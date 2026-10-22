const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, make, q } = require('../../../test/helpers');
before(resetDb);

test('CT-T01/T02: compose uses shared form, upload and preference contracts', async () => {
  for (const [handle, shown, all] of [
    ['mandy0hku', false, false],
    ['newbie0hk', false, false],
    ['kelvin0hk', false, true],
    ['jason0ust', true, true],
  ]) {
    const p = await (await agentAs(handle)).page('/compose');
    assert.equal(p.status, 200);
    assert.equal(p.$('.tabbar').length, 0);
    assert.equal(p.$('form[data-leave-guard]').attr('enctype'), 'multipart/form-data');
    assert.equal(p.$('textarea[name=body]').attr('data-max'), '750');
    assert.equal(p.$('input[data-preview=images]').length, 1);
    assert.equal(p.$('input[name=topic]').length, 7);
    assert.equal(p.$('input[type=checkbox][name=show_handle]').is(':checked'), shown);
    assert.equal(p.$('input[type=checkbox][name=all_universities]').is(':checked'), all);
  }
  await q("UPDATE users SET default_anonymous = 0 WHERE handle = 'newbie0hk'");
  assert.ok(
    (await (await agentAs('newbie0hk')).page('/compose'))
      .$('input[type=checkbox][name=show_handle]')
      .is(':checked'),
  );
  await q("UPDATE users SET default_anonymous = 1 WHERE handle = 'newbie0hk'");
});

test('CT-T08/T09: post actions, anonymous privacy including the author, public identities', async () => {
  const mandy = await agentAs('mandy0hku');
  const p = await mandy.page('/posts/600012');
  assert.equal(p.status, 200);
  for (const value of ['#600012', 'Feelings', 'HKU']) assert.ok(p.text.includes(value));
  assert.equal(p.$('.like[aria-pressed=true] [data-bind=likeCount]').text(), '3');
  assert.equal(p.$('.watch[aria-pressed=true] [data-bind=watchCount]').text(), '1');
  assert.equal(p.$('a[href="/messages/new?post=600012"]').length, 1);
  assert.equal(p.$('a[href="/report?type=post&id=600012"]').length, 1);
  assert.equal(p.$('form[action="/posts/600012/delete"]').length, 0);
  for (const h of ['kelvin0hk', 'wing0cuhk', 'jason0ust', 'author_id'])
    assert.ok(!p.text.includes(h));
  const own = await (await agentAs('kelvin0hk')).page('/posts/600012');
  // D22's shared account sidebar names the signed-in viewer, not the anonymous author.
  assert.ok(!own.$('.content-post').html().includes('kelvin0hk'));
  assert.equal(own.$('.sidebar-account strong').text(), 'kelvin0hk');
  assert.equal(own.$('form[action="/posts/600012/delete"]').length, 1);
  assert.equal(own.$('a[href="/messages/new?post=600012"]').length, 0);
  assert.equal(own.$('a[href="/report?type=post&id=600012"]').length, 0);
  assert.equal((await mandy.page('/posts/600004')).$('a[href="/u/jason0ust"]').text(), 'jason0ust');
  assert.equal(
    (await mandy.page('/posts/600006')).$('a[href="/u/filmsoc00"]').text(),
    'HKU Film Society',
  );
});

test('CT-T10/T15/T27: flat aliases, hidden/deleted anchors and reply targeting', async () => {
  const a = await agentAs('mandy0hku');
  const p = await a.page('/posts/600012');
  assert.deepEqual(
    p
      .$('.comment')
      .map((_, e) => p.$(e).attr('id'))
      .get(),
    ['c10', 'c11', 'c12', 'c13', 'c14'],
  );
  assert.deepEqual(
    p
      .$('.content-alias')
      .map((_, e) => p.$(e).text())
      .get(),
    ['Alice', 'Bob', 'Carol', 'Host', 'Alice'],
  );
  assert.match(p.$('#c12').text(), /\[hidden by a moderator\]/);
  assert.equal(p.$('#c12 a, #c12 button').length, 0);
  assert.match(p.$('#c13').text(), /replying to Alice/);
  assert.match(p.$('#c14').text(), /replying to Host/);
  assert.equal(p.$('#c11 a[href="/messages/new?post=600012&alias=2"]').length, 1);
  assert.equal(p.$('#c13 a[href="/messages/new?post=600012&alias=0"]').length, 1);
  assert.equal(p.$('#c10 form[action="/comments/10/delete"]').length, 1);
  assert.equal(p.$('#c10 a[href*="messages"]').length, 0);
  assert.equal(p.$('#c14 form[action="/comments/14/delete"]').length, 1);
  assert.equal(p.$('#c14 a[href*="messages"]').length, 0);
  assert.match(p.$('#comment-box').text(), /You will appear as Alice/);
  const deleted = await a.page('/posts/600002');
  assert.match(deleted.$('#c6').text(), /\[deleted\]/);
  assert.deepEqual(
    deleted
      .$('.comment')
      .map((_, e) => deleted.$(e).attr('id'))
      .get(),
    ['c3', 'c4', 'c5', 'c6'],
  );
  const newbie = await agentAs('newbie0hk');
  const reply = await newbie.page('/posts/600012?reply=11');
  assert.equal(reply.$('input[name=reply_to]').val(), '11');
  assert.match(reply.$('#comment-box').text(), /Replying to Bob/);
  assert.equal(reply.$('#comment-box a').attr('href'), '/posts/600012#comment-box');
  const hidden = await newbie.page('/posts/600012?reply=12');
  assert.doesNotMatch(hidden.$('#comment-box').text(), /Replying to/);
  for (const id of ['12', '6', '1', 'abc', '0'])
    assert.equal((await a.page('/posts/600012?reply=' + id)).$('input[name=reply_to]').length, 0);
});

