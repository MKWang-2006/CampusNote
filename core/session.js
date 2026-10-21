// Sessions in the `sessions` table (BB-2). A small express-session store on the shared pool,
// so sessions survive restarts and the tests need no extra connection to close.
const session = require('express-session');
const config = require('./config');
const { q } = require('./db');

const MAX_AGE_MS = 14 * 24 * 3600 * 1000; // two weeks

class MySqlStore extends session.Store {
  get(sid, cb) {
    q.one('SELECT data FROM sessions WHERE session_id = ? AND expires >= UNIX_TIMESTAMP()', [sid])
      .then((row) => cb(null, row ? JSON.parse(row.data) : null))
      .catch(cb);
  }

  set(sid, sess, cb) {
    const expires = expiresAt(sess);
    q(
      `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE expires = new.expires, data = new.data`,
      [sid, expires, JSON.stringify(sess)],
    )
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }

  touch(sid, sess, cb) {
    q('UPDATE sessions SET expires = ? WHERE session_id = ?', [expiresAt(sess), sid])
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }

  destroy(sid, cb) {
    q('DELETE FROM sessions WHERE session_id = ?', [sid])
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }
}

function expiresAt(sess) {
  const ms = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : 0;
  return Math.round((ms || Date.now() + MAX_AGE_MS) / 1000);
}

// Old rows are removed now and then, outside the request path.
async function clearExpired() {
  await q('DELETE FROM sessions WHERE expires < UNIX_TIMESTAMP()');
}

function sessions() {
  if (!config.isTest) {
    const timer = setInterval(() => clearExpired().catch(() => {}), 15 * 60 * 1000);
    timer.unref();
  }
  return session({
    name: 'cn.sid',
    secret: config.sessionSecret,
    store: new MySqlStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: MAX_AGE_MS },
  });
}

module.exports = { sessions, MySqlStore, clearExpired };
