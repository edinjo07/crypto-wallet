import React, { useState, useEffect, useCallback } from 'react';
import { transactionAPI } from '../services/api';
import ExportTransactions from './ExportTransactions';
import Icon from './Icon';

const PAGE_SIZE = 20;

const STATUS_COLORS = {
  confirmed: { bg: 'rgba(52,199,89,0.12)', color: '#34C759', label: 'Confirmed' },
  completed:  { bg: 'rgba(52,199,89,0.12)', color: '#34C759', label: 'Completed' },
  pending:   { bg: 'rgba(255,204,0,0.12)',  color: '#FFD60A', label: 'Pending'   },
  failed:    { bg: 'rgba(255,69,58,0.12)',  color: '#FF453A', label: 'Failed'    },
};

function statusStyle(status) {
  const s = STATUS_COLORS[status] || { bg: 'rgba(128,128,128,0.1)', color: '#8E8E93', label: status };
  return {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '0.75rem',
    fontWeight: '700',
    letterSpacing: '0.3px',
    background: s.bg,
    color: s.color,
  };
}

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr || '—';
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function TxIcon({ type }) {
  const isSend = type === 'send' || type === 'withdraw';
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
      background: isSend
        ? 'linear-gradient(135deg,rgba(255,69,58,.18),rgba(255,69,58,.08))'
        : 'linear-gradient(135deg,rgba(52,199,89,.18),rgba(52,199,89,.08))',
      border: `2px solid ${isSend ? 'rgba(255,69,58,.3)' : 'rgba(52,199,89,.3)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.25rem',
    }}>
      <span style={{
        color: isSend ? '#FF453A' : '#34C759',
        display: 'block', fontWeight: 'bold',
        transform: isSend ? 'rotate(45deg)' : 'rotate(135deg)'
      }}>↗</span>
    </div>
  );
}

export default function TransactionHistoryPage() {
  const [txs, setTxs]           = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');

  const [expandedId, setExpandedId]   = useState(null);
  const [showExport,  setShowExport]  = useState(false);

  const load = useCallback(async (p, type, status) => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: PAGE_SIZE, skip: p * PAGE_SIZE };
      if (type)   params.type   = type;
      if (status) params.status = status;
      const { data } = await transactionAPI.getHistory(params);
      setTxs(data.transactions || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError('Failed to load transactions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(0);
    load(0, typeFilter, statusFilter);
  }, [typeFilter, statusFilter, load]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    load(newPage, typeFilter, statusFilter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim().toLowerCase());
  };

  // Client-side search filter against already-loaded page
  const displayed = search
    ? txs.filter(tx =>
        (tx.txHash     && tx.txHash.toLowerCase().includes(search)) ||
        (tx.fromAddress && tx.fromAddress.toLowerCase().includes(search)) ||
        (tx.toAddress   && tx.toAddress.toLowerCase().includes(search)) ||
        (tx.cryptocurrency && tx.cryptocurrency.toLowerCase().includes(search))
      )
    : txs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
            Transaction History
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {total} transactions total
          </p>
        </div>
        {txs.length > 0 && (
          <button
            onClick={() => setShowExport(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 1.2rem', borderRadius: 12, border: 'none',
              background: 'var(--gradient-blue)', color: '#fff',
              fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(96,181,255,.3)'
            }}
          >
            <Icon name="upload" size={16} /> Export
          </button>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card-background)',
        borderRadius: 16,
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        border: '1px solid var(--border-color)',
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center'
      }}>
        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.9rem', borderRadius: 10, border: '1px solid var(--border-color)',
            background: 'var(--input-background)', color: 'var(--text-primary)',
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer'
          }}
        >
          <option value="">All types</option>
          <option value="receive">Received</option>
          <option value="send">Sent</option>
          <option value="withdraw">Withdraw</option>
          <option value="deposit">Deposit</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.9rem', borderRadius: 10, border: '1px solid var(--border-color)',
            background: 'var(--input-background)', color: 'var(--text-primary)',
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer'
          }}
        >
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
          <input
            type="text"
            placeholder="Search hash, address, coin…"
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); if (!e.target.value) setSearch(''); }}
            style={{
              padding: '0.5rem 0.9rem', borderRadius: 10, border: '1px solid var(--border-color)',
              background: 'var(--input-background)', color: 'var(--text-primary)',
              fontSize: '0.9rem', minWidth: 220
            }}
          />
          <button type="submit" style={{
            padding: '0.5rem 1rem', borderRadius: 10, border: 'none',
            background: 'var(--primary-blue)', color: '#fff',
            fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer'
          }}>
            Search
          </button>
        </form>
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
          Loading transactions…
        </div>
      )}

      {!loading && error && (
        <div style={{
          textAlign: 'center', padding: '2.5rem', borderRadius: 16,
          background: 'rgba(255,69,58,.08)', color: '#FF453A', border: '1px solid rgba(255,69,58,.2)'
        }}>
          <Icon name="alertCircle" size={36} color="#FF453A" />
          <p style={{ margin: '0.75rem 0 1.25rem', fontWeight: 600 }}>{error}</p>
          <button onClick={() => load(page, typeFilter, statusFilter)} style={{
            padding: '0.5rem 1.2rem', borderRadius: 10, border: 'none',
            background: '#FF453A', color: '#fff', fontWeight: 700, cursor: 'pointer'
          }}>Retry</button>
        </div>
      )}

      {!loading && !error && displayed.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '3.5rem 1rem', borderRadius: 16,
          background: 'var(--card-background)', border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>No transactions found</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {search || typeFilter || statusFilter
              ? 'Try adjusting your filters or search query.'
              : 'Your transaction history will appear here.'}
          </div>
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {displayed.map(tx => {
            const isSend  = tx.type === 'send' || tx.type === 'withdraw';
            const expanded = expandedId === tx._id;

            return (
              <div
                key={tx._id}
                onClick={() => setExpandedId(expanded ? null : tx._id)}
                style={{
                  background: 'var(--card-background)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 14,
                  padding: '1rem 1.25rem',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                  boxShadow: expanded ? '0 4px 20px rgba(96,181,255,.15)' : '0 1px 4px rgba(0,0,0,.06)',
                  borderColor: expanded ? 'var(--primary-blue)' : 'var(--border-color)',
                }}
              >
                {/* ── Row summary ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <TxIcon type={tx.type} />

                  {/* Left: type + date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', textTransform: 'capitalize' }}>
                        {tx.type === 'receive' ? 'Received' : tx.type === 'send' ? 'Sent' : tx.type}
                      </span>
                      <span style={{ ...statusStyle(tx.status) }}>
                        {STATUS_COLORS[tx.status]?.label || tx.status}
                      </span>
                      <span style={{
                        background: 'rgba(96,181,255,.1)', color: 'var(--primary-blue)',
                        padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700
                      }}>
                        {tx.cryptocurrency || '—'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 2 }}>
                      {formatDate(tx.timestamp)}
                    </div>
                  </div>

                  {/* Right: amount */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontWeight: 800, fontSize: '1rem',
                      color: isSend ? '#FF453A' : '#34C759'
                    }}>
                      {isSend ? '– ' : '+ '}
                      {parseFloat(tx.amount || 0).toFixed(6).replace(/\.?0+$/, '') || '0'}{' '}
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{tx.cryptocurrency || ''}</span>
                    </div>
                  </div>

                  <Icon
                    name={expanded ? 'chevronUp' : 'chevronDown'}
                    size={18}
                    color="var(--text-secondary)"
                  />
                </div>

                {/* ── Expanded detail ── */}
                {expanded && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      marginTop: '1rem', paddingTop: '1rem',
                      borderTop: '1px solid var(--border-color)',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1.25rem',
                    }}
                  >
                    {[
                      ['Transaction Hash', tx.txHash ? (
                        <a
                          href={
                            tx.network === 'bitcoin' || tx.network === 'btc'
                              ? `https://blockchair.com/bitcoin/transaction/${tx.txHash}`
                              : `https://etherscan.io/tx/${tx.txHash}`
                          }
                          target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ color: 'var(--primary-blue)', fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}
                        >
                          {tx.txHash}
                        </a>
                      ) : '—'],
                      ['From', <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{shortAddr(tx.fromAddress)}</span>],
                      ['To',   <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{shortAddr(tx.toAddress)}</span>],
                      ['Network', tx.network || '—'],
                      ['Block', tx.blockNumber || '—'],
                      ['Confirmations', tx.confirmations ?? '—'],
                      ['Description', tx.description || '—'],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 600, marginBottom: 2 }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 500, wordBreak: 'break-word' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────── */}
      {!loading && !error && totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: '0.5rem', marginTop: '1.75rem', flexWrap: 'wrap'
        }}>
          <button
            disabled={page === 0}
            onClick={() => handlePageChange(page - 1)}
            style={{
              padding: '0.5rem 1rem', borderRadius: 10, border: '1px solid var(--border-color)',
              background: 'var(--card-background)', color: 'var(--text-primary)',
              fontWeight: 700, cursor: page === 0 ? 'not-allowed' : 'pointer',
              opacity: page === 0 ? 0.4 : 1,
            }}
          >
            ← Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i)
            .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 2)
            .reduce((acc, i, idx, arr) => {
              if (idx > 0 && i - arr[idx - 1] > 1) acc.push('...');
              acc.push(i);
              return acc;
            }, [])
            .map((item, idx) =>
              item === '...' ? (
                <span key={`gap-${idx}`} style={{ padding: '0 0.25rem', color: 'var(--text-secondary)' }}>…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => handlePageChange(item)}
                  style={{
                    padding: '0.5rem 0.85rem', borderRadius: 10,
                    border: '1px solid var(--border-color)',
                    background: item === page ? 'var(--primary-blue)' : 'var(--card-background)',
                    color: item === page ? '#fff' : 'var(--text-primary)',
                    fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {item + 1}
                </button>
              )
            )}

          <button
            disabled={page >= totalPages - 1}
            onClick={() => handlePageChange(page + 1)}
            style={{
              padding: '0.5rem 1rem', borderRadius: 10, border: '1px solid var(--border-color)',
              background: 'var(--card-background)', color: 'var(--text-primary)',
              fontWeight: 700, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages - 1 ? 0.4 : 1,
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Export modal ───────────────────────────────────── */}
      {showExport && (
        <ExportTransactions
          transactions={displayed}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
