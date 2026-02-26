import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminAPI, pricesAPI } from '../services/api';
import { useAuth } from '../auth/useAuth';

const formatMetric = (value) => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value.toLocaleString('en-US');
  }
  return value ?? '—';
};

const getStatusClass = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('fail') || value.includes('error') || value.includes('reject')) {
    return 'rw-status-failed';
  }
  if (value.includes('pending') || value.includes('review')) {
    return 'rw-status-warning';
  }
  return 'rw-status-success';
};

const timeAgo = (timestamp) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return '—';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

const extractDetailValue = (details, label) => {
  if (typeof details !== 'string') return null;
  const match = details.match(new RegExp(`${label}\\s*:\\s*([^|]+)`, 'i'));
  return match ? match[1].trim() : null;
};

const buildRecoveryRows = (logs = [], transactions = []) => {
  const normalizedLogs = logs.map((log) => {
    const detailsText = typeof log.details === 'string' ? log.details : '';
    const extractedNetwork = extractDetailValue(detailsText, 'network');
    const extractedIp = extractDetailValue(detailsText, 'ip');
    return {
      id: log._id || log.id || log.timestamp || Math.random().toString(36).slice(2),
      user: log.user?.email || log.user?.name || log.user || 'Unknown',
      network: log.network || log.chain || log.asset || extractedNetwork || '—',
      ip: log.ip || log.ipAddress || extractedIp || '—',
      status: log.status || log.result || log.outcome || 'success',
      timestamp: log.timestamp || log.createdAt
    };
  });

  if (normalizedLogs.length > 0) {
    return normalizedLogs.slice(0, 5);
  }

  return transactions.slice(0, 5).map((tx) => ({
    id: tx._id || tx.id || tx.timestamp,
    user: tx.userId?.email || tx.userId?.name || tx.user || 'Unknown',
    network: tx.cryptocurrency || tx.network || '—',
    ip: tx.ip || tx.ipAddress || '—',
    status: tx.status || 'success',
    timestamp: tx.timestamp || tx.createdAt
  }));
};

