const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminGuard = require('../security/adminGuard');
const { getDb } = require('../models/db');
const { logAdminAction } = require('../security/auditLog');
const { logEvent } = require('../services/auditLogger');
const logger = require('../core/logger');
const { toAdminListUser, toUserDetails } = require('../dto/userDto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Token = require('../models/Token');
const Balance = require('../models/Balance');
const Webhook = require('../models/Webhook');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const walletProvisioningService = require('../services/walletProvisioningService');
const { getLiveUsdPrices } = require('../services/pricesService');
const { secureEraseString } = require('../security/secureErase');
const { revokeAllUserTokens } = require('../security/tokenRevocation');
const metricsService = require('../services/metricsService');

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE RECALCULATION HELPER
// Replays ALL confirmed transactions for a user+network in chronological order.
// receive/deposit → add; send/withdraw → subtract (floor at 0).
// A send/withdraw whose timestamp is before any receive will not produce a
// negative balance, so it will be absorbed (capped at 0) at that point in
// the replay, leaving later receives untouched.
// ─────────────────────────────────────────────────────────────────────────────
async function recalcBalance(userId, network) {
  const db = getDb();
  const { data: txRows, error } = await db
    .from('transactions')
    .select('type, amount, timestamp')
    .eq('user_id', String(userId))
    .eq('network', network)
    .eq('status', 'confirmed')
    .order('timestamp', { ascending: true });

  if (error) throw error;

  const balance = (txRows || []).reduce((acc, row) => {
    const amt = parseFloat(row.amount) || 0;
    if (row.type === 'receive' || row.type === 'deposit') return acc + amt;
    if (row.type === 'send'    || row.type === 'withdraw') return Math.max(0, acc - amt);
    return acc;
  }, 0);

  // Upsert the wallet row for this user+network
  const { data: existing } = await db
    .from('user_wallets')
    .select('id')
    .eq('user_id', String(userId))
    .eq('network', network);

  if (existing && existing.length > 0) {
    await db
      .from('user_wallets')
      .update({ balance_override_btc: balance, balance_updated_at: new Date().toISOString() })
      .eq('id', existing[0].id);
  } else {
    const cryptoLabel = {
      bitcoin: 'BTC', ethereum: 'ETH', polygon: 'MATIC',
      bsc: 'BNB', litecoin: 'LTC', dogecoin: 'DOGE'
    }[network] || network.toUpperCase();
    await db.from('user_wallets').insert({
      user_id: String(userId),
      address: `admin-managed-${network}-${userId}`,
      network,
      watch_only: true,
      label: `${cryptoLabel} (Admin Managed)`,
      balance_override_btc: balance,
      balance_updated_at: new Date().toISOString()
    });
  }
  return balance;
}

// Get dashboard statistics
router.get('/stats', adminAuth, adminGuard(), async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stats = {
      totalUsers: await User.countDocuments(),
      activeUsers: await User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      totalTransactions: await Transaction.countDocuments(),
      pendingTransactions: await Transaction.countDocuments({ status: 'pending' }),
      completedTransactions: await Transaction.countDocuments({ status: 'completed' }),
      failedTransactions: await Transaction.countDocuments({ status: 'failed' }),
      recoveries24h: await Transaction.countDocuments({ status: 'completed', timestamp: { $gte: since24h } }),
      failedTransactions24h: await Transaction.countDocuments({ status: 'failed', timestamp: { $gte: since24h } }),
      totalWallets: await User.aggregate([
        { $project: { walletCount: { $size: '$wallets' } } },
        { $group: { _id: null, total: { $sum: '$walletCount' } } }
      ]).then(result => result[0]?.total || 0),
      totalTokens: await Token.countDocuments(),
      recentUsers: await User.find()
        .select('name email createdAt')
        .sort({ createdAt: -1 })
        .limit(5),
      recentTransactions: await Transaction.find()
        .select('type cryptocurrency amount status timestamp')
        .sort({ timestamp: -1 })
        .limit(10)
    };

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching admin stats', { message: error.message });
    res.status(500).json({ message: 'Error fetching statistics' });
  }
});

// Get all users with pagination
router.get('/users', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const skip = (page - 1) * limit;

    // Allowlist-sanitize search: only permit characters valid in emails and names.
    // This prevents ReDoS and NoSQL injection without relying solely on escaping.
    const rawSearch = typeof search === 'string' ? search.slice(0, 100) : '';
    const sanitizedSearch = rawSearch.replace(/[^a-zA-Z0-9 @.\-_]/g, '');

    const query = sanitizedSearch ? {
      $or: [
        { email: { $regex: sanitizedSearch, $options: 'i' } },
        { name: { $regex: sanitizedSearch, $options: 'i' } }
      ]
    } : {};

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await User.countDocuments(query);

    res.json({
      users: users.map(toAdminListUser),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error('Error fetching users', { message: error.message });
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Get specific user details
router.get('/users/:id', adminAuth, adminGuard(), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const transactions = await Transaction.find({ userId: user._id })
      .sort({ timestamp: -1 })
      .limit(20);

    const tokens = await Token.find({ userId: user._id });

    res.json({
      user: toUserDetails(user),
      transactions,
      tokens
    });
  } catch (error) {
    logger.error('Error fetching user details', { message: error.message });
    res.status(500).json({ message: 'Error fetching user details' });
  }
});

// Update user role
router.patch('/users/:id/role', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-demotion
    if (user._id.toString() === req.userId.toString() && role === 'user') {
      return res.status(400).json({ message: 'Cannot demote yourself' });
    }

    user.role = role;
    user.isAdmin = role === 'admin';
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'update_user_role',
      targetId: user._id.toString(),
      ip: req.ip,
      metadata: { role }
    });

    res.json({ 
      message: 'User role updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    logger.error('Error updating user role', { message: error.message });
    res.status(500).json({ message: 'Error updating user role' });
  }
});

