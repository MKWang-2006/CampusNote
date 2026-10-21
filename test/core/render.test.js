// core/render.js: res.page refuses local names that Express or EJS read as options (§6.3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const request = require('supertest');
const cheerio = require('cheerio');
const { installRender } = require('../../core/render');

const app = express();
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, '..', '..', 'views')]); // as app.js: includes resolve from here
Object.assign(app.locals, {
  ui: require('../../core/ui'),
  ref: require('../../core/ref'),
  me: null,
  badges: {},
  flash: null,
  csrfToken: '',
  csrfField: () => '',
  csrfUrl: (p) => p,
  isDev: false,
});
app.use(installRender([]));
app.get('/ok', (req, res) => res.page('errors/404', { title: 'Fine', message: 'Hello' }));
app.get('/clash', (req, res) => res.page('errors/404', { title: 'Clash', settings: {} }));
const memberPage = (locals) => (req, res) => {
  req.me = { handle: 'testuser1', universityCode: 'HKU', avatarCode: 'cat' };
  res.locals.me = req.me;
  res.locals.badges = { messages: 3 };
  res.page('errors/404', { title: 'Member page', message: 'Hello', ...locals });
};
app.get('/me/tickets', memberPage({ tab: 'me' }));
app.get('/compose', memberPage({ tab: 'compose', hideTabs: true }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => res.status(500).send(err.message));

test('a page renders inside the layout', async () => {
  const res = await request(app).get('/ok');
  assert.equal(res.status, 200);
  assert.match(res.text, /<title>[^<]*Fine/);
  assert.ok(res.text.includes('Hello'));
});

test('a reserved local name fails loudly, naming the clash', async () => {
  const res = await request(app).get('/clash');
  assert.equal(res.status, 500);
  assert.equal(
    res.text,
    `res.page('errors/404'): the local name "settings" is reserved; rename it`,
  );
});

test('public pages offer a keyboard skip link and omit signed-in navigation', async () => {
  const res = await request(app).get('/ok');
  const $ = cheerio.load(res.text);
  assert.equal($('.skip-link').attr('href'), '#main');
  assert.equal($('#main').attr('tabindex'), '-1');
  assert.equal($('.desktop-sidebar, nav.tabbar').length, 0);
});

test('ticket pages expose Events as the desktop section and keep compact navigation', async () => {
  const res = await request(app).get('/me/tickets');
  assert.equal(res.status, 200);
  const $ = cheerio.load(res.text);
  assert.equal($('.sidebar-nav a[aria-current="page"]').attr('href'), '/events');
  assert.equal($('nav.tabbar a[aria-current="page"]').attr('href'), '/me');
  assert.equal($('.sidebar-nav .badge').text(), '3');
  assert.equal($('.sidebar-account strong').text(), 'testuser1');
});

test('focused compose pages retain desktop navigation while hiding compact tabs', async () => {
  const res = await request(app).get('/compose');
  assert.equal(res.status, 200);
  const $ = cheerio.load(res.text);
  assert.equal($('.desktop-sidebar').length, 1);
  assert.equal($('.sidebar-compose[aria-current="page"]').attr('href'), '/compose');
  assert.equal($('nav.tabbar').length, 0);
});
