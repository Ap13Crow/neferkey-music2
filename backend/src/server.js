const app = require('./app');
const { initDb } = require('./db');

const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const dbInitRetryAttempts = Number(process.env.DB_INIT_RETRY_ATTEMPTS || 10);
const dbInitRetryDelayMs = Number(process.env.DB_INIT_RETRY_DELAY_MS || 2000);

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
  const errorCode = typeof error?.code === 'string' ? error.code : String(error?.code || '');
  return ['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(errorCode);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer() {
  let lastError;
  for (let attempt = 1; attempt <= dbInitRetryAttempts; attempt += 1) {
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
      if (!retryable || attempt === dbInitRetryAttempts) {
        break;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `Database init failed (${error?.code || 'unknown'}) on attempt ${attempt}/${dbInitRetryAttempts}; retrying in ${dbInitRetryDelayMs}ms`,
      );
      await sleep(dbInitRetryDelayMs);
    }
  }

  // eslint-disable-next-line no-console
  console.error('Failed to start API', lastError);
  process.exit(1);
}

startServer();
