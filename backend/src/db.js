const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://music:music@localhost:5432/music';
const pool = new Pool({ connectionString });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      url_key TEXT PRIMARY KEY,
      album_key TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      audio_url TEXT NOT NULL,
      image_url TEXT NOT NULL,
      lyrics TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_records_album_key ON records (album_key);');

  await pool.query(`
    INSERT INTO records (url_key, album_key, title, artist, audio_url, image_url, lyrics)
    VALUES
      ('demo-track-1', 'demo-album', 'Prelude in C Major', 'J.S. Bach', 'https://cdn.freesound.org/previews/431/431117_5121236-lq.mp3', 'https://picsum.photos/seed/demo1/600/600', 'A gentle arpeggio introduces the harmony...'),
      ('demo-track-2', 'demo-album', 'Moonlight Sonata (Excerpt)', 'L. van Beethoven', 'https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3', 'https://picsum.photos/seed/demo2/600/600', 'Soft triplets unfold in the night...')
    ON CONFLICT (url_key) DO NOTHING;
  `);
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  initDb,
  query,
};
