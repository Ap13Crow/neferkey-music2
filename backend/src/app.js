const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/records/:urlKey', async (req, res) => {
  const { urlKey } = req.params;

  try {
    const result = await db.query('SELECT * FROM records WHERE url_key = $1 LIMIT 1', [urlKey]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    return res.json(result.rows[0]);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch record' });
  }
});

app.get('/api/albums/:albumKey', async (req, res) => {
  const { albumKey } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM records WHERE album_key = $1 ORDER BY created_at, url_key',
      [albumKey],
    );

    return res.json({
      albumKey,
      records: result.rows,
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch album' });
  }
});

module.exports = app;
