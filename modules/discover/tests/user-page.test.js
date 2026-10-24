const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, anon, make, q } = require('../../../test/helpers');

beforeEach(resetDb);
const postIds = (page) =>
  page
    .$('.discover-user .post-card')
    .map((_, a) => Number(page.$(a).attr('href').split('/').pop()))
    .get();

test('DS-T20: student profile shows public fields and only named posts visible to the viewer', async () => {
  for (const [viewer, ids] of [
    ['kelvin0hk', [600013]],
    ['wing0cuhk', []],
    ['jason0ust', []],
  ]) {
    const page = await (await agentAs(viewer)).page('/u/mandy0hku');
    assert.equal(page.status, 200);
    assert.equal(page.$('h1').text(), 'mandy0hku');
    assert.match(page.$('.user-summary').text(), /mandy0hku[\s\S]*HKU[\s\S]*Year 3, FinTech/);
    assert.equal(page.$('.user-summary img').attr('src'), '/static/img/avatars/cat.svg');
    assert.deepEqual(postIds(page), ids);
    assert.equal(page.$('.user-summary a').attr('href'), '/messages/new?to=mandy0hku');
    assert.equal(page.$('.topbar-back').attr('href'), '/feed');
    assert.equal(page.$('.own-page-note').length, 0);
    if (!ids.length) assert.equal(page.$('.discover-user .empty p').text(), 'No public posts yet.');
  }
});

test('DS-T21: anonymous posts stay absent even on the author own public page', async () => {
  for (const viewer of ['mandy0hku', 'kelvin0hk']) {
    const page = await (await agentAs(viewer)).page('/u/kelvin0hk');
    assert.deepEqual(postIds(page), []);
    assert.equal(page.$('.discover-user .empty p').text(), 'No public posts yet.');
    assert.equal(page.$('.own-page-note').length, viewer === 'kelvin0hk' ? 1 : 0);
    assert.equal(page.$('.user-summary a').length, viewer === 'kelvin0hk' ? 0 : 1);
    if (viewer === 'kelvin0hk')
      assert.equal(
        page.$('.own-page-note').text(),
        'Only posts that show your handle appear here.',
      );
  }
  const own = await (await agentAs('mandy0hku')).page('/u/mandy0hku');
  assert.deepEqual(postIds(own), [600013]);
  assert.equal(own.$('.user-summary a').length, 0);
});

test('DS-T22: organization name, handle, logo and description; avatar fallback without a logo', async () => {
  const agent = await agentAs('wing0cuhk');
  const page = await agent.page('/u/filmsoc00');
  assert.equal(page.$('h1').text(), 'HKU Film Society');
  assert.match(
    page.$('.user-summary').text(),
    /filmsoc00[\s\S]*HKU[\s\S]*Weekly screenings and director talks\./,
  );
  assert.equal(page.$('.user-summary img').attr('src'), '/static/seed/org-filmsoc.svg');
  assert.deepEqual(postIds(page), [600006]);
  // DS-6 fixture: public profile data is owned by Identity, not Discover business writes.
  await q('UPDATE organizations SET logo_path = NULL WHERE user_id = ?', [7]);
  assert.equal(
    (await agent.page('/u/filmsoc00')).$('.user-summary img').attr('src'),
    '/static/img/avatars/film.svg',
  );
});

test('DS-T22: handles are lower-cased; malformed, unknown and logged-out requests are handled safely', async () => {
  const agent = await agentAs('mandy0hku');
  assert.deepEqual(postIds(await agent.page('/u/JASON0UST')), [600004]);
  for (const handle of [
    'nobody000',
    'Bad-Handle',
    'abc',
    'abcdefghij',
    '%27OR1%3D1--',
    '%3Cscript%3E',
  ]) {
    assert.equal((await agent.page('/u/' + handle)).status, 404, handle);
  }
  const visitor = await anon().page('/u/filmsoc00?before=600006');
  assert.ok([302, 303].includes(visitor.status));
  assert.equal(
    new URL(visitor.headers.location, 'http://localhost').searchParams.get('next'),
    '/u/filmsoc00?before=600006',
  );
});

test('DS-T22: banned users keep their public page and named posts, without Message', async () => {
  await q("UPDATE users SET status = 'banned' WHERE user_id = ?", [5]);
  const page = await (await agentAs('kelvin0hk')).page('/u/jason0ust');
  assert.equal(page.status, 200);
  assert.deepEqual(postIds(page), [600004]);
  assert.equal(page.$('.user-summary a').length, 0);
});

