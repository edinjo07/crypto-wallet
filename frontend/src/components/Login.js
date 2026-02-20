import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../auth/useAuth';
import Icon from './Icon';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(formData);
      login(response.data.token, response.data.user);
      // Fetch CSRF token now that refreshToken cookie is set - this binds
      // the CSRF cookie to the session so all subsequent POSTs are allowed
      try { await authAPI.fetchCsrfToken(); } catch (_) { /* non-fatal */ }
      const requestedPath = location.state?.from?.pathname;
      const isSafePath = typeof requestedPath === 'string' && requestedPath.startsWith('/') && !requestedPath.startsWith('//');
      const redirectTo = isSafePath ? requestedPath : '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
          <div className="auth-logo" style={{ 
            animation: 'pulse 2s ease-in-out infinite',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <Icon name="wallet" size={64} color="#60B5FF" />
          </div>
          <h2 className="auth-title">Welcome Back</h2>
          <p className="auth-subtitle">Sign in to access your crypto wallet</p>
        </div>
        
        {error && (
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1rem 1.25rem', 
            background: 'rgba(255, 69, 58, 0.15)', 
            borderRadius: '16px', 
            textAlign: 'center',
            border: '1px solid rgba(255, 69, 58, 0.3)',
            fontWeight: '600',
            color: 'var(--danger)',
            animation: 'shake 0.5s ease-in-out'
          }}>
            <Icon name="alertTriangle" size={18} color="var(--danger)" /> {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="auth-form" style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}>
          <div className="form-group">
            <label className="form-label">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="user" size={16} /> Email Address
              </span>
            </label>
            <input
              type="email"
              name="email"
              className="form-input"
              placeholder="your@email.com"
              value={formData.email}
              onChange={handleChange}
              required
              style={{ transition: 'all 0.3s ease' }}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="lock" size={16} /> Password
              </span>
            </label>
            <input
              type="password"
              name="password"
              className="form-input"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              style={{ transition: 'all 0.3s ease' }}
            />
          </div>
          
          <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ marginTop: '1rem', fontSize: '1.05rem' }}>
            {loading ? (
              <>
                <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
                Signing in...
              </>
            ) : (
              <>
                Sign In <span style={{ marginLeft: '0.5rem' }}>→</span>
              </>
            )}
          </button>
        </form>
        
        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem', 
          borderTop: '1px solid rgba(200, 200, 200, 0.3)',
          textAlign: 'center',
          fontSize: '0.9rem',
          color: '#666'
        }}>
          Are you an administrator? <Link to="/admin-login" style={{ 
            color: '#667eea',
            fontWeight: '600',
            textDecoration: 'none',
            transition: 'all 0.3s ease'
          }}>Access Admin Portal</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
