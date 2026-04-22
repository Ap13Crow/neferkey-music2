import { useState } from 'react';
import { IconDisc, IconPlus, IconTrash, IconPlay, IconNote } from './Icons';
import TrackList from './TrackList';
import ConfirmModal from './ConfirmModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function CreateAlbumModal({ onClose, onCreated, token }) {
  const [form, setForm] = useState({ name: '', description: '', cover_url: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/albums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      onCreated(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Create album</div>
        <form className="modal-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">Album name *</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Album" required />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Cover image URL</label>
            <input className="form-input" value={form.cover_url} onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddTrackModal({ album, allTracks, onClose, onAdded, token }) {
  const [search, setSearch] = useState('');
  const albumTrackKeys = new Set((album.tracks || []).map((t) => t.url_key));
  const available = allTracks.filter(
    (t) => !albumTrackKeys.has(t.url_key) && (
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.artist.toLowerCase().includes(search.toLowerCase())
    ),
  );

  async function addTrack(trackKey) {
    try {
      const res = await fetch(`${API_BASE}/albums/${album.id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ track_key: trackKey }),
      });
      if (res.ok) onAdded(trackKey);
    } catch { /* ignore */ }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Add track to "{album.name}"</div>
        <input
          className="form-input"
          placeholder="Search by title or artist…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: '1rem' }}
        />
        {available.length === 0 ? (
          <div className="empty-state" style={{ padding: '1.5rem 0' }}>
            <p>{allTracks.length === 0 ? 'No tracks in your library yet.' : 'No more tracks to add.'}</p>
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {available.map((t) => (
              <div key={t.url_key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                {t.image_url ? (
                  <img src={t.image_url} alt={t.title} style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover' }} />
                ) : (
                  <div className="track-cover-placeholder" style={{ width: 36, height: 36 }}><IconNote size={16} /></div>
                )}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div className="track-title" style={{ fontSize: '0.84rem' }}>{t.title}</div>
                  <div className="track-artist">{t.artist}</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => addTrack(t.url_key)}>
                  <IconPlus size={13} /> Add
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export default function AlbumsView({ albums, allTracks, token, onRefresh, onPlayTracks }) {
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'album'|'track', id, label }

  async function deleteAlbum(id) {
    await fetch(`${API_BASE}/albums/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (selectedAlbum?.id === id) setSelectedAlbum(null);
    onRefresh();
  }

  async function removeTrackFromAlbum(trackKey) {
    if (!selectedAlbum) return;
    await fetch(`${API_BASE}/albums/${selectedAlbum.id}/tracks/${trackKey}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    onRefresh();
  }

  function handleAlbumCreated(album) {
    setShowCreate(false);
    onRefresh();
    setSelectedAlbum({ ...album, tracks: [] });
  }

  // Sync selectedAlbum with refreshed albums list
  const currentAlbum = selectedAlbum
    ? albums.find((a) => a.id === selectedAlbum.id) || selectedAlbum
    : null;

  return (
    <div>
      {currentAlbum ? (
        <>
          <div className="section-header">
            <div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedAlbum(null)}>
                ← Back to albums
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {token && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAddTrack(true)}>
                    <IconPlus size={13} /> Add track
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setConfirmDelete({ type: 'album', id: currentAlbum.id, label: currentAlbum.name })}
                  >
                    <IconTrash size={13} /> Delete album
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="album-detail-hero">
            {currentAlbum.cover_url ? (
              <img className="album-detail-cover" src={currentAlbum.cover_url} alt={currentAlbum.name} />
            ) : (
              <div className="album-detail-cover-placeholder"><IconDisc size={64} /></div>
            )}
            <div className="album-detail-info">
              <div className="album-detail-type">Album</div>
              <div className="album-detail-name">{currentAlbum.name}</div>
              {currentAlbum.description && (
                <div className="album-detail-desc">{currentAlbum.description}</div>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {currentAlbum.tracks?.length || 0} tracks
              </div>
              <div className="album-detail-actions">
                {(currentAlbum.tracks?.length > 0) && (
                  <button className="btn btn-primary" onClick={() => onPlayTracks(currentAlbum.tracks, 0)}>
                    <IconPlay size={14} /> Play all
                  </button>
                )}
              </div>
            </div>
          </div>

          <TrackList
            tracks={currentAlbum.tracks || []}
            currentIndex={-1}
            onPlay={(i) => onPlayTracks(currentAlbum.tracks, i)}
            onDelete={token ? (key) => setConfirmDelete({ type: 'track', id: key, label: (currentAlbum.tracks || []).find((t) => t.url_key === key)?.title || key }) : null}
            showDelete={!!token}
          />

          {showAddTrack && (
            <AddTrackModal
              album={currentAlbum}
              allTracks={allTracks}
              token={token}
              onClose={() => setShowAddTrack(false)}
              onAdded={() => { onRefresh(); setShowAddTrack(false); }}
            />
          )}
        </>
      ) : (
        <>
          <div className="section-header">
            <div>
              <div className="section-title">Albums</div>
              <div className="section-subtitle">Your personal album collection</div>
            </div>
            {token && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <IconPlus size={14} /> New album
              </button>
            )}
          </div>

          {albums.length === 0 ? (
            <div className="empty-state">
              <IconDisc size={48} />
              <h3>No albums yet</h3>
              <p>{token ? 'Create your first album to organise your tracks.' : 'Sign in to create and manage albums.'}</p>
            </div>
          ) : (
            <div className="album-grid">
              {albums.map((album) => (
                <div key={album.id} className="album-card" onClick={() => setSelectedAlbum(album)}>
                  {album.cover_url ? (
                    <img className="album-card-cover" src={album.cover_url} alt={album.name} />
                  ) : (
                    <div className="album-card-cover-placeholder"><IconDisc size={48} /></div>
                  )}
                  <div className="album-card-info">
                    <div className="album-card-name">{album.name}</div>
                    <div className="album-card-meta">{(album.tracks || []).length} tracks</div>
                  </div>
                  {token && (
                    <div className="album-card-actions">
                      <button
                        className="icon-btn"
                        title="Delete"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'album', id: album.id, label: album.name }); }}
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showCreate && (
            <CreateAlbumModal
              token={token}
              onClose={() => setShowCreate(false)}
              onCreated={handleAlbumCreated}
            />
          )}
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          message={
            confirmDelete.type === 'album'
              ? `Delete album "${confirmDelete.label}"? This cannot be undone.`
              : `Remove "${confirmDelete.label}" from this album?`
          }
          confirmLabel={confirmDelete.type === 'album' ? 'Delete album' : 'Remove track'}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete.type === 'album') deleteAlbum(confirmDelete.id);
            else removeTrackFromAlbum(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}