test('DS-6 pagination: 25 visible named posts span 20 then 5, filtering before the limit', async () => {
  const ids = [];
  for (let i = 0; i < 25; i++)
    ids.push(await make.post({ author: 'newbie0hk', anonymous: false, visibility: 'all' }));
  await make.post({ author: 'newbie0hk', anonymous: true, visibility: 'all' });
  await make.post({ author: 'newbie0hk', anonymous: false, visibility: 'university' });
  await make.post({ author: 'mandy0hku', anonymous: false, visibility: 'all' });
  const agent = await agentAs('wing0cuhk');
  const first = await agent.page('/u/NEWBIE0HK');
  assert.deepEqual(postIds(first), ids.slice().reverse().slice(0, 20));
  const next = first.$('.load-more').attr('href');
  assert.equal(next, `/u/newbie0hk?before=${ids[5]}`);
  const second = await agent.page(next);
  assert.deepEqual(postIds(second), ids.slice(0, 5).reverse());
  assert.equal(second.$('.load-more').length, 0);
  assert.equal(new Set([...postIds(first), ...postIds(second)]).size, 25);
});

test('DS-6 boundaries: exactly 20, invalid cursors and past-end empty state', async () => {
  for (let i = 0; i < 20; i++) await make.post({ author: 'newbie0hk', anonymous: false });
  const agent = await agentAs('mandy0hku');
  const first = await agent.page('/u/newbie0hk');
  assert.equal(postIds(first).length, 20);
  assert.equal(first.$('.load-more').length, 0);
  for (const query of [
    'before=0',
    'before=-1',
    'before=abc',
    'before=1.5',
    'before=4294967296',
    'before=1&before=2',
  ]) {
    assert.deepEqual(postIds(await agent.page('/u/newbie0hk?' + query)), postIds(first));
  }
  const empty = await agent.page('/u/newbie0hk?before=1');
  assert.equal(empty.$('.discover-user .empty p').text(), 'No public posts yet.');
  assert.equal(empty.$('.load-more').length, 0);
});

test('DS-6 privacy: live view removes named hidden/deleted posts; all seed profiles respect anonymity', async () => {
  await q('UPDATE posts SET is_anonymous = 0 WHERE post_id IN (?)', [[600009, 600010]]);
  for (const viewer of ['mandy0hku', 'wing0cuhk', 'jason0ust', 'newbie0hk', 'admin0000']) {
    const agent = await agentAs(viewer);
    for (const [handle, allowed] of [
      ['mandy0hku', viewer === 'wing0cuhk' || viewer === 'jason0ust' ? [] : [600013]],
      ['kelvin0hk', []],
      ['wing0cuhk', []],
      ['jason0ust', [600004]],
      ['filmsoc00', [600006]],
      ['hikeclub0', [600011]],
    ]) {
      const page = await agent.page('/u/' + handle);
      assert.deepEqual(postIds(page), allowed, `${viewer}/${handle}`);
      assert.doesNotMatch(
        page.$('.discover-user').html(),
        /author_id|user_id|@connect\.|#600009|#600010/,
      );
      if (handle !== 'kelvin0hk') assert.doesNotMatch(page.text, /kelvin0hk/);
    }
  }
});

test('DS-6 stored profile and post text is escaped', async () => {
  const text = '<script>alert("profile")</script>';
  await q('UPDATE users SET bio = ? WHERE user_id = ?', [text, 2]);
  await q('UPDATE organizations SET display_name = ?, description = ? WHERE user_id = ?', [
    text,
    text,
    7,
  ]);
  const id = await make.post({ author: 'mandy0hku', anonymous: false, body: text });
  const agent = await agentAs('newbie0hk');
  const page = await agent.page('/u/mandy0hku');
  assert.equal(page.$('.user-summary .pre').text(), text);
  assert.equal(page.$(`.post-card[href="/posts/${id}"] .post-text`).text(), text);
  const org = await agent.page('/u/filmsoc00');
  assert.equal(org.$('h1').text(), text);
  assert.equal(org.$('.user-summary .pre').text(), text);
  assert.equal(org.$('.discover-user script').length, 0);
  assert.ok(org.text.includes('&lt;script&gt;'));
});
