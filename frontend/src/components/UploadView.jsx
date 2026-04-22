import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { IconUpload, IconTrash, IconNote, IconKey, IconCamera, IconLink, IconCheck } from './Icons';
import {
  buildCameraConstraints,
  extractClaimToken,
  getCameraAccessErrorMessage,
  getScanSupportStatus,
  requestCameraStream,
} from '../utils/qrScan';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const AUDIO_EXTS = ['.mp3', '.flac', '.ogg', '.wav', '.aac', '.m4a', '.opus'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function extOf(name) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function parseFilename(filename) {
  const base = filename.slice(0, filename.lastIndexOf('.'));
  let title = base;
  let artist = '';
  let track_number = '';
  const numMatch = base.match(/^(\d{1,3})[.\s-]+\s*(.+)$/);
  const rest = numMatch ? numMatch[2].trim() : base;
  if (numMatch) track_number = String(parseInt(numMatch[1], 10));
  const dashIdx = rest.indexOf(' - ');
  if (dashIdx !== -1) {
    artist = rest.slice(0, dashIdx).trim();
    title = rest.slice(dashIdx + 3).trim();
  } else {
    title = rest.trim();
  }
  return { title, artist, track_number };
}

let _nextId = 0;
function makeItem(file) {
  const { title, artist, track_number } = parseFilename(file.name);
  return {
    id: ++_nextId,
    file,
    imageFile: null,
    form: { title, artist, genre: '', year: '', track_number, lyrics: '' },
    status: null,
    message: '',
  };
}

export default function UploadView({ token, onUploaded, onClaim }) {
  const audioInputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [claimUrl, setClaimUrl] = useState('');
  const [claimError, setClaimError] = useState('');
  const [scanning, setScanning] = useState(false);

  function addFiles(files) {
    const audioFiles = Array.from(files).filter((f) => AUDIO_EXTS.includes(extOf(f.name)));
    if (audioFiles.length === 0) return;
    setItems((prev) => [...prev, ...audioFiles.map(makeItem)]);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function updateForm(id, field, value) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, form: { ...it.form, [field]: value } } : it));
  }

  function setImageFile(id, file) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, imageFile: file } : it));
  }

  function setItemStatus(id, status, message) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, status, message } : it));
  }

  async function uploadOne(item) {
    const { form, file, imageFile } = item;
    if (!form.title.trim() || !form.artist.trim()) {
      setItemStatus(item.id, 'error', 'Title and artist are required.');
      return false;
    }
    setItemStatus(item.id, 'uploading', 'Uploading…');
    const data = new FormData();
    data.append('audio', file);
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
      if (!res.ok) { setItemStatus(item.id, 'error', result.error || 'Upload failed'); return false; }
      setItemStatus(item.id, 'success', `"${result.title}" uploaded!`);
      if (onUploaded) onUploaded(result);
      return true;
    } catch {
      setItemStatus(item.id, 'error', 'Network error during upload.');
      return false;
    }
  }

  async function uploadAll() {
    const pending = items.filter((it) => it.status !== 'success');
    for (const item of pending) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(item);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function handleClaimSubmit(e) {
    e.preventDefault();
    setClaimError('');
    const t = extractClaimToken(claimUrl);
    if (!t) {
      setClaimError('No valid claim token found in that URL.');
      return;
    }
    if (onClaim) onClaim(t);
    setClaimUrl('');
  }

  // QR scanner using BarcodeDetector API + camera
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);

  const stopScanner = useCallback(() => {
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setScanning(false);
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  async function startQrScan() {
    setClaimError('');
    const support = getScanSupportStatus(window);
    if (!support.supported) {
      setClaimError(support.message);
      return;
    }
    try {
      const stream = await requestCameraStream(navigator.mediaDevices, buildCameraConstraints());
      streamRef.current = stream;
      setScanning(true);
      // Give React a tick to render the video element
      setTimeout(async () => {
        const video = videoRef.current;
        if (!video) { stopScanner(); return; }
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', '');
        video.srcObject = stream;
        await video.play();
        const hasBarcodeDetector = 'BarcodeDetector' in window;
        const detector = hasBarcodeDetector
          // eslint-disable-next-line no-undef
          ? new BarcodeDetector({ formats: ['qr_code'] })
          : null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        function scan() {
          if (detector) {
            detector.detect(video).then((codes) => {
              if (codes.length > 0) {
                const raw = codes[0].rawValue;
                stopScanner();
                const t = extractClaimToken(raw);
                if (t) {
                  if (onClaim) onClaim(t);
                } else {
                  setClaimError(`QR code found but no claim token in URL: ${raw}`);
                }
              } else {
                scanLoopRef.current = requestAnimationFrame(scan);
              }
            }).catch(() => { scanLoopRef.current = requestAnimationFrame(scan); });
            return;
          }
          if (!ctx || !video.videoWidth || !video.videoHeight) {
            scanLoopRef.current = requestAnimationFrame(scan);
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(frame.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            const raw = code.data;
            stopScanner();
            const t = extractClaimToken(raw);
            if (t) {
              if (onClaim) onClaim(t);
            } else {
              setClaimError(`QR code found but no claim token in URL: ${raw}`);
            }
          } else {
            scanLoopRef.current = requestAnimationFrame(scan);
          }
        }
        scan();
      }, 100);
    } catch (err) {
      setClaimError(getCameraAccessErrorMessage(err));
      setScanning(false);
    }
  }

  const hasPending = items.some((it) => it.status !== 'success');

  if (!token) {
    return (
      <div className="upload-area">
        <div className="section-header">
          <div>
            <div className="section-title">Upload</div>
            <div className="section-subtitle">Add music to your library</div>
          </div>
        </div>

        {/* Redeem section — available without login for preview, login needed to claim */}
        <RedeemSection
          claimUrl={claimUrl}
          setClaimUrl={setClaimUrl}
          claimError={claimError}
          setClaimError={setClaimError}
          scanning={scanning}
          videoRef={videoRef}
          onSubmit={handleClaimSubmit}
          onScan={startQrScan}
          onStopScan={stopScanner}
          loggedIn={false}
        />

        <div className="empty-state" style={{ marginTop: '1rem' }}>
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
          <div className="section-subtitle">Add music to your library — drop multiple files at once</div>
        </div>
        {items.length > 0 && hasPending && (
          <button className="btn btn-primary" onClick={uploadAll}>
            <IconUpload size={14} /> Upload all ({items.filter((it) => it.status !== 'success').length})
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={`upload-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => audioInputRef.current?.click()}
      >
        <IconUpload size={40} />
        <p>Drop audio files here or click to browse</p>
        <small>Supported: MP3, FLAC, OGG, WAV, AAC, M4A, Opus · Multiple files allowed · Max 100 MB each</small>
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_EXTS.join(',')}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Per-file queue */}
      {items.length > 0 && (
        <div className="upload-queue">
          {items.map((item) => (
            <UploadItem
              key={item.id}
              item={item}
              onRemove={() => removeItem(item.id)}
              onFormChange={(field, val) => updateForm(item.id, field, val)}
              onImageChange={(f) => setImageFile(item.id, f)}
              onUpload={() => uploadOne(item)}
            />
          ))}
        </div>
      )}

      {/* Redeem purchase link section */}
      <RedeemSection
        claimUrl={claimUrl}
        setClaimUrl={setClaimUrl}
        claimError={claimError}
        setClaimError={setClaimError}
        scanning={scanning}
        videoRef={videoRef}
        onSubmit={handleClaimSubmit}
        onScan={startQrScan}
        onStopScan={stopScanner}
        loggedIn={true}
      />
    </div>
  );
}

function RedeemSection({ claimUrl, setClaimUrl, claimError, setClaimError, scanning, videoRef, onSubmit, onScan, onStopScan, loggedIn }) {
  return (
    <div style={{ marginTop: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <IconKey size={16} />
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Redeem Purchase Link</span>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
        Paste a purchase URL below, or scan its QR code to add a track or album to your library.
      </p>

      {/* Camera viewfinder */}
      {scanning && (
        <div style={{ position: 'relative', marginBottom: '0.85rem', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', maxWidth: 320, aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            playsInline
            muted
          />
          <div style={{ position: 'absolute', inset: 0, border: '3px solid var(--accent)', borderRadius: 'var(--radius-md)', pointerEvents: 'none' }} />
          <button
            className="btn btn-secondary btn-sm"
            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
            onClick={onStopScan}
          >
            Cancel
          </button>
          <div style={{ position: 'absolute', bottom: '0.5rem', left: 0, right: 0, textAlign: 'center', fontSize: '0.75rem', color: '#fff' }}>
            Point camera at QR code
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            className="form-input"
            style={{ width: '100%' }}
            placeholder="https://…?claim=abc123"
            value={claimUrl}
            onChange={(e) => { setClaimUrl(e.target.value); setClaimError(''); }}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={!claimUrl.trim()}>
          <IconLink size={13} /> Redeem
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={scanning ? onStopScan : onScan}
          title={scanning ? 'Stop scanner' : 'Scan QR code with camera'}
        >
          <IconCamera size={13} /> {scanning ? 'Stop scan' : 'Scan QR'}
        </button>
      </form>

      {claimError && (
        <div className="auth-error" style={{ marginTop: '0.65rem' }}>{claimError}</div>
      )}

      {!loggedIn && (
        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          You will be prompted to sign in before the link is redeemed.
        </p>
      )}
    </div>
  );
}

function UploadItem({ item, onRemove, onFormChange, onImageChange, onUpload }) {
  const imageRef = useRef(null);
  const { file, form, imageFile, status, message } = item;
  const isDone = status === 'success';
  const isUploading = status === 'uploading';

  return (
    <div className={`upload-item${isDone ? ' upload-item-done' : ''}`}>
      <div className="upload-item-header">
        <div className="upload-item-filename">
          <IconNote size={14} />
          <span>{file.name}</span>
          <span className="upload-item-size">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {!isDone && (
            <button className="btn btn-primary btn-sm" onClick={onUpload} disabled={isUploading}>
              <IconUpload size={12} /> {isUploading ? 'Uploading…' : 'Upload'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onRemove} title="Remove from queue">
            <IconTrash size={12} />
          </button>
        </div>
      </div>

      {status && (
        <div className={`upload-progress ${status === 'success' ? 'upload-success' : status === 'error' ? 'upload-error' : ''}`}>
          {status === 'success' && <IconCheck size={12} style={{ marginRight: 4 }} />}{message}
        </div>
      )}

      {!isDone && (
        <div className="upload-item-form">
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input className="form-input" value={form.title} onChange={(e) => onFormChange('title', e.target.value)} placeholder="Track title" />
          </div>
          <div className="form-group">
            <label className="form-label">Artist *</label>
            <input className="form-input" value={form.artist} onChange={(e) => onFormChange('artist', e.target.value)} placeholder="Artist name" />
          </div>
          <div className="form-group">
            <label className="form-label">Genre</label>
            <input className="form-input" value={form.genre} onChange={(e) => onFormChange('genre', e.target.value)} placeholder="e.g. Classical" />
          </div>
          <div className="form-group">
            <label className="form-label">Year</label>
            <input className="form-input" type="number" value={form.year} onChange={(e) => onFormChange('year', e.target.value)} placeholder="e.g. 2024" min={1000} max={2100} />
          </div>
          <div className="form-group">
            <label className="form-label">Track #</label>
            <input className="form-input" type="number" value={form.track_number} onChange={(e) => onFormChange('track_number', e.target.value)} placeholder="e.g. 1" min={1} />
          </div>
          <div className="form-group">
            <label className="form-label">Cover art</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => imageRef.current?.click()}>
              {imageFile ? `✓ ${imageFile.name}` : 'Choose image…'}
            </button>
            <input
              ref={imageRef}
              type="file"
              accept={IMAGE_EXTS.join(',')}
              style={{ display: 'none' }}
              onChange={(e) => onImageChange(e.target.files[0] || null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
