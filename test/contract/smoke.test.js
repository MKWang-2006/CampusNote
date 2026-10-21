// Every module's smoke pages open for every persona (ARCHITECTURE.md §5 `smoke`), inside the
// layout, without template slips such as "undefined" or "[object Object]".
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, anon } = require('../helpers');
const { loadModules } = require('./routes-helper');

before(resetDb);

const PERSONAS = [
  'admin0000',
  'mandy0hku',
  'kelvin0hk',
  'wing0cuhk',
  'jason0ust',
  'newbie0hk',
  'filmsoc00',
  'hikeclub0',
];
const pages = [...new Set(loadModules().flatMap((m) => m.smoke))];

for (const handle of PERSONAS) {
  test(`smoke pages answer 200 for ${handle}`, async () => {
    const agent = await agentAs(handle);
    for (const url of pages) {
      const res = await agent.page(url);
      assert.equal(res.status, 200, `${handle} ${url}`);
      assert.equal(res.$('header.topbar').length, 1, `${url}: no layout`);
      assert.ok(res.$('meta[name="csrf-token"]').attr('content'), `${url}: no CSRF meta tag`);
      const text = res.$('body').text();
      for (const slip of ['undefined', '[object Object]', 'NaN', 'Invalid Date']) {
        assert.ok(!text.includes(slip), `${handle} ${url} shows "${slip}"`);
      }
    }
  });
}

test('an unknown page is a 404 inside the layout, or JSON for kit.js', async () => {
  const mandy = await agentAs('mandy0hku');
  const page = await mandy.page('/no-such-page');
  assert.equal(page.status, 404);
  assert.match(page.$('main').text(), /This page does not exist or you cannot see it/);
  assert.equal(page.$('nav.tabbar').length, 1);
  const json = await mandy.raw.get('/no-such-page').set('Accept', 'application/json');
  assert.equal(json.status, 404);
  assert.equal(json.body.error, 'This page does not exist or you cannot see it');
});

test('security headers are set on every response', async () => {
  const res = await anon().page('/auth/login');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['referrer-policy'], 'same-origin');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('static files, avatars, seed images and module files are served', async () => {
  const visitor = anon();
  for (const url of [
    '/static/css/kit.css',
    '/static/js/kit.js',
    '/static/img/avatars/cat.svg',
    '/static/seed/film-night.svg',
    '/m/identity/banner.svg',
  ]) {
    // prettier-ignore
    assert.equal((await visitor.page(url)).status, 200, url);
  }
});
