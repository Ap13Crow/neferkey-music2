import { useEffect, useRef, useState } from 'react';
import {
  IconPlay, IconPause, IconSkipBack, IconSkipForward,
  IconRewind, IconForward, IconVolume, IconNote,
  IconChevronUp, IconChevronDown, IconKebabVertical,
} from './Icons';

function fmt(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerBar({ queue, currentIndex, onIndexChange, playIntent }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Reload audio source whenever the track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.url_key]);

  // Auto-start playback on explicit play intent; auto-expand if collapsed.
  useEffect(() => {
    if (!playIntent) return;
    setCollapsed(false);
    const audio = audioRef.current;
    if (!audio) return;

    const doPlay = () => {
      audio.play().catch(() => {});
      setPlaying(true);
    };

    if (audio.readyState >= 2) {
      doPlay();
    } else {
      audio.addEventListener('canplay', doPlay, { once: true });
      return () => audio.removeEventListener('canplay', doPlay);
    }
    return undefined;
  }, [playIntent]);

  // Auto-expand whenever playback starts
  useEffect(() => {
    if (playing) setCollapsed(false);
  }, [playing]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 1024) setSettingsOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

      <div className={`player-bar${collapsed ? ' mini' : ''}`}>
        {/* Collapse/expand toggle */}
        <button
          className="player-mini-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand player' : 'Collapse player'}
          aria-label={collapsed ? 'Expand player' : 'Collapse player'}
        >
          {collapsed ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>

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

        {/* Play/pause always visible (even in mini) */}
        {collapsed && (
          <button className="ctrl-btn primary" title={playing ? 'Pause' : 'Play'} onClick={togglePlay} style={{ flexShrink: 0 }}>
            {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
        )}

        {/* Full controls — hidden when collapsed */}
        <div className="player-controls">
          <div className="player-buttons">
            <button className="ctrl-btn" title="Previous" onClick={() => onIndexChange((currentIndex - 1 + queue.length) % queue.length)}>
              <IconSkipBack size={18} />
            </button>
            <button className="ctrl-btn" title="Rewind 15s" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15); }}>
              <IconRewind size={16} />
            </button>
            <button className="ctrl-btn primary" title={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>
            <button className="ctrl-btn" title="Forward 15s" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration || 0, audioRef.current.currentTime + 15); }}>
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

        <button
          className="ctrl-btn player-settings-btn"
          title="Playback settings"
          aria-label="Playback settings"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <IconKebabVertical size={16} />
        </button>

        {settingsOpen && (
          <div className="player-settings-popover">
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
        )}
      </div>
    </>
  );
}
