import { useCallback, useEffect, useRef, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PlayerBar from './components/PlayerBar';
import TrackList from './components/TrackList';
import AlbumsView from './components/AlbumsView';
import UploadView from './components/UploadView';
import ProfileView from './components/ProfileView';
import ConfirmModal from './components/ConfirmModal';
import ClaimModal from './components/ClaimModal';
import AdminLinksView from './components/AdminLinksView';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const SCORE_EXTS = '.pdf,.xml,.musicxml,.mxl';

const DEMO_TRACKS = [
  {
    url_key: 'demo-track-1',
    album_key: 'demo-album',
    title: 'Prelude in C Major',
    artist: 'J.S. Bach',
    audio_url: 'https://cdn.freesound.org/previews/431/431117_5121236-lq.mp3',
    image_url: 'https://picsum.photos/seed/demo1/600/600',
    lyrics: 'A gentle arpeggio introduces the harmony...',
    genre: 'Classical',
  },
  {
    url_key: 'demo-track-2',
    album_key: 'demo-album',
    title: 'Moonlight Sonata (Excerpt)',
    artist: 'L. van Beethoven',
    audio_url: 'https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3',
    image_url: 'https://picsum.photos/seed/demo2/600/600',
    lyrics: 'Soft triplets unfold in the night...',
    genre: 'Classical',
  },
];

const VIEW_TITLES = {
  library: 'Library',
  albums: 'Albums',
  lyrics: 'Lyrics',
  upload: 'Upload',
  profile: 'Profile',
  admin: 'Admin',
};

/** Extract a claim token from the current page URL (?claim=TOKEN) */
function getClaimTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('claim') || null;
}

