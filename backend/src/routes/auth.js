const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../db');
const { DEFAULT_ADMIN_EMAIL } = require('../constants');
const {
  signToken, requireAuth, requireRole, ROLES,
} = require('../auth');

const router = express.Router();

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_TOKEN_BYTES = 32;

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_PORT
    && process.env.SMTP_USER
    && process.env.SMTP_PASSWORD
    && process.env.SMTP_FROM_EMAIL,
  );
}

function smtpSecure() {
  return String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
}

function createMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: smtpSecure(),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildVerificationUrl(token) {
  const configuredBaseUrl = String(process.env.EMAIL_VERIFICATION_URL_BASE || '').trim();
  if (!/^https?:\/\//i.test(configuredBaseUrl)) {
    throw new Error('EMAIL_VERIFICATION_URL_BASE must start with http:// or https://');
  }
  return `${configuredBaseUrl.replace(/\/$/, '')}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const value = email.trim();
  const atPos = value.indexOf('@');
  if (atPos <= 0 || atPos !== value.lastIndexOf('@') || atPos === value.length - 1) {
    return false;
  }
  const domain = value.slice(atPos + 1);
  const dotPos = domain.indexOf('.');
  return dotPos > 0 && dotPos < domain.length - 1;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeDisplayName(value) {
  return String(value || '')
    .replace(/[\r\n]/g, ' ')
    .replace(/[<>"]/g, '')
    .trim() || 'Neferkey Music App';
}

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Creates a new user account. When SMTP is configured, sends an email verification link and requires verification before login.
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
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const role = normalizedEmail === DEFAULT_ADMIN_EMAIL ? ROLES.ADMIN : ROLES.USER;
    const hash = await bcrypt.hash(password, 12);
    const smtpEnabled = isSmtpConfigured();
    if (smtpEnabled && !String(process.env.EMAIL_VERIFICATION_URL_BASE || '').trim()) {
      return res.status(500).json({ error: 'EMAIL_VERIFICATION_URL_BASE must be set when SMTP is enabled' });
    }
    const verificationToken = smtpEnabled ? crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('hex') : null;
    const verificationTokenHash = verificationToken ? hashVerificationToken(verificationToken) : null;
    const verificationExpiresAt = verificationToken
      ? new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)
      : null;
    const emailVerified = !smtpEnabled;
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash, role, email_verified, email_verification_token_hash, email_verification_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, preferences, role, email_verified, created_at',
      [username.trim(), normalizedEmail, hash, role, emailVerified, verificationTokenHash, verificationExpiresAt],
    );
    const user = result.rows[0];
    if (smtpEnabled && verificationToken) {
      const verificationUrl = buildVerificationUrl(verificationToken);
      const safeVerificationUrl = escapeHtml(verificationUrl);
      const transporter = createMailer();
      try {
        await transporter.sendMail({
          from: {
            name: sanitizeDisplayName(process.env.SMTP_FROM_NAME),
            address: process.env.SMTP_FROM_EMAIL,
          },
          to: normalizedEmail,
          subject: 'Verify your Neferkey Music account',
          text:
            'Welcome to Neferkey Music.\n\n'
            + `Please verify your account by opening this link:\n${verificationUrl}\n\n`
            + 'If you did not create this account, you can ignore this email.',
          html:
            '<p>Welcome to Neferkey Music.</p>'
            + `<p>Please verify your account by clicking this link:</p><p><a href="${safeVerificationUrl}">${safeVerificationUrl}</a></p>`
            + '<p>If you did not create this account, you can ignore this email.</p>',
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('SMTP verification email send failed for registration:', err?.message || 'unknown error');
        try {
          await db.query('DELETE FROM users WHERE id = $1', [user.id]);
        } catch (cleanupErr) {
          // eslint-disable-next-line no-console
          console.error('Failed to rollback user after SMTP send failure:', cleanupErr?.message || 'unknown error');
        }
        return res.status(500).json({ error: 'Registration failed: could not send verification email' });
      }
      return res.status(201).json({
        message: 'Registration successful. Please check your email to verify your account before signing in.',
      });
    }
    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    return res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    // eslint-disable-next-line no-console
    console.error('Registration failed', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: Authenticates a verified user and returns a JWT token. Copy the token value and paste it in the Authorization header using the Authorize button in Swagger UI
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
      'SELECT id, username, email, password_hash, preferences, role, email_verified, created_at FROM users WHERE email = $1 LIMIT 1',
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
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Email not verified. Please verify your email before logging in.' });
    }
    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    const { password_hash: _h, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Login failed', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @openapi
 * /api/auth/verify-email:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email address using a verification token
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Email verified. Returns auth token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400: { description: Missing, invalid, or expired verification token }
 *       500: { description: Verification failed }
 */
router.get('/verify-email', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Verification token is required' });
  }
  const tokenHash = hashVerificationToken(token);
  try {
    const result = await db.query(
      `UPDATE users
       SET email_verified = true,
           email_verification_token_hash = NULL,
           email_verification_expires_at = NULL
       WHERE email_verification_token_hash = $1
         AND email_verification_expires_at IS NOT NULL
         AND email_verification_expires_at > NOW()
       RETURNING id, username, email, preferences, role, email_verified, created_at`,
      [tokenHash],
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    const user = result.rows[0];
    const authToken = signToken({ userId: user.id, username: user.username, role: user.role });
    return res.json({
      message: 'Email verified successfully. You can now use your account.',
      token: authToken,
      user,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Email verification failed', err);
    return res.status(500).json({ error: 'Verification failed' });
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
