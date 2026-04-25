import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, Bot, Gauge, LineChart, RefreshCcw, ShieldCheck, Wifi, Zap } from 'lucide-react';
import './styles.css';

const API_BASE = 'http://localhost:4000';
const ALLOWED_SYMBOLS = ['BTCUSDC', 'ETHUSDC'];
const TIMEFRAMES = [
  { label: '1 min', value: '1m' },
  { label: '3 min', value: '3m' },
  { label: '5 min', value: '5m' },
  { label: '15 min', value: '15m' },
  { label: '1 hour', value: '1h' },
  { label: '4 hour', value: '4h' },
  { label: '1 day', value: '1d' },
];
const REFRESH_SECONDS = 2;

function StatCard({ icon: Icon, label, value, subtext }) {
  return <section className="stat-card"><div className="stat-icon"><Icon size={22} /></div><div><p>{label}</p><h2>{value}</h2><span>{subtext}</span></div></section>;
}

function roundPrice(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Number(value) >= 100 ? Number(value).toFixed(2) : Number(value).toFixed(4);
}

function getMarketStats(candles, currentPrice) {
  const recent = candles.slice(-80);
  const last = Number(currentPrice || recent.at(-1)?.close || 0);
  const high = recent.length ? Math.max(...recent.map((candle) => candle.high)) : last * 1.01;
  const low = recent.length ? Math.min(...recent.map((candle) => candle.low)) : last * 0.99;
  const ranges = recent.map((candle) => candle.high - candle.low).filter((range) => Number.isFinite(range));
  const atr = ranges.length ? ranges.reduce((sum, range) => sum + range, 0) / ranges.length : last * 0.003;
  const rangePercent = last ? ((high - low) / last) * 100 : 0;
  return { last, high, low, atr, rangePercent };
}

function getGridStrategyPresets(candles, currentPrice, symbol) {
  const stats = getMarketStats(candles, currentPrice);
  const baseOrder = symbol === 'ETHUSDC' ? 50 : 100;
  const pct = (value) => stats.last * value;
  const safeLow = (value) => Number(Math.max(0.01, value).toFixed(2));
  const safeHigh = (value) => Number(Math.max(0.02, value).toFixed(2));

  return [
    {
      id: 'range-harvester',
      name: '1. Sideways Range Harvester',
      profile: 'Best for clear support/resistance chop',
      modeLabel: 'Long neutral grid',
      description: 'Uses the recent swing high and swing low. This is the classic grid for a market that keeps rotating inside a range.',
      settings: {
        mode: 'LONG_GRID',
        lowerPrice: safeLow(stats.low + stats.atr * 0.15),
        upperPrice: safeHigh(stats.high - stats.atr * 0.15),
        gridLevels: 14,
        orderSize: baseOrder,
        feePercent: 0.04,
      },
    },
    {
      id: 'micro-scalper',
      name: '2. Tight Futures Scalper Grid',
      profile: 'Best for 1m / 3m liquid sessions',
      modeLabel: 'Micro long grid',
      description: 'Builds a tight band around the current price to test quick mean-reversion scalps. Use small order size and watch fees.',
      settings: {
        mode: 'LONG_GRID',
        lowerPrice: safeLow(stats.last - Math.max(pct(0.006), stats.atr * 1.2)),
        upperPrice: safeHigh(stats.last + Math.max(pct(0.006), stats.atr * 1.2)),
        gridLevels: 18,
        orderSize: Math.max(25, baseOrder * 0.5),
        feePercent: 0.04,
      },
    },
    {
      id: 'atr-volatility',
      name: '3. ATR Volatility Adaptive Grid',
      profile: 'Best when volatility expands',
      modeLabel: 'ATR long grid',
      description: 'Automatically sizes the range using average candle range. Good for comparing different candle intervals.',
      settings: {
        mode: 'LONG_GRID',
        lowerPrice: safeLow(stats.last - Math.max(stats.atr * 3.2, pct(0.012))),
        upperPrice: safeHigh(stats.last + Math.max(stats.atr * 3.2, pct(0.012))),
        gridLevels: 12,
        orderSize: baseOrder,
        feePercent: 0.04,
      },
    },
    {
      id: 'trend-pullback',
      name: '4. Trend Pullback Accumulation Grid',
      profile: 'Best for bullish pullbacks',
      modeLabel: 'Dip-buy long grid',
      description: 'Places most of the useful range below the current price to test buying pullbacks and selling rebounds.',
      settings: {
        mode: 'LONG_GRID',
        lowerPrice: safeLow(stats.last - Math.max(stats.atr * 5, pct(0.025))),
        upperPrice: safeHigh(stats.last + Math.max(stats.atr * 1.6, pct(0.009))),
        gridLevels: 11,
        orderSize: baseOrder,
        feePercent: 0.04,
      },
    },
    {
      id: 'short-reversion',
      name: '5. Short Reversion Futures Grid',
      profile: 'Best for bearish rallies / overextended pumps',
      modeLabel: 'Short grid',
      description: 'Tests selling into upper grid levels and covering lower. This is futures-only logic for bearish or mean-reversion conditions.',
      settings: {
        mode: 'SHORT_GRID',
        lowerPrice: safeLow(stats.last - Math.max(stats.atr * 1.8, pct(0.01))),
        upperPrice: safeHigh(stats.last + Math.max(stats.atr * 5, pct(0.028))),
        gridLevels: 11,
        orderSize: baseOrder,
        feePercent: 0.04,
      },
    },
  ];
}

