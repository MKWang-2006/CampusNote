const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resetDb, agentAs, make, q } = require('../../../test/helpers');
const config = require('../../../core/config');
const queries = require('../queries');
const { PNG, publish, fileList } = require('./fixtures');
beforeEach(resetDb);
const count = async (table) => (await q.one('SELECT COUNT(*) AS n FROM ' + table)).n; // Test-owned fixed table names only.

test('CT-T03/T04: atomic image publish, Host, anonymity, scope, public author and trimming', async () => {
  const a = await agentAs('mandy0hku');
  // Distinct PNG byte streams make reversed upload order observable.
  const secondPNG = Buffer.concat([PNG, Buffer.from('second fixture')]);
  const r = await publish(a, { body: '  Selling a desk lamp, HKD 50.\n ', topic: 'trade' }, [
    { name: 'a.png' },
    { name: 'b.png', bytes: secondPNG },
  ]);
  assert.equal(r.status, 303);
  const id = Number(r.headers.location.split('/').pop());
  const p = await q.one('SELECT * FROM posts WHERE post_id = ?', [id]);
  assert.equal(p.body, 'Selling a desk lamp, HKD 50.');
  assert.equal(p.is_anonymous, 1);
  assert.equal(p.visibility, 'university');
  const images = await queries.listImages(id);
  assert.deepEqual(
    images.map((i) => i.position),
    [1, 2],
  );
  assert.notEqual(images[0].file_path, images[1].file_path);
  for (const img of images)
    assert.ok(fs.existsSync(path.join(config.uploadDir, img.file_path.slice('/uploads/'.length))));
  for (const [i, bytes] of [PNG, secondPNG].entries())
    assert.deepEqual(
      fs.readFileSync(path.join(config.uploadDir, images[i].file_path.slice('/uploads/'.length))),
      bytes,
    );
  assert.equal(
    (await q.one('SELECT alias_no FROM post_participants WHERE post_id = ? AND user_id = 2', [id]))
      .alias_no,
    0,
  );
  const page = await a.page(r.headers.location);
  assert.match(page.text, /Posted/);
  assert.equal(page.status, 200);
  assert.equal(page.$('h1').text(), '#' + id);
  assert.deepEqual(
    page
      .$('[data-content-image]')
      .map((_, el) => page.$(el).attr('href'))
      .get(),
    images.map((image) => image.file_path),
  );
  assert.match(page.$('.content-post').text(), /Trade/);
  assert.ok(!page.$('.content-post').html().includes('mandy0hku'));
  const wing = await agentAs('wing0cuhk');
  assert.equal((await wing.page(r.headers.location)).status, 404);
  const publicPost = await publish(a, {
    body: 'Public post',
    topic: 'share',
    show_handle: ['0', '1'],
    all_universities: ['0', '1'],
  });
  assert.equal(publicPost.status, 303);
  assert.equal((await wing.page(publicPost.headers.location)).status, 200);
  assert.equal(
    (await wing.page(publicPost.headers.location)).$('a[href="/u/mandy0hku"]').text(),
    'mandy0hku',
  );
});

test('CT-T05/T06: Unicode boundaries, error preservation, invalid topics and file cleanup', async () => {
  const a = await agentAs('mandy0hku');
  const files = fileList();
  const posts = await count('posts');
  const blank = await publish(
    a,
    { body: '   ', topic: 'trade', show_handle: '1', all_universities: '1' },
    [{}],
  );
  assert.equal(blank.status, 400);
  assert.match(blank.text, /Your post cannot be blank/);
  assert.match(blank.text, /Please add your images again/);
  const cheerio = require('cheerio');
  const $ = cheerio.load(blank.text);
  assert.equal($('#f-body-error').text(), 'Your post cannot be blank');
  assert.ok($('input[value=trade]').is(':checked'));
  assert.ok($('input[type=checkbox][name=show_handle]').is(':checked'));
  assert.ok($('input[type=checkbox][name=all_universities]').is(':checked'));
  assert.deepEqual(fileList(), files);
  assert.equal(await count('posts'), posts);
  assert.equal((await publish(a, { body: '中'.repeat(751), topic: 'random' })).status, 400);
  for (const topic of ['', 'invalid', "random' OR 1=1 --"]) {
    const res = await publish(a, { body: 'Keep this draft', topic });
    assert.equal(res.status, 400);
    assert.match(res.text, /Pick a topic/);
    assert.equal(await count('posts'), posts);
    assert.deepEqual(fileList(), files);
  }
  const valid = await publish(a, { body: '😀'.repeat(750), topic: 'random' });
  assert.equal(valid.status, 303);
  assert.equal(
    (
      await q.one('SELECT CHAR_LENGTH(body) AS n FROM posts WHERE post_id = ?', [
        Number(valid.headers.location.split('/').pop()),
      ])
    ).n,
    750,
  );
});

