import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  Bot,
  CircleDollarSign,
  Gauge,
  History,
  LineChart,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  Square,
  Wifi,
  Zap,
} from 'lucide-react';
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

const initialTrades = [
  { id: 'PT-1001', time: '09:15', symbol: 'BTCUSDC', side: 'BUY', qty: 0.015, entry: 64220, exit: 64880, pnl: 9.9, status: 'Closed' },
  { id: 'PT-1002', time: '10:05', symbol: 'ETHUSDC', side: 'BUY', qty: 0.4, entry: 3140, exit: 3108, pnl: -12.8, status: 'Closed' },
  { id: 'PT-1003', time: '11:42', symbol: 'BTCUSDC', side: 'BUY', qty: 0.01, entry: 77110, exit: null, pnl: 7.4, status: 'Open' },
];

const strategies = [
  { name: 'MA Crossover', status: 'Ready', risk: 'Low', description: 'Buy when fast MA crosses above slow MA, exit on reverse signal.' },
  { name: 'RSI Reversal', status: 'Testing', risk: 'Medium', description: 'Buy oversold zones and exit near overbought levels.' },
  { name: 'Breakout Bot', status: 'Paused', risk: 'High', description: 'Trade price breakouts with strict stop-loss controls.' },
  { name: 'Grid Simulator', status: 'Ready', risk: 'Medium', description: 'Simulates grid entries around a price range without real orders.' },
];

function StatCard({ icon: Icon, label, value, subtext }) {
  return (
    <section className="stat-card">
      <div className="stat-icon"><Icon size={22} /></div>
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
        <span>{subtext}</span>
      </div>
    </section>
  );
}