function buildGridLevels(lower, upper, levels) {
  const safeLevels = Math.max(2, Number(levels) || 2);
  const low = Number(lower);
  const high = Number(upper);
  if (!low || !high || high <= low) return [];
  const step = (high - low) / (safeLevels - 1);
  return Array.from({ length: safeLevels }, (_, index) => low + step * index);
}

function backtestGridStrategy(candles, settings) {
  const lower = Number(settings.lowerPrice);
  const upper = Number(settings.upperPrice);
  const levels = Number(settings.gridLevels);
  const orderSize = Number(settings.orderSize);
  const feePercent = Number(settings.feePercent);
  const mode = settings.mode || 'LONG_GRID';

  if (!candles.length || !lower || !upper || upper <= lower || levels < 2 || orderSize <= 0) {
    return { trades: [], profit: 0, fees: 0, wins: 0, losses: 0, completed: 0, openPositions: 0, returnPercent: 0, levels: [] };
  }

  const grid = buildGridLevels(lower, upper, levels);
  const openPositions = [];
  const trades = [];
  let totalProfit = 0;
  let totalFees = 0;
  let wins = 0;
  let losses = 0;

  candles.forEach((candle) => {
    if (mode === 'LONG_GRID') {
      grid.forEach((level, index) => {
        const nextLevel = grid[index + 1];
        if (!nextLevel) return;
        const alreadyOpen = openPositions.some((item) => item.entryLevel === level);
        if (candle.low <= level && candle.high >= level && !alreadyOpen) {
          const quantity = orderSize / level;
          const entryFee = orderSize * (feePercent / 100);
          openPositions.push({ side: 'LONG', entryLevel: level, exitLevel: nextLevel, quantity, entryFee });
          totalFees += entryFee;
        }
      });

      for (let index = openPositions.length - 1; index >= 0; index -= 1) {
        const position = openPositions[index];
        if (candle.high >= position.exitLevel) {
          const exitValue = position.quantity * position.exitLevel;
          const exitFee = exitValue * (feePercent / 100);
          const grossProfit = exitValue - orderSize;
          const netProfit = grossProfit - position.entryFee - exitFee;
          totalProfit += netProfit;
          totalFees += exitFee;
          if (netProfit >= 0) wins += 1; else losses += 1;
          trades.push({ id: `BT-${trades.length + 1}`, side: 'LONG', entry: position.entryLevel, exit: position.exitLevel, qty: position.quantity, netProfit, closeTime: candle.closeTime });
          openPositions.splice(index, 1);
        }
      }
    }

    if (mode === 'SHORT_GRID') {
      grid.forEach((level, index) => {
        const coverLevel = grid[index - 1];
        if (!coverLevel) return;
        const alreadyOpen = openPositions.some((item) => item.entryLevel === level);
        if (candle.high >= level && candle.low <= level && !alreadyOpen) {
          const quantity = orderSize / level;
          const entryFee = orderSize * (feePercent / 100);
          openPositions.push({ side: 'SHORT', entryLevel: level, exitLevel: coverLevel, quantity, entryFee });
          totalFees += entryFee;
        }
      });

      for (let index = openPositions.length - 1; index >= 0; index -= 1) {
        const position = openPositions[index];
        if (candle.low <= position.exitLevel) {
          const coverValue = position.quantity * position.exitLevel;
          const exitFee = coverValue * (feePercent / 100);
          const grossProfit = orderSize - coverValue;
          const netProfit = grossProfit - position.entryFee - exitFee;
          totalProfit += netProfit;
          totalFees += exitFee;
          if (netProfit >= 0) wins += 1; else losses += 1;
          trades.push({ id: `BT-${trades.length + 1}`, side: 'SHORT', entry: position.entryLevel, exit: position.exitLevel, qty: position.quantity, netProfit, closeTime: candle.closeTime });
          openPositions.splice(index, 1);
        }
      }
    }
  });

  const deployedCapital = Math.max(1, orderSize * Math.max(1, levels - 1));
  return { trades, profit: totalProfit, fees: totalFees, wins, losses, completed: trades.length, openPositions: openPositions.length, returnPercent: (totalProfit / deployedCapital) * 100, levels: grid };
}

