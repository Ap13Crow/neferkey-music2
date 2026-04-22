import { useEffect, useState } from 'react';
import { IconKey, IconCheck, IconNote, IconAlbum } from './Icons';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export default function ClaimModal({ token, onClaimed, onClose, user, onSignIn }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    fetch(`${API_BASE}/purchase-links/${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) setError(data.error || 'Invalid or expired link.');
        else setInfo(data);
      })
      .catch(() => setError('Could not reach the server.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleClaim() {
    if (!user) { onSignIn(); return; }
    setClaiming(true);
    setError('');
    try {
      const storedToken = localStorage.getItem('nk_token');
      const res = await fetch(`${API_BASE}/purchase-links/${encodeURIComponent(token)}/redeem`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to redeem link.');
      } else {
        setClaimed(true);
        if (onClaimed) onClaimed(data);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <IconKey size={20} />
          <div className="modal-title" style={{ margin: 0 }}>Redeem Purchase</div>
        </div>

        {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>}

        {!loading && error && (
          <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>
        )}

        {!loading && !error && info && !claimed && (
          <>
            <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem', border: '1px solid var(--border)', display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
              {info.resource?.image_url || info.resource?.cover_url ? (
                <img
                  src={info.resource.image_url || info.resource.cover_url}
                  alt={info.resource.title || info.resource.name}
                  style={{ width: 64, height: 64, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-sm)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {info.resource_type === 'track' ? <IconNote size={28} /> : <IconAlbum size={28} />}
                </div>
              )}
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                  {info.resource_type}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {info.resource?.title || info.resource?.name || info.resource_key}
                </div>
                {info.resource?.artist && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{info.resource.artist}</div>
                )}
                {info.resource?.track_count !== undefined && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{info.resource.track_count} tracks</div>
                )}
                {info.label && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{info.label}</div>
                )}
              </div>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              {user
                ? `This will add the ${info.resource_type} to your library. The link will be invalidated immediately.`
                : 'Sign in to claim this purchase and add it to your library.'}
            </p>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleClaim} disabled={claiming}>
                {claiming ? 'Claiming…' : user ? 'Claim now' : 'Sign in to claim'}
              </button>
            </div>
          </>
        )}

        {claimed && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ color: '#86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              <IconCheck size={22} /> Added to your library!
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              The {info?.resource_type} is now available in your library.
            </p>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        )}

        {!loading && error && (
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
