// core/render.js: res.page refuses local names that Express or EJS read as options (§6.3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const request = require('supertest');
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
