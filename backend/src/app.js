const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const authRouter = require('./routes/auth');
const tracksRouter = require('./routes/tracks');
const albumsRouter = require('./routes/albums');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes (stricter limit for login/register)
app.use('/api/auth', authLimiter, authRouter);

// Track + album routes
app.use('/api/tracks', apiLimiter, tracksRouter);
app.use('/api/albums', apiLimiter, albumsRouter);

// Legacy single-record route (backwards compat)
app.get('/api/records/:urlKey', apiLimiter, async (req, res) => {
  const { urlKey } = req.params;
  try {
    const result = await db.query('SELECT * FROM records WHERE url_key = $1 LIMIT 1', [urlKey]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch record' });
  }
});

module.exports = app;
