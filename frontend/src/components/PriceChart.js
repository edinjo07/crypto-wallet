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
  }, [coinId, days]);

  const title = useMemo(() => {
    const map = { bitcoin: 'BTC', ethereum: 'ETH', tether: 'USDT' };
    return `${map[coinId] || coinId} Price (USD)`;
  }, [coinId]);

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

      {loading && <div style={{ marginTop: 10 }}>Loading…</div>}
      {err && <div className="error-message" style={{ marginTop: 10 }}>{err}</div>}

      {!loading && !err && (
        <div style={{ width: '100%', marginTop: 10 }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
              <XAxis dataKey="d" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Line type="monotone" dataKey="p" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