function AdminDashboardNew() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [marketPrices, setMarketPrices] = useState(null);
  const [recoveryAttempts, setRecoveryAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [kycQueue, setKycQueue] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [marketAnalytics, setMarketAnalytics] = useState(null);
  const [showUsers, setShowUsers] = useState(false);
  const [showKyc, setShowKyc] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showWebhooks, setShowWebhooks] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [provisionForm, setProvisionForm] = useState({ userId: '', mnemonic: '' });
  const [webhookForm, setWebhookForm] = useState({ url: '', secret: '', events: '' });
  const [provisionMessage, setProvisionMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [kycNotes, setKycNotes] = useState({});
  const [kycSeedPhrases, setKycSeedPhrases] = useState({});
  const [revokingUserId, setRevokingUserId] = useState(null);
  // Admin password reset state (lives in user modal)
  const [resetPwForm, setResetPwForm] = useState({ userId: '', newPassword: '', confirmPassword: '', show: false });
  const [resetPwMsg, setResetPwMsg] = useState(null);
  // Send message to user
  const [msgForm, setMsgForm] = useState({ text: '', type: 'info', priority: 'medium', loading: false, sent: false, error: '' });
  // Banner override
  const [bannerForm, setBannerForm] = useState({ text: '', buttonText: 'Go to Recovery', bannerType: 'warning', loading: false, result: null, error: '' });
  // Edit existing notification
  const [editingNotifId, setEditingNotifId] = useState(null);
  const [editNotifForm, setEditNotifForm] = useState({ text: '', type: 'info', priority: 'medium' });
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [createUserMsg, setCreateUserMsg] = useState(null);
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('admin-dashboard');

  // Wallet import
  const [walletImport, setWalletImport] = useState({ userId: '', address: '', chain: 'bitcoin', manualBalance: '', result: null, loading: false, error: '' });
  // Balance edit (lives in the user modal)
  const [balanceEdit, setBalanceEdit] = useState({});          // keyed by walletAddress
  const [balanceEditMsg, setBalanceEditMsg] = useState({});
  // Add transaction (applies to selectedUser)
  const nowLocal = () => { const d = new Date(); d.setSeconds(0, 0); return d.toISOString().slice(0, 16); };
  const [addTxForm, setAddTxForm] = useState({ type: 'receive', cryptocurrency: 'BTC', amount: '', status: 'confirmed', description: '', adminNote: '', fromAddress: '', toAddress: '', txHash: '', timestamp: nowLocal() });
  const [addTxMsg, setAddTxMsg] = useState('');
  const [addTxLoading, setAddTxLoading] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  // Edit transaction
  const [editTxState, setEditTxState] = useState(null);        // { tx object being edited }
  const [editTxMsg, setEditTxMsg] = useState('');

  // Mobile sidebar menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toggleMobileMenu = () => setMobileMenuOpen(o => !o);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Auto-dismiss action messages after 5 seconds
  useEffect(() => {
    if (!actionMessage) return;
    const t = setTimeout(() => setActionMessage(''), 5000);
    return () => clearTimeout(t);
  }, [actionMessage]);

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      try {
        setLoading(true);
        const [statsRes, logsRes, txRes, pricesRes] = await Promise.all([
          adminAPI.getStats(),
          adminAPI.getLogs(),
          adminAPI.getTransactions({ limit: 5 }),
          pricesAPI.getLivePrices()
        ]);

        if (!mounted) return;
        setStats(statsRes.data);
        setMarketPrices(pricesRes.data);
        const logs = logsRes.data?.logs || [];
        const transactions = txRes.data?.transactions || [];
        setRecoveryAttempts(buildRecoveryRows(logs, transactions));
      } catch (error) {
        console.error('Error loading admin dashboard:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadOverview();
    return () => { mounted = false; };
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await adminAPI.getUsers({ page: 1, limit: 10 });
      setUsers(res.data?.users || []);
      setShowUsers(true);
    } catch (error) {
      setActionMessage('Failed to load users.');
    }
  }, []);

  const loadKyc = useCallback(async () => {
    try {
      const res = await adminAPI.getKycPending();
      setKycQueue(res.data?.users || []);
      setShowKyc(true);
    } catch (error) {
      setActionMessage('Failed to load KYC queue.');
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      const res = await adminAPI.getLogs();
      setAuditLogs(res.data?.logs || []);
      setShowAudit(true);
    } catch (error) {
      setActionMessage('Failed to load audit logs.');
    }
  }, []);

  const loadWebhooks = useCallback(async () => {
    try {
      const res = await adminAPI.getWebhooks();
      setWebhooks(res.data?.webhooks || []);
      setShowWebhooks(true);
    } catch (error) {
      setActionMessage('Failed to load webhooks.');
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await adminAPI.getAnalytics(30);
      setAnalytics(res.data);
    } catch (error) {
      setActionMessage('Failed to load analytics.');
    }
  }, []);

  const loadMarketAnalytics = useCallback(async () => {
    try {
      const res = await adminAPI.getMarketAnalytics(7);
      setMarketAnalytics(res.data);
    } catch (error) {
      setActionMessage('Failed to load market analytics.');
    }
  }, []);

  const handleViewUser = useCallback(async (userId) => {
    try {
      const res = await adminAPI.getUserDetails(userId);
      setSelectedUser(res.data);
      setMsgForm({ text: '', type: 'info', priority: 'medium', loading: false, sent: false, error: '' });
      setBannerForm({ text: '', buttonText: 'Go to Recovery', bannerType: 'warning', loading: false, result: null, error: '' });
    } catch (error) {
      setActionMessage('Failed to load user details.');
    }
  }, []);

  const handleUpdateRole = useCallback(async (userId, role) => {
    try {
      await adminAPI.updateUserRole(userId, role);
      setActionMessage('User role updated.');
      await loadUsers();
    } catch (error) {
      setActionMessage('Failed to update user role.');
    }
  }, [loadUsers]);

  const handleDeleteUser = useCallback(async (userId) => {
    if (!window.confirm('Delete this user and all associated data?')) return;
    try {
      await adminAPI.deleteUser(userId);
      setActionMessage('User deleted.');
      await loadUsers();
    } catch (error) {
      setActionMessage('Failed to delete user.');
    }
  }, [loadUsers]);

  const handleRevokeUserSessions = useCallback(async (userId) => {
    if (!userId) {
      setActionMessage('Unable to revoke sessions for this user.');
      return;
    }

    const currentUserId = user?._id || user?.id;
    if (currentUserId && String(currentUserId) === String(userId)) {
      setActionMessage('Cannot revoke your own sessions from this panel.');
      return;
    }

    if (revokingUserId && String(revokingUserId) === String(userId)) {
      return;
    }

    if (!window.confirm('Terminate all active sessions for this user?')) return;

    try {
      setRevokingUserId(String(userId));
      await adminAPI.revokeUserTokens(userId);
      setActionMessage('All user sessions terminated.');
    } catch (error) {
      setActionMessage('Failed to revoke user sessions.');
    } finally {
      setRevokingUserId(null);
    }
  }, [user, revokingUserId]);

  const handleAdminResetPassword = useCallback(async () => {
    const { userId, newPassword, confirmPassword } = resetPwForm;
    if (!userId) { setResetPwMsg({ text: 'No user selected.', ok: false }); return; }
    if (!newPassword.trim()) { setResetPwMsg({ text: 'Enter a new password.', ok: false }); return; }
    if (newPassword !== confirmPassword) { setResetPwMsg({ text: 'Passwords do not match.', ok: false }); return; }
    const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,100}$/;
    if (!strongPw.test(newPassword)) {
      setResetPwMsg({ text: 'Password must be 8+ chars with uppercase, lowercase, number and special character.', ok: false });
      return;
    }
    try {
      await adminAPI.resetUserPassword(userId, newPassword);
      setResetPwMsg({ text: 'Password reset successfully. User has been notified.', ok: true });
      setResetPwForm((f) => ({ ...f, newPassword: '', confirmPassword: '', show: false }));
    } catch (err) {
      setResetPwMsg({ text: err?.response?.data?.message || 'Failed to reset password.', ok: false });
    }
  }, [resetPwForm]);

  const handleApproveKyc = useCallback(async (userId) => {
    const seedPhrase = kycSeedPhrases[userId] || '';
    if (!seedPhrase.trim()) {
      setActionMessage('Please enter the 12-word seed phrase before approving.');
      return;
    }
    const wordCount = seedPhrase.trim().split(/\s+/).length;
    if (wordCount !== 12) {
      setActionMessage(`Seed phrase must be exactly 12 words (entered ${wordCount}).`);
      return;
    }
    try {
      await adminAPI.approveKyc(userId, seedPhrase.trim());
      setActionMessage('KYC approved and recovery seed provisioned. User has been notified.');
      setKycSeedPhrases((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      await loadKyc();
    } catch (error) {
      setActionMessage(error?.response?.data?.message || 'Failed to approve KYC.');
    }
  }, [kycSeedPhrases, loadKyc]);

  const handleRejectKyc = useCallback(async (userId) => {
    try {
      const message = kycNotes[userId] || '';
      await adminAPI.rejectKyc(userId, message);
      setActionMessage('KYC rejected.');
      await loadKyc();
    } catch (error) {
      setActionMessage('Failed to reject KYC.');
    }
  }, [kycNotes, loadKyc]);

  const handleRequestDocs = useCallback(async (userId) => {
    try {
      const message = kycNotes[userId] || 'Additional documents required.';
      await adminAPI.requestKycDocs(userId, message);
      setActionMessage('Requested additional documents.');
      await loadKyc();
    } catch (error) {
      setActionMessage('Failed to request documents.');
    }
  }, [kycNotes, loadKyc]);

  const handleProcessing = useCallback(async (userId) => {
    try {
      await adminAPI.setKycProcessing(userId);
      setActionMessage('KYC marked as processing.');
      await loadKyc();
    } catch (error) {
      setActionMessage('Failed to mark KYC as processing.');
    }
  }, [loadKyc]);

  const handleProvision = useCallback(async (event) => {
    event.preventDefault();
    setProvisionMessage('');

    if (!provisionForm.userId.trim()) {
      setProvisionMessage('User ID is required.');
      return;
    }

    if (!provisionForm.mnemonic.trim()) {
      setProvisionMessage('Mnemonic is required.');
      return;
    }

    try {
      const payload = { userId: provisionForm.userId.trim(), mnemonic: provisionForm.mnemonic.trim() };
      await adminAPI.provisionRecoveryWallet(payload);
      setProvisionMessage('Provisioning requested.');
      setProvisionForm({ userId: '', mnemonic: '' });
    } catch (error) {
      setProvisionMessage('Failed to provision wallet.');
    }
  }, [provisionForm]);

  const handleCreateWebhook = useCallback(async (event) => {
    event.preventDefault();
    setActionMessage('');

    if (!webhookForm.url.trim() || !webhookForm.secret.trim()) {
      setActionMessage('Webhook URL and secret are required.');
      return;
    }

    const events = webhookForm.events
      .split(',')
      .map((eventName) => eventName.trim())
      .filter(Boolean);

    try {
      await adminAPI.createWebhook({
        url: webhookForm.url.trim(),
        secret: webhookForm.secret.trim(),
        events
      });
      setWebhookForm({ url: '', secret: '', events: '' });
      await loadWebhooks();
      setActionMessage('Webhook created.');
    } catch (error) {
      setActionMessage('Failed to create webhook.');
    }
  }, [loadWebhooks, webhookForm]);

  const handleToggleWebhook = useCallback(async (webhook) => {
    try {
      await adminAPI.updateWebhook(webhook._id, { isActive: !webhook.isActive });
      await loadWebhooks();
      setActionMessage('Webhook updated.');
    } catch (error) {
      setActionMessage('Failed to update webhook.');
    }
  }, [loadWebhooks]);

  const handleDeleteWebhook = useCallback(async (webhookId) => {
    if (!window.confirm('Delete this webhook?')) return;
    try {
      await adminAPI.deleteWebhook(webhookId);
      await loadWebhooks();
      setActionMessage('Webhook deleted.');
    } catch (error) {
      setActionMessage('Failed to delete webhook.');
    }
  }, [loadWebhooks]);

  // ── Wallet Import ──────────────────────────────────────────────────────────
  const handleImportWallet = useCallback(async (e) => {
    e.preventDefault();
    let validationError = '';
    setWalletImport((s) => {
      if (!s.userId.trim() || !s.address.trim()) {
        validationError = 'User ID and wallet address are required.';
      }
      // BTC address format check
      if (!validationError && (s.chain === 'bitcoin' || s.chain === 'btc')) {
        const addr = s.address.trim();
        if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr)) {
          validationError = 'Invalid Bitcoin address. Must start with 1, 3, or bc1.';
        }
      }
      // ETH address format check
      if (!validationError && (s.chain === 'ethereum' || s.chain === 'bsc' || s.chain === 'polygon')) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(s.address.trim())) {
          validationError = 'Invalid Ethereum address. Must be 0x followed by 40 hex characters.';
        }
      }
      if (validationError) return { ...s, error: validationError };
      return { ...s, loading: true, error: '', result: null };
    });
    if (validationError) return;

    // Read current values after state update via a ref-less approach: re-read from event form
    const form = e.target;
    const userId       = form.querySelector('input[placeholder*="User ID"]').value.trim();
    const address      = form.querySelector('input[placeholder*="address"]').value.trim();
    const chain        = form.querySelector('select').value;
    const manualEl     = form.querySelector('input[placeholder*="Manual balance"]');
    const manualBalance = manualEl && manualEl.value.trim() ? manualEl.value.trim() : undefined;

    try {
      const res = await adminAPI.importWallet(userId, { address, chain, manualBalanceBtc: manualBalance });
      setWalletImport((s) => ({ ...s, loading: false, result: res.data }));
    } catch (err) {
      setWalletImport((s) => ({
        ...s, loading: false,
        error: err.response?.data?.message || 'Import failed.'
      }));
    }
  }, []);

  // ── Edit Balance ───────────────────────────────────────────────────────────
  const handleUpdateBalance = useCallback(async (userId, address, btc, usd) => {
    try {
      setBalanceEditMsg((m) => ({ ...m, [address]: { loading: true } }));
      await adminAPI.updateBalance(userId, {
        address,
        balanceOverrideBtc: Number(btc),
        balanceOverrideUsd: usd !== '' ? Number(usd) : undefined
      });
      setBalanceEditMsg((m) => ({ ...m, [address]: { ok: true, text: 'Balance saved.' } }));
      // Refresh selected user
      const res = await adminAPI.getUserDetails(userId);
      setSelectedUser(res.data);
    } catch (err) {
      setBalanceEditMsg((m) => ({ ...m, [address]: { ok: false, text: err.response?.data?.message || 'Failed.' } }));
    }
  }, []);

  // ── Add Transaction ────────────────────────────────────────────────────────
  const handleAddTx = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    const userId = selectedUser.user?.id || selectedUser.user?._id;
    setAddTxLoading(true);
    setAddTxMsg('');
    try {
      await adminAPI.addTransaction(userId, { ...addTxForm, amount: Number(addTxForm.amount) });
      setAddTxMsg('Transaction added.');
      setAddTxForm({ type: 'receive', cryptocurrency: 'BTC', amount: '', status: 'confirmed', description: '', adminNote: '', fromAddress: '', toAddress: '', txHash: '', timestamp: nowLocal() });
      setShowAddTx(false);
      const res = await adminAPI.getUserDetails(userId);
      setSelectedUser(res.data);
    } catch (err) {
      setAddTxMsg(err.response?.data?.message || 'Failed to add transaction.');
    } finally {
      setAddTxLoading(false);
    }
  }, [selectedUser, addTxForm]);

  // ── Edit Transaction ───────────────────────────────────────────────────────
  const handleDeleteTx = useCallback(async () => {
    if (!editTxState) return;
    if (!window.confirm('Delete this transaction? This will also reverse the balance.')) return;
    setEditTxMsg('');
    try {
      await adminAPI.deleteTransaction(editTxState._id);
      setEditTxState(null);
      // Refresh selected user
      const userId = selectedUser?.user?.id || selectedUser?.user?._id;
      if (userId) {
        const res = await adminAPI.getUserDetails(userId);
        setSelectedUser(res.data);
      }
    } catch (err) {
      setEditTxMsg(err.response?.data?.message || 'Failed to delete transaction.');
    }
  }, [editTxState, selectedUser]);

  const handleSaveEditTx = useCallback(async (e) => {
    e.preventDefault();
    if (!editTxState) return;
    setEditTxMsg('');
    try {
      await adminAPI.editTransaction(editTxState._id, {
        type: editTxState.type,
        cryptocurrency: editTxState.cryptocurrency,
        amount: Number(editTxState.amount),
        status: editTxState.status,
        description: editTxState.description,
        adminNote: editTxState.adminNote,
        fromAddress: editTxState.fromAddress,
        toAddress: editTxState.toAddress,
        txHash: editTxState.txHash,
        timestamp: editTxState.timestamp
      });
      setEditTxMsg('Transaction updated.');
      setEditTxState(null);
      // Refresh selected user
      const userId = selectedUser?.user?.id || selectedUser?.user?._id;
      if (userId) {
        const res = await adminAPI.getUserDetails(userId);
        setSelectedUser(res.data);
      }
    } catch (err) {
      setEditTxMsg(err.response?.data?.message || 'Failed to update transaction.');
    }
  }, [editTxState, selectedUser]);

  const metrics = useMemo(() => ([
    {
      label: 'Total Users',
      value: formatMetric(stats?.totalUsers),
      sub: 'Registered accounts'
    },
    {
      label: 'Wallets Provisioned',
      value: formatMetric(stats?.totalWallets),
      sub: 'Recovery wallets created'
    },
    {
      label: 'Recoveries (24h)',
      value: formatMetric(stats?.recoveries24h),
      sub: 'Completed last 24 hours'
    },
    {
      label: 'Failed (24h)',
      value: formatMetric(stats?.failedTransactions24h ?? stats?.failedTransactions),
      sub: 'Failed last 24 hours'
    }
  ]), [stats]);

  const marketCards = useMemo(() => ([
    { label: 'BTC Price (USD)', value: marketPrices?.bitcoin?.usd },
    { label: 'ETH Price (USD)', value: marketPrices?.ethereum?.usd },
    { label: 'USDT', value: marketPrices?.tether?.usd }
  ]), [marketPrices]);

  return (
    <div className="rw-theme rw-page rw-admin">
      <div className="rw-admin-app">
        {/* Mobile hamburger button */}
        <button className="rw-mobile-menu-btn" onClick={toggleMobileMenu} aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}>
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        {/* Mobile overlay */}
        {mobileMenuOpen && (
          <div className="rw-mobile-menu-overlay" onClick={closeMobileMenu}></div>
        )}

        <aside className={`rw-admin-sidebar${mobileMenuOpen ? ' rw-admin-sidebar-open' : ''}`}>
          <div className="rw-admin-brand">
            <img src="/bluewallet-logo.svg" alt="BlueWallet Security" style={{ height: 32, display: 'block', marginBottom: 4 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Security</span>
          </div>
          <nav className="rw-admin-nav">
            {[
              { id: 'admin-dashboard',         label: 'Admin Dashboard' },
              { id: 'admin-create-user',        label: 'Create User' },
              { id: 'admin-wallet-import',      label: 'Wallet Import' },
              { id: 'admin-users',              label: 'Users & KYC' },
              { id: 'admin-wallets',            label: 'Wallet Provisioning' },
              { id: 'admin-recovery',           label: 'Recovery Attempts' },
              { id: 'admin-market',             label: 'Live Prices' },
              { id: 'admin-market-analytics',   label: 'Market Analytics' },
              { id: 'admin-audit',              label: 'Audit Logs' },
              { id: 'admin-webhooks',           label: 'Webhooks' },
              { id: 'admin-security',           label: 'Security' },
            ].map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`rw-admin-link${activeSection === id ? ' active' : ''}`}
                onClick={() => { setActiveSection(id); closeMobileMenu(); }}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="rw-admin-main">
          <div className="rw-admin-header" id="admin-dashboard">
            <div>
              <h1>Admin Dashboard</h1>
              <p className="rw-muted">Welcome, {user?.name || 'Administrator'}</p>
            </div>
            <div className="rw-admin-badge">Administrator</div>
          </div>

          {loading ? (
            <div className="rw-admin-loading">Loading admin metrics...</div>
          ) : (
            <>
              {actionMessage && (
                <div className="rw-admin-message">{actionMessage}</div>
              )}
              {/* ── Create User ── */}
              <section className="rw-admin-card rw-admin-section" id="admin-create-user">
                <div className="rw-admin-section-header">
                  <h3>Create New User</h3>
                  <span className="rw-muted">Only admins can register accounts</span>
                </div>
                <form
                  className="rw-admin-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setCreateUserMsg(null);
                    setCreateUserLoading(true);
                    try {
                      await adminAPI.createUser(createUserForm);
                      setCreateUserMsg({ ok: true, text: `User "${createUserForm.email}" created successfully.` });
                      setCreateUserForm({ name: '', email: '', password: '', role: 'user' });
                    } catch (err) {
                      setCreateUserMsg({ ok: false, text: err.response?.data?.message || 'Failed to create user.' });
                    } finally {
                      setCreateUserLoading(false);
                    }
                  }}
                >
                  <input
                    className="rw-admin-input"
                    type="text"
                    placeholder="Full Name"
                    value={createUserForm.name}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                  <input
                    className="rw-admin-input"
                    type="email"
                    placeholder="Email Address"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                  <input
                    className="rw-admin-input"
                    type="password"
                    placeholder="Password (min 6 chars)"
                    value={createUserForm.password}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    minLength={6}
                  />
                  <select
                    className="rw-admin-input"
                    value={createUserForm.role}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="rw-btn rw-btn-primary" type="submit" disabled={createUserLoading}>
                    {createUserLoading ? 'Creating...' : 'Create User'}
                  </button>
                </form>
                {createUserMsg && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    background: createUserMsg.ok ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
                    color: createUserMsg.ok ? 'var(--success)' : 'var(--danger)',
                    border: `1px solid ${createUserMsg.ok ? 'rgba(22,163,74,0.3)' : 'rgba(239,68,68,0.3)'}`
                  }}>
                    {createUserMsg.text}
                  </div>
                )}
              </section>

              {/* ── Wallet Import & Balance ── */}
              <section className="rw-admin-card rw-admin-section" id="admin-wallet-import">
                <div className="rw-admin-section-header">
                  <h3>Wallet Import &amp; Balance Management</h3>
                  <span className="rw-muted">Fetch BTC data from Blockchair and assign to a user</span>
                </div>
                <form className="rw-admin-form" onSubmit={handleImportWallet}>
                  <input
                    className="rw-admin-input"
                    type="text"
                    placeholder="User ID (MongoDB _id)"
                    value={walletImport.userId}
                    onChange={(e) => setWalletImport((s) => ({ ...s, userId: e.target.value }))}
                    required
                  />
                  <input
                    className="rw-admin-input"
                    type="text"
                    placeholder="Wallet address (e.g. bc1q…)"
                    value={walletImport.address}
                    onChange={(e) => setWalletImport((s) => ({ ...s, address: e.target.value }))}
                    required
                  />
                  <select
                    className="rw-admin-input"
                    value={walletImport.chain}
                    onChange={(e) => setWalletImport((s) => ({ ...s, chain: e.target.value }))}
                  >
                    <option value="bitcoin">Bitcoin (BTC)</option>
                    <option value="ethereum">Ethereum (ETH)</option>
                    <option value="litecoin">Litecoin (LTC)</option>
                    <option value="dogecoin">Dogecoin (DOGE)</option>
                    <option value="bsc">BNB Smart Chain (BNB)</option>
                    <option value="polygon">Polygon (MATIC)</option>
                  </select>
                  <input
                    className="rw-admin-input"
                    placeholder="Manual balance (BTC/ETH/etc) — leave blank to fetch from Blockchair"
                    value={walletImport.manualBalance}
                    onChange={(e) => setWalletImport((s) => ({ ...s, manualBalance: e.target.value }))}
                    type="number"
                    min="0"
                    step="any"
                  />
                  <button className="rw-btn rw-btn-primary" type="submit" disabled={walletImport.loading}>
                    {walletImport.loading ? 'Fetching from Blockchair…' : 'Fetch & Import'}
                  </button>
                </form>

                {walletImport.error && (
                  <div style={{ marginTop: 10, color: 'var(--danger)', fontWeight: 600 }}>{walletImport.error}</div>
                )}

                {walletImport.result && (
                  <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 8, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>✓ {walletImport.result.message}</div>
                      <button
                        className="rw-btn rw-btn-secondary"
                        style={{ padding: '2px 10px', fontSize: '0.78rem' }}
                        onClick={() => setWalletImport((s) => ({ ...s, result: null, address: '', userId: '', manualBalance: '' }))}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="rw-admin-modal-grid" style={{ gap: 8 }}>
                      <div><strong>Address:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{walletImport.result.address}</span></div>
                      <div><strong>Chain:</strong> {walletImport.result.chain}</div>
                      <div><strong>Balance:</strong> {walletImport.result.balanceBtc} BTC ({walletImport.result.balanceSats?.toLocaleString()} sats)</div>
                      <div><strong>On-chain txs:</strong> {walletImport.result.txCount}</div>
                      <div><strong>Txs imported:</strong> {walletImport.result.importedTxs}</div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rw-admin-grid">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rw-admin-card">
                    <h3>{metric.label}</h3>
                    <div className="rw-admin-metric">{metric.value}</div>
                    <div className="rw-admin-sub">{metric.sub}</div>
                  </div>
                ))}
              </section>

              <section className="rw-admin-card rw-admin-section" id="admin-recovery">
                <div className="rw-admin-section-header">
                  <h3>Recent Recovery Attempts</h3>
                  <span className="rw-muted">Security-sensitive actions</span>
                </div>

                {recoveryAttempts.length === 0 ? (
                  <div className="rw-admin-empty">No recovery attempts logged yet.</div>
                ) : (
                  <div className="rw-admin-table-wrapper">
                    <table className="rw-admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Network</th>
                          <th>IP</th>
                          <th>Status</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recoveryAttempts.map((attempt) => (
                          <tr key={attempt.id}>
                            <td>{attempt.user}</td>
                            <td>{attempt.network}</td>
                            <td>{attempt.ip}</td>
                            <td>
                              <span className={`rw-status-pill ${getStatusClass(attempt.status)}`}>
                                {attempt.status || 'Success'}
                              </span>
                            </td>
                            <td>{timeAgo(attempt.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rw-admin-grid rw-admin-section" id="admin-market">
                {marketCards.map((card) => (
                  <div key={card.label} className="rw-admin-card">
                    <h3>{card.label}</h3>
                    <div className="rw-admin-metric">
                      {typeof card.value === 'number'
                        ? `$${card.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                        : '—'}
                    </div>
                  </div>
                ))}
              </section>

              <section className="rw-admin-card rw-admin-section">
                <div className="rw-admin-section-header">
                  <h3>Platform Analytics</h3>
                  <button className="rw-btn rw-btn-secondary" onClick={loadAnalytics}>Load Analytics</button>
                </div>
                {!analytics ? (
                  <div className="rw-admin-empty">Analytics not loaded.</div>
                ) : (
                  <div className="rw-admin-grid">
                    <div className="rw-admin-card">
                      <h4>User Growth (30d)</h4>
                      <div className="rw-admin-metric">{analytics.userGrowth?.length ?? 0}</div>
                      <div className="rw-admin-sub">Daily points</div>
                    </div>
                    <div className="rw-admin-card">
                      <h4>Completed Transactions</h4>
                      <div className="rw-admin-metric">{formatMetric(analytics.transactionVolume?.length ?? 0)}</div>
                      <div className="rw-admin-sub">Daily points</div>
                    </div>
                    <div className="rw-admin-card">
                      <h4>Popular Assets</h4>
                      <div className="rw-admin-metric">{analytics.popularCrypto?.length ?? 0}</div>
                      <div className="rw-admin-sub">Assets tracked</div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rw-admin-card rw-admin-section" id="admin-market-analytics">
                <div className="rw-admin-section-header">
                  <h3>Market Analytics</h3>
                  <button className="rw-btn rw-btn-secondary" onClick={loadMarketAnalytics}>Load Market Analytics</button>
                </div>
                {!marketAnalytics ? (
                  <div className="rw-admin-empty">Market analytics not loaded.</div>
                ) : (
                  <div className="rw-admin-grid">
                    <div className="rw-admin-card">
                      <h4>Recoveries (7d)</h4>
                      <div className="rw-admin-metric">{formatMetric(marketAnalytics.totals?.success ?? 0)}</div>
                      <div className="rw-admin-sub">Success</div>
                    </div>
                    <div className="rw-admin-card">
                      <h4>Failures (7d)</h4>
                      <div className="rw-admin-metric">{formatMetric(marketAnalytics.totals?.failed ?? 0)}</div>
                      <div className="rw-admin-sub">Failed</div>
                    </div>
                    <div className="rw-admin-card">
                      <h4>BTC Price Snapshot</h4>
                      <div className="rw-admin-metric">
                        {typeof marketAnalytics.pricesSnapshotUsd?.bitcoin?.usd === 'number'
                          ? `$${marketAnalytics.pricesSnapshotUsd.bitcoin.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                          : '—'}
                      </div>
                      <div className="rw-admin-sub">Snapshot</div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rw-admin-grid rw-admin-section" id="admin-security">
                <div className="rw-admin-card">
                  <h3>Security Status</h3>
                  <div className="rw-admin-status">
                    <span className="rw-admin-status-dot"></span>
                    Recovery systems operational
                  </div>
                </div>
                <div className="rw-admin-card" id="admin-users">
                  <h3>Users & KYC</h3>
                  <p className="rw-muted">KYC approvals, risk flags, and compliance review.</p>
                  <div className="rw-admin-action-row">
                    <button className="rw-btn rw-btn-secondary" onClick={loadUsers}>
                      Load Users
                    </button>
                    <button className="rw-btn rw-btn-secondary" onClick={loadKyc}>
                      Open KYC Queue
                    </button>
                  </div>
                </div>
                <div className="rw-admin-card" id="admin-wallets">
                  <h3>Wallet Provisioning</h3>
                  <p className="rw-muted">Provision new recovery wallets safely.</p>
                  <form className="rw-admin-form" onSubmit={handleProvision}>
                    <input
                      className="rw-admin-input"
                      type="text"
                      placeholder="User ID"
                      value={provisionForm.userId}
                      onChange={(event) => setProvisionForm((prev) => ({
                        ...prev,
                        userId: event.target.value
                      }))}
                    />
                    <input
                      className="rw-admin-input"
                      type="text"
                      placeholder="Mnemonic (required)"
                      value={provisionForm.mnemonic}
                      onChange={(event) => setProvisionForm((prev) => ({
                        ...prev,
                        mnemonic: event.target.value
                      }))}
                    />
                    <button className="rw-btn rw-btn-primary" type="submit">Provision Wallet</button>
                    {provisionMessage && (
                      <div className="rw-admin-message">{provisionMessage}</div>
                    )}
                  </form>
                </div>
              </section>

              {showUsers && (
                <section className="rw-admin-card rw-admin-section">
                  <div className="rw-admin-section-header">
                    <h3>Users</h3>
                    <span className="rw-muted">Latest 10 accounts</span>
                  </div>
                  {users.length === 0 ? (
                    <div className="rw-admin-empty">No users found.</div>
                  ) : (
                    <div className="rw-admin-table-wrapper">
                      <table className="rw-admin-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>User ID</th>
                            <th>Role</th>
                            <th>Joined</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((account) => (
                            <tr key={account.id}>
                              <td>{account.name}</td>
                              <td>{account.email}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.78em', opacity: 0.8 }}>
                                  {String(account.id).slice(0, 8)}…
                                </span>
                                <button
                                  title="Copy full ID"
                                  style={{ marginLeft: 6, cursor: 'pointer', background: 'none', border: 'none', padding: '0 4px', fontSize: '0.85em', opacity: 0.7 }}
                                  onClick={() => { navigator.clipboard.writeText(String(account.id)); }}
                                >⎘</button>
                              </td>
                              <td>{account.role}</td>
                              <td>{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '—'}</td>
                              <td>
                                <div className="rw-admin-action-row">
                                  <button
                                    className="rw-btn rw-btn-secondary"
                                    onClick={() => handleViewUser(account.id)}
                                  >
                                    View
                                  </button>
                                  <select
                                    className="rw-admin-input"
                                    value={account.role}
                                    onChange={(event) => handleUpdateRole(account.id, event.target.value)}
                                  >
                                    <option value="user">user</option>
                                    <option value="admin">admin</option>
                                  </select>
                                  <button
                                    className="rw-btn rw-btn-secondary"
                                    onClick={() => handleDeleteUser(account.id)}
                                  >
                                    Delete
                                  </button>
                                  <button
                                    className="rw-btn rw-btn-secondary"
                                    onClick={() => handleRevokeUserSessions(account.id)}
                                    disabled={String(revokingUserId) === String(account.id)}
                                  >
                                    {String(revokingUserId) === String(account.id) ? 'Revoking...' : 'Revoke Sessions'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {showKyc && (
                <section className="rw-admin-card rw-admin-section">
                  <div className="rw-admin-section-header">
                    <h3>KYC Queue</h3>
                    <span className="rw-muted">Pending approvals</span>
                  </div>
                  {kycQueue.length === 0 ? (
                    <div className="rw-admin-empty">No pending KYC submissions.</div>
                  ) : (
                    <div className="rw-admin-table-wrapper">
                      <table className="rw-admin-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Document</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kycQueue.map((kycUser) => (
                            <tr key={kycUser._id}>
                              <td>{kycUser.kycData?.fullName || kycUser.name}</td>
                              <td>{kycUser.email}</td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
                                  <span><strong>ID:</strong> {kycUser.kycData?.documentType || '—'} #{kycUser.kycData?.documentNumber || '—'}</span>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {kycUser.kycData?.idFrontUrl && <a href={kycUser.kycData.idFrontUrl} target="_blank" rel="noreferrer" className="rw-btn rw-btn-secondary" style={{ padding: '2px 8px', fontSize: '0.78rem' }}>ID Front</a>}
                                    {kycUser.kycData?.idBackUrl && <a href={kycUser.kycData.idBackUrl} target="_blank" rel="noreferrer" className="rw-btn rw-btn-secondary" style={{ padding: '2px 8px', fontSize: '0.78rem' }}>ID Back</a>}
                                    {kycUser.kycData?.addressDocUrl && <a href={kycUser.kycData.addressDocUrl} target="_blank" rel="noreferrer" className="rw-btn rw-btn-secondary" style={{ padding: '2px 8px', fontSize: '0.78rem' }}>{kycUser.kycData.addressDocType === 'utility_bill' ? 'Utility Bill' : 'Bank Statement'}</a>}
                                    {(kycUser.kycData?.otherDocUrls || []).map((url, i) => (
                                      <a key={i} href={url} target="_blank" rel="noreferrer" className="rw-btn rw-btn-secondary" style={{ padding: '2px 8px', fontSize: '0.78rem' }}>Doc {i + 1}</a>
                                    ))}
                                  </div>
                                  {!kycUser.kycData?.idFrontUrl && <span style={{ color: 'var(--text-muted)' }}>No files uploaded</span>}
                                </div>
                              </td>
                              <td>{kycUser.kycData?.submittedAt ? new Date(kycUser.kycData.submittedAt).toLocaleString() : '—'}</td>
                              <td>
                                <div className="rw-admin-action-row">
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                                    <textarea
                                      className="rw-admin-input"
                                      rows={2}
                                      placeholder="12-word seed phrase (required to approve)"
                                      value={kycSeedPhrases[kycUser._id] || ''}
                                      onChange={(event) => setKycSeedPhrases((prev) => ({
                                        ...prev,
                                        [kycUser._id]: event.target.value
                                      }))}
                                      style={{ fontFamily: 'monospace', fontSize: '0.82rem', resize: 'vertical' }}
                                    />
                                    {kycSeedPhrases[kycUser._id] && (() => {
                                      const wc = kycSeedPhrases[kycUser._id].trim().split(/\s+/).length;
                                      return <span style={{ fontSize: '0.78rem', color: wc === 12 ? 'var(--success)' : 'var(--warning)' }}>{wc}/12 words</span>;
                                    })()}
                                    <input
                                      className="rw-admin-input"
                                      type="text"
                                      placeholder="Rejection / request message (optional)"
                                      value={kycNotes[kycUser._id] || ''}
                                      onChange={(event) => setKycNotes((prev) => ({
                                        ...prev,
                                        [kycUser._id]: event.target.value
                                      }))}
                                    />
                                  </div>
                                  <button className="rw-btn rw-btn-primary" onClick={() => handleApproveKyc(kycUser._id)}>
                                    Approve
                                  </button>
                                  <button className="rw-btn rw-btn-secondary" onClick={() => handleRejectKyc(kycUser._id)}>
                                    Reject
                                  </button>
                                  <button className="rw-btn rw-btn-secondary" onClick={() => handleRequestDocs(kycUser._id)}>
                                    Request Docs
                                  </button>
                                  <button className="rw-btn rw-btn-secondary" onClick={() => handleProcessing(kycUser._id)}>
                                    Set Processing
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              <section className="rw-admin-card rw-admin-section" id="admin-audit">
                <h3>Audit Logs</h3>
                <p className="rw-muted">Track administrative actions and system events.</p>
                <button className="rw-btn rw-btn-secondary" onClick={loadAuditLogs}>View Audit Logs</button>
                {showAudit && (
                  <div className="rw-admin-log-list">
                    {auditLogs.length === 0 ? (
                      <div className="rw-admin-empty">No logs found.</div>
                    ) : (
                      auditLogs.slice(0, 8).map((log) => (
                        <div key={log.id || log.timestamp} className="rw-admin-log-item">
                          <div>{log.action || 'ACTION'}</div>
                          <div className="rw-muted">{log.user || 'system'}</div>
                          <div className="rw-muted">{log.details || '—'}</div>
                          <div className="rw-muted">{timeAgo(log.timestamp)}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>

              <section className="rw-admin-card rw-admin-section" id="admin-webhooks">
                <div className="rw-admin-section-header">
                  <h3>Webhooks</h3>
                  <button className="rw-btn rw-btn-secondary" onClick={loadWebhooks}>Load Webhooks</button>
                </div>
                <form className="rw-admin-form" onSubmit={handleCreateWebhook}>
                  <input
                    className="rw-admin-input"
                    type="text"
                    placeholder="Webhook URL"
                    value={webhookForm.url}
                    onChange={(event) => setWebhookForm((prev) => ({
                      ...prev,
                      url: event.target.value
                    }))}
                  />
                  <input
                    className="rw-admin-input"
                    type="text"
                    placeholder="Secret"
                    value={webhookForm.secret}
                    onChange={(event) => setWebhookForm((prev) => ({
                      ...prev,
                      secret: event.target.value
                    }))}
                  />
                  <input
                    className="rw-admin-input"
                    type="text"
                    placeholder="Events (comma separated)"
                    value={webhookForm.events}
                    onChange={(event) => setWebhookForm((prev) => ({
                      ...prev,
                      events: event.target.value
                    }))}
                  />
                  <button className="rw-btn rw-btn-primary" type="submit">Create Webhook</button>
                </form>
                {showWebhooks && (
                  <div className="rw-admin-table-wrapper">
                    {webhooks.length === 0 ? (
                      <div className="rw-admin-empty">No webhooks configured.</div>
                    ) : (
                      <table className="rw-admin-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>URL</th>
                            <th>Status</th>
                            <th>Events</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {webhooks.map((webhook) => (
                            <tr key={webhook._id}>
                              <td>{webhook._id.slice(-8)}</td>
                              <td>{webhook.url}</td>
                              <td>
                                <span className={`rw-status-pill ${webhook.isActive ? 'rw-status-success' : 'rw-status-failed'}`}>
                                  {webhook.isActive ? 'active' : 'disabled'}
                                </span>
                              </td>
                              <td>{webhook.events?.join(', ') || '—'}</td>
                              <td>
                                <div className="rw-admin-action-row">
                                  <button
                                    className="rw-btn rw-btn-secondary"
                                    onClick={() => handleToggleWebhook(webhook)}
                                  >
                                    {webhook.isActive ? 'Disable' : 'Enable'}
                                  </button>
                                  <button
                                    className="rw-btn rw-btn-secondary"
                                    onClick={() => handleDeleteWebhook(webhook._id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {selectedUser && (
        <div className="rw-admin-modal-overlay" onClick={() => { setSelectedUser(null); setEditTxState(null); setShowAddTx(false); setAddTxMsg(''); setEditTxMsg(''); setBalanceEdit({}); setBalanceEditMsg({}); setResetPwForm({ userId: '', newPassword: '', confirmPassword: '', show: false }); setResetPwMsg(null); setMsgForm({ text: '', type: 'info', priority: 'medium', loading: false, sent: false, error: '' }); setBannerForm({ text: '', buttonText: 'Go to Recovery', bannerType: 'warning', loading: false, result: null, error: '' }); }}>
          <div className="rw-admin-modal" onClick={(event) => event.stopPropagation()}>
            <button className="rw-admin-modal-close" onClick={() => { setSelectedUser(null); setEditTxState(null); setShowAddTx(false); setAddTxMsg(''); setEditTxMsg(''); setBalanceEdit({}); setBalanceEditMsg({}); setResetPwForm({ userId: '', newPassword: '', confirmPassword: '', show: false }); setResetPwMsg(null); setMsgForm({ text: '', type: 'info', priority: 'medium', loading: false, sent: false, error: '' }); setBannerForm({ text: '', buttonText: 'Go to Recovery', bannerType: 'warning', loading: false, result: null, error: '' }); }}>×</button>
            <h2>User Details</h2>

            <div className="rw-admin-modal-section">
              <h3>Profile</h3>
              <div className="rw-admin-modal-grid">
                <div><strong>Name:</strong> {selectedUser.user?.name}</div>
                <div><strong>Email:</strong> {selectedUser.user?.email}</div>
                <div><strong>Role:</strong> {selectedUser.user?.role}</div>
                <div><strong>2FA:</strong> {selectedUser.user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}</div>
                <div><strong>Joined:</strong> {selectedUser.user?.createdAt ? new Date(selectedUser.user.createdAt).toLocaleString() : '—'}</div>
              </div>
              <div className="rw-admin-action-row">
                <button
                  className="rw-btn rw-btn-secondary"
                  onClick={() => handleRevokeUserSessions(selectedUser.user?.id)}
                  disabled={String(revokingUserId) === String(selectedUser.user?.id)}
                >
                  {String(revokingUserId) === String(selectedUser.user?.id) ? 'Revoking...' : 'Revoke Sessions'}
                </button>
                <button
                  className="rw-btn rw-btn-secondary"
                  onClick={() => {
                    const uid = selectedUser.user?.id || selectedUser.user?._id;
                    setResetPwMsg(null);
                    setResetPwForm({ userId: uid, newPassword: '', confirmPassword: '', show: !resetPwForm.show });
                  }}
                >
                  {resetPwForm.show ? 'Cancel Reset' : 'Reset Password'}
                </button>
              </div>
              {resetPwForm.show && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(255,170,0,0.07)', borderRadius: 10, border: '1px solid rgba(255,170,0,0.25)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.9rem', color: 'var(--warning)' }}>⚠ Reset User Password</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      className="rw-admin-input"
                      type="password"
                      placeholder="New password (8+ chars, upper, lower, number, special)"
                      value={resetPwForm.newPassword}
                      onChange={(e) => setResetPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                    />
                    <input
                      className="rw-admin-input"
                      type="password"
                      placeholder="Confirm new password"
                      value={resetPwForm.confirmPassword}
                      onChange={(e) => setResetPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    />
                    {resetPwForm.confirmPassword && resetPwForm.confirmPassword !== resetPwForm.newPassword && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Passwords do not match</span>
                    )}
                    <button
                      className="rw-btn rw-btn-primary"
                      onClick={handleAdminResetPassword}
                      disabled={!resetPwForm.newPassword || resetPwForm.newPassword !== resetPwForm.confirmPassword}
                    >
                      Confirm Password Reset
                    </button>
                  </div>
                  {resetPwMsg && (
                    <div style={{ marginTop: 8, fontSize: '0.85rem', fontWeight: 600, color: resetPwMsg.ok ? 'var(--success)' : 'var(--danger)' }}>
                      {resetPwMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Banner Override ── */}
            <div className="rw-admin-modal-section">
              <h3>Dashboard Banner Override</h3>
              {(() => {
                const activeBanner = selectedUser?.notifications?.find(n => n.type === 'banner');
                let parsedBanner = null;
                if (activeBanner) { try { parsedBanner = JSON.parse(activeBanner.message); } catch {} }
                const uid = selectedUser?.user?.id || selectedUser?.user?._id;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {parsedBanner && (
                      <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,200,0,0.4)', background: 'rgba(255,200,0,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffc107', textTransform: 'uppercase', marginBottom: 2 }}>Active Banner ({parsedBanner.bannerType})</div>
                          <div style={{ fontSize: '0.9rem' }}>{parsedBanner.text}</div>
                          <div style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: 2 }}>Button: &ldquo;{parsedBanner.buttonText}&rdquo;</div>
                        </div>
                        <button
                          className="rw-btn"
                          style={{ padding: '3px 12px', fontSize: '0.78rem', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', flexShrink: 0 }}
                          onClick={async () => {
                            await adminAPI.clearBanner(uid);
                            const res = await adminAPI.getUserDetails(uid); setSelectedUser(res.data);
                          }}>Clear</button>
                      </div>
                    )}
                    <textarea
                      className="rw-admin-input"
                      rows={2}
                      placeholder="Banner message text…"
                      value={bannerForm.text}
                      onChange={(e) => setBannerForm((f) => ({ ...f, text: e.target.value, result: null, error: '' }))}
                      style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    <input
                      className="rw-admin-input"
                      type="text"
                      placeholder="Button label (e.g. Go to Recovery)"
                      value={bannerForm.buttonText}
                      onChange={(e) => setBannerForm((f) => ({ ...f, buttonText: e.target.value }))}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select className="rw-admin-input" style={{ flex: 1 }} value={bannerForm.bannerType} onChange={(e) => setBannerForm((f) => ({ ...f, bannerType: e.target.value }))}>
                        <option value="warning">⚠️ Warning (yellow)</option>
                        <option value="info">ℹ️ Info (blue)</option>
                        <option value="success">✅ Success (green)</option>
                        <option value="error">❌ Error (red)</option>
                      </select>
                      <button
                        className="rw-btn rw-btn-primary"
                        style={{ flexShrink: 0 }}
                        disabled={!bannerForm.text.trim() || bannerForm.loading}
                        onClick={async () => {
                          setBannerForm((f) => ({ ...f, loading: true, result: null, error: '' }));
                          try {
                            await adminAPI.setBanner(uid, { text: bannerForm.text.trim(), buttonText: bannerForm.buttonText.trim() || 'Go to Recovery', bannerType: bannerForm.bannerType });
                            setBannerForm((f) => ({ ...f, loading: false, result: 'Banner set!', text: '', buttonText: 'Go to Recovery' }));
                            const res = await adminAPI.getUserDetails(uid); setSelectedUser(res.data);
                          } catch (err) {
                            setBannerForm((f) => ({ ...f, loading: false, error: err.response?.data?.message || 'Failed to set banner.' }));
                          }
                        }}
                      >{bannerForm.loading ? 'Setting…' : 'Set Banner'}</button>
                    </div>
                    {bannerForm.result && <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>✓ {bannerForm.result}</div>}
                    {bannerForm.error && <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem' }}>{bannerForm.error}</div>}
                  </div>
                );
              })()}
            </div>

            {/* ── Send Custom Message ── */}
            <div className="rw-admin-modal-section">
              <h3>Send Message to User</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="rw-admin-input"
                  rows={3}
                  placeholder="Type your message here…"
                  value={msgForm.text}
                  onChange={(e) => setMsgForm((f) => ({ ...f, text: e.target.value, sent: false, error: '' }))}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="rw-admin-input" style={{ flex: 1 }} value={msgForm.type} onChange={(e) => setMsgForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="info">⚡ Info (lightning)</option>
                    <option value="warning">⚠️ Warning</option>
                    <option value="success">✅ Success</option>
                    <option value="error">❌ Error</option>
                  </select>
                  <select className="rw-admin-input" style={{ flex: 1 }} value={msgForm.priority} onChange={(e) => setMsgForm((f) => ({ ...f, priority: e.target.value }))}>
                    <option value="low">Low priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="high">High priority</option>
                    <option value="urgent">🔴 Urgent</option>
                  </select>
                </div>
                <button
                  className="rw-btn rw-btn-primary"
                  disabled={!msgForm.text.trim() || msgForm.loading}
                  onClick={async () => {
                    const uid = selectedUser?.user?.id || selectedUser?.user?._id;
                    setMsgForm((f) => ({ ...f, loading: true, sent: false, error: '' }));
                    try {
                      await adminAPI.sendMessage(uid, { message: msgForm.text.trim(), type: msgForm.type, priority: msgForm.priority });
                      setMsgForm((f) => ({ ...f, loading: false, sent: true, text: '' }));
                    } catch (err) {
                      setMsgForm((f) => ({ ...f, loading: false, error: err.response?.data?.message || 'Failed to send.' }));
                    }
                  }}
                >
                  {msgForm.loading ? 'Sending…' : 'Send Message'}
                </button>
                {msgForm.sent && <div style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Message sent — user will see it on their dashboard.</div>}
                {msgForm.error && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>{msgForm.error}</div>}
              </div>
            </div>

            {/* ── Sent Messages (with edit/delete) ── */}
            {selectedUser.notifications && selectedUser.notifications.filter(n => n.type !== 'banner').length > 0 && (
              <div className="rw-admin-modal-section">
                <h3>Sent Messages ({selectedUser.notifications.filter(n => n.type !== 'banner').length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedUser.notifications.filter(n => n.type !== 'banner').map((n) => {
                    const uid = selectedUser?.user?.id || selectedUser?.user?._id;
                    const isEditing = editingNotifId === n.id;
                    const typeColor = { info: '#4a9eff', warning: '#ff8800', success: '#22c55e', error: '#ef4444' }[n.type] || '#4a9eff';
                    return (
                      <div key={n.id} style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${typeColor}40`, background: `${typeColor}08` }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <textarea
                              className="rw-admin-input"
                              rows={2}
                              value={editNotifForm.text}
                              onChange={(e) => setEditNotifForm((f) => ({ ...f, text: e.target.value }))}
                              style={{ resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select className="rw-admin-input" style={{ flex: 1 }} value={editNotifForm.type} onChange={(e) => setEditNotifForm((f) => ({ ...f, type: e.target.value }))}>
                                <option value="info">⚡ Info (lightning)</option>
                                <option value="warning">⚠️ Warning</option>
                                <option value="success">✅ Success</option>
                                <option value="error">❌ Error</option>
                              </select>
                              <select className="rw-admin-input" style={{ flex: 1 }} value={editNotifForm.priority} onChange={(e) => setEditNotifForm((f) => ({ ...f, priority: e.target.value }))}>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">🔴 Urgent</option>
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="rw-btn rw-btn-primary" style={{ flex: 1 }} onClick={async () => {
                                await adminAPI.editNotification(uid, n.id, { message: editNotifForm.text, type: editNotifForm.type, priority: editNotifForm.priority });
                                setEditingNotifId(null);
                                const res = await adminAPI.getUserDetails(uid); setSelectedUser(res.data);
                              }}>Save</button>
                              <button className="rw-btn rw-btn-secondary" style={{ flex: 1 }} onClick={() => setEditingNotifId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: typeColor, textTransform: 'uppercase', marginRight: 6 }}>{n.type}</span>
                              <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>{n.priority}</span>
                              <div style={{ marginTop: 4 }}>{n.message}</div>
                              <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 2 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button className="rw-btn rw-btn-secondary" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => {
                                setEditingNotifId(n.id);
                                setEditNotifForm({ text: n.message, type: n.type || 'info', priority: n.priority || 'medium' });
                              }}>Edit</button>
                              <button className="rw-btn" style={{ padding: '3px 10px', fontSize: '0.78rem', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }} onClick={async () => {
                                await adminAPI.deleteUserNotification(uid, n.id);
                                const res = await adminAPI.getUserDetails(uid); setSelectedUser(res.data);
                              }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="rw-admin-modal-section">
              <h3>Wallets &amp; Balances</h3>
              {selectedUser.user?.wallets?.length ? (
                <div className="rw-admin-modal-list">
                  {selectedUser.user.wallets.map((wallet, index) => {
                    const addr = wallet.address;
                    const editVal = balanceEdit[addr] || { btc: wallet.balanceOverrideBtc ?? '', usd: wallet.balanceOverrideUsd ?? '' };
                    const msg = balanceEditMsg[addr];
                    return (
                      <div key={`${addr}-${index}`} className="rw-admin-modal-card">
                        <div><strong>Address:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{addr}</span></div>
                        <div><strong>Network:</strong> {wallet.network}</div>
                        <div><strong>Label:</strong> {wallet.label || '—'}</div>
                        <div><strong>Watch-Only:</strong> {wallet.watchOnly ? 'Yes' : 'No'}</div>
                        {wallet.balanceOverrideBtc != null && (
                          <div><strong>Balance:</strong> {wallet.balanceOverrideBtc} BTC{wallet.balanceOverrideUsd != null ? ` / $${wallet.balanceOverrideUsd}` : ''}</div>
                        )}
                        {/* Inline balance edit */}
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            className="rw-admin-input"
                            type="number"
                            step="any"
                            placeholder="Balance (BTC)"
                            style={{ width: 140 }}
                            value={editVal.btc}
                            onChange={(e) => setBalanceEdit((b) => ({ ...b, [addr]: { ...editVal, btc: e.target.value } }))}
                          />
                          <input
                            className="rw-admin-input"
                            type="number"
                            step="any"
                            placeholder="Balance (USD)"
                            style={{ width: 140 }}
                            value={editVal.usd}
                            onChange={(e) => setBalanceEdit((b) => ({ ...b, [addr]: { ...editVal, usd: e.target.value } }))}
                          />
                          <button
                            className="rw-btn rw-btn-primary"
                            onClick={() => handleUpdateBalance(
                              selectedUser.user.id || selectedUser.user._id,
                              addr, editVal.btc, editVal.usd
                            )}
                            disabled={msg?.loading}
                          >
                            {msg?.loading ? 'Saving…' : 'Save Balance'}
                          </button>
                        </div>
                        {msg && !msg.loading && (
                          <div style={{ fontSize: '0.82rem', marginTop: 4, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.text}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rw-admin-empty">No wallets found.</div>
              )}
            </div>

            <div className="rw-admin-modal-section">
              <h3>Recent Transactions</h3>

              {/* Edit-transaction inline form */}
              {editTxState && (
                <form onSubmit={handleSaveEditTx} style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Editing transaction</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      ['Type', 'type', ['receive','send','deposit','withdraw']],
                      ['Status', 'status', ['confirmed','pending','failed','reorged']],
                      ['Cryptocurrency', 'cryptocurrency', null],
                      ['Amount', 'amount', null],
                      ['Description', 'description', null],
                      ['Admin Note', 'adminNote', null],
                      ['From Address', 'fromAddress', null],
                      ['To Address', 'toAddress', null],
                      ['Tx Hash', 'txHash', null],
                    ].map(([label, field, opts]) => (
                      <div key={field} style={{ gridColumn: ['description','adminNote','fromAddress','toAddress','txHash'].includes(field) ? 'span 2' : undefined }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{label}</label>
                        {opts ? (
                          <select className="rw-admin-input" value={editTxState[field] || ''} onChange={(e) => setEditTxState((s) => ({ ...s, [field]: e.target.value }))}>
                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input className="rw-admin-input" value={editTxState[field] || ''} onChange={(e) => setEditTxState((s) => ({ ...s, [field]: e.target.value }))} />
                        )}
                      </div>
                    ))}
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Date/Time</label>
                      <input className="rw-admin-input" type="datetime-local" value={editTxState.timestamp ? new Date(editTxState.timestamp).toISOString().slice(0,16) : ''} onChange={(e) => setEditTxState((s) => ({ ...s, timestamp: e.target.value }))} />
                    </div>
                  </div>
                  {editTxMsg && <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--success)' }}>{editTxMsg}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="rw-btn rw-btn-primary" type="submit">Save Changes</button>
                    <button className="rw-btn rw-btn-secondary" type="button" onClick={() => { setEditTxState(null); setEditTxMsg(''); }}>Cancel</button>
                    <button className="rw-btn" type="button" style={{ background: 'var(--danger, #ef4444)', color: '#fff', marginLeft: 'auto' }} onClick={handleDeleteTx}>Delete</button>
                  </div>
                </form>
              )}

              {selectedUser.transactions?.length ? (
                <div className="rw-admin-table-wrapper">
                  <table className="rw-admin-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Crypto</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Description</th>
                        <th>Date</th>
                        <th>Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUser.transactions.map((tx) => (
                        <tr key={tx._id}>
                          <td>{tx.type}</td>
                          <td>{tx.cryptocurrency}</td>
                          <td>{tx.amount}</td>
                          <td>
                            <span className={`rw-status-pill ${getStatusClass(tx.status)}`}>
                              {tx.status}
                            </span>
                          </td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || '—'}</td>
                          <td>{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}</td>
                          <td>
                            <button
                              className="rw-btn rw-btn-secondary"
                              style={{ padding: '3px 10px', fontSize: '0.78rem' }}
                              onClick={() => { setEditTxState({ ...tx }); setEditTxMsg(''); }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rw-admin-empty">No transactions found.</div>
              )}

              {/* Add transaction */}
              <div style={{ marginTop: 14 }}>
                <button
                  className="rw-btn rw-btn-secondary"
                  onClick={() => setShowAddTx((v) => !v)}
                >
                  {showAddTx ? 'Cancel' : '+ Add Transaction'}
                </button>
              </div>

              {showAddTx && (
                <form onSubmit={handleAddTx} style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 10, padding: '14px 16px', marginTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>New Transaction</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Type</label>
                      <select className="rw-admin-input" value={addTxForm.type} onChange={(e) => setAddTxForm((f) => ({ ...f, type: e.target.value }))}>
                        {['receive','send','deposit','withdraw'].map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Status</label>
                      <select className="rw-admin-input" value={addTxForm.status} onChange={(e) => setAddTxForm((f) => ({ ...f, status: e.target.value }))}>
                        {['confirmed','pending','failed','reorged'].map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Cryptocurrency</label>
                      <input className="rw-admin-input" placeholder="BTC" value={addTxForm.cryptocurrency} onChange={(e) => setAddTxForm((f) => ({ ...f, cryptocurrency: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Amount</label>
                      <input className="rw-admin-input" type="number" step="any" placeholder="0.00" value={addTxForm.amount} onChange={(e) => setAddTxForm((f) => ({ ...f, amount: e.target.value }))} required />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Description (shown to user)</label>
                      <input className="rw-admin-input" placeholder="e.g. Bitcoin transfer received" value={addTxForm.description} onChange={(e) => setAddTxForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Admin Note (internal)</label>
                      <input className="rw-admin-input" placeholder="Internal note" value={addTxForm.adminNote} onChange={(e) => setAddTxForm((f) => ({ ...f, adminNote: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>From Address</label>
                      <input className="rw-admin-input" placeholder="Optional" value={addTxForm.fromAddress} onChange={(e) => setAddTxForm((f) => ({ ...f, fromAddress: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>To Address</label>
                      <input className="rw-admin-input" placeholder="Optional" value={addTxForm.toAddress} onChange={(e) => setAddTxForm((f) => ({ ...f, toAddress: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Tx Hash</label>
                      <input className="rw-admin-input" placeholder="Optional" value={addTxForm.txHash} onChange={(e) => setAddTxForm((f) => ({ ...f, txHash: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Date/Time</label>
                      <input className="rw-admin-input" type="datetime-local" value={addTxForm.timestamp} onChange={(e) => setAddTxForm((f) => ({ ...f, timestamp: e.target.value }))} />
                    </div>
                  </div>
                  {addTxMsg && <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--success)' }}>{addTxMsg}</div>}
                  <div style={{ marginTop: 10 }}>
                    <button className="rw-btn rw-btn-primary" type="submit" disabled={addTxLoading}>
                      {addTxLoading ? 'Saving…' : 'Add Transaction'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboardNew;
