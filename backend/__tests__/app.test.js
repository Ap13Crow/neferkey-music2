const request = require('supertest');

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

const db = require('../src/db');
const app = require('../src/app');

describe('music API', () => {
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

  it('returns album records', async () => {
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
