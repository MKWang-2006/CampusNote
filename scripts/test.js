// npm test [-- <path> ...]: runs the test files one at a time against the test database.
//   npm test                       every modules/*/tests/**/*.test.js and test/**/*.test.js
//   npm test -- modules/content    only the files whose path contains one of the arguments
// One file at a time, because every file resets the shared test database (ARCHITECTURE.md §10).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(full);
    return d.name.endsWith('.test.js') ? [full] : [];
  });
}

const modulesDir = path.join(root, 'modules');
const moduleTests = fs.existsSync(modulesDir)
  ? fs
      .readdirSync(modulesDir)
      .sort()
      .flatMap((m) => walk(path.join(modulesDir, m, 'tests')))
  : [];
const all = [...moduleTests, ...walk(path.join(root, 'test'))].map((f) => path.relative(root, f));

const filters = process.argv
  .slice(2)
  .map((a) => a.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''));
const files = filters.length
  ? all.filter((f) => filters.some((x) => f.replace(/\\/g, '/').includes(x)))
  : all;

if (files.length === 0) {
  console.log(filters.length ? `No test files match ${filters.join(', ')}.` : 'No test files yet.');
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', '--test-force-exit', ...files],
  { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } },
);
process.exit(result.status ?? 1);
