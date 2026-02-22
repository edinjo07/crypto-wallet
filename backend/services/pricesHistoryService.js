const axios = require('axios');

// CoinGecko Demo API keys are free: https://www.coingecko.com/en/api
// Set COINGECKO_API_KEY in Vercel env vars to avoid rate-limiting on cloud IPs.
// Without a key we fall back to CryptoCompare (no key required).
const API_KEY = process.env.COINGECKO_API_KEY || '';
const COINGECKO_BASE = API_KEY
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';

// CryptoCompare symbol map (fallback — no API key required)
const CRYPTOCOMPARE_SYM = { bitcoin: 'BTC', ethereum: 'ETH', tether: 'USDT' };

const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) { cache.delete(key); return null; }
  return item.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Fetch from CryptoCompare and return CoinGecko-compatible { prices: [[ts, price]] }
async function fetchFromCryptoCompare(coinId, days) {
  const fsym = CRYPTOCOMPARE_SYM[coinId];
  if (!fsym) throw new Error(`No CryptoCompare symbol for ${coinId}`);

  const endpoint = days <= 7
    ? 'https://min-api.cryptocompare.com/data/v2/histohour'
    : 'https://min-api.cryptocompare.com/data/v2/histoday';
  const limit = days <= 7 ? days * 24 : days;

  const res = await axios.get(endpoint, {
    params: { fsym, tsym: 'USD', limit },
    timeout: 12000
  });

  const rows = res.data?.Data?.Data || [];
  const prices = rows.map((r) => [r.time * 1000, r.close]);
  return { prices };
}

async function getUsdMarketChart(coinId, days) {
  const key = `chart:${coinId}:${days}`;
  const cached = getCache(key);
  if (cached) return cached;

  // Try CoinGecko first
  try {
    const headers = API_KEY ? { 'x-cg-demo-api-key': API_KEY } : {};
    const res = await axios.get(`${COINGECKO_BASE}/coins/${coinId}/market_chart`, {
      params: { vs_currency: 'usd', days },
      headers,
      timeout: 12000
    });
    setCache(key, res.data, 5 * 60 * 1000);
    return res.data;
  } catch (_cgErr) {
    // CoinGecko failed (rate-limit, network, etc.) — fall back to CryptoCompare
  }

  const fallback = await fetchFromCryptoCompare(coinId, days);
  setCache(key, fallback, 5 * 60 * 1000);
  return fallback;
}

module.exports = { getUsdMarketChart };
