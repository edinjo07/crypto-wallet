import client from '../api/client';

// Auth API
export const authAPI = {
  register: (data) => client.post('/auth/register', data),
  login: (data) => client.post('/auth/login', data),
  // Fetches + sets the CSRF cookie. Must be called after login/refresh
  // so the refreshToken cookie is present for session binding.
  fetchCsrfToken: () => client.get('/auth/csrf-token')
};

// Wallet API
export const walletAPI = {
  create: (data) => client.post('/wallet/create', data),
  list: () => client.get('/wallet/list'),
  getBalance: (address, network) => client.get(`/wallet/balance/${address}`, { params: { network } }),
  getAllBalances: () => client.get('/wallet/balances'),
  import: (data) => client.post('/wallet/import', data),
  addWatchOnly: (data) => client.post('/wallet/watch-only', data),
  getWatchOnly: () => client.get('/wallet/watch-only'),
  submitKyc: (data) => client.post('/wallet/kyc-submit', data),
  getKycStatus: () => client.get('/wallet/kyc-status'),
  getRecoveryStatus: () => client.get('/wallet/recovery-status'),
  getRecoveryWallet: () => client.get('/wallet/my-wallet'),
  getRecoverySeed: () => client.get('/wallet/recovery-seed'),
  recoverWallet: (payloadOrMnemonic, network) => {
    if (typeof payloadOrMnemonic === 'object') {
      return client.post('/wallet/recover', payloadOrMnemonic);
    }
    return client.post('/wallet/recover', { mnemonic: payloadOrMnemonic, network });
  },
  getSeedOnce: () => client.get('/wallet/seed-once'),
  // Notification APIs
  getNotifications: () => client.get('/wallet/notifications'),
  markNotificationAsRead: (notificationId) => client.patch(`/wallet/notifications/${notificationId}/read`),
  markAllNotificationsAsRead: () => client.patch('/wallet/notifications/read-all'),
  deleteNotification: (notificationId) => client.delete(`/wallet/notifications/${notificationId}`),
  // Transaction History APIs
  getRecoveryTransactions: () => client.get('/wallet/recovery-transactions')
};

// Transaction API
export const transactionAPI = {
  getHistory: (params) => client.get('/transactions/history', { params }),
  getBlockchainHistory: (address, network) => client.get(`/transactions/blockchain/${address}`, { params: { network } }),
  send: (data) => client.post('/transactions/send', data),
  sendBatch: (data) => client.post('/transactions/send-batch', data),
  deposit: (data) => client.post('/transactions/deposit', data),
  withdraw: (data) => client.post('/transactions/withdraw', data),
  getById: (id) => client.get(`/transactions/${id}`),
  estimateGas: (data) => client.post('/transactions/estimate-gas', data)
};

// Prices API
export const pricesAPI = {
  getLivePrices: () => client.get('/prices/live'),
  getHistory: (coinId, days) => client.get(`/prices/history/${coinId}`, { params: { days } })
};

// Token API
export const tokenAPI = {
  getPopular: (network) => client.get('/tokens/popular', { params: { network } }),
  getList: (params) => client.get('/tokens/list', { params }),
  getInfo: (address, network) => client.get(`/tokens/info/${address}`, { params: { network } }),
  add: (data) => client.post('/tokens/add', data),
  getBalance: (walletAddress, tokenAddress, network) => 
    client.get(`/tokens/balance/${walletAddress}/${tokenAddress}`, { params: { network } }),
  getBalances: (walletAddress, network) => 
    client.get(`/tokens/balances/${walletAddress}`, { params: { network } }),
  transfer: (data) => client.post('/tokens/transfer', data),
  delete: (id) => client.delete(`/tokens/${id}`),
  refresh: (id) => client.post(`/tokens/refresh/${id}`)
};

// Admin API
export const adminAPI = {
  getStats: () => client.get('/admin/stats'),
  getUsers: (params) => client.get('/admin/users', { params }),
  getUserDetails: (id) => client.get(`/admin/users/${id}`),
  updateUserRole: (id, role) => client.patch(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => client.delete(`/admin/users/${id}`),
  revokeUserTokens: (id) => client.post(`/admin/users/${id}/revoke-tokens`),
  getTransactions: (params) => client.get('/admin/transactions', { params }),
  getLogs: () => client.get('/admin/logs'),
  getAnalytics: (days) => client.get('/admin/analytics', { params: { days } }),
  getMarketAnalytics: (days) => client.get('/admin/market-analytics', { params: { days } }),
  getKycPending: () => client.get('/admin/kyc/pending'),
  approveKyc: (userId) => client.patch(`/admin/kyc/${userId}/approve`),
  rejectKyc: (userId, message) => client.patch(`/admin/kyc/${userId}/reject`, { message }),
  requestKycDocs: (userId, message) => client.patch(`/admin/kyc/${userId}/request-docs`, { message }),
  setKycProcessing: (userId) => client.patch(`/admin/kyc/${userId}/processing`),
  provisionRecoveryWallet: (payloadOrUserId, mnemonic) => {
    if (typeof payloadOrUserId === 'object') {
      return client.post('/admin/wallets/provision', payloadOrUserId);
    }
    return client.post('/admin/wallets/provision', { userId: payloadOrUserId, mnemonic });
  },
  getWebhooks: () => client.get('/admin/webhooks'),
  createWebhook: (data) => client.post('/admin/webhooks', data),
  updateWebhook: (id, data) => client.patch(`/admin/webhooks/${id}`, data),
  deleteWebhook: (id) => client.delete(`/admin/webhooks/${id}`),
  // Notification APIs
  sendNotification: (data) => client.post('/admin/notifications/send', data),
  sendBulkNotification: (data) => client.post('/admin/notifications/send-bulk', data),
  deleteUserNotification: (userId, notificationId) => client.delete(`/admin/notifications/${userId}/${notificationId}`)
};

export default client;
