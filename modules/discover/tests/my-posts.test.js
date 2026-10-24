const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, anon, make, q } = require('../../../test/helpers');

beforeEach(resetDb);

const postIds = (page) =>
  page
    .$('.discover-my-list .post-card')
    .map((_, card) => Number(page.$(card).attr('href').split('/').pop()))
    .get();

test('DS-T15/T17 (My posts): each persona sees only their own live seed posts, newest first', async () => {
  for (const [handle, ids] of [
    ['mandy0hku', [600013, 600005, 600001]],
    ['kelvin0hk', [600012, 600007, 600002]],
    ['wing0cuhk', [600008, 600003]],
    ['jason0ust', [600014, 600004]],
    ['filmsoc00', [600006]],
    ['hikeclub0', [600011]],
    ['admin0000', []],
    ['newbie0hk', []],
  ]) {
    const page = await (await agentAs(handle)).page('/me/posts');
    assert.equal(page.status, 200, handle);
    assert.equal(page.$('h1').text(), 'My posts');
    assert.deepEqual(postIds(page), ids, handle);
    assert.equal(page.$('.discover-my-list > p').text(), 'Anonymous posts show no name to others.');
    assert.ok(page.$('a[href="/me"]').length);
    assert.doesNotMatch(page.$('.discover-my-list').html(), /#600009|#600010|author_id|@connect\./);
    assert.equal(page.$('.load-more').length, 0);
  }
});

test('DS-T16 (My posts): empty and past-end lists offer the existing compose route', async () => {
  for (const [handle, path] of [
    ['newbie0hk', '/me/posts'],
    ['mandy0hku', '/me/posts?before=1'],
  ]) {
    const page = await (await agentAs(handle)).page(path);
    assert.deepEqual(postIds(page), []);
    assert.equal(page.$('.discover-my-list .empty p').text(), 'You have not posted yet.');
    assert.equal(page.$('.discover-my-list .empty a').text(), 'Write a post');
    assert.equal(page.$('.discover-my-list .empty a').attr('href'), '/compose');
    assert.equal(page.$('.load-more').length, 0);
  }
});

test('DS-T17: keyset cursor works; invalid or repeated cursors fall back to the first page', async () => {
  const agent = await agentAs('mandy0hku');
  assert.deepEqual(postIds(await agent.page('/me/posts?before=600005')), [600001]);
  for (const query of [
    'before=0',
    'before=-1',
    'before=abc',
    'before=1.5',
    'before=4294967296',
    'before=600005&before=600001',
    'before=%27%20OR%201%3D1',
  ]) {
    const page = await agent.page('/me/posts?' + query);
    assert.equal(page.status, 200, query);
    assert.deepEqual(postIds(page), [600013, 600005, 600001], query);
  }
});

test('DS-5 ownership: query parameters cannot select another author; login is required', async () => {
  const agent = await agentAs('mandy0hku');
  const page = await agent.page('/me/posts?userId=3&author_id=3&handle=kelvin0hk');
  assert.deepEqual(postIds(page), [600013, 600005, 600001]);
  const loggedOut = await anon().page('/me/posts?before=600005');
  assert.ok([302, 303].includes(loggedOut.status));
  const login = new URL(loggedOut.headers.location, 'http://localhost');
  assert.equal(login.pathname, '/auth/login');
  assert.equal(login.searchParams.get('next'), '/me/posts?before=600005');
});

test('DS-5 pagination: 25 own posts span two pages without repeats or other authors', async () => {
  const ids = [];
  const createdAt = new Date();
  for (let i = 0; i < 25; i++) ids.push(await make.post({ author: 'newbie0hk', createdAt }));
  await make.post({ author: 'mandy0hku' });
  const agent = await agentAs('newbie0hk');
  const first = await agent.page('/me/posts');
  assert.deepEqual(postIds(first), ids.slice().reverse().slice(0, 20));
  const next = first.$('.load-more').attr('href');
  assert.equal(next, `/me/posts?before=${ids[5]}`);
  const second = await agent.page(next);
  assert.deepEqual(postIds(second), ids.slice(0, 5).reverse());
  assert.equal(second.$('.load-more').length, 0);
  assert.equal(new Set([...postIds(first), ...postIds(second)]).size, 25);
});

test('DS-5 boundary: exactly 20 own posts have no Load more link', async () => {
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push(await make.post({ author: 'newbie0hk' }));
  const page = await (await agentAs('newbie0hk')).page('/me/posts');
  assert.deepEqual(postIds(page), ids.reverse());
  assert.equal(page.$('.load-more').length, 0);
});

test('DS-T19/T26 (My posts): deleted/hidden posts disappear and anonymous cards never identify authors', async () => {
  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.form('/posts/600005/delete')).status, 303);
  // BR-9 fixture: moderation belongs to Messages; the shared view removes this row.
  await q(
    "INSERT INTO hidden_content (target_type, target_id, hidden_by, reason) VALUES ('post', ?, ?, ?)",
    [600013, 1, 'My posts visibility test'],
  );
  assert.deepEqual(postIds(await mandy.page('/me/posts')), [600001]);
  for (const handle of ['mandy0hku', 'kelvin0hk', 'jason0ust']) {
    const page = await (await agentAs(handle)).page('/me/posts');
    page.$('.discover-my-list .post-card').each((_, card) => {
      const id = Number(page.$(card).attr('href').split('/').pop());
      if (id !== 600004) assert.equal(page.$(card).find('.author').length, 0);
    });
    assert.doesNotMatch(page.$('.discover-my-list').html(), /kelvin0hk|#600009|#600010|author_id/);
  }
});

test('DS-5 stored text stays escaped in shared cards', async () => {
  const body = '<script>alert("my posts")</script>' + '字'.repeat(700);
  const id = await make.post({ author: 'newbie0hk', body });
  const page = await (await agentAs('newbie0hk')).page('/me/posts');
  assert.equal(page.$(`.post-card[href="/posts/${id}"] .post-text`).text(), body);
  assert.equal(page.$('.discover-my-list script').length, 0);
  assert.ok(page.text.includes('&lt;script&gt;'));
});
