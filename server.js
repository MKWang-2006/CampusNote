// Starts Campus Notes on PORT (default 3000).
const config = require('./core/config');
const { createApp } = require('./app');
const db = require('./core/db');

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Campus Notes (${config.env}) on http://localhost:${config.port}`);
  if (config.isDev)
    console.log('Dev login: http://localhost:%d/auth/login (persona list)', config.port);
});

// Ctrl+C or nodemon restart: finish open requests, then close the database pool.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
