import { useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const fallbackRecords = [
  {
    url_key: 'demo-track-1',
    album_key: 'demo-album',
    title: 'Prelude in C Major',
    artist: 'J.S. Bach',
    audio_url: 'https://cdn.freesound.org/previews/431/431117_5121236-lq.mp3',
    image_url: 'https://picsum.photos/seed/demo1/600/600',
    lyrics: 'A gentle arpeggio introduces the harmony...',
  },
  {
    url_key: 'demo-track-2',
    album_key: 'demo-album',
    title: 'Moonlight Sonata (Excerpt)',
    artist: 'L. van Beethoven',
    audio_url: 'https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3',
    image_url: 'https://picsum.photos/seed/demo2/600/600',
    lyrics: 'Soft triplets unfold in the night...',
  },
];

export default function App() {
  const audioRef = useRef(null);
  const [albumKey, setAlbumKey] = useState('demo-album');
  const [urlKey, setUrlKey] = useState('demo-track-1');
  const [records, setRecords] = useState(fallbackRecords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState(1);

  const currentTrack = useMemo(() => records[currentIndex] || fallbackRecords[0], [records, currentIndex]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.playbackRate = speed;
  }, [speed, currentTrack]);

  async function loadAlbum() {
    try {
      const response = await fetch(`${API_BASE}/albums/${encodeURIComponent(albumKey)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch album');
      }
      const data = await response.json();
      setRecords(data.records.length > 0 ? data.records : fallbackRecords);
      setCurrentIndex(0);
    } catch {
      setRecords(fallbackRecords);
      setCurrentIndex(0);
    }
  }

  async function loadRecord() {
    try {
      const response = await fetch(`${API_BASE}/records/${encodeURIComponent(urlKey)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch record');
      }
      const data = await response.json();
      setRecords([data]);
      setCurrentIndex(0);
    } catch {
      setRecords(fallbackRecords);
      setCurrentIndex(0);
    }
  }

  function play() {
    audioRef.current?.play();
  }

  function pause() {
    audioRef.current?.pause();
  }

  function stop() {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }

  function rewind() {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  }

  function forward() {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.currentTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 10);
  }

  function replay() {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play();
  }

  function next() {
    setCurrentIndex((index) => (index + 1) % records.length);
  }

  function previous() {
    setCurrentIndex((index) => (index - 1 + records.length) % records.length);
  }

  return (
    <main className="player-layout">
      <section className="card">
        <h1>Neferkey Music Player</h1>
        <p className="subtitle">Docker-ready • Cloud-native • Kubernetes compatible</p>

        <div className="lookup-row">
          <input value={albumKey} onChange={(e) => setAlbumKey(e.target.value)} placeholder="Album key" />
          <button type="button" onClick={loadAlbum}>Load Album</button>
        </div>
        <div className="lookup-row">
          <input value={urlKey} onChange={(e) => setUrlKey(e.target.value)} placeholder="Record URL key" />
          <button type="button" onClick={loadRecord}>Load Record</button>
        </div>

        <img className="cover" src={currentTrack.image_url} alt={currentTrack.title} />
        <h2>{currentTrack.title}</h2>
        <p>{currentTrack.artist}</p>

        <audio key={currentTrack.url_key} ref={audioRef} src={currentTrack.audio_url} preload="metadata" />

        <div className="controls">
          <button type="button" onClick={previous}>Prev</button>
          <button type="button" onClick={rewind}>Rewind</button>
          <button type="button" onClick={play}>Play</button>
          <button type="button" onClick={pause}>Pause</button>
          <button type="button" onClick={stop}>Stop</button>
          <button type="button" onClick={forward}>Forward</button>
          <button type="button" onClick={replay}>Replay</button>
          <button type="button" onClick={next}>Next</button>
        </div>

        <label className="speed">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </label>

        <article className="lyrics">
          <h3>Lyrics</h3>
          <p>{currentTrack.lyrics}</p>
        </article>
      </section>
    </main>
  );
}
