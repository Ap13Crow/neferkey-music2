const path = require('path');
const express = require('express');
const cors = require('cors');
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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.use('/api/auth', authRouter);

// Track routes
app.use('/api/tracks', tracksRouter);

// Album routes (new + legacy /:albumKey)
app.use('/api/albums', albumsRouter);

// Legacy single-record route (backwards compat)
app.get('/api/records/:urlKey', async (req, res) => {
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
