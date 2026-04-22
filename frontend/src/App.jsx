import { useCallback, useEffect, useState } from 'react';
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
    if (!token) { setAlbums([]); return; }
    try {
      const res = await fetch(`${API_BASE}/albums`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setAlbums(data.albums || []);
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadTracks(); }, [loadTracks]);
  useEffect(() => { loadAlbums(); }, [loadAlbums]);

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
              {currentTrack?.lyrics
                ? <span>{currentTrack.lyrics}</span>
                : <span className="lyrics-empty">No lyrics available for this track.</span>}
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
      />

      <main className="main-content">{renderContent()}</main>

      <PlayerBar
        queue={queue}
        currentIndex={queueIndex}
        onIndexChange={setQueueIndex}
        playIntent={playIntent}
      />

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
