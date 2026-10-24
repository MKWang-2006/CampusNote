const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, make, q } = require('../../../test/helpers');

beforeEach(resetDb);

const postIds = (page) =>
  page
    .$('.discover-feed .post-card')
    .map((_, card) => Number(page.$(card).attr('href').split('/').pop()))
    .get();

const HKU = [600013, 600012, 600011, 600007, 600006, 600005, 600004, 600003, 600002, 600001];

test('DS-T01 (CP1): All is active, with university/topic links and shared post cards', async () => {
  const page = await (await agentAs('mandy0hku')).page('/feed');
  assert.equal(page.status, 200);
  assert.deepEqual(
    page
      .$('.discover-feed .tabs a')
      .map((_, a) => page.$(a).text())
      .get(),
    ['All', 'HKU', 'Share', 'Random', 'Feelings', 'Academics', 'Careers', 'Trade', 'Food'],
  );
  assert.equal(page.$('.discover-feed [aria-current=page]').attr('href'), '/feed?tab=all');
  assert.equal(page.$('#feed-heading').text(), 'All posts');
  assert.deepEqual(postIds(page), HKU);
  assert.equal(page.$('.load-more').length, 0);
  assert.equal(page.$('.post-card[href="/posts/600011"] .author').text(), 'CUHK Hiking Club');
  assert.equal(page.$('.post-card[href="/posts/600012"] .author').length, 0);
  assert.doesNotMatch(page.$('.discover-feed').text(), /First version|DEV_GUIDE/);
});

test('DS-T02: All respects each viewer university, including Newbie and Admin', async () => {
  for (const [handle, university, ids] of [
    ['wing0cuhk', 'CUHK', [600012, 600011, 600008, 600006, 600004, 600003, 600002]],
    ['jason0ust', 'HKUST', [600014, 600012, 600011, 600006, 600004, 600003, 600002]],
    ['newbie0hk', 'HKU', HKU],
    ['admin0000', 'HKU', HKU],
  ]) {
    const page = await (await agentAs(handle)).page('/feed');
    assert.equal(page.status, 200, handle);
    assert.deepEqual(postIds(page), ids, handle);
    assert.equal(page.$('.discover-feed a[href="/feed?tab=uni"]').text(), university);
    assert.equal(
      (await (await agentAs(handle)).page('/feed?tab=uni')).$('#feed-heading').text(),
      `${university} posts`,
    );
  }
});

test('DS-T03: university and all seven topic filters keep their active link and exact order', async () => {
  const agent = await agentAs('mandy0hku');
  for (const [tab, ids] of [
    ['uni', [600013, 600012, 600007, 600006, 600005, 600002, 600001]],
    ['share', [600011, 600006]],
    ['random', [600007]],
    ['feelings', [600012, 600003]],
    ['academics', [600001]],
    ['careers', [600004]],
    ['trade', [600005]],
    ['food', [600013, 600002]],
  ]) {
    const page = await agent.page('/feed?tab=' + tab);
    assert.equal(page.status, 200, tab);
    assert.deepEqual(postIds(page), ids, tab);
    assert.equal(page.$('.discover-feed [aria-current=page]').attr('href'), '/feed?tab=' + tab);
    assert.equal(page.$('script[src="/m/discover/feed.js"]').length, 1);
  }
  const wing = await agentAs('wing0cuhk');
  assert.deepEqual(postIds(await wing.page('/feed?tab=uni')), [600011, 600008, 600003]);
  assert.deepEqual(postIds(await wing.page('/feed?tab=academics')), [600008]);
});

test('DS-T04: keyset cursors work; unknown tabs and malformed parameters return the first page', async () => {
  const agent = await agentAs('mandy0hku');
  assert.deepEqual(
    postIds(await agent.page('/feed?tab=all&before=600006')),
    [600005, 600004, 600003, 600002, 600001],
  );
  for (const query of [
    'tab=nonsense',
    'tab=all&tab=uni',
    'tab=%3Cscript%3E',
    'before=0',
    'before=-1',
    'before=1.5',
    'before=abc',
    'before=4294967296',
    'before=600006&before=600005',
  ]) {
    const page = await agent.page('/feed?' + query);
    assert.equal(page.status, 200, query);
    assert.deepEqual(postIds(page), HKU, query);
  }
  assert.deepEqual(postIds(await agent.page('/feed?tab=food&before=abc')), [600013, 600002]);
  assert.equal((await agent.page('/feed?tab=food')).$('#feed-heading').text(), 'Food posts');
  assert.deepEqual(postIds(await agent.page('/feed?tab=food&before=600013')), [600002]);
});