test('CT-T07/T30: upload limits, disguised files and CSRF leave no writes/files', async () => {
  const a = await agentAs('newbie0hk');
  const baseline = fileList();
  const posts = await count('posts');
  for (const files of [
    Array.from({ length: 7 }, () => ({})),
    [{ name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('text') }],
    [{ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }],
    [{ bytes: Buffer.from('not a PNG') }],
  ]) {
    const res = await publish(a, { body: 'Draft retained', topic: 'trade' }, files);
    assert.equal(res.status, 400);
    assert.match(res.text, /Up to 6 images/);
    assert.match(res.text, /Draft retained/);
    assert.match(res.text, /value="trade" checked/);
    assert.deepEqual(fileList(), baseline);
    assert.equal(await count('posts'), posts);
  }
  assert.equal(
    (await a.raw.post('/compose').field('body', 'No token').attach('images', PNG, 'a.png')).status,
    403,
  );
  const comments = await count('comments');
  assert.equal(
    (await a.raw.post('/posts/600012/comments').type('form').send({ body: 'No token' })).status,
    403,
  );
  assert.equal(await count('comments'), comments);
  assert.deepEqual(fileList(), baseline);
  const six = await publish(
    a,
    { body: 'Six valid files', topic: 'random' },
    Array.from({ length: 6 }, () => ({})),
  );
  assert.equal(six.status, 303);
});

test('publish failure rolls back partial SQL and removes the uploaded files', async (t) => {
  const a = await agentAs('newbie0hk');
  const files = fileList();
  const posts = await count('posts'),
    images = await count('post_images'),
    participants = await count('post_participants');
  const create = queries.createPost;
  // Fail after the post and one valid image have been inserted, inside the real transaction.
  t.mock.method(queries, 'createPost', (author, values) =>
    create(author, { ...values, imagePaths: [...values.imagePaths, 'x'.repeat(256)] }),
  );
  const res = await publish(a, { body: 'Rollback fixture', topic: 'random' }, [{}]);
  assert.equal(res.status, 500);
  assert.equal(await count('posts'), posts);
  assert.equal(await count('post_images'), images);
  assert.equal(await count('post_participants'), participants);
  assert.deepEqual(fileList(), files);
});

test('CT-T12: inaccessible posts reject all operations without data changes', async () => {
  const wing = await agentAs('wing0cuhk');
  assert.equal((await wing.page('/posts/600001')).status, 404);
  for (const [suffix, body] of [
    ['like', { like: 1 }],
    ['watch', { watch: 1 }],
    ['comments', { body: 'hi' }],
    ['delete', {}],
  ])
    assert.equal((await wing.form('/posts/600001/' + suffix, body)).status, 404);
  for (const table of ['post_likes', 'post_watches', 'post_participants', 'post_views'])
    assert.equal(
      (await q.one(`SELECT COUNT(*) AS n FROM ${table} WHERE post_id = 600001 AND user_id = 4`)).n,
      0,
    );
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM comments WHERE post_id = 600001 AND author_id = 4')).n,
    0,
  );
});

