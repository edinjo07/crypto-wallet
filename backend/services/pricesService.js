/**
 * Prices Service
 * Handles cryptocurrency price fetching from external APIs
 * Includes caching, error handling, and metrics
 */

const axios = require('axios');
const { APIService } = require('./BaseService');

const COINGECKO_URL = 'https://api.coingecko.com/api/v3';
const CACHE_TTL = 15000; // 15 seconds

/**
 * PricesService - Manages cryptocurrency price data
 */
class PricesService extends APIService {
  constructor() {
    super('PricesService', COINGECKO_URL, {
      timeout: 8000,
      retryAttempts: 3
    });
  }

  /**
   * Get live USD prices for major cryptocurrencies
   * Includes caching with 15-second TTL
   */
  async getLiveUsdPrices() {
    return this.executeWithTracking('getLiveUsdPrices', async () => {
      const cacheKey = 'live_usd_prices';
      const cached = this.getCache(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await axios.get(`${COINGECKO_URL}/simple/price`, {
        params: {
          ids: 'bitcoin,ethereum,tether',
          vs_currencies: 'usd',
          include_24hr_change: true
        },
        timeout: this.timeout
      });

      this.setCache(cacheKey, response.data, CACHE_TTL);
      return response.data;
    });
  }

  /**
   * Get prices for specific tokens
   */
  async getPricesForTokens(tokenIds = ['bitcoin', 'ethereum', 'tether']) {
    return this.executeWithTracking('getPricesForTokens', async () => {
      this.validateRequired({ tokenIds }, ['tokenIds']);

      const response = await axios.get(COINGECKO_URL, {
        params: {
          ids: tokenIds.join(','),
          vs_currencies: 'usd',
          include_24hr_change: true
        },
        timeout: this.timeout
      });

      return response.data;
    });
  }

  /**
   * Get prices with fallback
   */
  async getLiveUsdPricesWithFallback() {
    try {
      return await this.getLiveUsdPrices();
    } catch (error) {
      this.log('warn', 'getLiveUsdPrices_failed_fallback', {
        errorMessage: error.message
      });

      // Return zero prices as fallback
      return {
        bitcoin: { usd: 0, usd_24h_change: 0 },
        ethereum: { usd: 0, usd_24h_change: 0 },
        tether: { usd: 1, usd_24h_change: 0 }
      };
    }
  }

  /**
   * Invalidate price cache
   */
  invalidateCache() {
    this.clearCache();
    this.log('info', 'cache_invalidated', {});
  }
}

// Export singleton instance
const pricesService = new PricesService();

module.exports = {
  getLiveUsdPrices: () => pricesService.getLiveUsdPrices(),
  getPricesForTokens: (tokenIds) => pricesService.getPricesForTokens(tokenIds),
  getLiveUsdPricesWithFallback: () => pricesService.getLiveUsdPricesWithFallback(),
  invalidateCache: () => pricesService.invalidateCache(),
  // Export instance for advanced usage
  instance: pricesService
};