test('DS-T05: each filter paginates without repeats and retains its selected tab', async () => {
  const ids = [];
  for (let i = 0; i < 25; i++)
    ids.push(await make.post({ author: 'newbie0hk', topic: 'food', visibility: 'all' }));
  const agent = await agentAs('mandy0hku');
  for (const [tab, seed] of [
    ['all', HKU],
    ['uni', [600013, 600012, 600007, 600006, 600005, 600002, 600001]],
    ['food', [600013, 600002]],
  ]) {
    const first = await agent.page('/feed?tab=' + tab);
    assert.deepEqual(postIds(first), ids.slice().reverse().slice(0, 20), tab);
    const next = first.$('.load-more').attr('href');
    assert.equal(next, `/feed?tab=${tab}&before=${ids[5]}`);
    const second = await agent.page(next);
    assert.deepEqual(postIds(second), [...ids.slice(0, 5).reverse(), ...seed], tab);
    assert.equal(second.$('.load-more').length, 0);
  }
});

test('CP1 empty states: All offers compose, university/topic pages name the filter', async () => {
  const agent = await agentAs('newbie0hk');
  const food = await agent.page('/feed?tab=food&before=1');
  assert.equal(food.$('.discover-feed .empty p').text(), 'No posts in Food yet.');
  assert.equal(food.$('.discover-feed .empty a').length, 0);
  const uni = await agent.page('/feed?tab=uni&before=1');
  assert.equal(uni.$('.discover-feed .empty p').text(), 'No posts from HKU yet.');
  const all = await agent.page('/feed?before=1');
  assert.equal(all.$('.discover-feed .empty p').text(), 'No posts yet. Be the first to write one.');
  assert.equal(all.$('.discover-feed .empty a').attr('href'), '/compose');
  assert.equal(all.$('.load-more').length, 0);
});

test('CP1 boundary: exactly 20 matching posts have no Load more link', async () => {
  const ids = [];
  for (let i = 0; i < 20; i++)
    ids.push(await make.post({ author: 'newbie0hk', topic: 'random', visibility: 'all' }));
  // BR-8/BR-9 fixture: remove only the seeded matching post, without changing the list boundary.
  await q('UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = ?', [600007]);
  const page = await (await agentAs('newbie0hk')).page('/feed?tab=random');
  assert.deepEqual(postIds(page), ids.reverse());
  assert.equal(page.$('.load-more').length, 0);
});

test('DS-T19/T26 (CP1): hidden/deleted posts and anonymous identities stay out of every built tab', async () => {
  for (const handle of [
    'mandy0hku',
    'kelvin0hk',
    'wing0cuhk',
    'jason0ust',
    'newbie0hk',
    'admin0000',
  ]) {
    const agent = await agentAs(handle);
    for (const tab of [
      'all',
      'uni',
      'share',
      'random',
      'feelings',
      'academics',
      'careers',
      'trade',
      'food',
    ]) {
      const page = await agent.page('/feed?tab=' + tab);
      const content = page.$('.discover-feed').html();
      assert.equal(page.status, 200, `${handle}/${tab}`);
      assert.doesNotMatch(content, /#600009|#600010|kelvin0hk|author_id|connect\.hku\.hk/);
      if (handle !== 'kelvin0hk') assert.ok(!page.text.includes('kelvin0hk'));
    }
  }
});

test('CP1 stored text is escaped in the shared card', async () => {
  const body = '<script>alert("feed")</script>';
  const id = await make.post({ author: 'newbie0hk', body, visibility: 'all' });
  const page = await (await agentAs('mandy0hku')).page('/feed');
  assert.equal(page.$(`.post-card[href="/posts/${id}"] .post-text`).text(), body);
  assert.equal(page.$('.discover-feed script').length, 0);
  assert.ok(page.text.includes('&lt;script&gt;'));
});
