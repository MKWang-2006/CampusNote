const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, q, make } = require('../../../test/helpers');
const queries = require('../queries');

beforeEach(resetDb);
const scalar = async (sql, params = []) => Object.values(await q.one(sql, params))[0];

test('MS-1: paging has no duplicate rows and arrivals after the snapshot remain unread', async () => {
  for (let i = 0; i < 33; i++)
    await make.comment({ post: 600001, author: 'newbie0hk', body: `Page item ${i}` });
  const loaded = await queries.listNotifications(2, 1);
  assert.equal(loaded.length, 31);
  await make.comment({ post: 600001, author: 'newbie0hk', body: 'Arrived after loading' });
  await queries.markNotificationsRead(2, loaded[0].notification_id);
  assert.equal((await queries.countUnread(2)).notifications, 1);
  const mandy = await agentAs('mandy0hku');
  const first = await mandy.page('/messages/notifications');
  assert.equal(first.$('.messages-notification').length, 30);
  const next = first
    .$('a')
    .filter((_, e) => first.$(e).text() === 'Load more')
    .attr('href');
  assert.ok(next);
  const second = await mandy.page(next);
  const ids = (page) =>
    page
      .$('.messages-notification')
      .map((_, e) => page.$(e).attr('data-notification-id'))
      .get();
  assert.equal(new Set([...ids(first), ...ids(second)]).size, 41);
});

test('MS-4: simultaneous first sends keep one conversation and both messages', async () => {
  const a = await agentAs('newbie0hk');
  const b = await agentAs('newbie0hk');
  await a.page('/messages/new?post=600001');
  await b.page('/messages/new?post=600001');
  const results = await Promise.all([
    a.form('/messages/new?post=600001', { body: 'First tab' }),
    b.form('/messages/new?post=600001', { body: 'Second tab' }),
  ]);
  results.forEach((r) => assert.equal(r.status, 303));
  assert.equal(results[0].headers.location, results[1].headers.location);
  const id = await queries.findConversation(6, 2, 600001);
  assert.equal(
    await scalar(
      'SELECT COUNT(*) FROM conversations WHERE context_key = 600001 AND user_lo = 2 AND user_hi = 6',
    ),
    1,
  );
  assert.deepEqual((await queries.listMessages(id, 6)).map((m) => m.body).sort(), [
    'First tab',
    'Second tab',
  ]);
});

test('MS-4/5: failed first messages and sends roll back conversation and read-pointer changes', async () => {
  await assert.rejects(queries.startConversation(6, 2, 600001, 'x'.repeat(1001)), { errno: 1406 });
  assert.equal(await queries.findConversation(6, 2, 600001), null);
  assert.equal(await scalar('SELECT COUNT(*) FROM conversations'), 2);
  await assert.rejects(queries.sendMessage(1, 2, 'x'.repeat(1001)), { errno: 1406 });
  await assert.rejects(queries.sendMessage(1, 6, 'Not a member'), { errno: 1644 });
  assert.equal(await scalar('SELECT COUNT(*) FROM messages WHERE conversation_id = 1'), 3);
  assert.equal(
    await scalar(
      'SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = 1 AND user_id = 2',
    ),
    2,
  );
});

test('MS-4: public and post contexts never collapse into one identity', async () => {
  const n = await agentAs('newbie0hk');
  const post = await n.form('/messages/new?post=600001', { body: 'Anonymous hello' });
  const named = await n.form('/messages/new?to=mandy0hku', { body: 'Named hello' });
  assert.notEqual(post.headers.location, named.headers.location);
  const mandy = await agentAs('mandy0hku');
  const anonymousPage = await mandy.page(post.headers.location);
  assert.ok(!anonymousPage.$('main').html().includes('newbie0hk'));
  assert.ok((await mandy.page(named.headers.location)).$('main').text().includes('newbie0hk'));
  await q("UPDATE users SET status = 'banned' WHERE user_id = 5");
  assert.equal((await n.page('/messages/new?to=jason0ust')).status, 404);
});

