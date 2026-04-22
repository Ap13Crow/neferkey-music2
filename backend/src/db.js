const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://music:music@localhost:5432/music';
const pool = new Pool({ connectionString });

async function initDb() {
  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      preferences JSONB NOT NULL DEFAULT '{}',
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Add role column for existing deployments
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`);
  // Ensure designated admin account always has admin role
  await pool.query(
    `UPDATE users SET role = 'admin' WHERE lower(email) = lower('admin@apollon.care')`,
  );

  // Tracks table (keeps url_key for backwards compat)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      url_key TEXT PRIMARY KEY,
      album_key TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      audio_url TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      lyrics TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL DEFAULT '',
      year INTEGER,
      track_number INTEGER,
      file_path TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL DEFAULT '',
      owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
      is_public BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Add columns for upgrades from previous schema
  for (const stmt of [
    `ALTER TABLE records ADD COLUMN IF NOT EXISTS genre TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE records ADD COLUMN IF NOT EXISTS year INTEGER`,
    `ALTER TABLE records ADD COLUMN IF NOT EXISTS track_number INTEGER`,
    `ALTER TABLE records ADD COLUMN IF NOT EXISTS file_path TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE records ADD COLUMN IF NOT EXISTS image_path TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE records ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE records ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false`,
  ]) {
    await pool.query(stmt);
  }

  await pool.query('CREATE INDEX IF NOT EXISTS idx_records_album_key ON records (album_key);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_records_owner ON records (owner_id);');

  // User-created album library
  await pool.query(`
    CREATE TABLE IF NOT EXISTS albums (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      cover_path TEXT NOT NULL DEFAULT '',
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_albums_owner ON albums (owner_id);');

  // Album-track ordered association
  await pool.query(`
    CREATE TABLE IF NOT EXISTS album_tracks (
      album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      track_key TEXT NOT NULL REFERENCES records(url_key) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (album_id, track_key)
    );
  `);

  // Purchase links — admin-generated one-time-use tokens
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token TEXT UNIQUE NOT NULL,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('track', 'album')),
      resource_key TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      used_by UUID REFERENCES users(id) ON DELETE SET NULL,
      used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // User purchases — access grants from redeemed purchase links
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource_type TEXT NOT NULL CHECK (resource_type IN ('track', 'album')),
      resource_key TEXT NOT NULL,
      purchase_link_id UUID REFERENCES purchase_links(id) ON DELETE SET NULL,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, resource_type, resource_key)
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_purchase_links_token ON purchase_links (token);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON user_purchases (user_id);');

  // Demo seed data
  await pool.query(`
    INSERT INTO records (url_key, album_key, title, artist, audio_url, image_url, lyrics, is_public)
    VALUES
      ('demo-track-1', 'demo-album', 'Prelude in C Major', 'J.S. Bach', 'https://cdn.freesound.org/previews/431/431117_5121236-lq.mp3', 'https://picsum.photos/seed/demo1/600/600', 'A gentle arpeggio introduces the harmony...', true),
      ('demo-track-2', 'demo-album', 'Moonlight Sonata (Excerpt)', 'L. van Beethoven', 'https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3', 'https://picsum.photos/seed/demo2/600/600', 'Soft triplets unfold in the night...', true)
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
