// Test helpers (ARCHITECTURE.md §10). Every test file runs in its own process against the test
// database (DB_NAME_TEST); call `before(resetDb)` once per file.
//
//   const kelvin = await agentAs('kelvin0hk');     logged in through the real login form
//   const visitor = anon();                         logged out
//   await agent.page(path)          GET  -> { status, text, $, headers }   ($ is cheerio)
//   await agent.form(path, body)    POST as a form with the CSRF token -> { status, text, $, headers }
//   await agent.json(path, body)    POST as kit.js does (Accept JSON, X-CSRF-Token) -> { status, body, headers }
//   agent.raw                       the underlying supertest agent, for anything else
//   make.user / make.post / make.comment   rows the seed lacks (see below)
const crypto = require('crypto');
const { after } = require('node:test');
const request = require('supertest');
const cheerio = require('cheerio');
const { createApp } = require('../app');
const db = require('../core/db');
const { resetDb: rebuild } = require('../db/reset');

const { q, tx } = db;

const PASSWORD = 'campus123';
const PASSWORD_HASH = '$2a$10$BQXplPmPWQ5gXkjIbT1MmOYLVK74US3DzjohpkazjNKPPp.RXNx5C'; // campus123
const DOMAINS = { 1: 'connect.hku.hk', 2: 'link.cuhk.edu.hk', 3: 'connect.ust.hk' };

let app = null;
function getApp() {
  if (!app) app = createApp();
  return app;
}

// Close the pool when the file's tests are done, so the process can exit.
after(() => db.close().catch(() => {}));

// A fresh, seeded test database.
async function resetDb() {
  await rebuild();
}

const sidOf = (res) => {
  const cookie = [].concat(res.headers['set-cookie'] || []).find((c) => c.startsWith('cn.sid='));
  return cookie ? cookie.split(';')[0] : null;
};

function wrap(raw) {
  let token = null;
  let sid = null;

  // The token belongs to the session: a new session (login, logout) means a new token.
  function remember(res) {
    const next = sidOf(res);
    if (next && next !== sid) {
      sid = next;
      token = null;
    }
    if (/html/.test(res.headers['content-type'] || '')) {
      const found = /<meta name="csrf-token" content="([^"]*)"/.exec(res.text || '');
      if (found && found[1]) token = found[1];
    }
    return res;
  }

  // Any page carries the token in the layout: an unknown path gives the 404 page when logged in,
  // and the login page (after the login wall's redirect) when logged out.
  async function ensureToken() {
    if (token) return token;
    const res = await raw.get('/__test/csrf-token').redirects(2);
    remember(res);
    if (!token) {
      const pathname = new URL(res.request.url).pathname;
      throw new Error(
        'test helpers: no csrf-token meta tag found ' +
          `(status ${res.status}; content-type ${res.headers['content-type'] || '(missing)'}; path ${pathname})`,
      );
    }
    return token;
  }

  const encode = (body = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      for (const v of [].concat(value))
        if (v !== undefined && v !== null) params.append(key, String(v));
    }
    return params.toString();
  };

  const shape = (res) => ({
    status: res.status,
    text: res.text,
    $: cheerio.load(res.text || ''),
    headers: res.headers,
  });

  return {
    raw,
    get token() {
      return token;
    },
    async page(path) {
      return shape(remember(await raw.get(path)));
    },
    async form(path, body = {}) {
      const t = await ensureToken();
      const res = await raw
        .post(path)
        .type('form')
        .send(encode({ _csrf: t, ...body }));
      return shape(remember(res));
    },
    async json(path, body = {}) {
      const t = await ensureToken();
      const res = await raw
        .post(path)
        .set('Accept', 'application/json')
        .set('X-CSRF-Token', t)
        .type('form')
        .send(encode(body));
      remember(res);
      return { status: res.status, body: res.body, headers: res.headers };
    },
  };
}

// A logged-out visitor.
function anon() {
  return wrap(request.agent(getApp()));
}

// A logged-in agent for a persona or a user from make.user(), through POST /auth/login.
async function agentAs(handle) {
  const user = await q.one('SELECT email FROM users WHERE handle = ?', [handle]);
  if (!user) throw new Error(`agentAs: no user with handle ${handle}`);
  const agent = anon();
  const res = await agent.form('/auth/login', { email: user.email, password: PASSWORD });
  if (res.status !== 303) {
    throw new Error(`agentAs(${handle}): the login answered ${res.status} instead of 303`);
  }
  return agent;
}

async function userId(handleOrId) {
  if (typeof handleOrId === 'number') return handleOrId;
  const row = await q.one('SELECT user_id FROM users WHERE handle = ?', [handleOrId]);
  if (!row) throw new Error(`make: no user with handle ${handleOrId}`);
  return row.user_id;
}

const randomHandle = () => {
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 9 }, () => ALPHABET[crypto.randomInt(36)]).join('');
};

const make = {
  // -> { userId, handle }. Password campus123; an organization also gets its organizations row.
  async user({ handle, email, university = 1, role = 'student' } = {}) {
    const h = handle || randomHandle();
    const mail = (email || `${h}@${DOMAINS[university]}`).toLowerCase();
    const res = await q(
      `INSERT INTO users (email, university_id, handle, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [mail, university, h, PASSWORD_HASH, role],
    );
    if (role === 'organization') {
      await q('INSERT INTO organizations (user_id, display_name) VALUES (?, ?)', [res.insertId, h]);
    }
    return { userId: res.insertId, handle: h };
  },

  // -> postId, with the author's Host row (alias 0), as content's publish does.
  async post({
    author,
    body = 'A test post',
    topic = 'random',
    anonymous = true,
    visibility = 'university',
    createdAt,
  } = {}) {
    const authorId = await userId(author);
    const t = await q.one('SELECT topic_id FROM topics WHERE code = ?', [topic]);
    if (!t) throw new Error(`make.post: no topic ${topic}`);
    return tx(async (c) => {
      const res = await c.q(
        `INSERT INTO posts (author_id, topic_id, body, is_anonymous, visibility, avatar_code, created_at)
         VALUES (?, ?, ?, ?, ?, 'cat', COALESCE(?, UTC_TIMESTAMP()))`,
        [authorId, t.topic_id, body, anonymous ? 1 : 0, visibility, createdAt || null],
      );
      await c.q(
        'INSERT INTO post_participants (post_id, user_id, alias_no, joined_at) VALUES (?, ?, 0, COALESCE(?, UTC_TIMESTAMP()))',
        [res.insertId, authorId, createdAt || null],
      );
      return res.insertId;
    });
  },

  // -> commentId. The author keeps their alias on the post, or takes the next one (BR-7), under
  // the post's row lock as content's addComment does; the notification triggers fire.
  async comment({ post, author, body = 'A test comment', replyTo = null } = {}) {
    const authorId = await userId(author);
    return tx(async (c) => {
      await c.q('SELECT post_id FROM posts WHERE post_id = ? FOR UPDATE', [post]);
      const mine = await c.q.one(
        'SELECT alias_no FROM post_participants WHERE post_id = ? AND user_id = ?',
        [post, authorId],
      );
      if (!mine) {
        await c.q(
          `INSERT INTO post_participants (post_id, user_id, alias_no)
           SELECT ?, ?, COALESCE(MAX(alias_no), 0) + 1 FROM post_participants WHERE post_id = ?`,
          [post, authorId, post],
        );
      }
      const res = await c.q(
        'INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (?, ?, ?, ?)',
        [post, authorId, replyTo, body],
      );
      return res.insertId;
    });
  },
};

module.exports = { resetDb, anon, agentAs, make, q, tx, getApp, PASSWORD };
