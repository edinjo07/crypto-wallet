const axios = require('axios');

const COINGECKO = 'https://api.coingecko.com/api/v3';
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

  const res = await axios.get(`${COINGECKO}/coins/${coinId}/market_chart`, {
    params: { vs_currency: 'usd', days },
    timeout: 8000
  });

  setCache(key, res.data, 60000);
  return res.data;
}

module.exports = { getUsdMarketChart };
