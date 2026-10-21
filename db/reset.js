// Rebuilds a database from the repository's SQL files (BB-4).
//   npm run db:reset              the development database (DB_NAME)
//   npm run db:reset -- --test    the test database (DB_NAME_TEST)
// Order: db/schema.sql -> modules/*/db/*.sql (triggers) -> db/seed/core.sql -> modules/*/db/seed.sql.
// The files may use DELIMITER like the mysql client; splitSql() understands it.
// Tests call resetDb(), which empties the test database in place (dropping the database would
// leave the app's pooled connections without a current database) and loads everything again.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');

// The SQL files in load order, as paths relative to the repository root.
function sqlFiles() {
  const modulesDir = path.join(ROOT, 'modules');
  const modules = fs.existsSync(modulesDir)
    ? fs
        .readdirSync(modulesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
  const moduleSql = (keep) =>
    modules.flatMap((m) => {
      const dir = path.join(modulesDir, m, 'db');
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql') && keep(f))
        .sort()
        .map((f) => path.join('modules', m, 'db', f));
    });
  return [
    'db/schema.sql',
    ...moduleSql((f) => f !== 'seed.sql'),
    'db/seed/core.sql',
    ...moduleSql((f) => f === 'seed.sql'),
  ];
}

// Splits a script into statements like the mysql client: `;` (or the DELIMITER in force) ends a
// statement outside quotes and comments. Returns [{ sql, line }].
function splitSql(text) {
  const out = [];
  let delim = ';';
  let buf = '';
  let hasCode = false;
  let line = 1;
  let stmtLine = 1;
  let i = 0;
  const n = text.length;
  const lines = (s) => (s.match(/\n/g) || []).length;
  const code = (chunk) => {
    if (!hasCode) stmtLine = line;
    hasCode = true;
    buf += chunk;
    line += lines(chunk);
  };
  const push = () => {
    if (hasCode) out.push({ sql: buf.trim(), line: stmtLine });
    buf = '';
    hasCode = false;
  };

  while (i < n) {
    if ((i === 0 || text[i - 1] === '\n') && !hasCode) {
      const eol = text.indexOf('\n', i);
      const end = eol < 0 ? n : eol;
      const m = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(text.slice(i, end));
      if (m) {
        delim = m[1];
        buf = '';
        i = end + 1;
        line += 1;
        continue;
      }
    }
    const c = text[i];
    if (c === '#' || (c === '-' && text[i + 1] === '-' && /\s/.test(text[i + 2] ?? '\n'))) {
      const eol = text.indexOf('\n', i);
      const end = eol < 0 ? n : eol;
      buf += text.slice(i, end); // a comment; the newline is handled below
      i = end;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close < 0 ? n : close + 2;
      const chunk = text.slice(i, end);
      if (text[i + 2] === '!')
        code(chunk); // /*! ... */ is executed by MySQL
      else {
        buf += chunk;
        line += lines(chunk);
      }
      i = end;
      continue;
    }
    if (text.startsWith(delim, i)) {
      push();
      i += delim.length;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\' && c !== '`') j += 2;
        else if (text[j] === c && text[j + 1] === c) j += 2;
        else if (text[j] === c) break;
        else j += 1;
      }
      code(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) {
      buf += c;
      if (c === '\n') line += 1;
    } else {
      code(c);
    }
    i += 1;
  }
  push();
  return out;
}

async function connect(database) {
  const config = require('../core/config');
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
}

async function runFile(conn, file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const stmt of splitSql(text)) {
    try {
      await conn.query(stmt.sql);
    } catch (err) {
      let hint = '';
      if (err.errno === 1419) {
        hint =
          '\nMySQL refuses triggers from this user while binary logging is on. Run once as root:\n' +
          '  SET PERSIST log_bin_trust_function_creators = 1;';
      }
      err.message = `${file}:${stmt.line}: ${err.message}${hint}`;
      throw err;
    }
  }
}

// Drops every view and table of the current database (and with them their triggers).
async function emptyDatabase(conn, database) {
  const [objects] = await conn.query(
    `SELECT table_name AS name, table_type AS type FROM information_schema.tables
     WHERE table_schema = ?`,
    [database],
  );
  const names = (type) => objects.filter((o) => o.type === type).map((o) => mysql.escapeId(o.name));
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  if (names('VIEW').length) await conn.query(`DROP VIEW IF EXISTS ${names('VIEW').join(', ')}`);
  if (names('BASE TABLE').length)
    await conn.query(`DROP TABLE IF EXISTS ${names('BASE TABLE').join(', ')}`);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function load(conn) {
  await conn.query("SET time_zone = '+00:00'");
  for (const file of sqlFiles()) await runFile(conn, file);
}

// The development (or test) database, dropped and created again.
async function rebuild(database) {
  const conn = await connect();
  try {
    const db = mysql.escapeId(database);
    await conn.query(`DROP DATABASE IF EXISTS ${db}`);
    await conn.query(`CREATE DATABASE ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE ${db}`);
    await load(conn);
  } finally {
    await conn.end();
  }
}

// For tests: the test database, emptied in place and loaded again.
async function resetDb() {
  const config = require('../core/config');
  const database = config.db.database;
  if (!config.isTest) throw new Error('resetDb() only runs against the test database');
  const conn = await connect();
  try {
    const db = mysql.escapeId(database);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    await conn.query(`USE ${db}`);
    await emptyDatabase(conn, database);
    await load(conn);
  } finally {
    await conn.end();
  }
}

async function main() {
  if (process.argv.includes('--test')) process.env.NODE_ENV = 'test';
  const config = require('../core/config');
  const database = process.argv.includes('--test')
    ? process.env.DB_NAME_TEST || 'campus_notes_test'
    : config.db.database;
  const started = Date.now();
  await rebuild(database);
  console.log(`Rebuilt ${database} in ${Date.now() - started} ms: ${sqlFiles().join(', ')}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`db:reset failed: ${err.message}`);
    if (err.code === 'ECONNREFUSED')
      console.error('Is MySQL running? Check DB_HOST and DB_PORT in .env.');
    if (err.code === 'ER_ACCESS_DENIED_ERROR')
      console.error('Check DB_USER and DB_PASSWORD in .env.');
    process.exit(1);
  });
}

module.exports = { resetDb, rebuild, splitSql, sqlFiles };
