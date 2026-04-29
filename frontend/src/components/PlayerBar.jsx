import { useEffect, useRef, useState } from 'react';
import {
  IconPlay, IconPause, IconSkipBack, IconSkipForward,
  IconRewind, IconForward, IconVolume, IconNote,
} from './Icons';

function fmt(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerBar({ queue, currentIndex, onIndexChange, hidden = false, playRequestId = 0 }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);

  const track = queue[currentIndex] || null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.load();
    if (playing) audio.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track || !playRequestId) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    audio.load();
    audio.play().catch(() => {});
    setPlaying(true);
  }, [playRequestId]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function seek(e) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
  }

  function onEnded() {
    if (queue.length > 1) {
      onIndexChange((currentIndex + 1) % queue.length);
    } else {
      setPlaying(false);
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  }

  return (
    <>
      {track && (
        <audio
          key={track.url_key}
          ref={audioRef}
          src={track.audio_url}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={onEnded}
        />
      )}

      <div className={`player-bar${hidden ? ' is-hidden' : ''}`}>
        {/* Track info */}
        <div className="player-bar-track">
          {track?.image_url ? (
            <img className="player-bar-cover" src={track.image_url} alt={track.title} />
          ) : (
            <div className="player-bar-cover-placeholder"><IconNote size={22} /></div>
          )}
          <div className="player-bar-info">
            <div className="player-bar-title">{track?.title || 'No track selected'}</div>
            <div className="player-bar-artist">{track?.artist || ''}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="player-controls">
          <div className="player-buttons">
            <button className="ctrl-btn" title="Previous" onClick={() => onIndexChange((currentIndex - 1 + queue.length) % queue.length)}>
              <IconSkipBack size={18} />
            </button>
            <button className="ctrl-btn" title="Rewind 10s" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }}>
              <IconRewind size={16} />
            </button>
            <button className="ctrl-btn primary" title={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>
            <button className="ctrl-btn" title="Forward 10s" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration || 0, audioRef.current.currentTime + 10); }}>
              <IconForward size={16} />
            </button>
            <button className="ctrl-btn" title="Next" onClick={() => onIndexChange((currentIndex + 1) % queue.length)}>
              <IconSkipForward size={18} />
            </button>
          </div>

          <div className="progress-row">
            <span className="progress-time">{fmt(currentTime)}</span>
            <input
              className="progress-bar"
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={seek}
            />
            <span className="progress-time">{fmt(duration)}</span>
          </div>
        </div>

        {/* Extras */}
        <div className="player-extras">
          <div className="volume-row">
            <IconVolume size={16} />
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
          <select className="speed-select" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </div>
      </div>
    </>
  );
}