test('CT-T13/T14/T15: stable first-comment aliases, Host, replies and trigger notifications', async () => {
  const n = await agentAs('newbie0hk');
  const first = await n.form('/posts/600012/comments', { body: ' Good luck! ' });
  assert.equal(first.status, 303);
  const id = Number(first.headers.location.split('#c')[1]);
  const firstPage = await n.page('/posts/600012');
  assert.equal(firstPage.$('#c' + id + ' .content-alias').text(), 'Dave');
  assert.match(firstPage.$('#comment-box').text(), /You will appear as Dave/);
  const reply = await n.form('/posts/600012/comments', { body: 'Thanks Bob', reply_to: 11 });
  assert.equal(reply.status, 303);
  const p = await n.page('/posts/600012');
  assert.equal(reply.status, 303);
  assert.equal(p.$('.comment').last().find('.content-alias').text(), 'Dave');
  assert.match(p.$('.comment').last().text(), /Dave[\s\S]*replying to Bob/);
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM post_participants WHERE post_id=600012 AND user_id=6'))
      .n,
    1,
  );
  assert.deepEqual(
    (
      await q('SELECT recipient_id FROM notifications WHERE comment_id = ? ORDER BY recipient_id', [
        id,
      ])
    ).map((x) => x.recipient_id),
    [2, 3],
  );
  assert.equal((await n.form('/posts/600003/comments', { body: 'First' })).status, 303);
  const m = await agentAs('mandy0hku');
  await m.form('/posts/600003/comments', { body: 'Second' });
  const w = await agentAs('wing0cuhk');
  assert.match((await w.page('/posts/600003')).text, /You will appear as Host/);
  await w.form('/posts/600003/comments', { body: 'Host reply' });
  const aliases = await w.page('/posts/600003');
  assert.deepEqual(
    aliases
      .$('.content-alias')
      .map((_, el) => aliases.$(el).text())
      .get(),
    ['Alice', 'Bob', 'Host'],
  );
  assert.deepEqual(
    (await queries.listThread(600003, 6)).map((c) => c.alias_no),
    [1, 2, 0],
  );
});

test('CT-T16/T17: invalid replies and text never consume aliases or visits', async () => {
  const n = await agentAs('newbie0hk');
  const comments = await count('comments');
  for (const [post, reply] of [
    [600012, 12],
    [600002, 6],
    [600012, 1],
    [600012, 999999],
    [600012, 'abc'],
    [600012, '0'],
    [600012, ['11', '13']],
  ]) {
    const r = await n.form('/posts/' + post + '/comments', { body: 'Kept text', reply_to: reply });
    assert.equal(r.status, 400);
    assert.match(r.text, /You can only reply to a visible comment/);
    assert.equal(r.$('textarea').val(), 'Kept text');
  }
  for (const body of ['   ', '中'.repeat(501)]) {
    const r = await n.form('/posts/600012/comments', { body });
    assert.equal(r.status, 400);
    assert.equal(r.$('textarea').val(), body);
    assert.equal(
      r.$('#f-body-error').text(),
      body.trim()
        ? 'Your comment is too long (at most 500 characters)'
        : 'Your comment cannot be blank',
    );
  }
  assert.equal(await count('comments'), comments);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_participants WHERE user_id=6')).n, 0);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=6')).n, 0);
  assert.equal((await n.form('/posts/600012/comments', { body: '中'.repeat(500) })).status, 303);
});

// Pause only at the HTTP-to-query boundary: both requests still execute their real SQL.
// This makes deletion win after the comment route has accepted its initial visibility check.
async function deleteBeforeCommentWrite(t, owner, deletePath, commenter, postId, fields) {
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const addComment = queries.addComment;
  t.mock.method(queries, 'addComment', async (...args) => {
    entered.resolve();
    await resume.promise;
    return addComment(...args);
  });
  const pending = commenter.form('/posts/' + postId + '/comments', fields);
  try {
    await Promise.race([
      entered.promise,
      pending.then(() => assert.fail('The comment request did not reach the write boundary')),
    ]);
    assert.equal((await owner.form(deletePath)).status, 303);
  } finally {
    resume.resolve();
    await pending;
  }
  return pending;
}

test('CT-3: deletion after visibility check rejects a pending comment without side effects', async (t) => {
  const n = await agentAs('newbie0hk');
  const owner = await agentAs('wing0cuhk');
  const comments = await count('comments');
  const notifications = await count('notifications');
  const res = await deleteBeforeCommentWrite(t, owner, '/posts/600003/delete', n, 600003, {
    body: 'Sent from a page that was still open',
  });
  assert.equal(res.status, 404);
  assert.equal(await count('comments'), comments);
  assert.equal(await count('notifications'), notifications);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_participants WHERE user_id=6')).n, 0);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=6')).n, 0);
});