/** Remove ?claim= from the browser URL without reloading */
function clearClaimFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('claim');
  window.history.replaceState({}, '', url.toString());
}

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('nk_token') || null);
  const [authVisible, setAuthVisible] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState('login');
  const [view, setView] = useState('library');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [tracks, setTracks] = useState(DEMO_TRACKS);
  const [albums, setAlbums] = useState([]);

  const [queue, setQueue] = useState(DEMO_TRACKS);
  const [queueIndex, setQueueIndex] = useState(0);
  const [playIntent, setPlayIntent] = useState(0);

  const [confirmDeleteTrack, setConfirmDeleteTrack] = useState(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [editingTrack, setEditingTrack] = useState(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchParams, setSearchParams] = useState({
    q: '',
    type: 'all',
    artist: '',
    composer: '',
    date_from: '',
    date_to: '',
  });
  const [searchResults, setSearchResults] = useState({ tracks: [], albums: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [lyricsXmlText, setLyricsXmlText] = useState('');
  const [lyricsXmlError, setLyricsXmlError] = useState('');

  // Purchase link claim flow
  const [claimToken, setClaimToken] = useState(null);
  const [pendingClaimToken, setPendingClaimToken] = useState(null);

  // On mount: check URL for ?claim= token
  useEffect(() => {
    const t = getClaimTokenFromUrl();
    if (t) {
      clearClaimFromUrl();
      setClaimToken(t);
    }
  }, []);

  // Verify stored token and load user
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((u) => { if (u) setUser(u); else logout(); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTracks = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/tracks`, { headers });
      if (res.ok) {
        const data = await res.json();
        const all = data.tracks.length > 0 ? data.tracks : DEMO_TRACKS;
        setTracks(all);
        setQueue(all);
      }
    } catch { /* use demo tracks */ }
  }, [token]);

  const loadAlbums = useCallback(async () => {
    try {
      const res = token
        ? await fetch(`${API_BASE}/albums`, { headers: { Authorization: `Bearer ${token}` } })
        : await fetch(`${API_BASE}/albums/public`);
      if (res.ok) {
        const data = await res.json();
        setAlbums(data.albums || []);
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadTracks(); }, [loadTracks]);
  useEffect(() => { loadAlbums(); }, [loadAlbums]);

  const runSearch = useCallback(async (params = searchParams) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (String(v || '').trim()) query.set(k, String(v).trim());
    });
    setSearchLoading(true);
    setSearchError('');
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/search?${query.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || 'Search failed');
        return;
      }
      setSearchResults({ tracks: data.tracks || [], albums: data.albums || [] });
    } catch {
      setSearchError('Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, [searchParams, token]);

  function handleAuth(newUser, newToken) {
    setUser(newUser);
    setToken(newToken);
    setAuthVisible(false);
    loadAlbums();
    // If user signed in to complete a pending claim, open the modal now
    if (pendingClaimToken) {
      setClaimToken(pendingClaimToken);
      setPendingClaimToken(null);
    }
  }

  function logout() {
    localStorage.removeItem('nk_token');
    setUser(null);
    setToken(null);
    setAlbums([]);
  }

  async function deleteAccount() {
    try {
      await fetch(`${API_BASE}/auth/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore — log out regardless */ }
    logout();
  }

  function handlePlayTracks(newQueue, index) {
    setQueue(newQueue);
    setQueueIndex(index);
    setPlayIntent((n) => n + 1);
  }

  function handleDeleteTrack(urlKey) {
    const track = tracks.find((t) => t.url_key === urlKey);
    setConfirmDeleteTrack({ urlKey, title: track?.title || urlKey });
  }

  function executeDeleteTrack() {
    if (!confirmDeleteTrack) return;
    const { urlKey } = confirmDeleteTrack;
    fetch(`${API_BASE}/tracks/${encodeURIComponent(urlKey)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => { if (r.ok) loadTracks(); });
    setConfirmDeleteTrack(null);
  }

  function openSignIn() {
    setAuthDefaultTab('login');
    setAuthVisible(true);
  }

  function openRegister() {
    setAuthDefaultTab('register');
    setAuthVisible(true);
  }

  // When a claim token is triggered from UploadView or URL
  function handleClaim(t) {
    if (!user) {
      // Save token and prompt login first
      setPendingClaimToken(t);
      openSignIn();
    } else {
      setClaimToken(t);
    }
  }

  const currentTrack = queue[queueIndex] || null;
  const canManageAllMetadata = user?.role === 'admin' || user?.role === 'manager';
  const canEditTrack = (track) => !!token && (canManageAllMetadata || track?.owner_id === user?.id);

  useEffect(() => {
    const track = currentTrack;
    setLyricsXmlText('');
    setLyricsXmlError('');
    if (!track?.lyrics_asset_url) return;
    const ext = String(track.lyrics_asset_type || '').toLowerCase();
    if (!ext.includes('xml')) return;

    let cancelled = false;
    fetch(track.lyrics_asset_url)
      .then((r) => r.ok ? r.text() : Promise.reject(new Error('Failed to load XML score')))
      .then((text) => { if (!cancelled) setLyricsXmlText(text); })
      .catch(() => { if (!cancelled) setLyricsXmlError('Unable to load XML score.'); });
    return () => { cancelled = true; };
  }, [currentTrack]);

  function renderContent() {
    switch (view) {
      case 'library':
        return (
          <div>
            <div className="section-header">
              <div>
                <div className="section-title">Library</div>
                <div className="section-subtitle">{tracks.length} tracks</div>
              </div>
            </div>
            <TrackList
              tracks={tracks}
              currentIndex={queue === tracks ? queueIndex : -1}
              onPlay={(i) => handlePlayTracks(tracks, i)}
              onDelete={token ? handleDeleteTrack : null}
              showDelete={!!token}
              onEdit={canManageAllMetadata ? setEditingTrack : null}
              showEdit={canManageAllMetadata}
            />
          </div>
        );
      case 'albums':
        return (
          <AlbumsView
            albums={albums}
            allTracks={tracks}
            token={token}
            onRefresh={() => { loadAlbums(); loadTracks(); }}
            onPlayTracks={handlePlayTracks}
            currentIndex={queueIndex}
            canManageAll={canManageAllMetadata}
          />
        );
      case 'lyrics':
        return (
          <div>
            <div className="section-header">
              <div className="section-title">Lyrics</div>
              {currentTrack && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {currentTrack.title} — {currentTrack.artist}
                </div>
              )}
            </div>
            <div className="lyrics-panel">
              {currentTrack?.lyrics_asset_url && currentTrack?.lyrics_asset_type === '.pdf' && (
                <iframe
                  title="Music score PDF"
                  src={currentTrack.lyrics_asset_url}
                  className="lyrics-score-frame"
                />
              )}
              {currentTrack?.lyrics_asset_url && currentTrack?.lyrics_asset_type?.includes('xml') && (
                <>
                  <a className="btn btn-secondary btn-sm" href={currentTrack.lyrics_asset_url} target="_blank" rel="noreferrer">
                    Open XML score
                  </a>
                  {lyricsXmlError && <div className="lyrics-empty">{lyricsXmlError}</div>}
                  {lyricsXmlText && <pre className="lyrics-xml">{lyricsXmlText}</pre>}
                </>
              )}
              {currentTrack?.lyrics && <span>{currentTrack.lyrics}</span>}
              {!currentTrack?.lyrics && !currentTrack?.lyrics_asset_url && (
                <span className="lyrics-empty">No lyrics or score available for this track.</span>
              )}
            </div>
          </div>
        );
      case 'upload':
        return <UploadView token={token} onUploaded={() => loadTracks()} onClaim={handleClaim} />;
      case 'profile':
        return (
          <ProfileView
            user={user}
            token={token}
            onUserUpdate={setUser}
            onLogout={logout}
          />
        );
      case 'admin':
        return user?.role === 'admin' ? (
          <AdminLinksView token={token} tracks={tracks} albums={albums} />
        ) : null;
      default:
        return null;
    }
  }

  if (authVisible) {
    return <AuthScreen onAuth={handleAuth} defaultTab={authDefaultTab} />;
  }

  function navigateTo(v) {
    setView(v);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        setView={navigateTo}
        user={user}
        onLogout={logout}
        isOpen={sidebarOpen}
      />
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <TopBar
        viewTitle={VIEW_TITLES[view]}
        user={user}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onSignIn={openSignIn}
        onRegister={openRegister}
        onProfile={() => navigateTo('profile')}
        onPreferences={() => navigateTo('profile')}
        onDeleteAccount={() => setConfirmDeleteAccount(true)}
        onSignOut={logout}
        onOpenSearch={() => {
          setSearchOpen(true);
          runSearch(searchParams);
        }}
      />

      <main className="main-content">{renderContent()}</main>

      <PlayerBar
        queue={queue}
        currentIndex={queueIndex}
        onIndexChange={setQueueIndex}
        playIntent={playIntent}
      />

      {searchOpen && (
        <SearchModal
          params={searchParams}
          results={searchResults}
          loading={searchLoading}
          error={searchError}
          onClose={() => setSearchOpen(false)}
          onChange={(next) => setSearchParams(next)}
          onSearch={(next) => runSearch(next)}
          onPlayTrack={(track) => {
            const i = tracks.findIndex((t) => t.url_key === track.url_key);
            if (i >= 0) handlePlayTracks(tracks, i);
            setSearchOpen(false);
          }}
          onOpenAlbums={() => { setView('albums'); setSearchOpen(false); }}
        />
      )}

      {editingTrack && canEditTrack(editingTrack) && (
        <TrackEditModal
          track={editingTrack}
          token={token}
          onClose={() => setEditingTrack(null)}
          onSaved={() => { setEditingTrack(null); loadTracks(); loadAlbums(); }}
        />
      )}

      {claimToken && (
        <ClaimModal
          token={claimToken}
          user={user}
          onSignIn={() => {
            setPendingClaimToken(claimToken);
            setClaimToken(null);
            openSignIn();
          }}
          onClaimed={() => { loadTracks(); loadAlbums(); }}
          onClose={() => setClaimToken(null)}
        />
      )}

      {confirmDeleteTrack && (
        <ConfirmModal
          message={`Permanently delete "${confirmDeleteTrack.title}"? This cannot be undone.`}
          confirmLabel="Delete track"
          onConfirm={executeDeleteTrack}
          onCancel={() => setConfirmDeleteTrack(null)}
        />
      )}

      {confirmDeleteAccount && (
        <ConfirmModal
          message="Permanently delete your account and all your data? This cannot be undone."
          confirmLabel="Delete account"
          onConfirm={() => { setConfirmDeleteAccount(false); deleteAccount(); }}
          onCancel={() => setConfirmDeleteAccount(false)}
        />
      )}
    </div>
  );
}

function SearchModal({
  params,
  results,
  loading,
  error,
  onClose,
  onChange,
  onSearch,
  onPlayTrack,
  onOpenAlbums,
}) {
  const next = (patch) => onChange({ ...params, ...patch });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Search</div>
        <div className="search-filters">
          <input className="form-input" placeholder="Title, album, artist…" value={params.q} onChange={(e) => next({ q: e.target.value })} />
          <select className="form-input" value={params.type} onChange={(e) => next({ type: e.target.value })}>
            <option value="all">Tracks + Albums</option>
            <option value="tracks">Tracks</option>
            <option value="albums">Albums</option>
          </select>
          <input className="form-input" placeholder="Artist" value={params.artist} onChange={(e) => next({ artist: e.target.value })} />
          <input className="form-input" placeholder="Composer" value={params.composer} onChange={(e) => next({ composer: e.target.value })} />
          <input className="form-input" type="date" value={params.date_from} onChange={(e) => next({ date_from: e.target.value })} />
          <input className="form-input" type="date" value={params.date_to} onChange={(e) => next({ date_to: e.target.value })} />
          <button className="btn btn-primary" onClick={() => onSearch(params)} disabled={loading}>Search</button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <div className="search-results">
          <div className="search-group-title">Tracks ({results.tracks.length})</div>
          {results.tracks.map((t) => (
            <button key={t.url_key} className="search-result-row" onClick={() => onPlayTrack(t)}>
              <span>{t.title}</span>
              <small>{t.artist}{t.composer ? ` · ${t.composer}` : ''}</small>
            </button>
          ))}
          <div className="search-group-title">Albums ({results.albums.length})</div>
          {results.albums.map((a) => (
            <button key={a.id} className="search-result-row" onClick={onOpenAlbums}>
              <span>{a.name}</span>
              <small>{a.artist || '—'}{a.composer ? ` · ${a.composer}` : ''}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackEditModal({ track, token, onClose, onSaved }) {
  const scoreRef = useRef(null);
  const [form, setForm] = useState({
    title: track.title || '',
    artist: track.artist || '',
    composer: track.composer || '',
    genre: track.genre || '',
    year: track.year || '',
    track_number: track.track_number || '',
    lyrics: track.lyrics || '',
    is_public: !!track.is_public,
    clear_score: false,
  });
  const [scoreFile, setScoreFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, String(v)));
      if (scoreFile) data.append('score', scoreFile);
      const res = await fetch(`${API_BASE}/tracks/${encodeURIComponent(track.url_key)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || 'Failed to save');
        return;
      }
      onSaved(payload);
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Edit track metadata</div>
        {error && <div className="auth-error">{error}</div>}
        <div className="upload-item-form">
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Artist</label>
            <input className="form-input" value={form.artist} onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Composer</label>
            <input className="form-input" value={form.composer} onChange={(e) => setForm((f) => ({ ...f, composer: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Genre</label>
            <input className="form-input" value={form.genre} onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Year</label>
            <input className="form-input" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Track #</label>
            <input className="form-input" value={form.track_number} onChange={(e) => setForm((f) => ({ ...f, track_number: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Lyrics</label>
            <textarea className="form-input" value={form.lyrics} onChange={(e) => setForm((f) => ({ ...f, lyrics: e.target.value }))} rows={4} />
          </div>
          <div className="form-group">
            <label className="form-label">Replace score (PDF/XML)</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => scoreRef.current?.click()}>
              {scoreFile ? `✓ ${scoreFile.name}` : 'Choose score…'}
            </button>
            <input
              ref={scoreRef}
              type="file"
              accept={SCORE_EXTS}
              style={{ display: 'none' }}
              onChange={(e) => setScoreFile(e.target.files[0] || null)}
            />
          </div>
          <label className="pref-item">
            <span className="pref-label">Public track</span>
            <input type="checkbox" checked={form.is_public} onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))} />
          </label>
          <label className="pref-item">
            <span className="pref-label">Remove current score</span>
            <input type="checkbox" checked={form.clear_score} onChange={(e) => setForm((f) => ({ ...f, clear_score: e.target.checked }))} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
