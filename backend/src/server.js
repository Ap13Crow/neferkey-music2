const app = require('./app');
const { initDb } = require('./db');

const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const RETRYABLE_DB_ERROR_CODES = ['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];
const rawDbInitRetryAttempts = Number.parseInt(process.env.DB_INIT_RETRY_ATTEMPTS || '10', 10);
const rawDbInitRetryDelayMs = Number.parseInt(process.env.DB_INIT_RETRY_DELAY_MS || '2000', 10);
const safeDbInitRetryAttempts = Number.isFinite(rawDbInitRetryAttempts) && rawDbInitRetryAttempts > 0
  ? rawDbInitRetryAttempts
  : 10;
const safeDbInitRetryDelayMs = Number.isFinite(rawDbInitRetryDelayMs) && rawDbInitRetryDelayMs >= 0
  ? rawDbInitRetryDelayMs
  : 2000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production') {
  if (isProduction) {
    throw new Error('JWT_SECRET must be set to a strong secret in production');
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[WARN] JWT_SECRET is not set or uses the insecure default. ' +
    'Set the JWT_SECRET environment variable to a strong random secret before deploying to production.',
  );
}

function isRetryableDbInitError(error) {
  const errorCode = String(error?.code || '');
  return RETRYABLE_DB_ERROR_CODES.includes(errorCode);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  let lastError;
  for (let attempt = 1; attempt <= safeDbInitRetryAttempts; attempt += 1) {
    try {
      await initDb();
      app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`API listening on port ${port}`);
      });
      return;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableDbInitError(error);
      if (!retryable || attempt === safeDbInitRetryAttempts) {
        break;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `Database init failed (${error?.code || 'unknown'}) on attempt ${attempt}/${safeDbInitRetryAttempts}; retrying in ${safeDbInitRetryDelayMs}ms`,
      );
      await sleep(safeDbInitRetryDelayMs);
    }
  }

  // eslint-disable-next-line no-console
  console.error('Failed to start API', lastError);
  process.exit(1);
}

startServer();
