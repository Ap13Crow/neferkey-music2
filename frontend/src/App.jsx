import { useCallback, useEffect, useState } from 'react';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import TrackList from './components/TrackList';
import AlbumsView from './components/AlbumsView';
import UploadView from './components/UploadView';
import ProfileView from './components/ProfileView';

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

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('nk_token') || null);
  const [authVisible, setAuthVisible] = useState(false);
  const [view, setView] = useState('library');

  const [tracks, setTracks] = useState(DEMO_TRACKS);
  const [albums, setAlbums] = useState([]);

  const [queue, setQueue] = useState(DEMO_TRACKS);
  const [queueIndex, setQueueIndex] = useState(0);

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
      const res = await fetch(`${API_BASE}/tracks`);
      if (res.ok) {
        const data = await res.json();
        const all = data.tracks.length > 0 ? data.tracks : DEMO_TRACKS;
        setTracks(all);
        setQueue(all);
      }
    } catch { /* use demo tracks */ }
  }, []);

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
  }

  function logout() {
    localStorage.removeItem('nk_token');
    setUser(null);
    setToken(null);
    setAlbums([]);
  }

  function handlePlayTracks(newQueue, index) {
    setQueue(newQueue);
    setQueueIndex(index);
  }

  function handleDeleteTrack(urlKey) {
    if (!confirm('Delete this track permanently?')) return;
    fetch(`${API_BASE}/tracks/${encodeURIComponent(urlKey)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => { if (r.ok) loadTracks(); });
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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!user && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setAuthVisible(true)}>
                    Sign in
                  </button>
                )}
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
        return <UploadView token={token} onUploaded={() => loadTracks()} />;
      case 'profile':
        return (
          <ProfileView
            user={user}
            token={token}
            onUserUpdate={setUser}
            onLogout={logout}
          />
        );
      default:
        return null;
    }
  }

  if (authVisible) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} user={user} onLogout={logout} />
      <main className="main-content">{renderContent()}</main>
      <PlayerBar queue={queue} currentIndex={queueIndex} onIndexChange={setQueueIndex} />
    </div>
  );
}
