import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 4000;

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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'simulation-only', simulationStatus });
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
    symbol,
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
