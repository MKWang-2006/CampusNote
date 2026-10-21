// Settings from the environment. `.env` (copied from `.env.example`) is read by Node itself.
const path = require('path');

const root = path.join(__dirname, '..');
try {
  process.loadEnvFile(path.join(root, '.env')); // never overrides variables that are already set
} catch {
  // no .env file: defaults below, or variables set by CI
}

// `node --test` marks its child processes; tests always run against the test database.
const env = process.env.NODE_TEST_CONTEXT ? 'test' : process.env.NODE_ENV || 'development';
const isTest = env === 'test';
const developmentDatabase = process.env.DB_NAME || 'campus_notes';
const testDatabase = process.env.DB_NAME_TEST || 'campus_notes_test';
if (isTest && developmentDatabase.toLowerCase() === testDatabase.toLowerCase()) {
  throw new Error(
    'DB_NAME_TEST must differ from DB_NAME: tests replace the test database contents',
  );
}

module.exports = {
  root,
  env,
  isDev: env === 'development',
  isTest,
  isProd: env === 'production',
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: isTest ? testDatabase : developmentDatabase,
  },
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || 'Campus Notes <no-reply@campus-notes.test>',
};
