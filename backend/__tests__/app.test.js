const request = require('supertest');

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn().mockReturnValue({ userId: 'user-uuid-1', username: 'testuser' }),
}));

const db = require('../src/db');
const app = require('../src/app');

const AUTH_HEADER = { Authorization: 'Bearer mock-token' };

describe('music API — legacy routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns a record by immutable url key', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ url_key: 'demo-track-1', title: 'Prelude in C Major' }] });

    const response = await request(app).get('/api/records/demo-track-1');

    expect(response.status).toBe(200);
    expect(response.body.url_key).toBe('demo-track-1');
  });

  it('returns 404 for unknown record key', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app).get('/api/records/missing-key');

    expect(response.status).toBe(404);
  });

  it('returns album records (legacy album_key)', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { url_key: 'demo-track-1', album_key: 'demo-album' },
        { url_key: 'demo-track-2', album_key: 'demo-album' },
      ],
    });

    const response = await request(app).get('/api/albums/demo-album');

    expect(response.status).toBe(200);
    expect(response.body.albumKey).toBe('demo-album');
    expect(response.body.records).toHaveLength(2);
  });
});

describe('auth routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registers a new user', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'user-uuid-1', username: 'testuser', email: 'test@example.com', preferences: {}, created_at: new Date() }],
    });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.token).toBe('mock-token');
    expect(response.body.user.username).toBe('testuser');
  });

  it('rejects registration with short password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'short' });

    expect(response.status).toBe(400);
  });

  it('logs in an existing user', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-uuid-1', username: 'testuser', email: 'test@example.com',
        password_hash: 'hashed', preferences: {}, created_at: new Date(),
      }],
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBe('mock-token');
  });

  it('rejects login with wrong password', async () => {
    const bcrypt = require('bcryptjs');
    bcrypt.compare.mockResolvedValueOnce(false);

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-uuid-1', username: 'testuser', email: 'test@example.com',
        password_hash: 'hashed', preferences: {}, created_at: new Date(),
      }],
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass' });

    expect(response.status).toBe(401);
  });

  it('returns 401 for protected route without token', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('returns current user for GET /api/auth/me with valid token', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'user-uuid-1', username: 'testuser', email: 'test@example.com', preferences: {}, created_at: new Date() }],
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body.username).toBe('testuser');
  });
});

describe('tracks routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists all tracks', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { url_key: 'demo-track-1', title: 'Prelude in C Major' },
        { url_key: 'demo-track-2', title: 'Moonlight Sonata' },
      ],
    });

    const response = await request(app).get('/api/tracks');

    expect(response.status).toBe(200);
    expect(response.body.tracks).toHaveLength(2);
  });

  it('returns 401 when uploading without auth', async () => {
    const response = await request(app).post('/api/tracks/upload');
    expect(response.status).toBe(401);
  });

  it('returns 401 when deleting track without auth', async () => {
    const response = await request(app).delete('/api/tracks/some-key');
    expect(response.status).toBe(401);
  });

  it('returns 403 when deleting a track owned by another user', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ url_key: 'demo-track-1', owner_id: 'other-user-id' }],
    });

    const response = await request(app)
      .delete('/api/tracks/demo-track-1')
      .set(AUTH_HEADER);

    expect(response.status).toBe(403);
  });

  it('deletes own track successfully', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ url_key: 'demo-track-1', owner_id: 'user-uuid-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete('/api/tracks/demo-track-1')
      .set(AUTH_HEADER);

    expect(response.status).toBe(204);
  });
});

describe('albums routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for GET /api/albums without auth', async () => {
    const response = await request(app).get('/api/albums');
    expect(response.status).toBe(401);
  });

  it('lists user albums', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'album-uuid-1', name: 'My Album', tracks: [] }],
    });

    const response = await request(app)
      .get('/api/albums')
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body.albums).toHaveLength(1);
  });

  it('creates an album', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'album-uuid-1', name: 'New Album', description: '', cover_url: '', owner_id: 'user-uuid-1', created_at: new Date() }],
    });

    const response = await request(app)
      .post('/api/albums')
      .set(AUTH_HEADER)
      .send({ name: 'New Album' });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('New Album');
  });

  it('returns 400 when creating album without name', async () => {
    const response = await request(app)
      .post('/api/albums')
      .set(AUTH_HEADER)
      .send({});

    expect(response.status).toBe(400);
  });

  it('deletes an album (owner)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ owner_id: 'user-uuid-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete('/api/albums/album-uuid-1')
      .set(AUTH_HEADER);

    expect(response.status).toBe(204);
  });

  it('returns 403 when deleting album owned by another user', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ owner_id: 'other-user' }] });

    const response = await request(app)
      .delete('/api/albums/album-uuid-1')
      .set(AUTH_HEADER);

    expect(response.status).toBe(403);
  });

  it('adds a track to an album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ owner_id: 'user-uuid-1' }] })
      .mockResolvedValueOnce({ rows: [{ url_key: 'demo-track-1' }] })
      .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post('/api/albums/album-uuid-1/tracks')
      .set(AUTH_HEADER)
      .send({ track_key: 'demo-track-1' });

    expect(response.status).toBe(201);
  });

  it('removes a track from an album', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ owner_id: 'user-uuid-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete('/api/albums/album-uuid-1/tracks/demo-track-1')
      .set(AUTH_HEADER);

    expect(response.status).toBe(204);
  });
});
