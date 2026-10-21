// ID-2 login and logout, BR-4 the login wall, ID-7 the public pages and CSRF
// (DEV_GUIDE §7, ID-T10 to ID-T17).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, agentAs, q } = require('../../../test/helpers');
const { problems, sidOf } = require('./support');

before(resetDb);

const MANDY = { email: 'mandy@connect.hku.hk', password: 'campus123' };
const loginWall = (path) => `/auth/login?next=${encodeURIComponent(path)}`;

test('ID-T10 Mandy logs in with a new session id', async () => {
  const visitor = anon();
  const page = await visitor.page('/auth/login');
  assert.equal(page.status, 200);
  const before = sidOf(page);
  assert.ok(before, 'the login page starts a session (it carries the CSRF token)');

  const res = await visitor.form('/auth/login', MANDY);
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/feed');
  const after = sidOf(res);
  assert.ok(after);
  assert.notEqual(after, before);

  const row = await q.one(
    `SELECT ABS(TIMESTAMPDIFF(SECOND, last_login_at, UTC_TIMESTAMP())) AS ago
     FROM users WHERE handle = 'mandy0hku'`,
  );
  assert.ok(Number(row.ago) <= 5);
  const me = await visitor.page('/me');
  assert.equal(me.status, 200);
  assert.equal(me.$('.me-handle').text().trim(), 'mandy0hku');
});

test('ID-T11 a wrong password and an unknown e-mail get the same answer', async () => {
  const visitor = anon();
  for (const body of [
    { email: 'mandy@connect.hku.hk', password: 'wrong-password' },
    { email: 'nobody@connect.hku.hk', password: 'campus123' },
  ]) {
    const res = await visitor.form('/auth/login', body);
    assert.equal(res.status, 400, body.email);
    assert.deepEqual(problems(res), ['Wrong e-mail or password.']);
  }
  const me = await visitor.page('/me');
  assert.equal(me.status, 303);
  assert.equal(me.headers.location, loginWall('/me'));
});

test('ID-T12 a banned account cannot log in', async () => {
  await q(`UPDATE users SET status = 'banned' WHERE handle = 'jason0ust'`);
  try {
    const visitor = anon();
    const res = await visitor.form('/auth/login', {
      email: 'jason@connect.ust.hk',
      password: 'campus123',
    });
    assert.equal(res.status, 403);
    assert.deepEqual(problems(res), ['This account is suspended.']);
    const me = await visitor.page('/me');
    assert.equal(me.status, 303);
    assert.equal(me.headers.location, loginWall('/me'));
  } finally {
    await q(`UPDATE users SET status = 'active' WHERE handle = 'jason0ust'`);
  }
});

test('ID-T13 ?next= is honoured only for internal paths', async () => {
  const ok = await anon().form('/auth/login?next=%2Fposts%2F600012', MANDY);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.location, '/posts/600012');
  for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example']) {
    const res = await anon().form(`/auth/login?next=${encodeURIComponent(next)}`, MANDY);
    assert.equal(res.status, 303, next);
    assert.equal(res.headers.location, '/feed', next);
  }
  // The login page keeps next in the form's action.
  const page = await anon().page('/auth/login?next=%2Fposts%2F600012');
  assert.equal(page.$('form[method="post"]').attr('action'), '/auth/login?next=%2Fposts%2F600012');
});

test('ID-T14 logging out ends the session', async () => {
  const mandy = await agentAs('mandy0hku');
  const res = await mandy.form('/auth/logout');
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/auth/login');
  const me = await mandy.page('/me');
  assert.equal(me.status, 303);
  assert.equal(me.headers.location, '/auth/login?next=%2Fme');
});

test('ID-T15 BR-4 the login wall', async () => {
  const visitor = anon();
  for (const path of ['/feed', '/me', '/me/settings', '/posts/600012', '/events']) {
    const res = await visitor.page(path);
    assert.equal(res.status, 303, path);
    assert.equal(res.headers.location, loginWall(path), path);
  }
  const post = await visitor.form('/me/settings', { notify_likes: '0' });
  assert.ok(visitor.token, 'the POST carried a valid CSRF token');
  assert.equal(post.status, 401);
});

test('ID-T16 the public pages work logged out, without a tab bar', async () => {
  const visitor = anon();
  for (const path of [
    '/about',
    '/contact',
    '/terms',
    '/privacy',
    '/auth/login',
    '/auth/register',
    '/auth/forgot',
  ]) {
    const res = await visitor.page(path);
    assert.equal(res.status, 200, path);
    assert.equal(res.$('nav.tabbar').length, 0, path);
  }
  const about = await visitor.page('/about');
  assert.match(about.text, /COMP3278/);
  assert.match(about.text, /not affiliated/);
  assert.equal(about.$('a.topbar-back').attr('href'), '/auth/login');

  const mandy = await agentAs('mandy0hku');
  const mine = await mandy.page('/about');
  assert.equal(mine.status, 200);
  assert.equal(mine.$('a.topbar-back').attr('href'), '/me');
  assert.equal(mine.$('nav.tabbar a[aria-current="page"]').attr('href'), '/me');

  // A logged-in user who opens a sign-up or login page goes to the feed.
  for (const path of ['/auth/login', '/auth/register', '/auth/forgot']) {
    const res = await mandy.page(path);
    assert.equal(res.status, 303, path);
    assert.equal(res.headers.location, '/feed', path);
  }
});

test('ID-T17 CSRF tokens are required; no developer shortcuts outside development', async () => {
  const before = await q.one(
    `SELECT default_anonymous, default_visibility, notify_comments, notify_likes
     FROM users WHERE handle = 'mandy0hku'`,
  );
  const mandy = await agentAs('mandy0hku');
  const res = await mandy.raw
    .post('/me/settings')
    .type('form')
    .send('default_anonymous=0&share_all=1&notify_comments=0&notify_likes=0');
  assert.equal(res.status, 403);
  const after = await q.one(
    `SELECT default_anonymous, default_visibility, notify_comments, notify_likes
     FROM users WHERE handle = 'mandy0hku'`,
  );
  assert.deepEqual(after, before);

  const visitor = anon();
  const login = await visitor.raw
    .post('/auth/login')
    .type('form')
    .send('email=mandy%40connect.hku.hk&password=campus123');
  assert.equal(login.status, 403);

  const page = await visitor.page('/auth/login');
  assert.equal(page.status, 200);
  assert.ok(!page.text.includes('/dev/login-as/'));
  assert.ok(!page.text.includes('Developer shortcuts'));
});