// Delete user
router.delete('/users/:id', adminAuth, adminGuard(), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-deletion
    if (user._id.toString() === req.userId.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Delete user's associated data
    await Transaction.deleteMany({ userId: user._id });
    await Token.deleteMany({ userId: user._id });
    await Balance.deleteMany({ userId: user._id });
    
    await User.findByIdAndDelete(req.params.id);

    logAdminAction({
      userId: req.userId,
      action: 'delete_user',
      targetId: req.params.id,
      ip: req.ip
    });

    res.json({ message: 'User and associated data deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user', { message: error.message });
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// Create a new user (admin only)
router.post('/users', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    // Reject non-string inputs to prevent type confusion before accessing .length
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Name, email and password must be strings.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'A user with that email already exists.' });
    }

    const user = new User({ name, email, password, role: role === 'admin' ? 'admin' : 'user' });
    if (role === 'admin') user.isAdmin = true;
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'create_user',
      targetId: user._id,
      ip: req.ip
    });

    res.status(201).json({ message: 'User created successfully.', userId: user._id });
  } catch (error) {
    logger.error('Error creating user', { message: error.message });
    res.status(500).json({ message: 'Error creating user.' });
  }
});

// Get all transactions with filters
router.get('/transactions', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { page = 1, limit = 50, status, type, userId } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (userId) query.userId = userId;

    const transactions = await Transaction.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('userId', 'name email');

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error('Error fetching transactions', { message: error.message });
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// Get system logs (last 100 activities)
router.get('/logs', adminAuth, adminGuard(), async (req, res) => {
  try {
    const {
      action,
      actorType,
      actorId,
      targetUserId,
      network,
      success,
      limit = 100
    } = req.query;

    const query = {};
    if (action) query.action = action;
    if (actorType) query.actorType = actorType;
    if (actorId) query.actorId = actorId;
    if (targetUserId) query.targetUserId = targetUserId;
    if (network) query.network = network;
    if (typeof success !== 'undefined') {
      query.success = success === 'true' || success === true;
    }

    const limitValue = Math.min(parseInt(limit, 10) || 100, 500);

    const auditLogs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limitValue)
      .lean();

    const userIds = new Set();
    auditLogs.forEach((log) => {
      if (log.actorId) userIds.add(log.actorId.toString());
      if (log.targetUserId) userIds.add(log.targetUserId.toString());
    });

    const users = await User.find({ _id: { $in: Array.from(userIds) } })
      .select('name email')
      .lean();

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const formatUser = (userId) => {
      if (!userId) return null;
      const user = userMap.get(userId.toString());
      return user ? `${user.name} (${user.email})` : userId.toString();
    };

    const logs = auditLogs.map((log) => {
      const actorLabel = formatUser(log.actorId) || log.actorType || 'system';
      const targetLabel = formatUser(log.targetUserId);

      const detailParts = [];
      if (targetLabel) detailParts.push(`target user: ${targetLabel}`);
      if (log.targetWalletId) detailParts.push(`wallet: ${log.targetWalletId}`);
      if (log.network) detailParts.push(`network: ${log.network}`);
      if (log.ip) detailParts.push(`ip: ${log.ip}`);
      if (log.details && Object.keys(log.details).length > 0) {
        detailParts.push(`details: ${JSON.stringify(log.details)}`);
      }

      return {
        id: log._id,
        action: log.action,
        user: actorLabel,
        details: detailParts.join(' | ') || '—',
        timestamp: log.createdAt,
        status: log.success ? 'completed' : 'failed'
      };
    });

    res.json({ logs });
  } catch (error) {
    logger.error('Error fetching logs', { message: error.message });
    res.status(500).json({ message: 'Error fetching logs' });
  }
});

