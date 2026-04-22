import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export default function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/auth/login' : '/auth/register';
      const body = tab === 'login'
        ? { email: form.email, password: form.password }
        : { username: form.username, email: form.email, password: form.password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }
      localStorage.setItem('nk_token', data.token);
      onAuth(data.user, data.token);
    } catch {
      setError('Network error — is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-name">♪ Neferkey</div>
          <div className="auth-logo-sub">Your personal music library</div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>
            Sign in
          </button>
          <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" type="text" value={form.username} onChange={set('username')} placeholder="Choose a username" required />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={form.password} onChange={set('password')} placeholder={tab === 'register' ? 'At least 8 characters' : '••••••••'} required />
          </div>

          <button className="btn btn-primary auth-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : tab === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Demo tracks are available without sign-in — sign in to upload and manage your library.
        </div>
      </div>
    </div>
  );
}
