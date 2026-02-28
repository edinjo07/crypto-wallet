import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supportAPI } from '../services/api';
import Icon from './Icon';

const SUBJECTS = [
  'Withdrawal issue',
  'Deposit not received',
  'KYC verification',
  'Account access',
  'Transaction question',
  'Security concern',
  'Other',
];

function SupportPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ subject: '', customSubject: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }

  const subjectValue = form.subject === 'Other' ? form.customSubject : form.subject;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject) return setResult({ ok: false, text: 'Please select a subject.' });
    if (form.subject === 'Other' && !form.customSubject.trim())
      return setResult({ ok: false, text: 'Please describe your subject.' });
    if (!form.message.trim()) return setResult({ ok: false, text: 'Message is required.' });

    setLoading(true);
    setResult(null);
    try {
      await supportAPI.submit({ subject: subjectValue.trim(), message: form.message.trim() });
      setResult({ ok: true, text: 'Your message has been sent. Our team will respond shortly.' });
      setForm({ subject: '', customSubject: '', message: '' });
    } catch (err) {
      setResult({ ok: false, text: err.response?.data?.message || 'Failed to send. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rw-theme rw-page rw-recover">
      <div className="rw-recover-container" style={{ maxWidth: 540 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: '1rem', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', padding: 0 }}
        >
          ← Back to Dashboard
        </button>

        <div className="rw-recover-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(74,158,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="infoCircle" size={28} color="#4a9eff" />
            </div>
          </div>
          <h1>Contact Support</h1>
          <p className="rw-muted" style={{ textAlign: 'center', marginTop: 4 }}>24/7 recovery assistance for critical cases</p>
        </div>

        <div className="rw-recover-box">
          {result?.ok ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ marginBottom: 8 }}>Message Sent</h2>
              <p style={{ color: 'var(--text-secondary)' }}>{result.text}</p>
              <button className="rw-btn rw-btn-primary" style={{ marginTop: 24, width: '100%' }} onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {result && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(255,68,68,0.3)', fontSize: '0.9rem', fontWeight: 600 }}>
                  {result.text}
                </div>
              )}

              {/* Subject */}
              <div className="form-group">
                <label className="form-label">Subject</label>
                <select
                  className="form-input form-select"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value, customSubject: '' }))}
                  required
                >
                  <option value="">Select a topic…</option>
                  {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {form.subject === 'Other' && (
                <div className="form-group">
                  <label className="form-label">Describe your topic</label>
                  <input
                    className="form-input"
                    type="text"
                    maxLength={120}
                    placeholder="Brief subject"
                    value={form.customSubject}
                    onChange={e => setForm(f => ({ ...f, customSubject: e.target.value }))}
                  />
                </div>
              )}

              {/* Message */}
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  className="form-input"
                  rows={6}
                  maxLength={2000}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Describe your issue in detail…"
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  required
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: 2 }}>
                  {form.message.length}/2000
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="rw-btn rw-btn-secondary" style={{ flex: 1 }} onClick={() => navigate('/dashboard')} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className="rw-btn rw-btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sending…</> : 'Send Message'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default SupportPage;
