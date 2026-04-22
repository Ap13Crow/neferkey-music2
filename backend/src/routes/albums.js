const express = require('express');

const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// GET /api/albums — list albums owned by the current user (auth required)
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*,
        COALESCE(
          json_agg(r.* ORDER BY at.position)
          FILTER (WHERE r.url_key IS NOT NULL), '[]'
        ) AS tracks
       FROM albums a
       LEFT JOIN album_tracks at ON at.album_id = a.id
       LEFT JOIN records r ON r.url_key = at.track_key
       WHERE a.owner_id = $1
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [req.user.userId],
    );
    return res.json({ albums: result.rows });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// GET /api/albums/:albumKey — public route for legacy album_key lookup
router.get('/:albumKey', async (req, res) => {
  const { albumKey } = req.params;
  try {
    // First try as a UUID (user-created album)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(albumKey)) {
      const albumResult = await db.query(
        `SELECT a.*,
          COALESCE(
            json_agg(r.* ORDER BY at.position)
            FILTER (WHERE r.url_key IS NOT NULL), '[]'
          ) AS tracks
         FROM albums a
         LEFT JOIN album_tracks at ON at.album_id = a.id
         LEFT JOIN records r ON r.url_key = at.track_key
         WHERE a.id = $1
         GROUP BY a.id`,
        [albumKey],
      );
      if (albumResult.rows.length > 0) {
        const album = albumResult.rows[0];
        return res.json({ albumKey, records: album.tracks, album });
      }
    }
    // Fall back to legacy album_key column on records
    const result = await db.query(
      'SELECT * FROM records WHERE album_key = $1 ORDER BY created_at, url_key',
      [albumKey],
    );
    return res.json({ albumKey, records: result.rows });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch album' });
  }
});

// POST /api/albums — create album (auth required)
router.post('/', requireAuth, async (req, res) => {
  const { name, description = '', cover_url = '' } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const result = await db.query(
      'INSERT INTO albums (name, description, cover_url, owner_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), description.trim(), cover_url.trim(), req.user.userId],
    );
    return res.status(201).json({ ...result.rows[0], tracks: [] });
  } catch {
    return res.status(500).json({ error: 'Failed to create album' });
  }
});

// PUT /api/albums/:id — update album metadata (auth required, owner only)
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description, cover_url } = req.body;
  try {
    const existing = await db.query('SELECT * FROM albums WHERE id = $1 LIMIT 1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }
    if (existing.rows[0].owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const album = existing.rows[0];
    const result = await db.query(
      'UPDATE albums SET name=$1, description=$2, cover_url=$3 WHERE id=$4 RETURNING *',
      [
        name !== undefined ? name.trim() : album.name,
        description !== undefined ? description.trim() : album.description,
        cover_url !== undefined ? cover_url.trim() : album.cover_url,
        id,
      ],
    );
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to update album' });
  }
});

// DELETE /api/albums/:id — delete album (auth required, owner only)
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.query('SELECT owner_id FROM albums WHERE id = $1 LIMIT 1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }
    if (existing.rows[0].owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await db.query('DELETE FROM albums WHERE id = $1', [id]);
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to delete album' });
  }
});

// POST /api/albums/:id/tracks — add track to album
router.post('/:id/tracks', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { track_key } = req.body;
  if (!track_key) {
    return res.status(400).json({ error: 'track_key is required' });
  }
  try {
    const albumCheck = await db.query('SELECT owner_id FROM albums WHERE id = $1 LIMIT 1', [id]);
    if (albumCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }
    if (albumCheck.rows[0].owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const trackCheck = await db.query('SELECT url_key FROM records WHERE url_key = $1 LIMIT 1', [track_key]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    const posResult = await db.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM album_tracks WHERE album_id = $1',
      [id],
    );
    const position = posResult.rows[0].next_pos;
    await db.query(
      'INSERT INTO album_tracks (album_id, track_key, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, track_key, position],
    );
    return res.status(201).json({ album_id: id, track_key, position });
  } catch {
    return res.status(500).json({ error: 'Failed to add track to album' });
  }
});

// DELETE /api/albums/:id/tracks/:trackKey — remove track from album
router.delete('/:id/tracks/:trackKey', requireAuth, async (req, res) => {
  const { id, trackKey } = req.params;
  try {
    const albumCheck = await db.query('SELECT owner_id FROM albums WHERE id = $1 LIMIT 1', [id]);
    if (albumCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }
    if (albumCheck.rows[0].owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await db.query('DELETE FROM album_tracks WHERE album_id = $1 AND track_key = $2', [id, trackKey]);
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to remove track from album' });
  }
});

module.exports = router;
