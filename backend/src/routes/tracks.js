const crypto = require('crypto');
const express = require('express');
const path = require('path');
const multer = require('multer');

const db = require('../db');
const { requireAuth, ROLES } = require('../auth');
const { makeFilename, storeUpload } = require('../storage');

const router = express.Router();

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
  } else if (file.fieldname === 'score') {
    const allowed = ['.pdf', '.xml', '.musicxml', '.mxl'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported score format (allowed: PDF/XML/MusicXML)'));
    }
  } else {
    cb(new Error('Unknown field'));
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB per file
});

/**
 * @openapi
 * /api/tracks:
 *   get:
 *     tags: [Tracks]
 *     summary: List tracks. Returns only the authenticated user's tracks when a valid token is supplied; returns only public tracks otherwise.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     responses:
 *       200:
 *         description: List of tracks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tracks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Track'
 */
router.get('/', async (req, res) => {
  try {
    // When a valid auth token is present, return owned + purchased tracks.
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const { verifyToken } = require('../auth');
        const payload = verifyToken(authHeader.slice(7));
        if ([ROLES.ADMIN, ROLES.MANAGER].includes(payload.role)) {
          const result = await db.query(
            'SELECT * FROM records ORDER BY created_at DESC, url_key',
          );
          return res.json({ tracks: result.rows });
        }
        const result = await db.query(
          `SELECT r.* FROM records r
           WHERE r.owner_id = $1
           UNION
           SELECT r.* FROM records r
           INNER JOIN user_purchases up ON up.resource_key = r.url_key
             AND up.resource_type = 'track'
             AND up.user_id = $1
           ORDER BY created_at DESC, url_key`,
          [payload.userId],
        );
        return res.json({ tracks: result.rows });
      } catch {
        // Invalid token — fall through to public listing
      }
    }
    // Unauthenticated: return only public tracks
    const result = await db.query(
      'SELECT * FROM records WHERE is_public = true ORDER BY created_at DESC, url_key',
    );
    return res.json({ tracks: result.rows });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

/**
 * @openapi
 * /api/tracks/upload:
 *   post:
 *     tags: [Tracks]
 *     summary: Upload a track with metadata
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [audio, title, artist]
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file (MP3, FLAC, OGG, WAV, AAC, M4A, Opus – max 100 MB)
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Cover art (JPG, PNG, WebP, GIF – optional)
 *               title: { type: string }
 *               artist: { type: string }
 *               genre: { type: string }
 *               year: { type: integer }
 *               track_number: { type: integer }
 *               lyrics: { type: string }
 *               is_public: { type: boolean, description: 'Whether track is publicly visible (default: false)' }
 *     responses:
 *       201:
 *         description: Track uploaded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Track'
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 */
router.post('/upload', requireAuth, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'score', maxCount: 1 },
]), async (req, res) => {
  try {
    const {
      title,
      artist,
      composer = '',
      genre = '',
      year,
      track_number,
      lyrics = '',
      is_public = 'false',
    } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: 'title and artist are required' });
    }

    const audioFile = req.files && req.files.audio && req.files.audio[0];
    const imageFile = req.files && req.files.image && req.files.image[0];
    const scoreFile = req.files && req.files.score && req.files.score[0];

    if (!audioFile) {
      return res.status(400).json({ error: 'audio file is required' });
    }

    const urlKey = crypto.randomUUID();
    const audioFilename = makeFilename(audioFile.originalname);
    const storedAudio = await storeUpload({
      file: audioFile,
      subfolder: 'audio',
      filename: audioFilename,
    });
    const filePath = storedAudio.filePath;
    const audioUrl = storedAudio.publicUrl;

    let imagePath = '';
    let imageUrl = '';
    if (imageFile) {
      const imageFilename = makeFilename(imageFile.originalname);
      const storedImage = await storeUpload({
        file: imageFile,
        subfolder: 'images',
        filename: imageFilename,
      });
      imagePath = storedImage.filePath;
      imageUrl = storedImage.publicUrl;
    }

    let lyricsAssetPath = '';
    let lyricsAssetUrl = '';
    let lyricsAssetType = '';
    if (scoreFile) {
      const scoreFilename = makeFilename(scoreFile.originalname);
      const storedScore = await storeUpload({
        file: scoreFile,
        subfolder: 'scores',
        filename: scoreFilename,
      });
      lyricsAssetPath = storedScore.filePath;
      lyricsAssetUrl = storedScore.publicUrl;
      lyricsAssetType = path.extname(scoreFile.originalname).toLowerCase();
    }

    const parsedYear = year ? parseInt(year, 10) : null;
    if (year && (isNaN(parsedYear) || parsedYear < 1000 || parsedYear > 2100)) {
      return res.status(400).json({ error: 'Invalid year — must be between 1000 and 2100' });
    }

    const parsedTrackNum = track_number ? parseInt(track_number, 10) : null;
    if (track_number && (isNaN(parsedTrackNum) || parsedTrackNum < 1)) {
      return res.status(400).json({ error: 'Invalid track_number — must be a positive integer' });
    }

    const isPublic = is_public === 'true' || is_public === true;

    const result = await db.query(
      `INSERT INTO records
        (url_key, album_key, title, artist, composer, audio_url, image_url, lyrics, lyrics_asset_url, lyrics_asset_path, lyrics_asset_type, genre, year, track_number, file_path, image_path, owner_id, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        urlKey, '', title.trim(), artist.trim(), composer.trim(),
        audioUrl, imageUrl, lyrics.trim(), lyricsAssetUrl, lyricsAssetPath, lyricsAssetType,
        genre.trim(), parsedYear,
        parsedTrackNum,
        filePath, imagePath, req.user.userId, isPublic,
      ],
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

/**
 * @openapi
 * /api/tracks/{urlKey}:
 *   patch:
 *     tags: [Tracks]
 *     summary: Update track visibility (owner only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: urlKey
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_public: { type: boolean, description: 'Whether track is publicly visible' }
 *     responses:
 *       200: { description: Track updated }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden – not the owner }
 *       404: { description: Track not found }
 */
router.patch('/:urlKey', requireAuth, upload.fields([
  { name: 'score', maxCount: 1 },
]), async (req, res) => {
  const { urlKey } = req.params;
  const scoreFile = req.files && req.files.score && req.files.score[0];
  try {
    const existing = await db.query(
      'SELECT * FROM records WHERE url_key = $1 LIMIT 1',
      [urlKey],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    const track = existing.rows[0];
    const canManage =
      track.owner_id === req.user.userId
      || req.user.role === ROLES.ADMIN
      || req.user.role === ROLES.MANAGER;
    if (!canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updates = [];
    const params = [];
    const {
      title,
      artist,
      composer,
      lyrics,
      genre,
      year,
      track_number,
      is_public,
      clear_score,
    } = req.body || {};

    function pushField(column, value) {
      updates.push(`${column} = $${params.length + 1}`);
      params.push(value);
    }

    if (title !== undefined) pushField('title', String(title).trim());
    if (artist !== undefined) pushField('artist', String(artist).trim());
    if (composer !== undefined) pushField('composer', String(composer).trim());
    if (lyrics !== undefined) pushField('lyrics', String(lyrics).trim());
    if (genre !== undefined) pushField('genre', String(genre).trim());
    if (is_public !== undefined) pushField('is_public', is_public === true || String(is_public).toLowerCase() === 'true');
    if (year !== undefined) {
      const parsedYear = String(year).trim() === '' ? null : parseInt(year, 10);
      if (parsedYear !== null && (isNaN(parsedYear) || parsedYear < 1000 || parsedYear > 2100)) {
        return res.status(400).json({ error: 'Invalid year — must be between 1000 and 2100' });
      }
      pushField('year', parsedYear);
    }
    if (track_number !== undefined) {
      const parsedTrackNum = String(track_number).trim() === '' ? null : parseInt(track_number, 10);
      if (parsedTrackNum !== null && (isNaN(parsedTrackNum) || parsedTrackNum < 1)) {
        return res.status(400).json({ error: 'Invalid track_number — must be a positive integer' });
      }
      pushField('track_number', parsedTrackNum);
    }

    if (scoreFile) {
      const scoreFilename = makeFilename(scoreFile.originalname);
      const storedScore = await storeUpload({
        file: scoreFile,
        subfolder: 'scores',
        filename: scoreFilename,
      });
      pushField('lyrics_asset_url', storedScore.publicUrl);
      pushField('lyrics_asset_path', storedScore.filePath);
      pushField('lyrics_asset_type', path.extname(scoreFile.originalname).toLowerCase());
    } else if (clear_score === true || String(clear_score).toLowerCase() === 'true') {
      pushField('lyrics_asset_url', '');
      pushField('lyrics_asset_path', '');
      pushField('lyrics_asset_type', '');
    }

    if (updates.length > 0) {
      params.push(urlKey);
      await db.query(
        `UPDATE records SET ${updates.join(', ')} WHERE url_key = $${params.length}`,
        params,
      );
    }
    const updated = await db.query(
      'SELECT * FROM records WHERE url_key = $1 LIMIT 1',
      [urlKey],
    );
    return res.json(updated.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to update track' });
  }
});

/**
 * @openapi
 * /api/tracks/{urlKey}:
 *   delete:
 *     tags: [Tracks]
 *     summary: Delete a track (owner only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: urlKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden – not the owner }
 *       404: { description: Track not found }
 */
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
