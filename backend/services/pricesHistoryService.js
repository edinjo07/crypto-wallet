const axios = require('axios');

// CoinGecko Demo API keys are free: https://www.coingecko.com/en/api
// Set COINGECKO_API_KEY in Vercel env vars to avoid rate-limiting on cloud IPs.
// Without a key the free public endpoint is heavily throttled on server IPs.
const API_KEY = process.env.COINGECKO_API_KEY || '';
const COINGECKO_BASE = API_KEY
  ? 'https://pro-api.coingecko.com/api/v3'   // Demo/Pro key endpoint
  : 'https://api.coingecko.com/api/v3';        // Public (often rate-limited on cloud)

const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function getUsdMarketChart(coinId, days) {
  const key = `chart:${coinId}:${days}`;
  const cached = getCache(key);
  if (cached) return cached;

  const headers = API_KEY ? { 'x-cg-demo-api-key': API_KEY } : {};

  const res = await axios.get(`${COINGECKO_BASE}/coins/${coinId}/market_chart`, {
    params: { vs_currency: 'usd', days },
    headers,
    timeout: 15000
  });

  // Cache for 5 minutes to avoid hammering the free tier
  setCache(key, res.data, 5 * 60 * 1000);
  return res.data;
}

module.exports = { getUsdMarketChart };
