// BR-5, BR-8, BR-9: a post you cannot see does not exist for you (404), wherever you ask.
// Until content, discover and messages are built these routes answer 404 anyway; the test then
// keeps them honest as they arrive.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs } = require('../helpers');

before(resetDb);

// Wing (CUHK) cannot see HKU-only 600001, 600005, 600007, 600013 or HKUST-only 600014;
// nobody can see deleted 600009 or hidden 600010.
const HIDDEN_FROM_WING = [600001, 600005, 600007, 600013, 600014, 600009, 600010];

test('Wing gets 404 for every page and action about posts she cannot see', async () => {
  const wing = await agentAs('wing0cuhk');
  for (const id of HIDDEN_FROM_WING) {
    for (const url of [`/posts/${id}`, `/messages/new?post=${id}`, `/report?type=post&id=${id}`]) {
      assert.equal((await wing.page(url)).status, 404, url);
    }
    for (const [url, body] of [
      [`/posts/${id}/like`, { like: 1 }],
      [`/posts/${id}/watch`, { watch: 1 }],
      [`/posts/${id}/comments`, { body: 'hello' }],
      [`/messages/new?post=${id}`, { body: 'hello' }],
    ]) {
      assert.equal((await wing.json(url, body)).status, 404, `POST ${url}`);
    }
  }
});

test('feeds never list posts the viewer cannot see', async () => {
  const wing = await agentAs('wing0cuhk');
  const feed = await wing.page('/feed');
  assert.equal(feed.status, 200);
  const shown = feed
    .$('.post-no')
    .map((i, el) => feed.$(el).text())
    .get();
  assert.ok(shown.length > 0);
  for (const id of HIDDEN_FROM_WING) assert.ok(!shown.includes(`#${id}`), `#${id} in Wing's feed`);
  const mandy = await agentAs('mandy0hku');
  const mine = await mandy.page('/feed');
  const ids = mine
    .$('.post-no')
    .map((i, el) => mine.$(el).text())
    .get();
  assert.equal(ids.length, 10); // DATA_MODEL §5: an HKU viewer sees 10 live posts
  assert.ok(!ids.includes('#600008') && !ids.includes('#600009') && !ids.includes('#600010'));
});
