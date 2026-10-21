// BR-4: every page except the visitor pages needs a login (ARCHITECTURE.md §4 step 8).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, agentAs } = require('../helpers');
const { moduleRoutes, loadModules } = require('./routes-helper');

before(resetDb);

const publicPaths = new Set(loadModules().flatMap((m) => m.publicRoutes));
const routes = moduleRoutes();
const isPublic = (r) => publicPaths.has(r.path);

test('a visitor opening any other page is sent to the login page with ?next=', async () => {
  const visitor = anon();
  const pages = routes.filter((r) => r.method === 'GET' && !isPublic(r)).map((r) => r.url);
  assert.ok(pages.length > 10);
  for (const url of [...new Set(pages), '/ME/Settings/', '/does-not-exist']) {
    const res = await visitor.page(url);
    assert.equal(res.status, 303, url);
    assert.equal(res.headers.location, `/auth/login?next=${encodeURIComponent(url)}`, url);
  }
});

test('a visitor posting to any other route gets 401, even with a valid CSRF token', async () => {
  const visitor = anon();
  for (const r of routes.filter((x) => x.method === 'POST' && !isPublic(x))) {
    const res = await visitor.form(r.url, {});
    assert.equal(res.status, 401, `POST ${r.url}`);
  }
  const res = await visitor.json('/posts/600001/like', { like: 1 });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Please log in first');
});

test('the public pages open without a login', async () => {
  const visitor = anon();
  for (const r of routes.filter((x) => x.method === 'GET' && isPublic(x))) {
    const res = await visitor.page(r.url);
    assert.ok(
      !(res.status === 303 && String(res.headers.location).startsWith('/auth/login?next=')),
      `${r.url} sent a visitor to the login page`,
    );
    assert.ok(res.status < 500, `${r.url} answered ${res.status}`);
  }
});

test('/ sends visitors to the login page and members to the feed', async () => {
  assert.equal((await anon().page('/')).headers.location, '/auth/login');
  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.page('/')).headers.location, '/feed');
});

test('the development tools do not exist outside development (BB-5)', async () => {
  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.page('/dev/mailbox')).status, 404);
  assert.equal((await mandy.page('/dev/login-as/admin0000')).status, 404);
  assert.equal((await anon().page('/dev/login-as/admin0000')).status, 303);
});
