const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, preferences, created_at',
      [username.trim(), email.trim().toLowerCase(), hash],
    );
    const user = result.rows[0];
    const token = signToken({ userId: user.id, username: user.username });
    return res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const result = await db.query(
      'SELECT id, username, email, password_hash, preferences, created_at FROM users WHERE email = $1 LIMIT 1',
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
    const token = signToken({ userId: user.id, username: user.username });
    const { password_hash: _h, ...safeUser } = user;
    return res.json({ token, user: safeUser });
  } catch {
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, preferences, created_at FROM users WHERE id = $1 LIMIT 1',
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

router.put('/me/preferences', requireAuth, async (req, res) => {
  const { preferences } = req.body;
  if (!preferences || typeof preferences !== 'object') {
    return res.status(400).json({ error: 'preferences must be an object' });
  }
  try {
    const result = await db.query(
      'UPDATE users SET preferences = $1 WHERE id = $2 RETURNING id, username, email, preferences, created_at',
      [preferences, req.user.userId],
    );
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
