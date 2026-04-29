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
import { IconNfc, IconNote, IconUser } from './components/Icons';
import {
  extractNfcResourceFromMessage,
  isNfcSupported,
  parseNfcResourceUrl,
} from './utils/nfc';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const SCORE_EXTS = '.pdf,.xml,.musicxml,.mxl';
const LONG_PRESS_TIMEOUT_MS = 520;
const OVERFLOW_TOLERANCE_PX = 2;

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

function getNfcPayloadFromUrl() {
  return parseNfcResourceUrl(window.location.href);
}

function clearNfcFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('nfc_type');
  url.searchParams.delete('nfc_key');
  window.history.replaceState({}, '', url.toString());
}

function OverflowMarquee({ text, className, ariaLive }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const containerEl = containerRef.current;
    const contentEl = contentRef.current;
    if (!containerEl || !contentEl) return undefined;

    const measure = () => {
      setOverflowing(contentEl.scrollWidth > containerEl.clientWidth + OVERFLOW_TOLERANCE_PX);
    };

    measure();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (resizeObserver) {
      resizeObserver.observe(containerEl);
      resizeObserver.observe(contentEl);
    }
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      resizeObserver?.disconnect();
    };
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={`${className}${overflowing ? ' overflow-marquee overflow-marquee-active' : ''}`}
      aria-live={ariaLive}
    >
      <span ref={contentRef}>{text}</span>
    </div>
  );
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
  const [audiobookMode, setAudiobookMode] = useState(false);
  const [audiobookContextOpen, setAudiobookContextOpen] = useState(false);
  const [audiobookAccountMenuOpen, setAudiobookAccountMenuOpen] = useState(false);
  const [audiobookStatus, setAudiobookStatus] = useState('Ready to scan NFC tags');
  const [audiobookError, setAudiobookError] = useState('');
  const [audiobookResource, setAudiobookResource] = useState(null);
  const [pendingNfcPayload, setPendingNfcPayload] = useState(null);
  const longPressRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  // On mount: check URL for ?claim= token
  useEffect(() => {
    const t = getClaimTokenFromUrl();
    if (t) {
      clearClaimFromUrl();
      setClaimToken(t);
    }
  }, []);

  useEffect(() => {
    const payload = getNfcPayloadFromUrl();
    if (payload) {
      clearNfcFromUrl();
      setPendingNfcPayload(payload);
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

  const handleAudiobookScan = useCallback((payload) => {
    if (!payload) return;
    const { resource_type: resourceType, resource_key: resourceKey } = payload;
    if (resourceType === 'track') {
      const resourceKeyStr = String(resourceKey);
      const idx = tracks.findIndex((t) => String(t.url_key) === resourceKeyStr || String(t.id) === resourceKeyStr);
      if (idx < 0) {
        setAudiobookError('Scanned track was not found in your library.');
        return;
      }
      const track = tracks[idx];
      handlePlayTracks(tracks, idx);
      setAudiobookStatus('Track detected and started.');
      setAudiobookError('');
      setAudiobookResource({
        type: 'track',
        title: track.title,
        subtitle: track.artist || '',
        image_url: track.image_url || '',
      });
      return;
    }

    const album = albums.find((a) => String(a.id) === String(resourceKey));
    if (!album) {
      setAudiobookError('Scanned album was not found in your library.');
      return;
    }
    const albumTracks = Array.isArray(album.tracks) ? album.tracks : [];
    if (albumTracks.length > 0) {
      handlePlayTracks(albumTracks, 0);
      setAudiobookStatus('Album detected and started.');
    } else {
      setAudiobookStatus('Album detected.');
    }
    setAudiobookError('');
    setAudiobookResource({
      type: 'album',
      title: album.name,
      subtitle: album.artist || `${albumTracks.length} tracks`,
      image_url: album.cover_url || '',
    });
  }, [albums, tracks]);

  useEffect(() => {
    if (!pendingNfcPayload) return;
    if (tracks.length === 0 && albums.length === 0) return;
    if (user) {
      setAudiobookMode(true);
      setAudiobookContextOpen(false);
      setAudiobookAccountMenuOpen(false);
      setSearchOpen(false);
    }
    handleAudiobookScan(pendingNfcPayload);
    setPendingNfcPayload(null);
  }, [albums, handleAudiobookScan, pendingNfcPayload, tracks, user]);

  useEffect(() => {
    if (!audiobookMode) return undefined;
    const support = isNfcSupported();
    if (!support.mobileOnly) {
      setAudiobookError('Audiobook mode is available on mobile devices only.');
      return undefined;
    }
    if (!support.supported) {
      if (support.passiveSupported) {
        setAudiobookStatus('Ready for NFC links. On iPhone, scan a tag and open the iOS notification banner.');
        setAudiobookError('');
        return undefined;
      }
      setAudiobookError(support.message || 'NFC scanning is not available.');
      return undefined;
    }

    let disposed = false;
    let reader = null;

    (async () => {
      try {
        reader = new NDEFReader();
        await reader.scan();
        if (disposed) return;
        setAudiobookStatus('Scanning for tags…');
        setAudiobookError('');
        reader.onreading = (event) => {
          if (disposed) return;
          const payload = extractNfcResourceFromMessage(event.message);
          if (!payload) {
            setAudiobookError('Tag does not contain a valid Neferkey NFC link.');
            return;
          }
          handleAudiobookScan(payload);
        };
        reader.onreadingerror = () => {
          if (disposed) return;
          setAudiobookError('Could not read this NFC tag.');
        };
      } catch (err) {
        if (disposed) return;
        setAudiobookError(err?.message || 'Failed to start NFC scanning.');
      }
    })();

    return () => {
      disposed = true;
      if (reader) {
        reader.onreading = null;
        reader.onreadingerror = null;
      }
    };
  }, [audiobookMode, handleAudiobookScan]);

  useEffect(() => {
    if (user) return;
    setAudiobookMode(false);
    setAudiobookContextOpen(false);
    setAudiobookAccountMenuOpen(false);
  }, [user]);

  useEffect(() => () => clearTimeout(longPressRef.current), []);

  function toggleAudiobookMode() {
    if (audiobookMode) {
      setAudiobookMode(false);
      setAudiobookContextOpen(false);
      setAudiobookAccountMenuOpen(false);
      setSearchOpen(false);
      return;
    }
    const support = isNfcSupported();
    if (!support.mobileOnly) {
      setAudiobookError('Audiobook mode is available on mobile devices only.');
      return;
    }
    if (!support.supported) {
      if (support.passiveSupported) {
        setAudiobookMode(true);
        setAudiobookContextOpen(false);
        setAudiobookAccountMenuOpen(false);
        setSidebarOpen(false);
        setSearchOpen(false);
        setAudiobookStatus('Ready for NFC links. On iPhone, scan a tag and open the iOS notification banner.');
        setAudiobookError('');
        return;
      }
      setAudiobookError(support.message || 'NFC scanning is not available.');
      return;
    }
    setAudiobookMode(true);
    setAudiobookContextOpen(false);
    setAudiobookAccountMenuOpen(false);
    setSidebarOpen(false);
    setSearchOpen(false);
    setAudiobookStatus('Ready to scan NFC tags');
    setAudiobookError('');
  }

  function handleAudiobookAccountPointerDown() {
    longPressTriggeredRef.current = false;
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setAudiobookAccountMenuOpen(true);
      setAudiobookContextOpen(false);
    }, LONG_PRESS_TIMEOUT_MS);
  }

  function handleAudiobookAccountPointerUp() {
    clearTimeout(longPressRef.current);
    if (longPressTriggeredRef.current) return;
    if (audiobookAccountMenuOpen) setAudiobookAccountMenuOpen(false);
    setAudiobookContextOpen((open) => !open);
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

  const showAudiobookMode = audiobookMode && !!user;

  const hideAudiobookPlayer = showAudiobookMode && !audiobookContextOpen;

  return (
    <div className={`app-shell${showAudiobookMode ? ' audiobook-shell-mode' : ''}${hideAudiobookPlayer ? ' audiobook-player-collapsed' : ''}`}>
      {!showAudiobookMode && (
        <>
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
        </>
      )}

      {showAudiobookMode ? (
        <div className="audiobook-top-bar">
          <div className="audiobook-brand">
            <IconNote size={18} />
            <span>Neferkey</span>
          </div>
          <div className="audiobook-scan-indicator">
            <IconNfc size={14} />
            <span>Scan</span>
          </div>
          <button
            className="audiobook-account-btn"
            title="Account"
            onPointerDown={handleAudiobookAccountPointerDown}
            onPointerUp={handleAudiobookAccountPointerUp}
            onPointerLeave={() => clearTimeout(longPressRef.current)}
          >
            {user ? <div className="account-avatar audiobook-account-avatar">{user.username.charAt(0).toUpperCase()}</div> : <IconUser size={16} />}
          </button>
          {audiobookAccountMenuOpen && (
            <div className="audiobook-account-menu">
              <button className="account-dropdown-item" onClick={() => { setAudiobookAccountMenuOpen(false); setAudiobookMode(false); }}>
                Disable audiobook mode
              </button>
              <button className="account-dropdown-item" onClick={() => { setAudiobookAccountMenuOpen(false); navigateTo('profile'); }}>
                Profile
              </button>
              <button className="account-dropdown-item" onClick={() => { setAudiobookAccountMenuOpen(false); logout(); }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <TopBar
          viewTitle={VIEW_TITLES[view]}
          user={user}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onSignIn={openSignIn}
          onRegister={openRegister}
          onProfile={() => navigateTo('profile')}
          onPreferences={() => navigateTo('profile')}
          onToggleAudiobookMode={toggleAudiobookMode}
          audiobookModeActive={audiobookMode}
          onDeleteAccount={() => setConfirmDeleteAccount(true)}
          onSignOut={logout}
          onOpenSearch={() => {
            setSearchOpen(true);
            runSearch(searchParams);
          }}
        />
      )}

      <main className={`main-content${showAudiobookMode ? ' audiobook-main' : ''}`}>
        {showAudiobookMode ? (
          <div className="audiobook-stage">
            {!audiobookResource && (
              <div className="audiobook-empty">
                <IconNfc size={40} />
                <div className="audiobook-empty-title">{audiobookStatus}</div>
                <div className="audiobook-empty-subtitle">Hold your book page NFC tag near this phone.</div>
              </div>
            )}
            {audiobookResource && (
              <div className="audiobook-card">
                {audiobookResource.image_url ? (
                  <img src={audiobookResource.image_url} alt={audiobookResource.title} className="audiobook-cover" />
                ) : (
                  <div className="audiobook-cover audiobook-cover-placeholder"><IconNote size={36} /></div>
                )}
                <OverflowMarquee text={audiobookResource.title} className="audiobook-title" />
                <div className="audiobook-subtitle">{audiobookResource.subtitle || audiobookResource.type}</div>
                {audiobookResource.type === 'album' && currentTrack?.title && (
                  <OverflowMarquee text={`Now playing: ${currentTrack.title}`} className="audiobook-track-marquee" ariaLive="polite" />
                )}
              </div>
            )}
            {audiobookError && <div className="auth-error audiobook-error">{audiobookError}</div>}
          </div>
        ) : renderContent()}
      </main>

      <div className={hideAudiobookPlayer ? 'audiobook-player-hidden' : ''}>
        <PlayerBar
          queue={queue}
          currentIndex={queueIndex}
          onIndexChange={setQueueIndex}
          playIntent={playIntent}
          audiobookMode={showAudiobookMode}
        />
      </div>

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
          <button className="btn btn-primary search-submit-btn" onClick={() => onSearch(params)} disabled={loading}>Search</button>
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
      <div className="modal track-edit-modal" onClick={(e) => e.stopPropagation()}>
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
