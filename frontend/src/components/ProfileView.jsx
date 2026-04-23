import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export default function ProfileView({ user, token, onUserUpdate, onLogout }) {
  const [prefs, setPrefs] = useState(user?.preferences || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [loadingPurchases, setLoadingPurchases] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoadingPurchases(true);
    fetch(`${API_BASE}/purchase-links/redeemed`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : { purchases: [] })
      .then((data) => setPurchases(data.purchases || []))
      .catch(() => setPurchases([]))
      .finally(() => setLoadingPurchases(false));
  }, [token]);

  if (!user) {
    return (
      <div className="profile-section">
        <div className="section-header">
          <div className="section-title">Profile</div>
        </div>
        <div className="empty-state">
          <p>Sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  async function savePrefs() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/auth/me/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferences: prefs }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUserUpdate(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  const initial = user.username?.charAt(0).toUpperCase() || '?';

  return (
    <div className="profile-section">
      <div className="section-header">
        <div className="section-title">Profile</div>
      </div>

      <div className="profile-info">
        <div className="profile-avatar">{initial}</div>
        <div>
          <div className="profile-name">{user.username}</div>
          <div className="profile-email">{user.email}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Member since {new Date(user.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Preferences</div>

        <div className="pref-row">
          <span className="pref-label">Default playback speed</span>
          <select
            className="speed-select"
            value={prefs.defaultSpeed || 1}
            onChange={(e) => setPrefs((p) => ({ ...p, defaultSpeed: Number(e.target.value) }))}
          >
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </div>

        <div className="pref-row">
          <span className="pref-label">Autoplay next track</span>
          <input
            type="checkbox"
            checked={prefs.autoplay !== false}
            onChange={(e) => setPrefs((p) => ({ ...p, autoplay: e.target.checked }))}
            style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary btn-sm" onClick={savePrefs} disabled={saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save preferences'}
          </button>
        </div>
      </div>

      <button className="btn btn-danger" onClick={onLogout}>Sign out</button>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginTop: '1.25rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '0.9rem' }}>Redeemed purchases</div>
        {loadingPurchases && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading…</p>}
        {!loadingPurchases && purchases.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No redeemed purchases yet.</p>
        )}
        {!loadingPurchases && purchases.map((p) => (
          <div key={p.id} style={{ borderTop: '1px solid var(--border)', padding: '0.65rem 0' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {p.resource_type === 'track'
                ? (p.track_title || p.resource_key)
                : (p.album_name || p.resource_key)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {p.resource_type === 'track' ? p.track_artist : 'Album'} · Redeemed {new Date(p.purchased_at).toLocaleDateString()}
              {p.label ? ` · ${p.label}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
