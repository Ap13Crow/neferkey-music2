const app = require('./app');
const { initDb } = require('./db');

const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

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

initDb()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`API listening on port ${port}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start API', error);
    process.exit(1);
  });
