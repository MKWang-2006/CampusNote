const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs } = require('../../../test/helpers');
beforeEach(resetDb);

// These assertions really execute. Strict mode makes unmet cross-module requirements fail CI.
const pending = (reason) => (process.env.CONTENT_STRICT_ACCEPTANCE === '1' ? {} : { todo: reason });

test(
  'CT-T22 integration: Watching contains the saved post, then removes it',
  pending('Discover /me/watching is still a placeholder'),
  async () => {
    const n = await agentAs('newbie0hk');
    assert.deepEqual((await n.json('/posts/600003/watch', { watch: 1 })).body, {
      watched: true,
      watchCount: 1,
    });
    const saved = await n.page('/me/watching');
    assert.equal(saved.status, 200);
    const visibleWhenSaved = saved.$('a[href="/posts/600003"]').length;
    assert.deepEqual((await n.json('/posts/600003/watch', { watch: 0 })).body, {
      watched: false,
      watchCount: 0,
    });
    const removed = await n.page('/me/watching');
    assert.equal(removed.$('a[href="/posts/600003"]').length, 0);
    assert.ok(visibleWhenSaved > 0, 'The Watching page never displayed the saved post');
  },
);

test(
  'CT definition of done: an anonymous author handle is absent from the entire HTML',
  pending('Shared account sidebar conflicts with whole-page anonymity; issue #5'),
  async () => {
    const own = await (await agentAs('kelvin0hk')).page('/posts/600012');
    assert.equal(own.status, 200);
    assert.ok(!own.$('.content-post').html().includes('kelvin0hk'));
    assert.ok(
      !own.text.includes('kelvin0hk'),
      'The shared account sidebar still contains the author-viewer handle',
    );
  },
);