test('MS-5: stale read pointers stay forward; history shows only the last 100 chronologically', async () => {
  await queries.markConversationRead(1, 2, 3);
  await queries.markConversationRead(1, 2, 1);
  assert.equal(
    await scalar(
      'SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = 1 AND user_id = 2',
    ),
    3,
  );
  await q('INSERT INTO messages (conversation_id, sender_id, body) VALUES ?', [
    Array.from({ length: 102 }, (_, i) => [1, 3, `History ${i}`]),
  ]);
  const page = await (await agentAs('mandy0hku')).page('/messages/c/1');
  const rows = page.$('.messages-bubble');
  assert.equal(rows.length, 100);
  assert.ok(rows.first().text().includes('History 2'));
  assert.ok(rows.last().text().includes('History 101'));
  assert.ok(page.text.includes('Showing the last 100 messages.'));
});

test('MS-5/6: Unicode limits, literal HTML, malformed fields and optional details are handled', async () => {
  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.form('/messages/c/1', { body: '🙂'.repeat(1000) })).status, 303);
  assert.equal((await mandy.form('/messages/c/1', { body: '🙂'.repeat(1001) })).status, 400);
  const literal = '<script>alert("test")</script>';
  await mandy.form('/messages/c/1', { body: literal });
  const chat = await mandy.page('/messages/c/1');
  assert.equal(chat.$('main script').length, 0);
  assert.ok(chat.$('main').text().includes(literal));
  assert.equal((await mandy.form('/messages/c/1', { body: ['one', 'two'] })).status, 400);
  const n = await agentAs('newbie0hk');
  assert.equal(
    (await n.form('/report?type=post&id=600007', { reason: 'spam', details: '🙂'.repeat(301) }))
      .status,
    400,
  );
  assert.equal(
    (await n.form('/report?type=post&id=600007', { reason: 'spam', details: ['x', 'y'] })).status,
    400,
  );
  assert.equal(
    (await n.form('/report?type=post&id=600007', { reason: 'spam', details: '   ' })).status,
    303,
  );
  assert.equal(await scalar('SELECT details FROM reports WHERE reporter_id = 6'), '');
  assert.equal((await n.page('/messages/new?post=600001&to=invalid')).status, 200);
  for (const suffix of [
    '?post=0',
    '?post=4294967296',
    '?post=600012&alias=',
    '?post=600012&alias=-1',
  ])
    assert.equal((await n.page('/messages/new' + suffix)).status, 404);
});

test('MS-7: an injected report-update failure rolls back the hidden-content insertion', async () => {
  await q(
    "CREATE TRIGGER ms_test_refuse_resolution BEFORE UPDATE ON reports FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test resolution failure'",
  );
  try {
    await assert.rejects(queries.hideTarget(3, 1), { errno: 1644 });
    assert.equal(
      await scalar(
        "SELECT COUNT(*) FROM hidden_content WHERE target_type = 'post' AND target_id = 600007",
      ),
      0,
    );
    assert.equal(await scalar('SELECT resolved_at FROM reports WHERE report_id = 3'), null);
  } finally {
    await q('DROP TRIGGER ms_test_refuse_resolution');
  }
});

test('MS-7: concurrent hides from different report IDs resolve once and preserve one audit row', async () => {
  const newReport = await queries.fileReport(6, 'post', 600007, 'spam', 'Duplicate target');
  const decisions = await Promise.all([queries.hideTarget(3, 1), queries.hideTarget(newReport, 1)]);
  assert.equal(
    decisions.reduce((n, r) => n + r.resolved, 0),
    2,
  );
  assert.equal(
    await scalar(
      "SELECT COUNT(*) FROM hidden_content WHERE target_type = 'post' AND target_id = 600007",
    ),
    1,
  );
  assert.equal(
    await scalar(
      "SELECT COUNT(*) FROM reports WHERE target_type = 'post' AND target_id = 600007 AND resolved_at IS NULL",
    ),
    0,
  );
});
