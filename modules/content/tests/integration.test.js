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

test('CT-T09: anonymous content hides identities while own-account navigation remains named', async () => {
  for (const viewer of ['mandy0hku', 'kelvin0hk', 'wing0cuhk', 'newbie0hk']) {
    const page = await (await agentAs(viewer)).page('/posts/600012');
    assert.equal(page.status, 200);
    const content = page.$('.content-post').html();
    assert.ok(content, 'The complete Content area must be present');
    assert.equal(page.$('.sidebar-account strong').text(), viewer);
    for (const hidden of ['kelvin0hk', 'mandy0hku', 'wing0cuhk', 'jason0ust']) {
      assert.ok(!content.includes(hidden), `${viewer} sees ${hidden} in anonymous content`);
      if (hidden !== viewer)
        assert.ok(!page.text.includes(hidden), `${viewer} sees another participant's identity`);
    }
  }
});
