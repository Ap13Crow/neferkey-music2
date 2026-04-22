const crypto = require('crypto');
const express = require('express');
const path = require('path');
const multer = require('multer');

const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    const sub = file.fieldname === 'audio' ? 'audio' : 'images';
    const fs = require('fs');
    const dir = path.join(UPLOADS_DIR, sub);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(_file.originalname).toLowerCase()}`);
  },
});

function fileFilter(_req, file, cb) {
  if (file.fieldname === 'audio') {
    const allowed = ['.mp3', '.flac', '.ogg', '.wav', '.aac', '.m4a', '.opus'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format'));
    }
  } else if (file.fieldname === 'image') {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported image format'));
    }
  } else {
    cb(new Error('Unknown field'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB per file
});

// GET /api/tracks — list all tracks visible to the caller
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM records ORDER BY created_at DESC, url_key',
    );
    return res.json({ tracks: result.rows });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// POST /api/tracks/upload — upload a track with metadata (authenticated)
router.post('/upload', requireAuth, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]), async (req, res) => {
  try {
    const { title, artist, genre = '', year, track_number, lyrics = '' } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: 'title and artist are required' });
    }

    const audioFile = req.files && req.files.audio && req.files.audio[0];
    const imageFile = req.files && req.files.image && req.files.image[0];

    if (!audioFile) {
      return res.status(400).json({ error: 'audio file is required' });
    }

    const urlKey = crypto.randomUUID();
    const filePath = `audio/${audioFile.filename}`;
    const audioUrl = `/uploads/${filePath}`;

    let imagePath = '';
    let imageUrl = '';
    if (imageFile) {
      imagePath = `images/${imageFile.filename}`;
      imageUrl = `/uploads/${imagePath}`;
    }

    const parsedYear = year ? parseInt(year, 10) : null;
    if (year && (isNaN(parsedYear) || parsedYear < 1000 || parsedYear > 2100)) {
      return res.status(400).json({ error: 'Invalid year — must be between 1000 and 2100' });
    }

    const parsedTrackNum = track_number ? parseInt(track_number, 10) : null;
    if (track_number && (isNaN(parsedTrackNum) || parsedTrackNum < 1)) {
      return res.status(400).json({ error: 'Invalid track_number — must be a positive integer' });
    }

    const result = await db.query(
      `INSERT INTO records
        (url_key, album_key, title, artist, audio_url, image_url, lyrics, genre, year, track_number, file_path, image_path, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        urlKey, '', title.trim(), artist.trim(),
        audioUrl, imageUrl, lyrics.trim(),
        genre.trim(), parsedYear,
        parsedTrackNum,
        filePath, imagePath, req.user.userId,
      ],
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

// DELETE /api/tracks/:urlKey — delete a track (owner only)
router.delete('/:urlKey', requireAuth, async (req, res) => {
  const { urlKey } = req.params;
  try {
    const existing = await db.query(
      'SELECT * FROM records WHERE url_key = $1 LIMIT 1',
      [urlKey],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    const track = existing.rows[0];
    if (track.owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await db.query('DELETE FROM records WHERE url_key = $1', [urlKey]);
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to delete track' });
  }
});

module.exports = router;