test('CT-T11: unavailable and malformed post IDs are indistinguishable 404s', async () => {
  const a = await agentAs('mandy0hku');
  for (const id of [
    '600008',
    '600014',
    '600009',
    '600010',
    '999999',
    'abc',
    '0',
    '-1',
    '1.5',
    '600012e0',
    '4294967296',
  ])
    assert.equal((await a.page('/posts/' + id)).status, 404, id);
});

test('CT-T25/T26: my comments show aliases, visibility, hidden text, empty state and real paging', async () => {
  const a = await agentAs('mandy0hku');
  const p = await a.page('/me/comments');
  assert.deepEqual(
    p
      .$('.content-comment-item')
      .map((_, e) => p.$(e).attr('href'))
      .get(),
    ['/posts/600012#c14', '/posts/600012#c10', '/posts/600002#c3', '/posts/600001#c2'],
  );
  assert.deepEqual(
    p
      .$('.content-comment-item strong')
      .map((_, e) => p.$(e).text())
      .get(),
    ['as Alice', 'as Alice', 'as Alice', 'as Host'],
  );
  const older = await a.page('/me/comments?before=10');
  assert.deepEqual(
    older
      .$('.content-comment-item')
      .map((_, e) => older.$(e).attr('href'))
      .get(),
    ['/posts/600002#c3', '/posts/600001#c2'],
  );
  const j = await (await agentAs('jason0ust')).page('/me/comments');
  assert.match(j.$('.content-comment-item').first().text(), /\[hidden by a moderator\]/);
  assert.equal(
    (await (await agentAs('wing0cuhk')).page('/me/comments')).$('a[href$="#c6"]').length,
    0,
  );
  const n = await agentAs('newbie0hk');
  assert.match((await n.page('/me/comments')).text, /You have not commented on anything yet/);
  const post = await make.post({ author: 'newbie0hk' });
  const ids = [];
  for (let i = 0; i < 21; i++)
    ids.push(await make.comment({ post, author: 'newbie0hk', body: 'Page ' + i }));
  const first = await n.page('/me/comments');
  assert.equal(first.$('.content-comment-item').length, 20);
  const next = first
    .$('a')
    .filter((_, e) => first.$(e).text() === 'Load more')
    .attr('href');
  const second = await n.page(next);
  assert.equal(second.$('.content-comment-item').length, 1);
  assert.equal(second.$('.content-comment-item').attr('href'), '/posts/' + post + '#c' + ids[0]);
  await q('UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = ?', [post]);
  assert.equal((await n.page('/me/comments')).$('.content-comment-item').length, 0);
});

test('CT-T29: ordered images are ordinary original-file links; user text is escaped', async () => {
  const a = await agentAs('mandy0hku');
  const p = await a.page('/posts/600005');
  assert.deepEqual(
    p
      .$('[data-content-image]')
      .map((_, e) => p.$(e).attr('href'))
      .get(),
    ['/static/seed/textbook-1.svg', '/static/seed/textbook-2.svg'],
  );
  const payload = '<script>alert("x")</script>\n' + 'x'.repeat(250);
  const id = await make.post({ author: 'mandy0hku', body: payload });
  const page = await a.page('/posts/' + id);
  assert.ok(!page.text.includes(payload));
  assert.equal(page.$('.content-text').first().text(), payload);
});