function CandleChart({ candles, currentPrice, gridLevels, chartSize, setChartSize }) {
  const dragRef = useRef(null);
  const width = Number(chartSize.width) || 1500;
  const height = Number(chartSize.height) || 650;
  const visibleCount = Number(chartSize.visibleCandles) || 80;
  const priceZoom = Number(chartSize.priceZoom) || 1;
  const offset = Number(chartSize.offset) || 0;
  const futureBars = Number(chartSize.futureBars) || 10;
  const padding = { top: 28, right: 112, bottom: 58, left: 22 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (!candles.length) return <div className="empty-chart">Waiting for live futures candle data...</div>;

  const maxOffset = Math.max(0, candles.length - Math.max(10, visibleCount));
  const safeOffset = Math.min(maxOffset, Math.max(0, offset));
  const endIndex = candles.length - safeOffset;
  const startIndex = Math.max(0, endIndex - visibleCount);
  const visibleCandles = candles.slice(startIndex, endIndex);
  const slotCount = visibleCandles.length + futureBars;
  const candleHigh = Math.max(...visibleCandles.map((candle) => candle.high), Number(currentPrice || 0));
  const candleLow = Math.min(...visibleCandles.map((candle) => candle.low), Number(currentPrice || Infinity));
  const midPrice = (candleHigh + candleLow) / 2;
  const rawRange = candleHigh - candleLow || Math.max(candleHigh * 0.001, 1);
  const zoomedRange = Math.max(rawRange * (1.35 / priceZoom), rawRange * 0.12, 0.01);
  const maxHigh = midPrice + zoomedRange / 2;
  const minLow = midPrice - zoomedRange / 2;
  const priceRange = maxHigh - minLow || 1;
  const candleGap = plotWidth / slotCount;
  const candleWidth = Math.max(4, Math.min(22, candleGap * 0.62));
  const yForPrice = (price) => padding.top + ((maxHigh - price) / priceRange) * plotHeight;
  const gridLines = Array.from({ length: 7 }, (_, index) => {
    const ratio = index / 6;
    return { price: maxHigh - priceRange * ratio, y: padding.top + plotHeight * ratio };
  });
  const visibleGridLevels = (gridLevels || []).filter((level) => level >= minLow && level <= maxHigh);
  const currentY = currentPrice ? yForPrice(currentPrice) : null;
  const livePriceX = padding.left + Math.max(0, visibleCandles.length - 1) * candleGap + candleGap / 2;

  const startDrag = (event, type) => {
    event.preventDefault();
    dragRef.current = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      startVisible: Number(chartSize.visibleCandles) || 80,
      startZoom: Number(chartSize.priceZoom) || 1,
      startOffset: Number(chartSize.offset) || 0,
    };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);
  };

  const onDrag = (event) => {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    if (drag.type === 'price') {
      const deltaY = drag.startY - event.clientY;
      const nextZoom = Math.min(20, Math.max(0.25, drag.startZoom + deltaY / 80));
      setChartSize((prev) => ({ ...prev, priceZoom: Number(nextZoom.toFixed(2)) }));
    }
    if (drag.type === 'time') {
      const deltaX = event.clientX - drag.startX;
      const nextVisible = Math.min(260, Math.max(15, Math.round(drag.startVisible + deltaX / 5)));
      setChartSize((prev) => ({ ...prev, visibleCandles: nextVisible }));
    }
    if (drag.type === 'pan') {
      const deltaX = event.clientX - drag.startX;
      const barsMoved = Math.round(deltaX / Math.max(4, candleGap));
      const nextOffset = Math.min(maxOffset, Math.max(0, drag.startOffset + barsMoved));
      setChartSize((prev) => ({ ...prev, offset: nextOffset }));
    }
  };

  const stopDrag = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
  };

  return (
    <div className="candle-chart-wrap resizable-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="candle-chart" style={{ minWidth: `${width}px` }} role="img" aria-label="Live USDC perpetual futures candlestick chart">
        <rect x="0" y="0" width={width} height={height} rx="18" className="chart-bg" />
        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} className="chart-pan-zone" onMouseDown={(event) => startDrag(event, 'pan')} />
        {gridLines.map((line) => <g key={line.y}><line x1={padding.left} y1={line.y} x2={width - padding.right} y2={line.y} className="chart-grid" /><text x={width - padding.right + 12} y={line.y + 4} className="chart-price-label">{line.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</text></g>)}
        {visibleGridLevels.map((level) => <line key={level} x1={padding.left} y1={yForPrice(level)} x2={width - padding.right} y2={yForPrice(level)} className="grid-bot-line" />)}
        {visibleCandles.map((candle, index) => {
          const x = padding.left + index * candleGap + candleGap / 2;
          const openY = yForPrice(candle.open);
          const closeY = yForPrice(candle.close);
          const highY = yForPrice(candle.high);
          const lowY = yForPrice(candle.low);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(4, Math.abs(closeY - openY));
          const isUp = candle.close >= candle.open;
          const timeLabel = new Date(candle.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return <g key={`${candle.closeTime}-${index}`}><line x1={x} y1={highY} x2={x} y2={lowY} className={isUp ? 'wick up' : 'wick down'} /><rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} rx="2" className={isUp ? 'candle up' : 'candle down'} />{index % Math.ceil(visibleCandles.length / 8) === 0 && <text x={x} y={height - 22} textAnchor="middle" className="chart-time-label">{timeLabel}</text>}</g>;
        })}
        {currentY && <g><line x1={padding.left} y1={currentY} x2={width - padding.right} y2={currentY} className="running-price-line" /><circle cx={livePriceX} cy={currentY} r="4" className="live-price-dot" /><rect x={width - padding.right + 8} y={currentY - 13} width="88" height="26" rx="8" className="price-tag-bg" /><text x={width - padding.right + 14} y={currentY + 4} className="price-tag-text">{currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</text></g>}
        <rect x={width - padding.right} y={padding.top} width={padding.right} height={plotHeight} className="price-axis-drag-zone" onMouseDown={(event) => startDrag(event, 'price')} />
        <rect x={padding.left} y={height - padding.bottom} width={plotWidth} height={padding.bottom} className="time-axis-drag-zone" onMouseDown={(event) => startDrag(event, 'time')} />
        <text x={width - padding.right + 10} y={height - 12} className="axis-hint">drag price</text>
        <text x={padding.left + 12} y={height - 12} className="axis-hint">drag time axis</text>
        <text x={padding.left + plotWidth / 2} y={padding.top + 18} textAnchor="middle" className="axis-hint">drag chart left/right to pan</text>
      </svg>
    </div>
  );
}

