import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 4000;
const BINANCE_FUTURES_BASE_URLS = [
  'https://fapi.binance.com',
];

app.use(cors());
app.use(express.json());

let simulationStatus = 'paused';

const normalizeSymbol = (symbol = 'BTCUSDC') => String(symbol).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

async function binanceFuturesGet(path, params = {}) {
  let lastError = null;

  for (const baseUrl of BINANCE_FUTURES_BASE_URLS) {
    try {
      const url = new URL(path, baseUrl);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
      });

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GridBacktester/1.0',
          Accept: 'application/json',
        },
      });
      const data = await response.json();

      if (!response.ok) {
        const message = data?.msg || `Futures market data request failed with status ${response.status}.`;
        throw new Error(message);
      }

      return { data, source: baseUrl };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Unable to fetch Binance USD-M futures market data. Last error: ${lastError?.message || 'Unknown error'}`);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'backtesting-only', simulationStatus, marketData: 'binance-usdm-futures-public-api' });
});

app.get('/api/market/price', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.query.symbol || 'BTCUSDC');
    const { data, source } = await binanceFuturesGet('/fapi/v1/ticker/price', { symbol });
    res.json({ source, market: 'USD-M Futures Perpetual', symbol: data.symbol, price: Number(data.price), rawPrice: data.price });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/market/ticker24h', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.query.symbol || 'BTCUSDC');
    const { data, source } = await binanceFuturesGet('/fapi/v1/ticker/24hr', { symbol });
    res.json({
      source,
      market: 'USD-M Futures Perpetual',
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
    const symbol = normalizeSymbol(req.query.symbol || 'BTCUSDC');
    const interval = String(req.query.interval || '15m');
    const limit = Math.min(Number(req.query.limit || 160), 1500);
    const { data: rows, source } = await binanceFuturesGet('/fapi/v1/klines', { symbol, interval, limit });
    const candles = rows.map((row) => ({
      openTime: row[0],
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: row[6],
    }));
    res.json({ source, market: 'USD-M Futures Perpetual', symbol, interval, candles });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Futures backtesting API running on port ${port}`);
});
