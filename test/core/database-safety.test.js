// These commands must reject unsafe settings before making a database connection.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const run = (args, env) => {
  const childEnv = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: '1', ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, { cwd: root, env: childEnv, encoding: 'utf8' });
};

test('tests refuse to use the development database, including case-only name differences', () => {
  for (const testName of ['campus_dev', 'CAMPUS_DEV']) {
    const result = run(['-e', "require('./core/config')"], {
      NODE_ENV: 'test',
      DB_NAME: 'campus_dev',
      DB_NAME_TEST: testName,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DB_NAME_TEST must differ from DB_NAME/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
  }
});

test('db:reset --test rejects overlapping databases before connecting', () => {
  const result = run(['db/reset.js', '--test'], {
    NODE_ENV: 'development',
    DB_NAME: 'campus_dev',
    DB_NAME_TEST: 'campus_dev',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DB_NAME_TEST must differ from DB_NAME/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});

test('load-test refuses production and test settings before inserting any posts', () => {
  for (const env of ['production', 'test']) {
    const result = run(['scripts/load-test.js'], {
      NODE_ENV: env,
      DB_NAME: 'campus_dev',
      DB_NAME_TEST: 'campus_test',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /development database only/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
  }
});
