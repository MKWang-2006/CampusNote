const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, make, q } = require('../../../test/helpers');
const queries = require('../queries');
const { PNG, publish, fileList } = require('./fixtures');
beforeEach(resetDb);
const limit = 5 * 1024 * 1024;
const sizedPNG = (bytes) => Buffer.concat([PNG, Buffer.alloc(bytes - PNG.length)]);

test('BR-18: a file just below 5 MB succeeds; one byte above is refused without orphans', async () => {
  const a = await agentAs('mandy0hku');
  assert.equal(
    (
      await publish(a, { body: 'Below the limit', topic: 'share' }, [
        { bytes: sizedPNG(limit - 1) },
      ])
    ).status,
    303,
  );
  const files = fileList();
  const before = await q.one('SELECT COUNT(*) AS n FROM posts');
  const refused = await publish(a, { body: 'Over the limit', topic: 'share' }, [
    { bytes: sizedPNG(limit + 1) },
  ]);
  assert.equal(refused.status, 400);
  assert.deepEqual(await q.one('SELECT COUNT(*) AS n FROM posts'), before);
  assert.deepEqual(fileList(), files);
});

test('BR-18: exactly 5 MB is accepted by the inclusive file-size limit', async () => {
  const a = await agentAs('mandy0hku');
  const res = await publish(a, { body: 'Exactly the limit', topic: 'share' }, [
    { bytes: sizedPNG(limit) },
  ]);
  assert.equal(res.status, 303);
});

test('malformed repeated fields are rejected without uploads, comments or aliases', async () => {
  const a = await agentAs('newbie0hk');
  const posts = await q.one('SELECT COUNT(*) AS n FROM posts');
  const files = fileList();
  for (const fields of [
    { body: ['First', 'Second'], topic: 'share' },
    { body: 'Keep this draft', topic: ['share', 'trade'] },
  ]) {
    const res = await publish(a, fields, [{}]);
    assert.equal(res.status, 400);
    assert.match(
      res.text,
      fields.body instanceof Array ? /Your post cannot be blank/ : /Pick a topic/,
    );
    assert.deepEqual(await q.one('SELECT COUNT(*) AS n FROM posts'), posts);
    assert.deepEqual(fileList(), files);
  }
  const res = await a.form('/posts/600003/comments', { body: ['One', 'Two'] });
  assert.equal(res.status, 400);
  assert.equal(res.$('#f-body-error').text(), 'Your comment cannot be blank');
  assert.equal((await queries.listThread(600003, 6)).length, 0);
  assert.equal((await queries.viewerState(600003, 6)).my_alias, null);
});

test('HTTP-submitted HTML stays literal in posts, comments, lists and error drafts', async () => {
  const a = await agentAs('newbie0hk');
  const payload = '</textarea><img src=x onerror=alert(1)><script>alert(2)</script>';
  const published = await publish(a, { body: payload, topic: 'share' });
  assert.equal(published.status, 303);
  const url = published.headers.location;
  const comment = await a.form(url + '/comments', { body: payload });
  assert.equal(comment.status, 303);
  const post = await a.page(url);
  assert.deepEqual(
    post
      .$('.content-text')
      .map((_, el) => post.$(el).text())
      .get(),
    [payload, payload],
  );
  assert.equal(
    post.$('.content-post img[src=x], .content-post [onerror], .content-post script').length,
    0,
  );
  const mine = await a.page('/me/comments');
  assert.equal(mine.$('.content-comment-item .content-text').text(), payload);
  assert.equal(mine.$('.content-comment-item img, .content-comment-item script').length, 0);
  const error = await a.form(url + '/comments', { body: payload, reply_to: 'invalid' });
  assert.equal(error.status, 400);
  assert.equal(error.$('textarea').val(), payload);
  assert.equal(
    error.$('.content-post img[src=x], .content-post [onerror], .content-post script').length,
    0,
  );
});

test('failed comment INSERT rolls back its new alias; retry takes Alice without side effects', async (t) => {
  const a = await agentAs('newbie0hk');
  const notifications = await q.one('SELECT COUNT(*) AS n FROM notifications');
  const add = queries.addComment;
  // The route accepts valid text; force the real INSERT to fail after alias allocation.
  const mock = t.mock.method(queries, 'addComment', (post, user, body, reply) =>
    add(post, user, body + 'x'.repeat(501), reply),
  );
  const failed = await a.form('/posts/600003/comments', { body: 'Retry me' });
  assert.equal(failed.status, 500);
  assert.equal((await queries.listThread(600003, 6)).length, 0);
  assert.equal((await queries.viewerState(600003, 6)).my_alias, null);
  assert.deepEqual(await q.one('SELECT COUNT(*) AS n FROM notifications'), notifications);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM post_views WHERE user_id=6')).n, 0);
  mock.mock.restore();
  assert.equal((await a.form('/posts/600003/comments', { body: 'Retry me' })).status, 303);
  assert.equal((await queries.viewerState(600003, 6)).my_alias, 1);
  assert.equal((await queries.listThread(600003, 6)).length, 1);
});

