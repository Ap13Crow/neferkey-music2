import { useCallback, useEffect, useState } from 'react';
import {
  IconKey, IconCopy, IconTrash, IconCheck, IconPlus, IconNfc,
} from './Icons';
import {
  buildNfcResourceUrl,
  decodeNfcRecordData,
  isNfcSupported,
} from '../utils/nfc';

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
  const [form, setForm] = useState({
    resource_type: 'track',
    resource_key: '',
    label: '',
    expires_at: '',
    bulk: false,
    count: 10,
    target_user_id: '',
  });
  const [copied, setCopied] = useState(null);
  const [formError, setFormError] = useState('');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [savingRoleId, setSavingRoleId] = useState(null);
  const [nfcForm, setNfcForm] = useState({
    resource_type: 'track',
    resource_key: '',
    repeat_count: 1,
  });
  const [nfcWriteState, setNfcWriteState] = useState({
    step: 'idle',
    status: '',
    written: 0,
    verified: false,
    error: '',
    recentUrl: '',
    records: [],
  });
  const nfcSupport = isNfcSupported();

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

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch(`${API_BASE}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
      else setUsersError(data.error || 'Failed to load users');
    } catch {
      setUsersError('Network error');
    } finally {
      setUsersLoading(false);
    }
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

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
          count: form.bulk ? Number(form.count) : 1,
          target_user_id: form.target_user_id || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const createdLinks = data.links || (data.link ? [data.link] : []);
        setLinks((prev) => [...createdLinks, ...prev]);
        setForm((prev) => ({
          ...prev,
          resource_type: 'track',
          resource_key: '',
          label: '',
          expires_at: '',
          bulk: false,
          count: 10,
        }));
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

  async function handleRoleChange(userId, role) {
    setSavingRoleId(userId);
    try {
      const res = await fetch(`${API_BASE}/auth/users/${encodeURIComponent(userId)}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUsersError(data.error || 'Failed to update role');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: data.role } : u)));
    } catch {
      setUsersError('Network error');
    } finally {
      setSavingRoleId(null);
    }
  }

  const resourceOptions = form.resource_type === 'track' ? tracks : albums;
  const nfcResourceOptions = nfcForm.resource_type === 'track' ? tracks : albums;

  async function verifyWrittenNfc(expectedUrl) {
    let reader = null;
    try {
      reader = new NDEFReader();
      await reader.scan();
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2500);
        reader.onreading = (event) => {
          clearTimeout(timeout);
          const values = (event.message?.records || []).map((record) => decodeNfcRecordData(record));
          resolve(values.includes(expectedUrl));
        };
        reader.onreadingerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      });
    } catch {
      return false;
    } finally {
      if (reader) {
        reader.onreading = null;
        reader.onreadingerror = null;
      }
    }
  }

  async function handleNfcWrite() {
    if (!nfcForm.resource_key) {
      setNfcWriteState((prev) => ({ ...prev, error: 'Select a track or album first.' }));
      return;
    }
    if (!nfcSupport.supported) {
      setNfcWriteState((prev) => ({ ...prev, error: nfcSupport.message || 'NFC is not supported.' }));
      return;
    }
    const repeatCount = Math.min(50, Math.max(1, Number(nfcForm.repeat_count) || 1));
    const resourceUrl = buildNfcResourceUrl(nfcForm.resource_type, nfcForm.resource_key);
    setNfcWriteState({
      step: 'activate',
      status: 'Activate NFC and hold a tag near the device.',
      written: 0,
      verified: false,
      error: '',
      recentUrl: resourceUrl,
      records: [],
    });

    for (let i = 0; i < repeatCount; i += 1) {
      try {
        setNfcWriteState((prev) => ({
          ...prev,
          step: 'detect',
          status: `Ready for tag ${i + 1} of ${repeatCount}. Touch a tag now.`,
        }));
        const writer = new NDEFReader();
        await writer.write({
          records: [{ recordType: 'url', data: resourceUrl }],
        });
        setNfcWriteState((prev) => ({
          ...prev,
          step: 'write',
          status: `Tag ${i + 1} written. Verifying…`,
          written: i + 1,
        }));
        const verified = await verifyWrittenNfc(resourceUrl);
        setNfcWriteState((prev) => ({
          ...prev,
          step: verified ? 'verify' : 'store',
          status: verified
            ? `Tag ${i + 1} verified and stored.`
            : `Tag ${i + 1} stored (verification skipped).`,
          verified,
          records: [
            { index: i + 1, at: new Date().toISOString(), verified },
            ...prev.records,
          ].slice(0, 10),
        }));
      } catch (err) {
        setNfcWriteState((prev) => ({
          ...prev,
          step: 'error',
          error: err?.message || 'NFC write failed.',
          status: `Failed while writing tag ${i + 1}.`,
        }));
        return;
      }
    }

    setNfcWriteState((prev) => ({
      ...prev,
      step: 'done',
      status: `Finished writing ${repeatCount} tag${repeatCount > 1 ? 's' : ''}.`,
    }));
  }

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

            <div className="form-group">
              <label className="form-label">Assigned user (optional)</label>
              <select
                className="form-input speed-select"
                style={{ fontSize: '0.84rem', padding: '0.55rem 0.75rem' }}
                value={form.target_user_id}
                onChange={(e) => setForm((f) => ({ ...f, target_user_id: e.target.value }))}
              >
                <option value="">Anyone can redeem</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={form.bulk}
                onChange={(e) => setForm((f) => ({ ...f, bulk: e.target.checked }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              Bulk generate
            </label>
            {form.bulk && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Count
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={200}
                  value={form.count}
                  onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
                  style={{ width: 92, padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                />
              </label>
            )}
          </div>

          {formError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{formError}</div>}

          <button className="btn btn-primary" type="submit" disabled={creating}>
            <IconKey size={13} /> {creating ? 'Generating…' : form.bulk ? 'Generate links' : 'Generate link'}
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
                  {link.target_user_username && ` · Assigned to ${link.target_user_username}`}
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

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginTop: '1.25rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <IconNfc size={14} /> NFC writer
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.77rem', marginBottom: '0.9rem' }}>
          Step 1: choose resource. Step 2: activate reader, detect, write, store and verify. Repeat for multiple tags if needed.
        </div>
        {!nfcSupport.supported && (
          <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{nfcSupport.message || 'NFC is not available.'}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-input speed-select"
              style={{ fontSize: '0.84rem', padding: '0.55rem 0.75rem' }}
              value={nfcForm.resource_type}
              onChange={(e) => setNfcForm((f) => ({ ...f, resource_type: e.target.value, resource_key: '' }))}
            >
              <option value="track">Track</option>
              <option value="album">Album</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{nfcForm.resource_type === 'track' ? 'Track' : 'Album'}</label>
            <select
              className="form-input speed-select"
              style={{ fontSize: '0.84rem', padding: '0.55rem 0.75rem' }}
              value={nfcForm.resource_key}
              onChange={(e) => setNfcForm((f) => ({ ...f, resource_key: e.target.value }))}
            >
              <option value="">Select…</option>
              {nfcResourceOptions.map((r) => (
                <option key={r.url_key || r.id} value={r.url_key || r.id}>
                  {r.title || r.name}{r.artist ? ` — ${r.artist}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tag count</label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={50}
              value={nfcForm.repeat_count}
              onChange={(e) => setNfcForm((f) => ({ ...f, repeat_count: e.target.value }))}
            />
          </div>
        </div>
        {nfcWriteState.error && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{nfcWriteState.error}</div>}
        <button className="btn btn-primary" type="button" onClick={handleNfcWrite} disabled={!nfcSupport.supported}>
          <IconNfc size={13} /> Write NFC tag{Number(nfcForm.repeat_count) > 1 ? 's' : ''}
        </button>
        {nfcWriteState.status && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {nfcWriteState.status}
          </div>
        )}
        {nfcWriteState.recentUrl && (
          <div style={{ marginTop: '0.4rem', fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            {nfcWriteState.recentUrl}
          </div>
        )}
        {nfcWriteState.records.length > 0 && (
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
            {nfcWriteState.records.map((record) => (
              <div key={`${record.index}-${record.at}`} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                Tag #{record.index} · {new Date(record.at).toLocaleTimeString()} · {record.verified ? 'verified' : 'stored'}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginTop: '1.25rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>
          User permissions
        </div>
        {usersLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading users…</p>}
        {usersError && <div className="auth-error" style={{ marginBottom: '0.75rem' }}>{usersError}</div>}
        {!usersLoading && users.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No users found.</p>
        )}
        {!usersLoading && users.map((u) => (
          <div
            key={u.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '0.75rem',
              alignItems: 'center',
              padding: '0.65rem 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.username}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.email}
              </div>
            </div>
            <select
              className="form-input"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.55rem', minWidth: 110 }}
              value={u.role || 'user'}
              disabled={savingRoleId === u.id}
              aria-label={`Role for ${u.username}`}
              onChange={(e) => handleRoleChange(u.id, e.target.value)}
            >
              <option value="user">user</option>
              <option value="artist">artist</option>
              <option value="composer">composer</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
