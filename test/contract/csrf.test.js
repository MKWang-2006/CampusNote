// Every POST needs the session's CSRF token (ARCHITECTURE.md §4 step 4, PRODUCT_SPEC §7).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, agentAs } = require('../helpers');
const { moduleRoutes } = require('./routes-helper');

before(resetDb);

const MESSAGE = 'Your session expired or the form is out of date. Go back and try again.';

test('a logged-in POST without a token, or with a wrong one, is refused with 403 on every route', async () => {
  const mandy = await agentAs('mandy0hku');
  const posts = moduleRoutes().filter((r) => r.method === 'POST');
  assert.ok(posts.length > 5);
  for (const r of posts) {
    const none = await mandy.raw.post(r.url).type('form').send('x=1');
    assert.equal(none.status, 403, `POST ${r.url} without a token`);
    const wrong = await mandy.raw.post(r.url).type('form').send('_csrf=0000&x=1');
    assert.equal(wrong.status, 403, `POST ${r.url} with a wrong token`);
  }
});

test('the refusal explains itself, as a page or as JSON for kit.js', async () => {
  const mandy = await agentAs('mandy0hku');
  const page = await mandy.raw.post('/me/settings').type('form').send('notify_likes=0');
  assert.equal(page.status, 403);
  assert.match(page.text, /Your session expired or the form is out of date/);
  const json = await mandy.raw
    .post('/posts/600001/like')
    .set('Accept', 'application/json')
    .set('X-CSRF-Token', 'not-the-token')
    .type('form')
    .send('like=1');
  assert.equal(json.status, 403);
  assert.deepEqual(json.body, { error: MESSAGE, status: 403 });
});

test('a visitor needs the token too (login form)', async () => {
  const res = await anon()
    .raw.post('/auth/login')
    .type('form')
    .send('email=mandy@connect.hku.hk&password=campus123');
  assert.equal(res.status, 403);
});

test('a multipart form carries the token in its action URL; without it the POST is refused', async () => {
  const mandy = await agentAs('mandy0hku');
  const res = await mandy.raw.post('/compose').field('body', 'hello').field('topic', 'random');
  assert.equal(res.status, 403);
});

test('a token from another session does not work', async () => {
  const mandy = await agentAs('mandy0hku');
  const kelvin = await agentAs('kelvin0hk');
  await kelvin.page('/me'); // make sure Kelvin's token is known
  await mandy.page('/me');
  const res = await mandy.raw
    .post('/me/settings')
    .type('form')
    .send(`_csrf=${kelvin.token}&notify_likes=0`);
  assert.equal(res.status, 403);
});
