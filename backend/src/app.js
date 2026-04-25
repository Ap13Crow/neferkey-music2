const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const db = require('./db');
const authRouter = require('./routes/auth');
const tracksRouter = require('./routes/tracks');
const albumsRouter = require('./routes/albums');
const purchaseLinksRouter = require('./routes/purchase-links');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

app.use(cors(corsOrigins.length > 0 ? {
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
} : undefined));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── Swagger / OpenAPI ─────────────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Neferkey Music API',
      version: '1.0.0',
      description:
        'REST API for the Neferkey music player. Supports authentication, track management, album management, and user account operations.\n\n' +
        '**Authentication**: Most write endpoints and user-scoped reads require a Bearer JWT obtained from `/api/auth/login` (or from `/api/auth/verify-email` after registration).\n\n' +
        '**Getting a Token**: 1) Register, 2) Verify your email using `/api/auth/verify-email`, 3) Login (or use token returned by verify endpoint), 4) Click the "Authorize" button (top-right), paste the token, 5) Click "Authorize" in the dialog.\n\n' +
        '**Roles** (current): `user` (default), `artist`, `composer`, `manager`, `admin`. Future route gates will use these roles.',
      contact: { name: 'Neferkey' },
    },
    servers: [{ url: '/', description: 'Current server (paths include /api prefix)' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login or /api/auth/register. Copy the token value from the response and paste it here.',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            preferences: { type: 'object' },
            role: { type: 'string', enum: ['user', 'artist', 'composer', 'manager', 'admin'] },
            email_verified: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT bearer token' },
            user: { $ref: '#/components/schemas/User' },
            message: { type: 'string' },
          },
        },
        Track: {
          type: 'object',
          properties: {
            url_key: { type: 'string' },
            album_key: { type: 'string' },
            title: { type: 'string' },
            artist: { type: 'string' },
            audio_url: { type: 'string' },
            image_url: { type: 'string' },
            lyrics: { type: 'string' },
            genre: { type: 'string' },
            year: { type: 'integer', nullable: true },
            track_number: { type: 'integer', nullable: true },
            owner_id: { type: 'string', format: 'uuid', nullable: true },
            is_public: { type: 'boolean', description: 'Whether track is publicly visible' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Album: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            cover_url: { type: 'string' },
            owner_id: { type: 'string', format: 'uuid' },
            created_at: { type: 'string', format: 'date-time' },
            tracks: { type: 'array', items: { $ref: '#/components/schemas/Track' } },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'User registration, login, profile, and account management' },
      { name: 'Tracks', description: 'Track listing, upload, and deletion' },
      { name: 'Albums', description: 'User album management' },
      { name: 'Legacy', description: 'Backwards-compatible routes' },
    ],
  },
  apis: [path.join(__dirname, 'routes/*.js')],
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Neferkey API Docs',
  swaggerOptions: { persistAuthorization: true },
}));

// Expose raw OpenAPI JSON for tooling
app.get('/api/openapi.json', (_req, res) => res.json(swaggerSpec));

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

// Backward-compatibility aliases for clients still sending double /api prefix.
app.use('/api/api/auth', authLimiter, authRouter);

// Track + album routes
app.use('/api/tracks', apiLimiter, tracksRouter);
app.use('/api/albums', apiLimiter, albumsRouter);
app.use('/api/purchase-links', apiLimiter, purchaseLinksRouter);
app.use('/api/api/tracks', apiLimiter, tracksRouter);
app.use('/api/api/albums', apiLimiter, albumsRouter);
app.use('/api/api/purchase-links', apiLimiter, purchaseLinksRouter);

/**
 * @openapi
 * /api/records/{urlKey}:
 *   get:
 *     tags: [Legacy]
 *     summary: Get a single track by url_key (legacy route)
 *     parameters:
 *       - in: path
 *         name: urlKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Track object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Track'
 *       404: { description: Not found }
 */
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

// Legacy alias for double-prefixed records endpoint.
app.get('/api/api/records/:urlKey', apiLimiter, async (req, res) => {
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
