const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, ROLES } = require('../auth');

const router = express.Router();
const PARAMS_PER_LINK = 7;

/**
 * @openapi
 * /api/purchase-links:
 *   post:
 *     tags: [PurchaseLinks]
 *     summary: Generate a one-time purchase link (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resource_type, resource_key]
 *             properties:
 *               resource_type: { type: string, enum: [track, album] }
 *               resource_key: { type: string, description: url_key for track or UUID for album }
 *               label: { type: string, description: Optional human-readable label }
 *               expires_at: { type: string, format: date-time, description: Optional expiry date }
 *     responses:
 *       201:
 *         description: Purchase link created
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Admin role required }
 *       404: { description: Resource not found }
 */
router.post('/', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  const {
    resource_type,
    resource_key,
    label = '',
    expires_at,
    target_user_id,
    count,
  } = req.body;

  if (!resource_type || !['track', 'album'].includes(resource_type)) {
    return res.status(400).json({ error: 'resource_type must be "track" or "album"' });
  }
  if (!resource_key || typeof resource_key !== 'string' || !resource_key.trim()) {
    return res.status(400).json({ error: 'resource_key is required' });
  }
  const normalizedCount = count === undefined ? 1 : Number(count);
  if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > 200) {
    return res.status(400).json({ error: 'count must be an integer between 1 and 200' });
  }

  try {
    if (resource_type === 'track') {
      const r = await db.query('SELECT url_key, title, artist FROM records WHERE url_key = $1', [resource_key]);
      if (!r.rows.length) return res.status(404).json({ error: 'Track not found' });
    } else {
      const r = await db.query('SELECT id, name FROM albums WHERE id = $1', [resource_key]);
      if (!r.rows.length) return res.status(404).json({ error: 'Album not found' });
    }

    let targetUserId = null;
    if (target_user_id !== undefined && target_user_id !== null && String(target_user_id).trim()) {
      const target = await db.query(
        'SELECT id FROM users WHERE id = $1 LIMIT 1',
        [String(target_user_id).trim()],
      );
      if (!target.rows.length) return res.status(404).json({ error: 'Target user not found' });
      targetUserId = target.rows[0].id;
    }

    const values = [];
    const placeholders = [];
    for (let i = 0; i < normalizedCount; i += 1) {
      const token = crypto.randomBytes(20).toString('hex');
      const placeholderBase = i * PARAMS_PER_LINK;
      placeholders.push(`($${placeholderBase + 1}, $${placeholderBase + 2}, $${placeholderBase + 3}, $${placeholderBase + 4}, $${placeholderBase + 5}, $${placeholderBase + 6}, $${placeholderBase + 7})`);
      values.push(
        token,
        resource_type,
        resource_key.trim(),
        label.trim(),
        req.user.userId,
        expires_at || null,
        targetUserId,
      );
    }
    const result = await db.query(
      `INSERT INTO purchase_links (token, resource_type, resource_key, label, created_by, expires_at, target_user_id)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values,
    );

    if (normalizedCount === 1) {
      return res.status(201).json({ link: result.rows[0] });
    }
    return res.status(201).json({ links: result.rows, count: result.rows.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create purchase link', detail: err.message });
  }
});

/**
 * @openapi
 * /api/purchase-links:
 *   get:
 *     tags: [PurchaseLinks]
 *     summary: List all purchase links (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of purchase links
 *       401: { description: Unauthorized }
 *       403: { description: Admin role required }
 */
router.get('/', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const result = await db.query(
       `SELECT pl.*,
          u.username AS used_by_username,
          c.username AS created_by_username,
          tu.username AS target_user_username
        FROM purchase_links pl
        LEFT JOIN users u ON u.id = pl.used_by
        LEFT JOIN users c ON c.id = pl.created_by
        LEFT JOIN users tu ON tu.id = pl.target_user_id
        ORDER BY pl.created_at DESC`,
    );
    return res.json({ links: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch links', detail: err.message });
  }
});

router.get('/redeemed', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         up.id,
         up.resource_type,
         up.resource_key,
         up.purchased_at,
         pl.label,
         creator.username AS created_by_username,
         r.title AS track_title,
         r.artist AS track_artist,
         r.image_url AS track_image_url,
         a.name AS album_name,
         a.cover_url AS album_cover_url
       FROM user_purchases up
       LEFT JOIN purchase_links pl ON pl.id = up.purchase_link_id
       LEFT JOIN users creator ON creator.id = pl.created_by
       LEFT JOIN records r ON up.resource_type = 'track' AND r.url_key = up.resource_key
       LEFT JOIN albums a ON up.resource_type = 'album' AND a.id::text = up.resource_key
       WHERE up.user_id = $1
       ORDER BY up.purchased_at DESC`,
      [req.user.userId],
    );
    return res.json({ purchases: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch redeemed history', detail: err.message });
  }
});

