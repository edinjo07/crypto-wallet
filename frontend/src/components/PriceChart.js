import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { pricesAPI } from '../services/api';

function formatDate(ts) {
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function PriceChart({
  coinId = 'bitcoin',
  className = 'card',
  style,
  buttonClassName = 'btn btn-secondary',
  activeButtonClassName = 'active'
}) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setErr('');
        const res = await pricesAPI.getHistory(coinId, days);
        if (!mounted) return;

        setData(res.data.points.map((pt) => ({
          t: pt.t,
          p: pt.p,
          d: formatDate(pt.t)
        })));
      } catch (error) {
        if (!mounted) return;
        setErr('Failed to load chart data');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [coinId, days, retryKey]);

  const title = useMemo(() => {
    const map = { bitcoin: 'BTC', ethereum: 'ETH', tether: 'USDT' };
    return `${map[coinId] || coinId} Price (USD)`;
  }, [coinId]);

  const showChart = !loading && !err && data.length > 0;

  return (
    <div className={className} style={{ padding: '1rem', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`${buttonClassName} ${days === 7 ? activeButtonClassName : ''}`}
            onClick={() => setDays(7)}
          >
            7D
          </button>
          <button
            className={`${buttonClassName} ${days === 30 ? activeButtonClassName : ''}`}
            onClick={() => setDays(30)}
          >
            30D
          </button>
        </div>
      </div>

      {/* Fixed-height chart area — always rendered to prevent layout shift */}
      <div style={{ width: '100%', height: 260, marginTop: 10, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary, #888)', fontSize: '0.9rem'
          }}>
            Loading chart data…
          </div>
        )}

        {!loading && err && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: 'var(--danger, #e74c3c)', fontSize: '0.9rem'
          }}>
            <span>⚠️ Chart data unavailable</span>
            <button
              className={buttonClassName}
              style={{ fontSize: '0.75rem', padding: '4px 12px' }}
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !err && data.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary, #888)', fontSize: '0.9rem'
          }}>
            No price data available
          </div>
        )}

        {showChart && (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
              <XAxis dataKey="d" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Price']} />
              <Line type="monotone" dataKey="p" dot={false} stroke="var(--primary, #3498db)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