// Get analytics data
router.get('/analytics', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // User growth
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { 
        $group: { 
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Transaction volume
    const transactionVolume = await Transaction.aggregate([
      { $match: { timestamp: { $gte: startDate }, status: 'completed' } },
      { 
        $group: { 
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Popular cryptocurrencies
    const popularCrypto = await Transaction.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: '$cryptocurrency',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      userGrowth,
      transactionVolume,
      popularCrypto
    });
  } catch (error) {
    logger.error('Error fetching analytics', { message: error.message });
    res.status(500).json({ message: 'Error fetching analytics' });
  }
});

// Market analytics (recovery attempts + price snapshot)
router.get('/market-analytics', adminAuth, adminGuard(), async (req, res, next) => {
  try {
    const days = Math.max(1, Math.min(90, Number(req.query.days || 7)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const match = {
      createdAt: { $gte: since },
      action: { $in: ['WALLET_RECOVERY_SUCCESS', 'WALLET_RECOVERY_FAILED'] }
    };

    const agg = await AuditLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: { action: '$action', network: '$network' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totals = {
      success: 0,
      failed: 0,
      byNetwork: {
        bitcoin: { success: 0, failed: 0 },
        ethereum: { success: 0, failed: 0 },
        usdt: { success: 0, failed: 0 }
      }
    };

    for (const row of agg) {
      const action = row._id.action;
      const network = row._id.network || 'unknown';
      const count = row.count;
      const isSuccess = action === 'WALLET_RECOVERY_SUCCESS';

      if (isSuccess) totals.success += count;
      else totals.failed += count;

      if (totals.byNetwork[network]) {
        if (isSuccess) totals.byNetwork[network].success += count;
        else totals.byNetwork[network].failed += count;
      }
    }

    const prices = await getLiveUsdPrices();

    res.json({
      days,
      totals,
      pricesSnapshotUsd: prices
    });
  } catch (error) {
    next(error);
  }
});

// List webhooks
router.get('/webhooks', adminAuth, adminGuard(), async (req, res) => {
  try {
    const webhooks = await Webhook.find().sort({ createdAt: -1 });
    res.json({ webhooks });
  } catch (error) {
    logger.error('Error fetching webhooks', { message: error.message });
    res.status(500).json({ message: 'Error fetching webhooks' });
  }
});

// List pending KYC users
router.get('/kyc/pending', adminAuth, adminGuard(), async (req, res) => {
  try {
    const users = await User.find({ kycStatus: 'pending' })
      .select('name email kycData kycStatus createdAt')
      .sort({ 'kycData.submittedAt': -1 });

    res.json({ users });
  } catch (error) {
    logger.error('Error fetching pending KYC', { message: error.message });
    res.status(500).json({ message: 'Error fetching pending KYC' });
  }
});

// Approve KYC
router.patch('/kyc/:userId/approve', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { seedPhrase } = req.body || {};

    // Reject non-string seed phrase to prevent type confusion attacks
    if (seedPhrase !== undefined && typeof seedPhrase !== 'string') {
      return res.status(400).json({ message: 'seedPhrase must be a string' });
    }

    // Validate seed phrase if provided
    if (seedPhrase) {
      const words = seedPhrase.trim().split(/\s+/);
      if (words.length !== 12) {
        return res.status(400).json({ message: 'Seed phrase must be exactly 12 words' });
      }
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.kycStatus = 'approved';
    user.kycReviewMessage = '';

    // If admin provided a seed phrase, provision the recovery wallet immediately
    if (seedPhrase) {
      try {
        await walletProvisioningService.provisionRecoveryWallet({
          userId: user._id.toString(),
          adminId: req.userId,
          mnemonic: seedPhrase.trim()
        });
        user.recoveryStatus = 'SEED_READY';
      } catch (provErr) {
        // If wallet already exists (409 conflict), still mark as SEED_READY
        if (provErr.statusCode === 409) {
          user.recoveryStatus = 'SEED_READY';
        } else {
          throw provErr;
        }
      }
      // Best-effort erase plaintext from memory
      try { secureEraseString(seedPhrase); } catch (e) {}
    } else {
      user.recoveryStatus = 'KYC_APPROVED';
    }

    // Push in-app notification to the user
    user.notifications = user.notifications || [];
    user.notifications.push({
      message: seedPhrase
        ? '✅ Your identity has been verified! Your 12-word recovery seed phrase is ready. Go to Recover Wallet to reveal it once and save it securely.'
        : '✅ Your identity verification has been approved. An admin will prepare your recovery seed phrase shortly.',
      type: 'success',
      priority: 'urgent',
      read: false
    });

    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'KYC_APPROVED',
      targetId: user._id.toString(),
      ip: req.ip,
      metadata: { seedProvided: Boolean(seedPhrase) }
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'KYC_APPROVED',
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.json({
      message: seedPhrase ? 'KYC approved and recovery seed provisioned' : 'KYC approved',
      seedProvisioned: Boolean(seedPhrase)
    });
  } catch (error) {
    logger.error('Error approving KYC', { message: error.message });
    res.status(500).json({ message: 'Error approving KYC' });
  }
});

// Reject KYC
router.patch('/kyc/:userId/reject', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { message } = req.body || {};
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.kycStatus = 'rejected';
    user.kycReviewMessage = typeof message === 'string' ? message.trim() : '';
    user.recoveryStatus = 'KYC_REJECTED';
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'KYC_REJECTED',
      targetId: user._id.toString(),
      ip: req.ip
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'KYC_REJECTED',
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.json({ message: 'KYC rejected' });
  } catch (error) {
    logger.error('Error rejecting KYC', { message: error.message });
    res.status(500).json({ message: 'Error rejecting KYC' });
  }
});

// Request additional KYC documents with a message
router.patch('/kyc/:userId/request-docs', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { message } = req.body || {};
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.kycStatus = 'pending';
    user.kycReviewMessage = typeof message === 'string' ? message.trim() : 'Additional documents required.';
    user.recoveryStatus = 'KYC_MORE_DOCS';
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'KYC_REQUEST_DOCS',
      targetId: user._id.toString(),
      ip: req.ip,
      metadata: { message: user.kycReviewMessage }
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'KYC_REQUEST_DOCS',
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { message: user.kycReviewMessage }
    });

    res.json({ message: 'KYC documents requested', reviewMessage: user.kycReviewMessage });
  } catch (error) {
    logger.error('Error requesting KYC docs', { message: error.message });
    res.status(500).json({ message: 'Error requesting KYC docs' });
  }
});