test('CT-3: reply target deleted during submission preserves the draft and consumes no alias', async (t) => {
  const n = await agentAs('newbie0hk');
  const owner = await agentAs('wing0cuhk');
  const comments = await count('comments');
  const notifications = await count('notifications');
  const res = await deleteBeforeCommentWrite(t, owner, '/comments/11/delete', n, 600012, {
    body: 'Keep this reply draft',
    reply_to: 11,
  });
  assert.equal(res.status, 400);
  assert.match(res.text, /You can only reply to a visible comment/);
  assert.equal(res.$('textarea[name=body]').val(), 'Keep this reply draft');
  assert.equal(res.$('input[name=reply_to]').length, 0);
  assert.match(res.$('#c11').text(), /\[deleted\]/);
  assert.equal(await count('comments'), comments);
  assert.equal(await count('notifications'), notifications);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_participants WHERE user_id=6')).n, 0);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=6')).n, 0);
});

test('CT-T18/T19/T20/T26: soft deletes preserve anchors/aliases and enforce ownership', async () => {
  const m = await agentAs('mandy0hku');
  const before = await m.page('/posts/600012');
  assert.equal(before.$('#content-comments-title').text(), '4 comments');
  assert.equal((await m.form('/posts/600012/delete')).status, 404);
  assert.equal((await m.form('/comments/11/delete')).status, 404);
  const refused = await m.page('/posts/600012');
  assert.equal(refused.status, 200);
  assert.equal(refused.$('#c11 .content-text').text(), before.$('#c11 .content-text').text());
  assert.equal((await m.form('/comments/14/delete')).headers.location, '/posts/600012#c14');
  const p = await m.page('/posts/600012');
  assert.match(p.text, /Comment deleted/);
  assert.match(p.$('#c14').text(), /\[deleted\]/);
  assert.equal(p.$('#content-comments-title').text(), '3 comments');
  assert.equal((await m.form('/comments/14/delete')).status, 404);
  const r = await m.form('/posts/600012/comments', { body: 'Still Alice' });
  assert.equal(
    (
      await q.one('SELECT alias_no FROM v_comment_items WHERE comment_id=?', [
        Number(r.headers.location.split('#c')[1]),
      ])
    ).alias_no,
    1,
  );
  const kelvin = await agentAs('kelvin0hk');
  const c = await kelvin.form('/posts/600005/comments', { body: 'About these books' });
  const cId = c.headers.location.split('#c')[1];
  assert.equal(
    (await kelvin.page('/me/comments')).$('.content-comment-item').first().attr('href'),
    '/posts/600005#c' + cId,
  );
  assert.equal((await m.form('/posts/600005/delete')).status, 303);
  assert.equal((await kelvin.page('/me/comments')).$('a[href$="#c' + cId + '"]').length, 0);
  assert.equal((await m.form('/posts/600013/delete')).headers.location, '/feed');
  const feed = await m.page('/feed');
  assert.equal(feed.status, 200);
  assert.match(feed.text, /Post deleted/);
  assert.equal(feed.$('a[href="/posts/600013"]').length, 0);
  for (const a of [m, kelvin]) assert.equal((await a.page('/posts/600013')).status, 404);
  assert.equal((await m.page('/feed')).$('a[href="/posts/600013"]').length, 0);
  assert.equal((await m.form('/posts/600013/delete')).status, 404);
  assert.equal((await queries.listImages(600005)).length, 2);
});

