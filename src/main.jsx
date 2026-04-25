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
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './styles.css';

const API_BASE = 'http://localhost:4000';

const initialTrades = [
  { id: 'PT-1001', time: '09:15', symbol: 'BTCUSDT', side: 'BUY', qty: 0.015, entry: 64220, exit: 64880, pnl: 9.9, status: 'Closed' },
  { id: 'PT-1002', time: '10:05', symbol: 'ETHUSDT', side: 'BUY', qty: 0.4, entry: 3140, exit: 3108, pnl: -12.8, status: 'Closed' },
  { id: 'PT-1003', time: '11:42', symbol: 'BNBUSDT', side: 'BUY', qty: 1.8, entry: 588, exit: null, pnl: 7.4, status: 'Open' },
];

const fallbackEquityData = [
  { time: '09:00', equity: 10000 },
  { time: '10:00', equity: 10045 },
  { time: '11:00', equity: 10022 },
  { time: '12:00', equity: 10084 },
  { time: '13:00', equity: 10110 },
  { time: '14:00', equity: 10096 },
  { time: '15:00', equity: 10154 },
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

function App() {
  const [botState, setBotState] = useState('Paused');
  const [paperBalance, setPaperBalance] = useState(10000);
  const [marketPrice, setMarketPrice] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [candles, setCandles] = useState([]);
  const [apiMessage, setApiMessage] = useState('Connecting to backend...');
  const [config, setConfig] = useState({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    strategy: 'MA Crossover',
    tradeSize: 250,
    stopLoss: 2,
    takeProfit: 4,
    maxDailyLoss: 5,
  });

  const closedPnl = useMemo(() => initialTrades.reduce((sum, trade) => sum + trade.pnl, 0), []);
  const openTrades = initialTrades.filter((trade) => trade.status === 'Open');

  const chartData = candles.length
    ? candles.map((candle) => ({
        time: new Date(candle.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        equity: candle.close,
      }))
    : fallbackEquityData;

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
      const symbol = config.symbol.trim().toUpperCase();
      const [priceRes, tickerRes, candlesRes] = await Promise.all([
        fetch(`${API_BASE}/api/market/price?symbol=${symbol}`),
        fetch(`${API_BASE}/api/market/ticker24h?symbol=${symbol}`),
        fetch(`${API_BASE}/api/market/klines?symbol=${symbol}&interval=${config.timeframe}&limit=40`),
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
      setApiMessage(`Live Binance public market data loaded for ${symbol}.`);
    } catch (error) {
      setApiMessage(`Market data error: ${error.message}`);
    }
  };

  useEffect(() => {
    loadMarketData();
    const timer = setInterval(loadMarketData, 15000);
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
          <p>This version uses public Binance market data only. It does not place real Binance orders.</p>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Simulated trading environment</p>
            <h1>Binance Paper Trading Dashboard</h1>
            <span>Live Binance public prices + paper trading simulation. No live order execution.</span>
          </div>
          <div className={`bot-pill ${botState.toLowerCase()}`}>
            <Activity size={18} /> Bot {botState}
          </div>
        </header>

        <section className="market-strip">
          <div><Wifi size={18} /><span>{apiMessage}</span></div>
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
          <StatCard icon={ShieldCheck} label="Risk Guard" value="Enabled" subtext="SL, TP, max loss active" />
        </section>

        <section className="grid two-col">
          <article className="panel chart-panel">
            <div className="panel-title">
              <div>
                <h3>{candles.length ? `${config.symbol} Live Candle Chart` : 'Equity Curve'}</h3>
                <p>{candles.length ? `Real public candle close prices from Binance (${config.timeframe})` : 'Demo account movement from simulated trades'}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="equity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="currentColor" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="currentColor" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip />
                <Area type="monotone" dataKey="equity" stroke="currentColor" fill="url(#equity)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </article>

          <article className="panel">
            <div className="panel-title">
              <div>
                <h3>Strategy Builder</h3>
                <p>Configure rules for paper execution</p>
              </div>
            </div>
            <div className="form-grid">
              {Object.entries(config).map(([key, value]) => (
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
            <p>Connected feature is public market data only. Do not put Binance secret keys in frontend code. Keep this version paper-only until backtesting and risk limits are verified.</p>
          </div>
        </article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