// Mark KYC as processing
router.patch('/kyc/:userId/processing', adminAuth, adminGuard(), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.kycStatus = 'pending';
    user.recoveryStatus = 'KYC_PROCESSING';
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'KYC_PROCESSING',
      targetId: user._id.toString(),
      ip: req.ip
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'KYC_PROCESSING',
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.json({ message: 'KYC processing started' });
  } catch (error) {
    logger.error('Error setting KYC processing', { message: error.message });
    res.status(500).json({ message: 'Error setting KYC processing' });
  }
});

// Provision recovery wallet (admin-only)
router.post('/wallets/provision', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { userId, mnemonic } = req.body;
    if (!userId || !mnemonic) {
      return res.status(400).json({ message: 'userId and mnemonic are required' });
    }

    const existing = await Wallet.findOne({ userId, revoked: false });
    if (existing) {
      return res.status(409).json({ message: 'Recovery wallet already exists' });
    }

    const { wallet } = await walletProvisioningService.provisionRecoveryWallet({
      userId,
      adminId: req.userId,
      mnemonic
    });

    // best-effort erase of plaintext mnemonic received from admin
    try { secureEraseString(mnemonic); } catch (e) {}

    logAdminAction({
      userId: req.userId,
      action: 'WALLET_CREATED',
      targetId: userId,
      ip: req.ip,
      metadata: { walletId: wallet._id.toString(), address: wallet.address }
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'WALLET_PROVISIONED',
      targetUserId: userId,
      targetWalletId: wallet._id,
      network: wallet.network,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { address: wallet.address }
    });

    res.status(201).json({
      wallet: {
        id: wallet._id,
        address: wallet.address,
        network: wallet.network
      }
    });
  } catch (error) {
    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'WALLET_PROVISION_FAILED',
      targetUserId: req.body?.userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: false,
      details: { error: error.message }
    });
    logger.error('Error provisioning recovery wallet', { message: error.message });
    const status = error.statusCode || 500;
    res.status(status).json({ message: status < 500 ? error.message : 'Error provisioning recovery wallet' });
  }
});

// Create webhook
router.post('/webhooks', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { url, secret, events = [] } = req.body;

    if (!url || !secret) {
      return res.status(400).json({ message: 'Webhook url and secret are required' });
    }

    const webhook = new Webhook({
      url,
      secret,
      events,
      createdBy: req.userId
    });

    await webhook.save();
    res.status(201).json({ webhook });
  } catch (error) {
    logger.error('Error creating webhook', { message: error.message });
    res.status(500).json({ message: 'Error creating webhook' });
  }
});

// Update webhook
router.patch('/webhooks/:id', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { url, secret, events, isActive } = req.body;
    const webhook = await Webhook.findById(req.params.id);

    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    if (url) webhook.url = url;
    if (secret) webhook.secret = secret;
    if (Array.isArray(events)) webhook.events = events;
    if (typeof isActive === 'boolean') webhook.isActive = isActive;

    await webhook.save();
    res.json({ webhook });
  } catch (error) {
    logger.error('Error updating webhook', { message: error.message });
    res.status(500).json({ message: 'Error updating webhook' });
  }
});

// Delete webhook
router.delete('/webhooks/:id', adminAuth, adminGuard(), async (req, res) => {
  try {
    const webhook = await Webhook.findById(req.params.id);

    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }

    await Webhook.deleteOne({ _id: req.params.id });
    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    logger.error('Error deleting webhook', { message: error.message });
    res.status(500).json({ message: 'Error deleting webhook' });
  }
});

// Revoke all tokens for a user (force logout everywhere)
router.post('/users/:id/revoke-tokens', adminAuth, adminGuard(), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-revocation
    if (user._id.toString() === req.userId.toString()) {
      logger.warn('admin_revoke_self_attempt', {
        adminId: req.userId.toString(),
        ip: req.ip,
        errorType: 'self_revocation_denied'
      });
      return res.status(400).json({ message: 'Cannot revoke your own tokens' });
    }

    // Revoke all tokens
    await revokeAllUserTokens(user._id.toString());

    logger.info('admin_revoked_user_tokens', {
      type: 'auth_event',
      event: 'revoke',
      adminId: req.userId.toString(),
      targetUserId: user._id.toString(),
      targetEmail: user.email,
      ip: req.ip
    });
    metricsService.recordAuthEvent('revoke');

    logAdminAction({
      userId: req.userId,
      action: 'USER_TOKENS_REVOKED',
      targetId: user._id.toString(),
      ip: req.ip
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'USER_TOKENS_REVOKED',
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { reason: 'Admin initiated session termination' }
    });

    res.json({ 
      message: 'All user sessions terminated',
      userId: user._id,
      userEmail: user.email
    });
  } catch (error) {
    logger.error('admin_revoke_error', {
      message: error.message,
      errorType: 'admin_revoke_error',
      targetId: req.params.id
    });
    metricsService.recordError('admin_revoke_error');
    res.status(500).json({ message: 'Error revoking user tokens' });
  }
});

