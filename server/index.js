import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 4000;
const BINANCE_PUBLIC_BASE_URL = 'https://api.binance.com';

app.use(cors());
app.use(express.json());

let simulationStatus = 'paused';
let paperAccount = {
  mode: 'simulation-only',
  currency: 'USDT',
  startingBalance: 10000,
  balance: 10000,
  demoPositions: [],
  demoHistory: [],
  risk: {
    maxDailyLossPercent: 5,
    defaultStopLossPercent: 2,
    defaultTakeProfitPercent: 4,
  },
};

const normalizeSymbol = (symbol = 'BTCUSDT') => String(symbol).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

async function binanceGet(path, params = {}) {
  const url = new URL(path, BINANCE_PUBLIC_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.msg || 'Binance public market request failed.';
    throw new Error(message);
  }

  return data;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'simulation-only', simulationStatus, marketData: 'binance-public-api' });
});

app.get('/api/market/price', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.query.symbol || 'BTCUSDT');
    const data = await binanceGet('/api/v3/ticker/price', { symbol });
    res.json({ source: 'binance-public-api', symbol: data.symbol, price: Number(data.price), rawPrice: data.price });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/market/ticker24h', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.query.symbol || 'BTCUSDT');
    const data = await binanceGet('/api/v3/ticker/24hr', { symbol });
    res.json({
      source: 'binance-public-api',
      symbol: data.symbol,
      lastPrice: Number(data.lastPrice),
      priceChangePercent: Number(data.priceChangePercent),
      highPrice: Number(data.highPrice),
      lowPrice: Number(data.lowPrice),
      volume: Number(data.volume),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/market/klines', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.query.symbol || 'BTCUSDT');
    const interval = String(req.query.interval || '15m');
    const limit = Math.min(Number(req.query.limit || 60), 500);
    const rows = await binanceGet('/api/v3/klines', { symbol, interval, limit });
    const candles = rows.map((row) => ({
      openTime: row[0],
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: row[6],
    }));
    res.json({ source: 'binance-public-api', symbol, interval, candles });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/paper-account', (_req, res) => {
  res.json(paperAccount);
});

app.post('/api/simulation/start', (_req, res) => {
  simulationStatus = 'running';
  res.json({ simulationStatus, message: 'Simulation started. This app does not send exchange orders.' });
});

app.post('/api/simulation/pause', (_req, res) => {
  simulationStatus = 'paused';
  res.json({ simulationStatus, message: 'Simulation paused.' });
});

app.post('/api/simulation/stop', (_req, res) => {
  simulationStatus = 'stopped';
  res.json({ simulationStatus, message: 'Simulation stopped.' });
});

app.post('/api/simulation/kill', (_req, res) => {
  simulationStatus = 'killed';
  paperAccount.demoPositions = [];
  res.json({ simulationStatus, message: 'Emergency stop completed for simulated positions only.' });
});

app.post('/api/simulation/reset', (_req, res) => {
  simulationStatus = 'paused';
  paperAccount.balance = paperAccount.startingBalance;
  paperAccount.demoPositions = [];
  paperAccount.demoHistory = [];
  res.json({ simulationStatus, paperAccount, message: 'Simulation reset complete.' });
});

app.post('/api/simulation/demo-position', (req, res) => {
  const { symbol = 'BTCUSDT', direction = 'LONG', quantity = 0.01, demoPrice = 65000, strategy = 'Manual Simulation' } = req.body || {};
  const demoValue = Number(quantity) * Number(demoPrice);

  if (!Number.isFinite(demoValue) || demoValue <= 0) {
    return res.status(400).json({ error: 'Invalid simulation quantity or price.' });
  }

  if (demoValue > paperAccount.balance) {
    return res.status(400).json({ error: 'Insufficient simulated balance.' });
  }

  const demoPosition = {
    id: `SIM-${Date.now()}`,
    symbol: normalizeSymbol(symbol),
    direction,
    quantity: Number(quantity),
    demoPrice: Number(demoPrice),
    strategy,
    status: 'open-demo',
    createdAt: new Date().toISOString(),
  };

  paperAccount.balance -= demoValue;
  paperAccount.demoPositions.push(demoPosition);
  paperAccount.demoHistory.push(demoPosition);

  res.json({ demoPosition, paperAccount, message: 'Demo position created inside the simulator only.' });
});

app.listen(port, () => {
  console.log(`Simulation API running on port ${port}`);
});
