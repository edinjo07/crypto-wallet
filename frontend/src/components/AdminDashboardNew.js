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
  const [revokingUserId, setRevokingUserId] = useState(null);

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

  const handleApproveKyc = useCallback(async (userId) => {
    try {
      await adminAPI.approveKyc(userId);
      setActionMessage('KYC approved.');
      await loadKyc();
    } catch (error) {
      setActionMessage('Failed to approve KYC.');
    }
  }, [loadKyc]);

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
      value: formatMetric(stats?.recoveries24h ?? stats?.completedTransactions),
      sub: 'BTC / ETH / USDT'
    },
    {
      label: 'Failed Recoveries',
      value: formatMetric(stats?.failedTransactions),
      sub: 'Last 24 hours'
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
        <aside className="rw-admin-sidebar">
          <div className="rw-admin-brand">RecoveryWallet</div>
          <nav className="rw-admin-nav">
            <a href="#admin-dashboard" className="rw-admin-link active">Admin Dashboard</a>
            <a href="#admin-users" className="rw-admin-link">Users & KYC</a>
            <a href="#admin-wallets" className="rw-admin-link">Wallet Provisioning</a>
            <a href="#admin-recovery" className="rw-admin-link">Recovery Attempts</a>
            <a href="#admin-market" className="rw-admin-link">Market Analytics</a>
            <a href="#admin-audit" className="rw-admin-link">Audit Logs</a>
            <a href="#admin-security" className="rw-admin-link">Security</a>
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
                              <td>{kycUser.kycData?.documentType || '—'}</td>
                              <td>{kycUser.kycData?.submittedAt ? new Date(kycUser.kycData.submittedAt).toLocaleString() : '—'}</td>
                              <td>
                                <div className="rw-admin-action-row">
                                  <input
                                    className="rw-admin-input"
                                    type="text"
                                    placeholder="Message to user"
                                    value={kycNotes[kycUser._id] || ''}
                                    onChange={(event) => setKycNotes((prev) => ({
                                      ...prev,
                                      [kycUser._id]: event.target.value
                                    }))}
                                  />
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
        <div className="rw-admin-modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="rw-admin-modal" onClick={(event) => event.stopPropagation()}>
            <button className="rw-admin-modal-close" onClick={() => setSelectedUser(null)}>×</button>
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
              </div>
            </div>

            <div className="rw-admin-modal-section">
              <h3>Wallets</h3>
              {selectedUser.user?.wallets?.length ? (
                <div className="rw-admin-modal-list">
                  {selectedUser.user.wallets.map((wallet, index) => (
                    <div key={`${wallet.address}-${index}`} className="rw-admin-modal-card">
                      <div><strong>Address:</strong> {wallet.address}</div>
                      <div><strong>Network:</strong> {wallet.network}</div>
                      <div><strong>Watch-Only:</strong> {wallet.watchOnly ? 'Yes' : 'No'}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rw-admin-empty">No wallets found.</div>
              )}
            </div>

            <div className="rw-admin-modal-section">
              <h3>Recent Transactions</h3>
              {selectedUser.transactions?.length ? (
                <div className="rw-admin-table-wrapper">
                  <table className="rw-admin-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Crypto</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
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
                          <td>{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rw-admin-empty">No transactions found.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboardNew;
