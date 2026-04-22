const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { DEFAULT_ADMIN_EMAIL } = require('../constants');
const {
  signToken, requireAuth, requireRole, ROLES,
} = require('../auth');

const router = express.Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Creates a new user account and returns a JWT token for immediate authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string, minLength: 3 }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, description: 'Must be at least 8 characters' }
 *     responses:
 *       201:
 *         description: Registration successful. Copy the token value and paste it in the Authorization header (Authorize button, top-right)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400: { description: Validation error or missing fields }
 *       409: { description: Username or email already taken }
 *       500: { description: Registration failed }
 */
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const role = normalizedEmail === DEFAULT_ADMIN_EMAIL ? ROLES.ADMIN : ROLES.USER;
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, preferences, role, created_at',
      [username.trim(), normalizedEmail, hash, role],
    );
    const user = result.rows[0];
    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    return res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: Authenticates user and returns a JWT token. Copy the token value and paste it in the Authorization header using the Authorize button in Swagger UI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful. Copy the token value and paste it in the Authorize button
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400: { description: Missing email or password }
 *       401: { description: Invalid email or password }
 *       500: { description: Login failed }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const result = await db.query(
      'SELECT id, username, email, password_hash, preferences, role, created_at FROM users WHERE email = $1 LIMIT 1',
      [email.trim().toLowerCase()],
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    const { password_hash: _h, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  } catch {
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401: { description: Unauthorized }
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, preferences, role, created_at FROM users WHERE id = $1 LIMIT 1',
      [req.user.userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * @openapi
 * /api/auth/me/preferences:
 *   put:
 *     tags: [Auth]
 *     summary: Update current user preferences
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [preferences]
 *             properties:
 *               preferences:
 *                 type: object
 *     responses:
 *       200: { description: Updated user }
 *       400: { description: Invalid preferences }
 *       401: { description: Unauthorized }
 */
router.put('/me/preferences', requireAuth, async (req, res) => {
  const { preferences } = req.body;
  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({ error: 'preferences must be an object' });
  }
  try {
    const result = await db.query(
      'UPDATE users SET preferences = $1 WHERE id = $2 RETURNING id, username, email, preferences, role, created_at',
      [preferences, req.user.userId],
    );
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * @openapi
 * /api/auth/me:
 *   delete:
 *     tags: [Auth]
 *     summary: Delete current user account and all associated data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204: { description: Account deleted }
 *       401: { description: Unauthorized }
 */
router.delete('/me', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.user.userId]);
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * @openapi
 * /api/auth/users:
 *   get:
 *     tags: [Auth]
 *     summary: List users (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: User list }
 *       401: { description: Unauthorized }
 *       403: { description: Admin role required }
 */
router.get('/users', requireAuth, requireRole(ROLES.ADMIN), async (_req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC',
    );
    return res.json({ users: result.rows });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * @openapi
 * /api/auth/users/{id}/role:
 *   put:
 *     tags: [Auth]
 *     summary: Update a user role (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, artist, composer, manager, admin]
 *     responses:
 *       200: { description: Updated user }
 *       400: { description: Invalid role }
 *       401: { description: Unauthorized }
 *       403: { description: Admin role required }
 *       404: { description: User not found }
 */
router.put('/users/:id/role', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const allowedRoles = Object.values(ROLES);
  if (!role || !allowedRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(', ')}` });
  }
  const requesterId = String(req.user.userId ?? '').trim();
  const targetId = String(id ?? '').trim();
  if (requesterId === targetId && role !== ROLES.ADMIN) {
    return res.status(400).json({ error: 'Admin cannot remove own admin role' });
  }
  try {
    const result = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, preferences, role, created_at',
      [role, id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

module.exports = router;