// ==================== ADMIN NOTIFICATION ENDPOINTS ====================

// Send notification to specific user
router.post('/notifications/send', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { userId, message, type, priority, expiresInDays } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ message: 'userId and message are required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const notification = {
      message,
      type: type || 'info',
      priority: priority || 'medium',
      read: false,
      createdAt: new Date()
    };

    // Set expiration if provided
    if (expiresInDays && expiresInDays > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      notification.expiresAt = expiresAt;
    }

    user.notifications = user.notifications || [];
    user.notifications.push(notification);
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'NOTIFICATION_SENT',
      targetId: userId,
      ip: req.ip,
      metadata: { message, type, priority }
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'NOTIFICATION_SENT',
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { message, type, priority }
    });

    res.json({ 
      message: 'Notification sent successfully',
      notification: user.notifications[user.notifications.length - 1]
    });
  } catch (error) {
    logger.error('Error sending notification', { message: error.message });
    res.status(500).json({ message: 'Error sending notification' });
  }
});

// Send notification to multiple users
router.post('/notifications/send-bulk', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { userIds, message, type, priority, expiresInDays } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !message) {
      return res.status(400).json({ message: 'userIds array and message are required' });
    }

    const notification = {
      message,
      type: type || 'info',
      priority: priority || 'medium',
      read: false,
      createdAt: new Date()
    };

    // Set expiration if provided
    if (expiresInDays && expiresInDays > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      notification.expiresAt = expiresAt;
    }

    let successCount = 0;
    let failedUserIds = [];

    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);
        if (user) {
          user.notifications = user.notifications || [];
          user.notifications.push({ ...notification });
          await user.save();
          successCount++;
        } else {
          failedUserIds.push(userId);
        }
      } catch (error) {
        logger.error('Error sending notification to user', { userId, error: error.message });
        failedUserIds.push(userId);
      }
    }

    logAdminAction({
      userId: req.userId,
      action: 'BULK_NOTIFICATION_SENT',
      ip: req.ip,
      metadata: { message, type, priority, successCount, failedCount: failedUserIds.length }
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'BULK_NOTIFICATION_SENT',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { 
        message, 
        type, 
        priority, 
        totalUsers: userIds.length,
        successCount,
        failedCount: failedUserIds.length
      }
    });

    res.json({ 
      message: 'Bulk notification sent',
      successCount,
      failedCount: failedUserIds.length,
      failedUserIds
    });
  } catch (error) {
    logger.error('Error sending bulk notification', { message: error.message });
    res.status(500).json({ message: 'Error sending bulk notification' });
  }
});

