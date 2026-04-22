import { useRef, useState } from 'react';
import { IconUpload } from './Icons';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const AUDIO_EXTS = ['.mp3', '.flac', '.ogg', '.wav', '.aac', '.m4a', '.opus'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function extOf(name) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

export default function UploadView({ token, onUploaded }) {
  const audioInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [audioFile, setAudioFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState({ title: '', artist: '', genre: '', year: '', track_number: '', lyrics: '' });
  const [status, setStatus] = useState(null); // null | 'uploading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleAudioDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files).find((f) => AUDIO_EXTS.includes(extOf(f.name)));
    if (file) setAudioFile(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!audioFile) { setMessage('Please select an audio file.'); setStatus('error'); return; }
    if (!form.title.trim() || !form.artist.trim()) { setMessage('Title and artist are required.'); setStatus('error'); return; }

    setStatus('uploading');
    setMessage('Uploading…');

    const data = new FormData();
    data.append('audio', audioFile);
    if (imageFile) data.append('image', imageFile);
    data.append('title', form.title.trim());
    data.append('artist', form.artist.trim());
    if (form.genre) data.append('genre', form.genre.trim());
    if (form.year) data.append('year', form.year);
    if (form.track_number) data.append('track_number', form.track_number);
    if (form.lyrics) data.append('lyrics', form.lyrics.trim());

    try {
      const res = await fetch(`${API_BASE}/tracks/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      const result = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(result.error || 'Upload failed');
        return;
      }
      setStatus('success');
      setMessage(`"${result.title}" uploaded successfully!`);
      setAudioFile(null);
      setImageFile(null);
      setForm({ title: '', artist: '', genre: '', year: '', track_number: '', lyrics: '' });
      if (onUploaded) onUploaded(result);
    } catch {
      setStatus('error');
      setMessage('Network error during upload.');
    }
  }

  if (!token) {
    return (
      <div className="upload-area">
        <div className="section-header">
          <div>
            <div className="section-title">Upload</div>
            <div className="section-subtitle">Add music to your library</div>
          </div>
        </div>
        <div className="empty-state">
          <IconUpload size={48} />
          <h3>Sign in to upload</h3>
          <p>You need to be signed in to upload tracks to your library.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-area">
      <div className="section-header">
        <div>
          <div className="section-title">Upload</div>
          <div className="section-subtitle">Add music to your library</div>
        </div>
      </div>

      {/* Audio drop zone */}
      <div
        className={`upload-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleAudioDrop}
        onClick={() => audioInputRef.current?.click()}
      >
        <IconUpload size={40} />
        <p>{audioFile ? audioFile.name : 'Drop an audio file here or click to browse'}</p>
        <small>Supported: MP3, FLAC, OGG, WAV, AAC, M4A, Opus (max 100 MB)</small>
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_EXTS.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => setAudioFile(e.target.files[0] || null)}
        />
        {audioFile && (
          <div className="file-badge">
            🎵 {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)
          </div>
        )}
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Title *</label>
          <input className="form-input" value={form.title} onChange={set('title')} placeholder="Track title" required />
        </div>
        <div className="form-group">
          <label className="form-label">Artist *</label>
          <input className="form-input" value={form.artist} onChange={set('artist')} placeholder="Artist name" required />
        </div>
        <div className="form-group">
          <label className="form-label">Genre</label>
          <input className="form-input" value={form.genre} onChange={set('genre')} placeholder="e.g. Classical, Jazz" />
        </div>
        <div className="form-group">
          <label className="form-label">Year</label>
          <input className="form-input" type="number" value={form.year} onChange={set('year')} placeholder="e.g. 2024" min={1000} max={2100} />
        </div>
        <div className="form-group">
          <label className="form-label">Track #</label>
          <input className="form-input" type="number" value={form.track_number} onChange={set('track_number')} placeholder="e.g. 1" min={1} />
        </div>
        <div className="form-group">
          <label className="form-label">Cover art</label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => imageInputRef.current?.click()}
          >
            {imageFile ? `✓ ${imageFile.name}` : 'Choose image…'}
          </button>
          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.25rem' }}>
            JPG, PNG, WebP (optional)
          </small>
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_EXTS.join(',')}
            style={{ display: 'none' }}
            onChange={(e) => setImageFile(e.target.files[0] || null)}
          />
        </div>
        <div className="form-group upload-form-full">
          <label className="form-label">Lyrics</label>
          <textarea
            className="form-input form-textarea"
            value={form.lyrics}
            onChange={set('lyrics')}
            placeholder="Paste lyrics here (optional)"
          />
        </div>

        {status && (
          <div className={`upload-progress upload-form-full ${status === 'success' ? 'upload-success' : status === 'error' ? 'upload-error' : ''}`}>
            {message}
          </div>
        )}

        <div className="upload-form-full" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" disabled={status === 'uploading'}>
            <IconUpload size={14} /> {status === 'uploading' ? 'Uploading…' : 'Upload track'}
          </button>
        </div>
      </form>
    </div>
  );
}
