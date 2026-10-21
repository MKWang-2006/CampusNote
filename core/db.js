// The database helpers every module uses (ARCHITECTURE.md §6.1).
//   q(sql, params)        SELECT -> array of rows; INSERT/UPDATE/DELETE -> { affectedRows, insertId }
//   q.one(sql, params)    first row or null
//   tx(async t => ...)    BEGIN ... COMMIT; t.q and t.q.one run on the transaction's connection;
//                         a throw rolls back and is re-thrown
//   isDuplicate(err)      true for a duplicate key (1062)
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',
  timezone: 'Z', // DATETIME values are UTC; they arrive as Date objects
  dateStrings: false,
  connectionLimit: 10,
  waitForConnections: true,
  supportBigNumbers: true, // BIGINT ids come back as numbers while they are below 2^53
});

// Every connection works in UTC, so DEFAULT CURRENT_TIMESTAMP and UTC_TIMESTAMP() agree (D16).
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

function bind(runner) {
  const q = async (sql, params = []) => {
    const [result] = await runner.query(sql, params);
    return result;
  };
  q.one = async (sql, params = []) => {
    const rows = await q(sql, params);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  };
  return q;
}

const q = bind(pool);

async function tx(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work({ q: bind(conn) });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

const isDuplicate = (err) => Boolean(err) && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY');

async function close() {
  await pool.end();
}

module.exports = { q, tx, isDuplicate, pool, close };
