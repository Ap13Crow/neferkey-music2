import { useCallback, useEffect, useState } from 'react';
import { IconKey, IconCopy, IconTrash, IconCheck, IconPlus } from './Icons';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function relTime(isoStr) {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(isoStr).toLocaleDateString();
}

function copyText(str) {
  navigator.clipboard?.writeText(str).catch(() => {});
}

function buildClaimUrl(token) {
  return `${window.location.origin}${window.location.pathname}?claim=${token}`;
}

export default function AdminLinksView({ token, tracks, albums }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ resource_type: 'track', resource_key: '', label: '', expires_at: '' });
  const [copied, setCopied] = useState(null);
  const [formError, setFormError] = useState('');

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/purchase-links`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setLinks(data.links || []);
      else setError(data.error || 'Failed to load links');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (!form.resource_key) { setFormError('Select a resource.'); return; }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/purchase-links`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: form.resource_type,
          resource_key: form.resource_key,
          label: form.label,
          expires_at: form.expires_at || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinks((prev) => [data.link, ...prev]);
        setForm({ resource_type: 'track', resource_key: '', label: '', expires_at: '' });
      } else {
        setFormError(data.error || 'Failed to create link');
      }
    } catch {
      setFormError('Network error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    try {
      await fetch(`${API_BASE}/purchase-links/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch { /* ignore */ }
  }

  function handleCopy(linkToken) {
    const url = buildClaimUrl(linkToken);
    copyText(url);
    setCopied(linkToken);
    setTimeout(() => setCopied((c) => c === linkToken ? null : c), 2000);
  }

  const resourceOptions = form.resource_type === 'track' ? tracks : albums;

  return (
    <div className="upload-area">
      <div className="section-header">
        <div>
          <div className="section-title">Purchase Links</div>
          <div className="section-subtitle">Generate one-time URLs to grant track or album access after purchase</div>
        </div>
      </div>

      {/* Create form */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <IconPlus size={14} /> Generate new link
        </div>

        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-input speed-select"
                style={{ fontSize: '0.84rem', padding: '0.55rem 0.75rem' }}
                value={form.resource_type}
                onChange={(e) => setForm((f) => ({ ...f, resource_type: e.target.value, resource_key: '' }))}
              >
                <option value="track">Track</option>
                <option value="album">Album</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{form.resource_type === 'track' ? 'Track' : 'Album'}</label>
              <select
                className="form-input speed-select"
                style={{ fontSize: '0.84rem', padding: '0.55rem 0.75rem' }}
                value={form.resource_key}
                onChange={(e) => setForm((f) => ({ ...f, resource_key: e.target.value }))}
              >
                <option value="">Select…</option>
                {resourceOptions.map((r) => (
                  <option key={r.url_key || r.id} value={r.url_key || r.id}>
                    {r.title || r.name}{r.artist ? ` — ${r.artist}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Label (optional)</label>
              <input
                className="form-input"
                placeholder="e.g. Order #1234"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Expires (optional)</label>
              <input
                className="form-input"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
            </div>
          </div>

          {formError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{formError}</div>}

          <button className="btn btn-primary" type="submit" disabled={creating}>
            <IconKey size={13} /> {creating ? 'Generating…' : 'Generate link'}
          </button>
        </form>
      </div>

      {/* Link list */}
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</p>}
      {error && <div className="auth-error">{error}</div>}

      {!loading && links.length === 0 && (
        <div className="empty-state">
          <IconKey size={40} />
          <h3>No links yet</h3>
          <p>Generate your first purchase link above.</p>
        </div>
      )}

      {links.map((link) => {
        const claimUrl = buildClaimUrl(link.token);
        const isUsed = !!link.used_at;
        const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
        return (
          <div
            key={link.id}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${isUsed || isExpired ? 'var(--border)' : 'var(--accent)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1rem',
              marginBottom: '0.6rem',
              opacity: isUsed || isExpired ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                    {link.resource_type}
                  </span>
                  {isUsed && <span style={{ fontSize: '0.7rem', background: 'rgba(22,163,74,0.15)', color: '#86efac', borderRadius: 3, padding: '0.1rem 0.35rem' }}>Used {relTime(link.used_at)}</span>}
                  {isExpired && !isUsed && <span style={{ fontSize: '0.7rem', background: 'rgba(185,28,28,0.15)', color: '#fca5a5', borderRadius: 3, padding: '0.1rem 0.35rem' }}>Expired</span>}
                  {!isUsed && !isExpired && <span style={{ fontSize: '0.7rem', background: 'rgba(233,69,96,0.12)', color: 'var(--accent)', borderRadius: 3, padding: '0.1rem 0.35rem' }}>Active</span>}
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {link.label || link.resource_key}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {claimUrl}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Created {relTime(link.created_at)}
                  {link.used_by_username && ` · Used by ${link.used_by_username}`}
                  {link.expires_at && !isExpired && ` · Expires ${new Date(link.expires_at).toLocaleDateString()}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                {!isUsed && !isExpired && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(link.token)}
                    title="Copy link"
                  >
                    {copied === link.token ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    {copied === link.token ? 'Copied' : 'Copy'}
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDelete(link.id)}
                  title="Delete link"
                >
                  <IconTrash size={12} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
