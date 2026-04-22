const app = require('./app');
const { initDb } = require('./db');

const port = Number(process.env.PORT || 3000);

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
