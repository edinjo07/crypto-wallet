import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { walletAPI, transactionAPI } from '../services/api';
import Icon from './Icon';

function WithdrawPage() {
  const navigate = useNavigate();

  const [wallets, setWallets] = useState([]);
  const [walletsLoading, setWalletsLoading] = useState(true);

  const [form, setForm] = useState({
    fromAddress: '',
    toAddress: '',
    amount: '',
    cryptocurrency: 'ETH',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null); // { hash, id }

  // Load wallets on mount
  useEffect(() => {
    walletAPI.list()
      .then((res) => {
        const sendable = (res.data.wallets || res.data || []).filter((w) => !w.watchOnly);
        setWallets(sendable);
        if (sendable.length > 0) {
          setForm((f) => ({ ...f, fromAddress: sendable[0].address }));
        }
      })
      .catch(() => setError('Failed to load wallets.'))
      .finally(() => setWalletsLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setError('');
    setEstimatedGas(null);
  };

  const selectedWallet = wallets.find((w) => w.address === form.fromAddress);

  const handleEstimateGas = async () => {
    if (!form.toAddress || !form.amount) {
      setError('Enter recipient address and amount before estimating gas.');
      return;
    }
    setEstimating(true);
    setError('');
    try {
      const res = await transactionAPI.estimateGas({
        toAddress: form.toAddress,
        amount: parseFloat(form.amount),
        network: selectedWallet?.network || 'ethereum',
      });
      setEstimatedGas(res.data);
    } catch {
      setError('Could not estimate gas fee. Check the recipient address and try again.');
    } finally {
      setEstimating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await transactionAPI.withdraw({
        fromAddress: form.fromAddress,
        toAddress: form.toAddress,
        amount: parseFloat(form.amount),
        cryptocurrency: form.cryptocurrency,
        network: selectedWallet?.network || 'ethereum',
        password: form.password,
      });
      setSuccess({
        hash: res.data.transaction?.hash,
        id: res.data.transaction?.id,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Withdrawal failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="rw-theme rw-page rw-recover">
        <div className="rw-recover-container" style={{ maxWidth: 500 }}>
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              background: 'rgba(52,199,89,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}>
              <Icon name="checkCircle" size={48} color="var(--success)" />
            </div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem', fontSize: '1.75rem', fontWeight: 800 }}>
              Withdrawal Sent!
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Your withdrawal has been broadcast to the network.
            </p>
            {success.hash && (
              <div style={{
                padding: '1.25rem', background: 'var(--dark-bg)', borderRadius: 16,
                wordBreak: 'break-all', fontSize: '0.875rem', fontFamily: 'monospace',
                border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                marginBottom: '1.5rem',
              }}>
                <div style={{ marginBottom: 6, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Transaction Hash
                </div>
                {success.hash}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="rw-btn rw-btn-primary" onClick={() => navigate('/dashboard')} style={{ flex: 1 }}>
                Back to Dashboard
              </button>
              <button className="rw-btn rw-btn-secondary" onClick={() => { setSuccess(null); setForm((f) => ({ ...f, toAddress: '', amount: '', password: '' })); setEstimatedGas(null); }} style={{ flex: 1 }}>
                New Withdrawal
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────
  return (
    <div className="rw-theme rw-page rw-recover">
      <div className="rw-recover-container" style={{ maxWidth: 540 }}>

        {/* Header */}
        <div className="rw-recover-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,69,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrowDown" size={28} color="#ff453a" />
            </div>
          </div>
          <h1>Withdraw Funds</h1>
          <p className="rw-muted">Send crypto from your wallet to an external address.</p>
        </div>

        <div className="rw-recover-box">

          {walletsLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }} />
              Loading wallets…
            </div>
          ) : wallets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Icon name="alertCircle" size={40} color="var(--warning)" />
              <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
                No spendable wallets found. Watch-only wallets cannot be used for withdrawals.
              </p>
              <button className="rw-btn rw-btn-primary" onClick={() => navigate('/dashboard')} style={{ marginTop: '1rem' }}>
                Go to Dashboard
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>

              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: '1.25rem',
                  background: 'rgba(255,68,68,0.1)', color: 'var(--danger)',
                  fontWeight: 600, fontSize: '0.9rem',
                  border: '1px solid rgba(255,68,68,0.3)',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <Icon name="alertCircle" size={18} color="var(--danger)" />
                  {error}
                </div>
              )}

              {/* From Wallet */}
              <div className="form-group">
                <label className="form-label">From Wallet</label>
                <select
                  name="fromAddress"
                  className="form-input form-select"
                  value={form.fromAddress}
                  onChange={handleChange}
                  required
                  disabled={loading}
                >
                  {wallets.map((w) => (
                    <option key={w.address} value={w.address}>
                      {w.address.slice(0, 10)}…{w.address.slice(-8)}{' '}
                      ({w.network?.toUpperCase()})
                      {w.label ? ` — ${w.label}` : ''}
                    </option>
                  ))}
                </select>
                {selectedWallet && (
                  <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                    <span>Network: <strong>{selectedWallet.network}</strong></span>
                  </div>
                )}
              </div>

              {/* Recipient Address */}
              <div className="form-group">
                <label className="form-label">Recipient Address</label>
                <input
                  type="text"
                  name="toAddress"
                  className="form-input"
                  value={form.toAddress}
                  onChange={handleChange}
                  placeholder="0x…"
                  required
                  disabled={loading}
                  spellCheck={false}
                />
              </div>

              {/* Amount + Crypto */}
              <div className="form-group">
                <label className="form-label">Amount</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="number"
                    name="amount"
                    className="form-input"
                    value={form.amount}
                    onChange={handleChange}
                    placeholder="0.000000"
                    step="0.000001"
                    min="0.000001"
                    required
                    disabled={loading}
                    style={{ flex: 1 }}
                  />
                  <select
                    name="cryptocurrency"
                    className="form-input form-select"
                    value={form.cryptocurrency}
                    onChange={handleChange}
                    disabled={loading}
                    style={{ width: 130 }}
                  >
                    <option value="ETH">ETH</option>
                    <option value="MATIC">MATIC</option>
                    <option value="BNB">BNB</option>
                  </select>
                </div>
              </div>

              {/* Gas estimate */}
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={handleEstimateGas}
                disabled={loading || estimating}
                style={{ marginBottom: '1rem' }}
              >
                {estimating ? (
                  <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Estimating…</>
                ) : (
                  <><Icon name="zap" size={18} /> Estimate Gas Fee</>
                )}
              </button>

              {estimatedGas && (
                <div style={{
                  background: 'rgba(10,132,255,0.08)', padding: '0.875rem 1rem',
                  borderRadius: 12, marginBottom: '1rem',
                  border: '1px solid rgba(10,132,255,0.2)', fontSize: '0.875rem',
                  color: 'var(--text-primary)',
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Estimated Gas Fee</div>
                  <div>{estimatedGas.estimatedFee} {form.cryptocurrency}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                    Gas Price: {estimatedGas.gasPrice} Gwei
                  </div>
                </div>
              )}

              {/* Warning */}
              <div style={{
                background: 'rgba(255,159,10,0.08)', padding: '0.875rem 1rem',
                borderRadius: 12, marginBottom: '1.25rem',
                border: '1px solid rgba(255,159,10,0.25)', fontSize: '0.85rem',
                color: 'var(--text-secondary)', display: 'flex', gap: 8,
              }}>
                <Icon name="alertTriangle" size={18} color="#ff9f0a" style={{ flexShrink: 0 }} />
                <span>
                  Withdrawals are <strong>irreversible</strong>. Double-check the recipient address before submitting.
                </span>
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="form-label">Wallet Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    className="form-input"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Enter your wallet password"
                    required
                    disabled={loading}
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="rw-btn rw-btn-secondary"
                  onClick={() => navigate(-1)}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rw-btn rw-btn-primary"
                  disabled={loading || !form.toAddress || !form.amount || !form.password}
                  style={{ flex: 1, background: 'linear-gradient(135deg, #ff453a, #ff6b35)' }}
                >
                  {loading ? (
                    <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Withdrawing…</>
                  ) : (
                    <><Icon name="arrowDown" size={18} /> Withdraw</>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default WithdrawPage;