function CandleChart({ candles }) {
  const width = 920;
  const height = 340;
  const padding = { top: 22, right: 70, bottom: 34, left: 18 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (!candles.length) {
    return <div className="empty-chart">Waiting for live candle data...</div>;
  }

  const visibleCandles = candles.slice(-40);
  const maxHigh = Math.max(...visibleCandles.map((candle) => candle.high));
  const minLow = Math.min(...visibleCandles.map((candle) => candle.low));
  const priceRange = maxHigh - minLow || 1;
  const candleGap = plotWidth / visibleCandles.length;
  const candleWidth = Math.max(5, candleGap * 0.56);

  const yForPrice = (price) => padding.top + ((maxHigh - price) / priceRange) * plotHeight;
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const price = maxHigh - priceRange * ratio;
    const y = padding.top + plotHeight * ratio;
    return { price, y };
  });

  return (
    <div className="candle-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="candle-chart" role="img" aria-label="Live candlestick chart">
        <rect x="0" y="0" width={width} height={height} rx="18" className="chart-bg" />
        {gridLines.map((line) => (
          <g key={line.y}>
            <line x1={padding.left} y1={line.y} x2={width - padding.right} y2={line.y} className="chart-grid" />
            <text x={width - padding.right + 10} y={line.y + 4} className="chart-price-label">
              {line.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </text>
          </g>
        ))}
        {visibleCandles.map((candle, index) => {
          const x = padding.left + index * candleGap + candleGap / 2;
          const openY = yForPrice(candle.open);
          const closeY = yForPrice(candle.close);
          const highY = yForPrice(candle.high);
          const lowY = yForPrice(candle.low);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));
          const isUp = candle.close >= candle.open;
          const timeLabel = new Date(candle.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <g key={`${candle.closeTime}-${index}`}>
              <line x1={x} y1={highY} x2={x} y2={lowY} className={isUp ? 'wick up' : 'wick down'} />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                rx="2"
                className={isUp ? 'candle up' : 'candle down'}
              />
              {index % 8 === 0 && (
                <text x={x} y={height - 11} textAnchor="middle" className="chart-time-label">{timeLabel}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function App() {
  const [botState, setBotState] = useState('Paused');
  const [paperBalance, setPaperBalance] = useState(10000);
  const [marketPrice, setMarketPrice] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [candles, setCandles] = useState([]);
  const [apiMessage, setApiMessage] = useState('Connecting to backend...');
  const [lastUpdated, setLastUpdated] = useState('-');
  const [config, setConfig] = useState({
    symbol: 'BTCUSDC',
    timeframe: '1m',
    strategy: 'MA Crossover',
    tradeSize: 250,
    stopLoss: 2,
    takeProfit: 4,
    maxDailyLoss: 5,
  });

  const closedPnl = useMemo(() => initialTrades.reduce((sum, trade) => sum + trade.pnl, 0), []);
  const openTrades = initialTrades.filter((trade) => trade.status === 'Open');

  const callSimulation = async (action, nextState) => {
    try {
      const response = await fetch(`${API_BASE}/api/simulation/${action}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Backend request failed');
      setBotState(nextState);
      setApiMessage(data.message || `Simulation ${action} completed.`);
      if (data.paperAccount?.balance) setPaperBalance(data.paperAccount.balance);
    } catch (error) {
      setApiMessage(`Backend error: ${error.message}`);
    }
  };

  const loadMarketData = async () => {
    try {
      const symbol = ALLOWED_SYMBOLS.includes(config.symbol.trim().toUpperCase())
        ? config.symbol.trim().toUpperCase()
        : 'BTCUSDC';
      const [priceRes, tickerRes, candlesRes] = await Promise.all([
        fetch(`${API_BASE}/api/market/price?symbol=${symbol}`),
        fetch(`${API_BASE}/api/market/ticker24h?symbol=${symbol}`),
        fetch(`${API_BASE}/api/market/klines?symbol=${symbol}&interval=${config.timeframe}&limit=80`),
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
      setApiMessage(`Auto-refresh ON: ${symbol} ${config.timeframe} candles update every ${REFRESH_SECONDS} seconds.`);
    } catch (error) {
      setApiMessage(`Market data error: ${error.message}`);
    }
  };

  useEffect(() => {
    loadMarketData();
    const timer = setInterval(loadMarketData, REFRESH_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [config.symbol, config.timeframe]);

  const resetSimulation = () => {
    callSimulation('reset', 'Paused');
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Bot size={26} /></div>
          <div>
            <strong>PaperBot</strong>
            <span>Binance Simulator</span>
          </div>
        </div>
        <nav>
          <a className="active"><Gauge size={18} /> Dashboard</a>
          <a><Zap size={18} /> Strategy Builder</a>
          <a><LineChart size={18} /> Backtesting</a>
          <a><History size={18} /> Trade History</a>
          <a><ShieldCheck size={18} /> API Safety</a>
        </nav>
        <div className="risk-box">
          <AlertTriangle size={18} />
          <p>This version uses Binance public market data for BTCUSDC and ETHUSDC only. Revoke the exposed key and never commit secrets.</p>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Simulated trading environment</p>
            <h1>Binance Paper Trading Dashboard</h1>
            <span>Live public prices + paper trading simulation. No live order execution.</span>
          </div>
          <div className={`bot-pill ${botState.toLowerCase()}`}>
            <Activity size={18} /> Bot {botState}
          </div>
        </header>

        <section className="market-strip">
          <div><Wifi size={18} /><span>{apiMessage} Last update: {lastUpdated}</span></div>
          <button onClick={loadMarketData}>Refresh Market Data</button>
        </section>

        <section className="controls-panel">
          <button className="primary" onClick={() => callSimulation('start', 'Running')}><Play size={18} /> Start Paper Bot</button>
          <button onClick={() => callSimulation('pause', 'Paused')}><Pause size={18} /> Pause</button>
          <button onClick={() => callSimulation('stop', 'Stopped')}><Square size={18} /> Stop</button>
          <button className="danger" onClick={() => callSimulation('kill', 'Killed')}><AlertTriangle size={18} /> Emergency Kill</button>
          <button onClick={resetSimulation}><RefreshCcw size={18} /> Reset Simulation</button>
        </section>

        <section className="stats-grid">
          <StatCard icon={CircleDollarSign} label="Paper Balance" value={`$${paperBalance.toLocaleString()}`} subtext="Demo capital only" />
          <StatCard icon={LineChart} label={`${config.symbol} Price`} value={marketPrice ? `$${marketPrice.toLocaleString()}` : 'Loading'} subtext="Binance public API" />
          <StatCard icon={Activity} label="24h Change" value={ticker ? `${ticker.priceChangePercent}%` : 'Loading'} subtext={ticker ? `High ${ticker.highPrice} / Low ${ticker.lowPrice}` : 'Live ticker'} />
          <StatCard icon={ShieldCheck} label="Auto Refresh" value={`${REFRESH_SECONDS}s`} subtext="Candle and price update" />
        </section>

        <section className="grid two-col">
          <article className="panel chart-panel">
            <div className="panel-title">
              <div>
                <h3>{config.symbol} Candlestick Chart</h3>
                <p>Real public OHLC candle data from Binance. Interval: {config.timeframe}</p>
              </div>
            </div>
            <CandleChart candles={candles} />
          </article>

          <article className="panel">
            <div className="panel-title">
              <div>
                <h3>Strategy Builder</h3>
                <p>Configure rules for paper execution</p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                <span>Symbol</span>
                <select value={config.symbol} onChange={(e) => setConfig({ ...config, symbol: e.target.value })}>
                  {ALLOWED_SYMBOLS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                </select>
              </label>
              <label>
                <span>Candle Time Interval</span>
                <select value={config.timeframe} onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}>
                  {TIMEFRAMES.map((timeframe) => <option key={timeframe.value} value={timeframe.value}>{timeframe.label}</option>)}
                </select>
              </label>
              {Object.entries(config).filter(([key]) => !['symbol', 'timeframe'].includes(key)).map(([key, value]) => (
                <label key={key}>
                  <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                  <input
                    value={value}
                    onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <button className="primary full" onClick={loadMarketData}>Save & Reload Market Data</button>
          </article>
        </section>

        <section className="grid two-col">
          <article className="panel">
            <div className="panel-title"><h3>Strategy Presets</h3></div>
            <div className="strategy-list">
              {strategies.map((strategy) => (
                <div className="strategy-card" key={strategy.name}>
                  <div>
                    <strong>{strategy.name}</strong>
                    <p>{strategy.description}</p>
                  </div>
                  <span>{strategy.status} · {strategy.risk}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-title"><h3>Backtesting Snapshot</h3></div>
            <div className="backtest-grid">
              <div><span>Win Rate</span><strong>58.4%</strong></div>
              <div><span>Max Drawdown</span><strong>4.8%</strong></div>
              <div><span>Total Return</span><strong>+7.2%</strong></div>
              <div><span>Live Candles</span><strong>{candles.length}</strong></div>
            </div>
            <p className="muted">Next upgrade: convert these candles into real backtest results for each strategy.</p>
          </article>
        </section>

        <article className="panel">
          <div className="panel-title"><h3>Paper Trade History</h3></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Status</th></tr>
              </thead>
              <tbody>
                {initialTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td>{trade.id}</td><td>{trade.time}</td><td>{trade.symbol}</td><td>{trade.side}</td><td>{trade.qty}</td><td>{trade.entry}</td><td>{trade.exit || '-'}</td><td className={trade.pnl >= 0 ? 'profit' : 'loss'}>{trade.pnl}</td><td>{trade.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel safety-panel">
          <ShieldCheck size={24} />
          <div>
            <h3>API Safety Checklist</h3>
            <p>Your secret key is not required for chart data. This app remains paper-trading only. For any future real mode, use a new restricted key, not the exposed key.</p>
          </div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
