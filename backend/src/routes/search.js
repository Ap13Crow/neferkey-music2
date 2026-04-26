const express = require('express');
const db = require('../db');
const { verifyToken, ROLES } = require('../auth');

const router = express.Router();

function getRoleFromAuthHeader(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    const payload = verifyToken(header.slice(7));
    return payload?.role || null;
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const role = getRoleFromAuthHeader(req);
    const canSeeAll = role === ROLES.ADMIN || role === ROLES.MANAGER;
    const q = String(req.query.q || '').trim();
    const type = String(req.query.type || 'all').toLowerCase();
    const artist = String(req.query.artist || '').trim();
    const composer = String(req.query.composer || '').trim();
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();

    const tracks = [];
    const albums = [];

    if (type === 'all' || type === 'tracks') {
      const where = [];
      const params = [];
      if (!canSeeAll) where.push('r.is_public = true');
      if (q) {
        where.push(`(
          r.title ILIKE $${params.length + 1}
          OR r.artist ILIKE $${params.length + 1}
          OR r.composer ILIKE $${params.length + 1}
          OR r.genre ILIKE $${params.length + 1}
          OR r.lyrics ILIKE $${params.length + 1}
        )`);
        params.push(`%${q}%`);
      }
      if (artist) {
        where.push(`r.artist ILIKE $${params.length + 1}`);
        params.push(`%${artist}%`);
      }
      if (composer) {
        where.push(`r.composer ILIKE $${params.length + 1}`);
        params.push(`%${composer}%`);
      }
      if (dateFrom) {
        where.push(`r.created_at >= $${params.length + 1}::timestamptz`);
        params.push(dateFrom);
      }
      if (dateTo) {
        where.push(`r.created_at <= $${params.length + 1}::timestamptz`);
        params.push(dateTo);
      }
      const trackSql = `
        SELECT r.*
        FROM records r
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY r.created_at DESC, r.url_key
        LIMIT 100
      `;
      const result = await db.query(trackSql, params);
      tracks.push(...result.rows);
    }

    if (type === 'all' || type === 'albums') {
      const where = [];
      const params = [];
      if (!canSeeAll) where.push('a.is_public = true');
      if (q) {
        where.push(`(
          a.name ILIKE $${params.length + 1}
          OR a.description ILIKE $${params.length + 1}
          OR a.artist ILIKE $${params.length + 1}
          OR a.composer ILIKE $${params.length + 1}
        )`);
        params.push(`%${q}%`);
      }
      if (artist) {
        where.push(`a.artist ILIKE $${params.length + 1}`);
        params.push(`%${artist}%`);
      }
      if (composer) {
        where.push(`a.composer ILIKE $${params.length + 1}`);
        params.push(`%${composer}%`);
      }
      if (dateFrom) {
        where.push(`a.created_at >= $${params.length + 1}::timestamptz`);
        params.push(dateFrom);
      }
      if (dateTo) {
        where.push(`a.created_at <= $${params.length + 1}::timestamptz`);
        params.push(dateTo);
      }

      const albumSql = `
        SELECT a.*,
          COALESCE(
            json_agg(r.* ORDER BY at.position)
            FILTER (WHERE r.url_key IS NOT NULL), '[]'
          ) AS tracks
        FROM albums a
        LEFT JOIN album_tracks at ON at.album_id = a.id
        LEFT JOIN records r ON r.url_key = at.track_key ${canSeeAll ? '' : 'AND r.is_public = true'}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY a.id
        ORDER BY a.created_at DESC
        LIMIT 100
      `;
      const result = await db.query(albumSql, params);
      albums.push(...result.rows);
    }

    return res.json({ tracks, albums });
  } catch {
    return res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