test('CT-T21/T22: explicit like/watch state is repeatable; notification and list data contracts', async () => {
  const n = await agentAs('newbie0hk');
  for (const on of [1, 1, 0, 0])
    assert.deepEqual((await n.json('/posts/600012/like', { like: on })).body, {
      liked: !!on,
      likeCount: on ? 4 : 3,
    });
  assert.equal((await n.form('/posts/600012/like', { like: 1 })).headers.location, '/posts/600012');
  for (const on of [1, 1, 0, 0]) {
    assert.deepEqual((await n.json('/posts/600003/watch', { watch: on })).body, {
      watched: !!on,
      watchCount: on ? 1 : 0,
    });
    assert.equal(
      (await q.one('SELECT COUNT(*) AS n FROM post_watches WHERE post_id=600003 AND user_id=6')).n,
      on,
    );
  }
  assert.equal(
    (await n.form('/posts/600003/watch', { watch: 1 })).headers.location,
    '/posts/600003',
  );
  const m = await agentAs('mandy0hku');
  const c = await m.form('/posts/600003/comments', { body: 'Watch notification' });
  assert.equal(
    (
      await q.one('SELECT COUNT(*) AS n FROM notifications WHERE recipient_id=6 AND comment_id=?', [
        Number(c.headers.location.split('#c')[1]),
      ])
    ).n,
    1,
  );
  await n.form('/posts/600013/like', { like: 1 });
  await n.form('/posts/600013/like', { like: 1 });
  assert.equal(
    (
      await q.one(
        "SELECT COUNT(*) AS n FROM notifications WHERE recipient_id=2 AND actor_id=6 AND post_id=600013 AND type='like_on_post'",
      )
    ).n,
    1,
  );
});

test('CT-T23/T24: visit increments, personal clear retains totals, reopening restores history', async () => {
  const n = await agentAs('newbie0hk');
  await n.page('/posts/600003');
  await n.page('/posts/600003');
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM post_views WHERE post_id=600003 AND user_id=6')).n,
    1,
  );
  assert.equal(
    (await q.one('SELECT view_count FROM post_views WHERE post_id=600003 AND user_id=6'))
      .view_count,
    2,
  );
  const m = await agentAs('mandy0hku');
  const kelvinBefore = await q('SELECT * FROM post_views WHERE user_id=3 ORDER BY post_id');
  assert.equal((await m.form('/me/history/clear')).headers.location, '/me/history');
  assert.deepEqual(
    await q('SELECT * FROM post_views WHERE user_id=3 ORDER BY post_id'),
    kelvinBefore,
  );
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=2')).n, 4);
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=2 AND cleared_at IS NULL')).n,
    0,
  );
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=3 AND cleared_at IS NULL')).n,
    3,
  );
  assert.equal(
    Number((await q.one('SELECT view_count FROM v_post_cards WHERE post_id=600012')).view_count),
    11,
  );
  assert.equal((await m.form('/me/history/clear')).status, 303);
  await m.page('/posts/600012');
  await m.page('/posts/600008');
  const v = await q.one('SELECT * FROM post_views WHERE user_id=2 AND post_id=600012');
  assert.equal(v.view_count, 5);
  assert.equal(v.cleared_at, null);
  assert.equal(
    Number((await q.one('SELECT view_count FROM v_post_cards WHERE post_id=600012')).view_count),
    12,
  );
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=2 AND post_id=600008')).n,
    0,
  );
  assert.match((await m.page('/me')).text, /Viewed/);
});

test('CT-T28: 20 simultaneous first HTTP comments get aliases 1–20 exactly once', async (t) => {
  const users = await Promise.all(Array.from({ length: 20 }, () => make.user()));
  const agents = await Promise.all(users.map((u) => agentAs(u.handle)));
  const results = await Promise.all(
    agents.map((a, i) => a.form('/posts/600003/comments', { body: 'Concurrent ' + i })),
  );
  assert.deepEqual(
    results.map((r) => r.status),
    Array(20).fill(303),
  );
  assert.deepEqual(
    (await q('SELECT alias_no FROM post_participants WHERE post_id=600003 ORDER BY alias_no')).map(
      (r) => r.alias_no,
    ),
    Array.from({ length: 21 }, (_, i) => i),
  );
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM comments WHERE post_id=600003')).n, 20);
  t.diagnostic('All 20 first-comment requests succeeded with distinct aliases.');
  // Independent sessions exercise one user's competing requests without sharing an ephemeral
  // Supertest server or racing the helper's post-login CSRF-token refresh.
  const sameUserAgents = await Promise.all(
    Array.from({ length: 5 }, () => agentAs(users[0].handle)),
  );
  const repeated = await Promise.all(
    sameUserAgents.map((a) => a.form('/posts/600003/comments', { body: 'Same participant' })),
  );
  assert.ok(repeated.every((r) => r.status === 303));
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM post_participants WHERE post_id=600003')).n,
    21,
  );
});