test('concurrent duplicate likes/watches create one row and one notification, including re-like', async () => {
  const post = await make.post({ author: 'wing0cuhk', visibility: 'all' });
  // Separate sessions keep the requests concurrent without sharing a temporary HTTP server.
  const agents = await Promise.all(Array.from({ length: 5 }, () => agentAs('newbie0hk')));
  for (const [action, state, count, table] of [
    ['like', 'liked', 'likeCount', 'post_likes'],
    ['watch', 'watched', 'watchCount', 'post_watches'],
  ]) {
    for (const on of [1, 0, 1]) {
      const replies = await Promise.all(
        agents.map((a) => a.json('/posts/' + post + '/' + action, { [action]: on })),
      );
      for (const res of replies) {
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { [state]: Boolean(on), [count]: on });
      }
      // Table identifiers are fixed test cases, never user input.
      assert.equal(
        (await q.one('SELECT COUNT(*) AS n FROM ' + table + ' WHERE post_id=?', [post])).n,
        on,
      );
    }
  }
  const notifications = await q(
    'SELECT recipient_id, actor_id, type FROM notifications WHERE post_id=?',
    [post],
  );
  assert.deepEqual(notifications, [{ recipient_id: 4, actor_id: 6, type: 'like_on_post' }]);
  const owner = await agentAs('wing0cuhk');
  assert.deepEqual((await owner.json('/posts/' + post + '/like', { like: 1 })).body, {
    liked: true,
    likeCount: 2,
  });
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM notifications WHERE post_id=?', [post])).n,
    1,
  );
});

test('deleting all comments keeps the alias reserved and preserves reply anchors', async () => {
  const alice = await agentAs('newbie0hk');
  const first = await alice.form('/posts/600003/comments', { body: 'Alice first' });
  const id = Number(first.headers.location.split('#c')[1]);
  const bob = await agentAs('mandy0hku');
  const reply = await bob.form('/posts/600003/comments', { body: 'Bob reply', reply_to: id });
  assert.equal(reply.status, 303);
  assert.equal((await alice.form('/comments/' + id + '/delete')).status, 303);
  const page = await bob.page('/posts/600003');
  assert.equal(page.$('#c' + id + ' .content-text').text(), '[deleted]');
  assert.equal(page.$('.content-reply-link').attr('href'), '#c' + id);
  assert.equal(page.$('.content-reply-link').text(), 'replying to Alice');
  const again = await alice.form('/posts/600003/comments', { body: 'Alice returns' });
  assert.equal(again.status, 303);
  assert.equal((await queries.viewerState(600003, 6)).my_alias, 1);
  assert.equal((await queries.viewerState(600003, 2)).my_alias, 2);
  assert.deepEqual(
    (await queries.listThread(600003, 6)).map((c) => c.alias_no),
    [1, 2, 1],
  );
});

test('the 27th participant renders Alice 2 in the thread, composer, reply and personal list', async () => {
  for (let i = 0; i < 26; i++) {
    const u = await make.user();
    await make.comment({ post: 600003, author: u.userId });
  }
  const a = await agentAs('newbie0hk');
  const sent = await a.form('/posts/600003/comments', { body: 'Second round' });
  assert.equal(sent.status, 303);
  const id = Number(sent.headers.location.split('#c')[1]);
  const page = await a.page('/posts/600003?reply=' + id);
  assert.equal(page.$('#c' + id + ' .content-alias').text(), 'Alice 2');
  assert.match(page.$('#comment-box').text(), /You will appear as Alice 2/);
  assert.match(page.$('#comment-box').text(), /Replying to Alice 2/);
  assert.equal(
    (await a.page('/me/comments')).$('.content-comment-item strong').text(),
    'as Alice 2',
  );
  assert.equal((await queries.viewerState(600003, 6)).my_alias, 27);
});

test('ten concurrent visits from one account produce one row and ten visits', async () => {
  const agents = await Promise.all(Array.from({ length: 10 }, () => agentAs('newbie0hk')));
  const replies = await Promise.all(agents.map((a) => a.page('/posts/600003')));
  assert.deepEqual(
    replies.map((r) => r.status),
    Array(10).fill(200),
  );
  assert.deepEqual(
    await q('SELECT view_count FROM post_views WHERE post_id=600003 AND user_id=6'),
    [{ view_count: 10 }],
  );
});

test('My comments handles malformed cursors and excludes posts hidden after commenting', async () => {
  const a = await agentAs('newbie0hk');
  const sent = await a.form('/posts/600003/comments', { body: 'Visible until moderation' });
  assert.equal(sent.status, 303);
  for (const cursor of ['abc', '-1', '0', '1e3', '4294967296', '1&before=2']) {
    const page = await a.page('/me/comments?before=' + cursor);
    assert.equal(page.status, 200);
    assert.equal(page.$('.content-comment-item').attr('href'), sent.headers.location);
  }
  // Test fixture only: Content application code never writes Messages tables.
  await q(
    "INSERT INTO hidden_content (target_type,target_id,hidden_by,reason) VALUES ('post',600003,1,'test fixture')",
  );
  assert.equal((await a.page('/me/comments')).$('.content-comment-item').length, 0);
  assert.equal((await a.page('/posts/600003')).status, 404);
  assert.equal((await queries.viewerState(600003, 6)).my_alias, 1);
});
