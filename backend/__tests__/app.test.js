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
  verify: jest.fn().mockReturnValue({ userId: 'user-uuid-1', username: 'testuser', role: 'user' }),
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
      rows: [{ id: 'user-uuid-1', username: 'testuser', email: 'test@example.com', preferences: {}, role: 'user', created_at: new Date() }],
    });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.token).toBe('mock-token');
    expect(response.body.user.username).toBe('testuser');
  });

  it('registers admin@apollon.care with admin role', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-uuid-2',
        username: 'adminuser',
        email: 'admin@apollon.care',
        preferences: {},
        role: 'admin',
        created_at: new Date(),
      }],
    });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ username: 'adminuser', email: 'admin@apollon.care', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('admin');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('password_hash, role'),
      ['adminuser', 'admin@apollon.care', 'hashed', 'admin'],
    );
  });

  it('registers ADMIN@APOLLON.CARE with normalized admin role', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'user-uuid-3',
        username: 'adminupper',
        email: 'admin@apollon.care',
        preferences: {},
        role: 'admin',
        created_at: new Date(),
      }],
    });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ username: 'adminupper', email: 'ADMIN@APOLLON.CARE', password: 'password123' });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('admin');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('password_hash, role'),
      ['adminupper', 'admin@apollon.care', 'hashed', 'admin'],
    );
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
        password_hash: 'hashed', preferences: {}, role: 'user', created_at: new Date(),
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
        password_hash: 'hashed', preferences: {}, role: 'user', created_at: new Date(),
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
      rows: [{ id: 'user-uuid-1', username: 'testuser', email: 'test@example.com', preferences: {}, role: 'user', created_at: new Date() }],
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body.username).toBe('testuser');
  });

  it('deletes current user account', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .delete('/api/auth/me')
      .set(AUTH_HEADER);

    expect(response.status).toBe(204);
    expect(db.query).toHaveBeenCalledWith(
      'DELETE FROM users WHERE id = $1',
      ['user-uuid-1'],
    );
  });

  it('returns 401 for DELETE /api/auth/me without token', async () => {
    const response = await request(app).delete('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('lists users for admin role', async () => {
    const jwt = require('jsonwebtoken');
    jwt.verify.mockReturnValueOnce({ userId: 'admin-id', username: 'admin', role: 'admin' });
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'u1', username: 'alice', email: 'a@example.com', role: 'user', created_at: new Date() }],
    });

    const response = await request(app)
      .get('/api/auth/users')
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
  });

  it('rejects listing users for non-admin role', async () => {
    const response = await request(app)
      .get('/api/auth/users')
      .set(AUTH_HEADER);

    expect(response.status).toBe(403);
  });

  it('updates user role for admin role', async () => {
    const jwt = require('jsonwebtoken');
    jwt.verify.mockReturnValueOnce({ userId: 'admin-id', username: 'admin', role: 'admin' });
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'u1', username: 'alice', email: 'a@example.com', preferences: {}, role: 'manager', created_at: new Date() }],
    });

    const response = await request(app)
      .put('/api/auth/users/u1/role')
      .set(AUTH_HEADER)
      .send({ role: 'manager' });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('manager');
  });

  it('prevents admin from removing own admin role', async () => {
    const jwt = require('jsonwebtoken');
    jwt.verify.mockReturnValueOnce({ userId: 'admin-id', username: 'admin', role: 'admin' });

    const response = await request(app)
      .put('/api/auth/users/admin-id/role')
      .set(AUTH_HEADER)
      .send({ role: 'user' });

    expect(response.status).toBe(400);
  });
});

describe('tracks routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists all tracks when unauthenticated', async () => {
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

  it('lists only own tracks when authenticated', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ url_key: 'my-track-1', title: 'My Track', owner_id: 'user-uuid-1' }],
    });

    const response = await request(app)
      .get('/api/tracks')
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body.tracks).toHaveLength(1);
    expect(response.body.tracks[0].url_key).toBe('my-track-1');
    // Verify user-scoped query was used
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('owner_id'),
      ['user-uuid-1'],
    );
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

describe('purchase links routes', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns redeemed history for authenticated user', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'p1', resource_type: 'album', resource_key: 'a1', purchased_at: new Date() }],
    });

    const response = await request(app)
      .get('/api/purchase-links/redeemed')
      .set(AUTH_HEADER);

    expect(response.status).toBe(200);
    expect(response.body.purchases).toHaveLength(1);
  });

  it('prevents redeeming a link assigned to another user', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'link-1',
        used_at: null,
        expires_at: null,
        target_user_id: 'different-user-id',
        resource_type: 'track',
        resource_key: 'demo-track-1',
      }],
    });

    const response = await request(app)
      .post('/api/purchase-links/token-abc/redeem')
      .set(AUTH_HEADER);

    expect(response.status).toBe(403);
  });

  it('supports admin bulk link generation', async () => {
    const jwt = require('jsonwebtoken');
    jwt.verify.mockReturnValueOnce({ userId: 'admin-id', username: 'admin', role: 'admin' });
    db.query
      .mockResolvedValueOnce({ rows: [{ url_key: 'demo-track-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'l1' }, { id: 'l2' }] });

    const response = await request(app)
      .post('/api/purchase-links')
      .set(AUTH_HEADER)
      .send({
        resource_type: 'track',
        resource_key: 'demo-track-1',
        count: 2,
      });

    expect(response.status).toBe(201);
    expect(response.body.links).toHaveLength(2);
  });
});

describe('roles middleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exports requireRole function', () => {
    const { requireRole, ROLES } = require('../src/auth');
    expect(typeof requireRole).toBe('function');
    expect(ROLES.USER).toBe('user');
    expect(ROLES.ADMIN).toBe('admin');
    expect(ROLES.ARTIST).toBe('artist');
    expect(ROLES.MANAGER).toBe('manager');
    expect(ROLES.COMPOSER).toBe('composer');
  });

  it('requireRole allows user with matching role', () => {
    const { requireRole } = require('../src/auth');
    const middleware = requireRole('user');
    const req = { user: { userId: 'u1', role: 'user' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('requireRole rejects user with wrong role', () => {
    const { requireRole } = require('../src/auth');
    const middleware = requireRole('admin');
    const req = { user: { userId: 'u1', role: 'user' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('requireRole always allows admin', () => {
    const { requireRole } = require('../src/auth');
    const middleware = requireRole('artist');
    const req = { user: { userId: 'u1', role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
