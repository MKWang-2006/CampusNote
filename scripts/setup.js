// Creates a local development config once, without replacing someone's existing settings.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const config = example.replace(
  'SESSION_SECRET=change-me-to-a-long-random-string',
  `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
);

try {
  fs.writeFileSync(target, config, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a random session secret. Set your local MySQL credentials there.');
} catch (err) {
  if (err.code !== 'EEXIST') throw err;
  console.log('Kept your existing .env. Check its MySQL credentials before running db:reset.');
}