/**
 * @openapi
 * /api/purchase-links/{token}:
 *   get:
 *     tags: [PurchaseLinks]
 *     summary: Preview purchase link info (no auth required — used before login)
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Link details and resource preview
 *       404: { description: Link not found }
 *       410: { description: Link already used or expired }
 */
router.get('/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await db.query('SELECT * FROM purchase_links WHERE token = $1', [token]);
    if (!result.rows.length) return res.status(404).json({ error: 'Link not found' });

    const link = result.rows[0];
    if (link.used_at) return res.status(410).json({ error: 'This link has already been used' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    let resource = null;
    if (link.resource_type === 'track') {
      const r = await db.query(
        'SELECT url_key, title, artist, image_url, genre FROM records WHERE url_key = $1',
        [link.resource_key],
      );
      resource = r.rows[0] || null;
    } else {
      const r = await db.query(
        `SELECT a.id, a.name, a.description, a.cover_url,
           COUNT(at2.track_key)::int AS track_count
         FROM albums a
         LEFT JOIN album_tracks at2 ON at2.album_id = a.id
         WHERE a.id = $1
         GROUP BY a.id`,
        [link.resource_key],
      );
      resource = r.rows[0] || null;
    }

    return res.json({
      token: link.token,
      resource_type: link.resource_type,
      resource_key: link.resource_key,
      label: link.label,
      expires_at: link.expires_at,
      target_user_id: link.target_user_id,
      resource,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch link', detail: err.message });
  }
});

/**
 * @openapi
 * /api/purchase-links/{token}/redeem:
 *   post:
 *     tags: [PurchaseLinks]
 *     summary: Redeem a purchase link (adds resource to user library, invalidates link)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Successfully redeemed
 *       401: { description: Unauthorized }
 *       404: { description: Link not found }
 *       410: { description: Link already used or expired }
 */
router.post('/:token/redeem', requireAuth, async (req, res) => {
  const { token } = req.params;
  const userId = req.user.userId;

  try {
    const linkResult = await db.query('SELECT * FROM purchase_links WHERE token = $1', [token]);
    if (!linkResult.rows.length) return res.status(404).json({ error: 'Link not found' });

    const link = linkResult.rows[0];
    if (link.used_at) return res.status(410).json({ error: 'This link has already been used' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }
    if (link.target_user_id && link.target_user_id !== userId) {
      return res.status(403).json({ error: 'This link is assigned to a different user account' });
    }

    // Mark link as used
    await db.query(
      'UPDATE purchase_links SET used_by = $1, used_at = NOW() WHERE id = $2',
      [userId, link.id],
    );

    // Grant access to user
    await db.query(
      `INSERT INTO user_purchases (user_id, resource_type, resource_key, purchase_link_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, resource_type, resource_key) DO NOTHING`,
      [userId, link.resource_type, link.resource_key, link.id],
    );

    // Return the resource info so the frontend can display it
    let resource = null;
    if (link.resource_type === 'track') {
      const r = await db.query('SELECT * FROM records WHERE url_key = $1', [link.resource_key]);
      resource = r.rows[0] || null;
    } else {
      const r = await db.query('SELECT * FROM albums WHERE id = $1', [link.resource_key]);
      resource = r.rows[0] || null;
    }

    return res.json({
      success: true,
      resource_type: link.resource_type,
      resource_key: link.resource_key,
      resource,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to redeem link', detail: err.message });
  }
});

/**
 * @openapi
 * /api/purchase-links/{id}:
 *   delete:
 *     tags: [PurchaseLinks]
 *     summary: Delete a purchase link (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 *       401: { description: Unauthorized }
 *       403: { description: Admin role required }
 *       404: { description: Link not found }
 */
router.delete('/:id', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  const { id } = req.params;
  try {
    const r = await db.query('DELETE FROM purchase_links WHERE id = $1 RETURNING id', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Link not found' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete link', detail: err.message });
  }
});

module.exports = router;