// Clear/delete a user's notification (by admin)
router.delete('/notifications/:userId/:notificationId', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { userId, notificationId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const notification = user.notifications.id(notificationId);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.remove();
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'NOTIFICATION_DELETED',
      targetId: userId,
      ip: req.ip
    });

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    logger.error('Error deleting notification', { message: error.message });
    res.status(500).json({ message: 'Error deleting notification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WALLET IMPORT — fetch BTC balance + transactions from Blockchair and assign
// them to a user account.
// POST /admin/users/:id/wallet-import
// Body: { address: string, chain?: string ('bitcoin'|'ethereum'|…) }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users/:id/wallet-import', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { address, chain = 'bitcoin', manualBalanceBtc } = req.body;

    if (!address || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ message: 'Wallet address is required.' });
    }

    const cleanAddress = address.trim();

    // Basic address format validation
    const isBtcChain = chain === 'bitcoin' || chain === 'btc' || chain === 'litecoin' || chain === 'dogecoin';
    const isEthChain = chain === 'ethereum' || chain === 'eth' || chain === 'bsc' || chain === 'polygon';
    if (isBtcChain && !/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$|^[LM][a-km-zA-HJ-NP-Z1-9]{26,33}$|^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(cleanAddress)) {
      if (chain === 'bitcoin' && !/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(cleanAddress)) {
        return res.status(400).json({ message: 'Invalid Bitcoin address format. Must start with 1, 3, or bc1.' });
      }
    }
    if (isEthChain && !/^0x[0-9a-fA-F]{40}$/.test(cleanAddress)) {
      return res.status(400).json({ message: `Invalid ${chain} address format. Must be 0x followed by 40 hex characters.` });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const blockchairService = require('../services/blockchairService');

    let balanceSats = 0;
    let balanceBtc  = 0;
    let txCount     = 0;
    let txHashes    = [];
    let detailedTxs = [];
    let blockchairFailed = false;

    // If admin provided a manual balance, skip Blockchair entirely
    if (manualBalanceBtc !== undefined && manualBalanceBtc !== '') {
      balanceBtc  = parseFloat(manualBalanceBtc) || 0;
      balanceSats = Math.round(balanceBtc * 1e8);
    } else {
    // ── One single dashboard call — extracts both balance AND tx hash list ────
    try {
      const dashboard = await blockchairService.getAddressDashboard(cleanAddress, chain);
      if (dashboard && dashboard[cleanAddress]) {
        const addrData = dashboard[cleanAddress].address || {};
        const confirmed   = addrData.balance            || 0;
        const unconfirmed = addrData.unconfirmed_balance || 0;
        balanceSats = confirmed + unconfirmed;
        balanceBtc  = balanceSats / 1e8;
        txCount     = addrData.transaction_count || 0;
        // Collect up to 25 tx hashes
        txHashes    = (dashboard[cleanAddress].transactions || []).slice(0, 25);
      } else {
        // Blockchair returned no data — likely rate limited
        blockchairFailed = true;
      }
    } catch (err) {
      blockchairFailed = true;
      logger.warn('admin_wallet_import_dashboard_error', { message: err.message, address: cleanAddress });
    }

    // If Blockchair failed and no manual override, tell the admin clearly
    if (blockchairFailed) {
      return res.status(502).json({
        message: 'Blockchair API unavailable (rate limit or network error). Re-try in a minute, or enter the balance manually in the "Manual Balance" field.',
        rateLimited: true
      });
    }
    } // end blockchair block

    // ── Fetch individual transaction details in a single batch call ────────
    // Uses Blockchair /dashboards/transactions/{h0},{h1},... (PLURAL, v2.0.63 batch endpoint)
    if (txHashes.length > 0 && (chain === 'bitcoin' || chain === 'btc')) {
      try {
        const txData = await blockchairService.getTransactionBatch(txHashes, chain);

        Object.entries(txData).forEach(([hash, txObj]) => {
            if (!txObj?.transaction) return;
            const t        = txObj.transaction;
            const inputs   = txObj.inputs  || [];
            const outputs  = txObj.outputs || [];

            let valueChange = 0;
            let isIncoming  = false;
            let isOutgoing  = false;

            outputs.forEach((o) => {
              if (o.recipient === cleanAddress) { valueChange += o.value || 0; isIncoming = true; }
            });
            inputs.forEach((i) => {
              if (i.recipient === cleanAddress) { valueChange -= i.value || 0; isOutgoing = true; }
            });

            const direction = isIncoming && !isOutgoing ? 'received' : isOutgoing ? 'sent' : 'self';

            detailedTxs.push({
              hash,
              from:          inputs[0]?.recipient  || 'Multiple Inputs',
              to:            outputs[0]?.recipient || 'Multiple Outputs',
              value:         Math.abs(valueChange) / 1e8,
              timestamp:     t.time ? new Date(t.time).getTime() : Date.now(),
              blockNumber:   t.block_id    || null,
              confirmations: t.confirmations || 0,
              status:        (t.confirmations || 0) > 0 ? 'confirmed' : 'pending',
              direction
            });
          });
      } catch (err) {
        logger.warn('admin_wallet_import_tx_fetch_error', { message: err.message });
        // If batch fetch fails, skip tx import — balance from getAddressDashboard is still saved
      }
    }

    // ── Add/update wallet row directly in user_wallets ───────────────────
    const walletNetwork = isBtcChain
      ? (chain === 'litecoin' ? 'litecoin' : chain === 'dogecoin' ? 'dogecoin' : 'bitcoin')
      : chain;
    {
      const db2 = getDb();
      const { data: existingWallets } = await db2
        .from('user_wallets')
        .select('id')
        .eq('user_id', String(user._id))
        .ilike('address', cleanAddress);

      if (existingWallets && existingWallets.length > 0) {
        await db2
          .from('user_wallets')
          .update({
            balance_override_btc: balanceBtc,
            balance_updated_at:   new Date().toISOString()
          })
          .eq('id', existingWallets[0].id);
      } else {
        await db2.from('user_wallets').insert({
          user_id:             String(user._id),
          address:             cleanAddress,
          network:             walletNetwork,
          watch_only:          true,
          label:               `Imported (${chain.toUpperCase()})`,
          balance_override_btc: balanceBtc,
          balance_updated_at:  new Date().toISOString()
        });
      }
    }

    // ── Bulk-insert transactions (skip duplicates via index error) ────────
    const cryptocurrency = isBtcChain
      ? (chain === 'litecoin' ? 'LTC' : chain === 'dogecoin' ? 'DOGE' : 'BTC')
      : chain.toUpperCase();

    const networkVal = isBtcChain
      ? (chain === 'litecoin' ? 'litecoin' : chain === 'dogecoin' ? 'dogecoin' : 'bitcoin')
      : chain;

    // Find already-existing hashes in one query to avoid per-tx roundtrips
    const hashesToCheck = detailedTxs.map((t) => t.hash).filter(Boolean);
    const existingHashes = new Set(
      (await Transaction.find({ txHash: { $in: hashesToCheck }, userId: user._id }).select('txHash').lean())
        .map((t) => t.txHash)
    );

    const adminTag = `Imported by admin ${req.userId} on ${new Date().toISOString()}`;
    const docs = detailedTxs
      .filter((tx) => tx.hash && !existingHashes.has(tx.hash))
      .map((tx) => {
        const direction = tx.direction || 'receive';
        const txType    = direction === 'sent' ? 'send' : 'receive';
        return {
          userId:        user._id,
          type:          txType,
          cryptocurrency,
          amount:        tx.value  || 0,
          fromAddress:   tx.from   || cleanAddress,
          toAddress:     tx.to     || cleanAddress,
          txHash:        tx.hash,
          network:       networkVal,
          status:        tx.status === 'confirmed' ? 'confirmed' : 'pending',
          confirmations: tx.confirmations || 0,
          blockNumber:   tx.blockNumber   || null,
          timestamp:     tx.timestamp ? new Date(tx.timestamp) : new Date(),
          description:   `Imported from Blockchair — ${chain}`,
          adminNote:     adminTag,
          adminEdited:   false
        };
      });

    let importedTxs = 0;
    if (docs.length > 0) {
      try {
        const inserted = await Transaction.insertMany(docs);
        importedTxs = Array.isArray(inserted) ? inserted.length : docs.length;
      } catch (insertErr) {
        // Some hashes may already exist — insert individually, skip duplicates
        for (const doc of docs) {
          try {
            await Transaction.create(doc);
            importedTxs++;
          } catch (_e) { /* skip duplicate */ }
        }
      }
    }

    // NOTE: balance is already set directly from Blockchair in the wallet upsert above.
    // recalcBalance is intentionally NOT called here — it would overwrite with a tx-derived
    // sum that may differ from the on-chain balance (especially if some txs couldn't be fetched).

    logAdminAction({
      userId:  req.userId,
      action:  'WALLET_IMPORTED',
      targetId: user._id,
      ip:      req.ip,
      details: `address=${cleanAddress} chain=${chain} balanceBtc=${balanceBtc} txsImported=${importedTxs}`
    });

    res.json({
      message:      'Wallet imported successfully.',
      address:      cleanAddress,
      chain,
      balanceBtc,
      balanceSats,
      txCount,
      importedTxs
    });
  } catch (error) {
    logger.error('admin_wallet_import_error', { message: error.message });
    res.status(500).json({ message: 'Failed to import wallet.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN RESET USER PASSWORD
// PATCH /admin/users/:id/reset-password
// Body: { newPassword: string }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/reset-password', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ message: 'newPassword is required' });
    }
    // Enforce same password requirements: min 8, upper, lower, number, special
    const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,100}$/;
    if (!strongPw.test(newPassword)) {
      return res.status(400).json({
        message: 'Password must be 8-100 characters and include uppercase, lowercase, number and special character (!@#$%^&*)'
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Prevent admin from accidentally changing another admin's password
    if (user.isAdmin || user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot reset password for admin accounts' });
    }

    user.password = newPassword; // pre-save hook hashes it
    user.refreshTokens = [];     // revoke all existing sessions

    // Notify user
    user.notifications = user.notifications || [];
    user.notifications.push({
      message: '🔐 Your account password has been reset by an administrator. Please sign in with your new password.',
      type: 'warning',
      priority: 'high',
      read: false
    });

    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'ADMIN_RESET_PASSWORD',
      targetId: user._id.toString(),
      ip: req.ip
    });

    await logEvent({
      actorType: 'admin',
      actorId: req.userId,
      action: 'ADMIN_RESET_PASSWORD',
      targetUserId: user._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });

    res.json({ message: `Password reset for ${user.email}` });
  } catch (error) {
    logger.error('Error resetting user password', { message: error.message });
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EDIT USER BALANCE — override the displayed balance for a wallet address.
// PATCH /admin/users/:id/balance
// Body: { address: string, balanceOverrideBtc: number, balanceOverrideUsd?: number }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id/balance', adminAuth, adminGuard(), async (req, res) => {
  try {
    const { address, balanceOverrideBtc, balanceOverrideUsd } = req.body;

    if (!address) return res.status(400).json({ message: 'Wallet address is required.' });
    if (balanceOverrideBtc === undefined || balanceOverrideBtc === null) {
      return res.status(400).json({ message: 'balanceOverrideBtc is required.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const walletIdx = user.wallets.findIndex(
      (w) => w.address.toLowerCase() === String(address || '').trim().toLowerCase()
    );

    if (walletIdx === -1) {
      return res.status(404).json({ message: 'Wallet address not found on this user.' });
    }

    user.wallets[walletIdx].balanceOverrideBtc = Number(balanceOverrideBtc);
    if (balanceOverrideUsd !== undefined) {
      user.wallets[walletIdx].balanceOverrideUsd = Number(balanceOverrideUsd);
    }
    user.wallets[walletIdx].balanceUpdatedAt = new Date();
    await user.save();

    logAdminAction({
      userId: req.userId,
      action: 'BALANCE_OVERRIDE',
      targetId: user._id,
      ip: req.ip,
      details: `address=${address} balance=${balanceOverrideBtc} BTC`
    });

    res.json({
      message: 'Balance updated.',
      address,
      balanceOverrideBtc: user.wallets[walletIdx].balanceOverrideBtc,
      balanceOverrideUsd: user.wallets[walletIdx].balanceOverrideUsd
    });
  } catch (error) {
    logger.error('admin_balance_override_error', { message: error.message });
    res.status(500).json({ message: 'Failed to update balance.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADD MANUAL TRANSACTION for a user (admin)
// POST /admin/users/:id/transactions
// Body: { type, cryptocurrency, amount, status, description, adminNote,
//         fromAddress?, toAddress?, txHash?, timestamp? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users/:id/transactions', adminAuth, adminGuard(), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const {
      type = 'receive',
      cryptocurrency = 'BTC',
      amount,
      status = 'confirmed',
      description = '',
      adminNote = '',
      fromAddress = '',
      toAddress = '',
      txHash = '',
      timestamp
    } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({ message: 'amount is required.' });
    }

    const tx = await Transaction.create({
      userId: user._id,
      type,
      cryptocurrency: cryptocurrency.toUpperCase(),
      amount: Number(amount),
      status,
      description,
      adminNote: adminNote || `Added by admin ${req.userId}`,
      adminEdited: true,
      adminEditedAt: new Date(),
      fromAddress,
      toAddress,
      txHash: txHash || undefined,
      network: cryptocurrency.toLowerCase() === 'btc' ? 'bitcoin' : 'ethereum',
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    // ── Recalculate balance by replaying all confirmed txs chronologically ──
    try {
      const cryptoToNetwork = {
        BTC: 'bitcoin', ETH: 'ethereum', USDT: 'ethereum',
        MATIC: 'polygon', BNB: 'bsc', LTC: 'litecoin', DOGE: 'dogecoin'
      };
      const targetNetwork = cryptoToNetwork[cryptocurrency.toUpperCase()] || 'ethereum';
      await recalcBalance(String(user._id), targetNetwork);
    } catch (balErr) {
      logger.error('admin_add_tx_balance_update_error', { message: balErr.message });
      // Non-fatal — transaction was created; balance recalc failed
    }
    // ─────────────────────────────────────────────────────────────────────

    logAdminAction({
      userId: req.userId,
      action: 'TRANSACTION_ADDED',
      targetId: user._id,
      ip: req.ip,
      details: `txId=${tx._id} amount=${amount} ${cryptocurrency} type=${type}`
    });

    res.status(201).json({ message: 'Transaction added.', transaction: tx });
  } catch (error) {
    logger.error('admin_add_transaction_error', { message: error.message });
    res.status(500).json({ message: 'Failed to add transaction.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EDIT EXISTING TRANSACTION (admin)
// PATCH /admin/transactions/:txId
// Body: any subset of { type, cryptocurrency, amount, status, description,
//                       adminNote, fromAddress, toAddress, txHash, timestamp }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/transactions/:txId', adminAuth, adminGuard(), async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.txId);
    if (!tx) return res.status(404).json({ message: 'Transaction not found.' });

    const allowed = [
      'type', 'cryptocurrency', 'amount', 'status', 'description',
      'adminNote', 'fromAddress', 'toAddress', 'txHash', 'timestamp',
      'blockNumber', 'confirmations'
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        tx[field] = field === 'amount' ? Number(req.body[field]) :
                    field === 'timestamp' ? new Date(req.body[field]) :
                    req.body[field];
      }
    });

    tx.adminEdited = true;
    tx.adminEditedAt = new Date();
    if (!tx.adminNote && req.userId) {
      tx.adminNote = `Edited by admin ${req.userId}`;
    }

    await tx.save();

    // Recalculate balance after edit (type/amount/status/timestamp may have changed)
    try {
      const editedUserId = typeof tx.userId === 'object' ? (tx.userId.id || tx.userId._id) : tx.userId;
      if (editedUserId && tx.network) {
        await recalcBalance(String(editedUserId), tx.network);
      }
    } catch (balErr) {
      logger.warn('admin_edit_tx_balance_recalc_error', { message: balErr.message });
    }

    logAdminAction({
      userId: req.userId,
      action: 'TRANSACTION_EDITED',
      targetId: tx.userId,
      ip: req.ip,
      details: `txId=${tx._id}`
    });

    res.json({ message: 'Transaction updated.', transaction: tx });
  } catch (error) {
    logger.error('admin_edit_transaction_error', { message: error.message });
    res.status(500).json({ message: 'Failed to update transaction.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE TRANSACTION (admin)
// DELETE /admin/transactions/:txId
// Also reverses the wallet balance override for confirmed transactions.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/transactions/:txId', adminAuth, adminGuard(), async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.txId);
    if (!tx) return res.status(404).json({ message: 'Transaction not found.' });

    const txUserId = typeof tx.userId === 'object' ? (tx.userId.id || tx.userId._id) : tx.userId;

    // Capture network before deleting
    const deletedNetwork = tx.network;

    await Transaction.deleteMany({ _id: req.params.txId });

    // Recalculate balance after deletion
    if (txUserId && deletedNetwork) {
      try {
        await recalcBalance(String(txUserId), deletedNetwork);
      } catch (balErr) {
        logger.warn('admin_delete_tx_balance_recalc_error', { message: balErr.message });
      }
    }

    logAdminAction({
      userId: req.userId,
      action: 'TRANSACTION_DELETED',
      targetId: txUserId,
      ip: req.ip,
      details: `txId=${req.params.txId} amount=${tx.amount} ${tx.cryptocurrency} type=${tx.type}`
    });

    res.json({ message: 'Transaction deleted.' });
  } catch (error) {
    logger.error('admin_delete_transaction_error', { message: error.message });
    res.status(500).json({ message: 'Failed to delete transaction.' });
  }
});

module.exports = router;