function App() {
  const [marketPrice, setMarketPrice] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [candles, setCandles] = useState([]);
  const [apiMessage, setApiMessage] = useState('Connecting to backend...');
  const [lastUpdated, setLastUpdated] = useState('-');
  const [config, setConfig] = useState({ symbol: 'BTCUSDC', timeframe: '1m' });
  const [chartSize, setChartSize] = useState({ width: 1500, height: 650, visibleCandles: 80, priceZoom: 1, offset: 0, futureBars: 10 });
  const [gridSettings, setGridSettings] = useState({ mode: 'LONG_GRID', lowerPrice: 76000, upperPrice: 79000, gridLevels: 10, orderSize: 100, feePercent: 0.04 });
  const [selectedPreset, setSelectedPreset] = useState('manual');

  const strategyPresets = useMemo(() => getGridStrategyPresets(candles, marketPrice, config.symbol), [candles, marketPrice, config.symbol]);
  const backtest = useMemo(() => backtestGridStrategy(candles, gridSettings), [candles, gridSettings]);

  const applyPreset = (preset) => {
    setGridSettings(preset.settings);
    setSelectedPreset(preset.id);
    setChartSize((prev) => ({ ...prev, offset: 0 }));
  };

  const loadMarketData = async () => {
    try {
      const symbol = ALLOWED_SYMBOLS.includes(config.symbol.trim().toUpperCase()) ? config.symbol.trim().toUpperCase() : 'BTCUSDC';
      const limit = Math.max(160, Number(chartSize.visibleCandles) + Number(chartSize.offset || 0) + 40);
      const [priceRes, tickerRes, candlesRes] = await Promise.all([
        fetch(`${API_BASE}/api/market/price?symbol=${symbol}`),
        fetch(`${API_BASE}/api/market/ticker24h?symbol=${symbol}`),
        fetch(`${API_BASE}/api/market/klines?symbol=${symbol}&interval=${config.timeframe}&limit=${limit}`),
      ]);
      const priceData = await priceRes.json();
      const tickerData = await tickerRes.json();
      const candlesData = await candlesRes.json();
      if (!priceRes.ok) throw new Error(priceData.error || 'Price request failed');
      if (!tickerRes.ok) throw new Error(tickerData.error || 'Ticker request failed');
      if (!candlesRes.ok) throw new Error(candlesData.error || 'Candle request failed');
      setMarketPrice(priceData.price);
      setTicker(tickerData);
      setCandles(candlesData.candles || []);
      setLastUpdated(new Date().toLocaleTimeString());
      setApiMessage(`Live Binance USD-M ${symbol} perpetual futures ${config.timeframe} candles refresh every ${REFRESH_SECONDS} seconds.`);
    } catch (error) {
      setApiMessage(`Market data error: ${error.message}`);
    }
  };

  useEffect(() => { setChartSize((prev) => ({ ...prev, offset: 0 })); }, [config.symbol, config.timeframe]);
  useEffect(() => {
    loadMarketData();
    const timer = setInterval(loadMarketData, REFRESH_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [config.symbol, config.timeframe, chartSize.visibleCandles, chartSize.offset]);

  const autoFillRange = () => {
    if (!candles.length) return;
    const lows = candles.map((candle) => candle.low);
    const highs = candles.map((candle) => candle.high);
    setGridSettings({ ...gridSettings, lowerPrice: Number(Math.min(...lows).toFixed(2)), upperPrice: Number(Math.max(...highs).toFixed(2)) });
    setSelectedPreset('manual');
  };

  const stretchChart = () => setChartSize({ width: 2200, height: 850, visibleCandles: 120, priceZoom: 2, offset: 0, futureBars: 16 });
  const compactChart = () => setChartSize({ width: 1200, height: 520, visibleCandles: 60, priceZoom: 1, offset: 0, futureBars: 8 });
  const resetScale = () => setChartSize((prev) => ({ ...prev, priceZoom: 1, visibleCandles: 80, offset: 0, futureBars: 10 }));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Bot size={26} /></div><div><strong>GridTester</strong><span>USDC Perp Futures</span></div></div>
        <nav><a className="active"><Gauge size={18} /> Futures Chart</a><a><Zap size={18} /> Strategy Presets</a><a><LineChart size={18} /> Backtest Results</a><a><ShieldCheck size={18} /> Safety</a></nav>
        <div className="risk-box"><AlertTriangle size={18} /><p>Backtesting only. Futures data is live public market data; no orders are placed.</p></div>
      </aside>

      <section className="content">
        <header className="topbar"><div><p className="eyebrow">Binance USD-M USDC perpetual futures</p><h1>Grid Bot Backtesting Dashboard</h1><span>Test 5 professional-style grid templates one by one before considering any live setup.</span></div><div className="bot-pill running"><Activity size={18} /> Auto Refresh {REFRESH_SECONDS}s</div></header>
        <section className="market-strip"><div><Wifi size={18} /><span>{apiMessage} Last update: {lastUpdated}</span></div><button onClick={loadMarketData}><RefreshCcw size={16} /> Refresh</button></section>
        <section className="stats-grid">
          <StatCard icon={LineChart} label={`${config.symbol} Perp Price`} value={marketPrice ? `$${marketPrice.toLocaleString()}` : 'Loading'} subtext="Binance USD-M futures" />
          <StatCard icon={Activity} label="24h Change" value={ticker ? `${ticker.priceChangePercent}%` : 'Loading'} subtext={ticker ? `High ${ticker.highPrice} / Low ${ticker.lowPrice}` : 'Live ticker'} />
          <StatCard icon={Zap} label={`${gridSettings.mode === 'SHORT_GRID' ? 'Short' : 'Long'} Grid Result`} value={`$${backtest.profit.toFixed(2)}`} subtext={`${backtest.completed} completed cycles`} />
          <StatCard icon={ShieldCheck} label="Return on Grid" value={`${backtest.returnPercent.toFixed(2)}%`} subtext={`Fees: $${backtest.fees.toFixed(2)}`} />
        </section>

        <article className="panel strategy-panel">
          <div className="panel-title"><div><h3>5 Grid Strategy Presets</h3><p>These templates auto-calculate their ranges from the fetched futures candles. Select one, then run the backtest.</p></div></div>
          <div className="preset-grid">
            {strategyPresets.map((preset) => (
              <button key={preset.id} className={`preset-card ${selectedPreset === preset.id ? 'selected' : ''}`} onClick={() => applyPreset(preset)}>
                <strong>{preset.name}</strong>
                <span>{preset.profile}</span>
                <p>{preset.description}</p>
                <small>{preset.modeLabel} · {preset.settings.gridLevels} levels · {roundPrice(preset.settings.lowerPrice)} → {roundPrice(preset.settings.upperPrice)}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="panel chart-panel chart-full">
          <div className="panel-title chart-title-row"><div><h3>{config.symbol} Perpetual Futures Chart</h3><p>Current candle is not locked to the right axis. Drag chart body to pan through candles.</p></div><div className="chart-actions"><button onClick={compactChart}>Compact</button><button onClick={resetScale}>Reset View</button><button className="primary" onClick={stretchChart}>Stretch Chart</button></div></div>
          <CandleChart candles={candles} currentPrice={marketPrice} gridLevels={backtest.levels} chartSize={chartSize} setChartSize={setChartSize} />
        </article>

        <section className="grid two-col">
          <article className="panel"><div className="panel-title"><div><h3>Backtest Controls</h3><p>Fine-tune the selected preset or build your own grid manually.</p></div></div>
            <div className="form-grid">
              <label><span>USDC Perpetual Symbol</span><select value={config.symbol} onChange={(e) => setConfig({ ...config, symbol: e.target.value })}>{ALLOWED_SYMBOLS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}</select></label>
              <label><span>Candle Time Interval</span><select value={config.timeframe} onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}>{TIMEFRAMES.map((timeframe) => <option key={timeframe.value} value={timeframe.value}>{timeframe.label}</option>)}</select></label>
              <label><span>Grid Mode</span><select value={gridSettings.mode} onChange={(e) => { setGridSettings({ ...gridSettings, mode: e.target.value }); setSelectedPreset('manual'); }}><option value="LONG_GRID">Long grid: buy low, sell higher</option><option value="SHORT_GRID">Short grid: sell high, cover lower</option></select></label>
              <label><span>Chart Width</span><input type="number" min="900" max="3000" value={chartSize.width} onChange={(e) => setChartSize({ ...chartSize, width: e.target.value })} /></label>
              <label><span>Chart Height</span><input type="number" min="360" max="1200" value={chartSize.height} onChange={(e) => setChartSize({ ...chartSize, height: e.target.value })} /></label>
              <label><span>Visible Candles</span><input type="number" min="20" max="260" value={chartSize.visibleCandles} onChange={(e) => setChartSize({ ...chartSize, visibleCandles: e.target.value })} /></label>
              <label><span>Future Blank Bars</span><input type="number" min="0" max="60" value={chartSize.futureBars} onChange={(e) => setChartSize({ ...chartSize, futureBars: e.target.value })} /></label>
              <label><span>Vertical Zoom</span><input type="number" min="0.25" max="20" step="0.25" value={chartSize.priceZoom} onChange={(e) => setChartSize({ ...chartSize, priceZoom: e.target.value })} /></label>
              <label><span>Candle Offset</span><input type="number" min="0" max="500" value={chartSize.offset} onChange={(e) => setChartSize({ ...chartSize, offset: e.target.value })} /></label>
              <label><span>Lower Grid Price</span><input type="number" value={gridSettings.lowerPrice} onChange={(e) => { setGridSettings({ ...gridSettings, lowerPrice: e.target.value }); setSelectedPreset('manual'); }} /></label>
              <label><span>Upper Grid Price</span><input type="number" value={gridSettings.upperPrice} onChange={(e) => { setGridSettings({ ...gridSettings, upperPrice: e.target.value }); setSelectedPreset('manual'); }} /></label>
              <label><span>Grid Levels</span><input type="number" min="2" value={gridSettings.gridLevels} onChange={(e) => { setGridSettings({ ...gridSettings, gridLevels: e.target.value }); setSelectedPreset('manual'); }} /></label>
              <label><span>Order Size USDC</span><input type="number" value={gridSettings.orderSize} onChange={(e) => { setGridSettings({ ...gridSettings, orderSize: e.target.value }); setSelectedPreset('manual'); }} /></label>
              <label><span>Fee % per side</span><input type="number" step="0.01" value={gridSettings.feePercent} onChange={(e) => { setGridSettings({ ...gridSettings, feePercent: e.target.value }); setSelectedPreset('manual'); }} /></label>
            </div><div className="button-row"><button className="primary" onClick={loadMarketData}>Run Backtest</button><button onClick={autoFillRange}>Auto Range</button></div></article>

          <article className="panel"><div className="panel-title"><h3>Grid Backtest Summary</h3></div><div className="backtest-grid"><div><span>Mode</span><strong>{gridSettings.mode === 'SHORT_GRID' ? 'SHORT' : 'LONG'}</strong></div><div><span>Completed Cycles</span><strong>{backtest.completed}</strong></div><div><span>Open Positions</span><strong>{backtest.openPositions}</strong></div><div><span>Winning Cycles</span><strong>{backtest.wins}</strong></div><div><span>Losing Cycles</span><strong>{backtest.losses}</strong></div><div><span>Net Profit</span><strong className={backtest.profit >= 0 ? 'profit' : 'loss'}>${backtest.profit.toFixed(2)}</strong></div><div><span>Estimated Fees</span><strong>${backtest.fees.toFixed(2)}</strong></div><div><span>Return on Grid</span><strong>{backtest.returnPercent.toFixed(2)}%</strong></div></div></article>
        </section>

        <article className="panel"><div className="panel-title"><h3>Recent Backtest Cycles</h3></div><div className="table-wrap"><table><thead><tr><th>ID</th><th>Side</th><th>Entry Level</th><th>Exit Level</th><th>Qty</th><th>Net Profit</th><th>Close Time</th></tr></thead><tbody>{backtest.trades.slice(-20).reverse().map((trade) => <tr key={trade.id}><td>{trade.id}</td><td>{trade.side}</td><td>{trade.entry.toFixed(2)}</td><td>{trade.exit.toFixed(2)}</td><td>{trade.qty.toFixed(6)}</td><td className={trade.netProfit >= 0 ? 'profit' : 'loss'}>${trade.netProfit.toFixed(2)}</td><td>{new Date(trade.closeTime).toLocaleString()}</td></tr>)}{!backtest.trades.length && <tr><td colSpan="7">No completed grid cycles yet. Try a preset, adjust range, or change candle interval.</td></tr>}</tbody></table></div></article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
