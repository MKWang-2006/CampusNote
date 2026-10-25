const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, q, make } = require('../../../test/helpers');

beforeEach(resetDb);

const badge = (page) => Number(page.$('a[href="/messages"] .badge').first().text() || 0);
const scalar = async (sql, params = []) => Object.values(await q.one(sql, params))[0];

test('MS-T01: Mandy sees seven ordered notifications, aliases, links and unread highlights', async () => {
  const page = await (await agentAs('mandy0hku')).page('/messages/notifications');
  assert.equal(page.status, 200);
  const rows = page.$('.messages-notification');
  assert.deepEqual(
    rows.map((_, row) => Number(page.$(row).attr('data-notification-id'))).get(),
    [30, 29, 27, 17, 14, 2, 1],
  );
  assert.deepEqual(
    rows
      .filter('.is-unread')
      .map((_, row) => Number(page.$(row).attr('data-notification-id')))
      .get(),
    [30, 29, 27],
  );
  const expected = [
    'Host replied to your comment on #600012: “Thanks, doing the 2024 paper now.”',
    'Carol commented on #600012, which you watch: [hidden by a moderator]',
    'Bob commented on #600012, which you watch: “\u52a0\u6cb9\uff01You got this.”',
    'Host commented on #600004, which you watch: “Only behavioural ones, about 5 questions, 2 minutes each.”',
    'Alice commented on #600004, which you watch: “Did they ask technical questions in the video part?”',
    'Your post #600001 got a like',
    'Alice commented on your post #600001: “Thanks! Is 4/F quiet too?”',
  ];
  expected.forEach((text, index) => assert.ok(rows.eq(index).text().includes(text)));
  assert.equal(rows.eq(0).find('a').attr('href'), '/posts/600012#c13');
  assert.equal(rows.eq(5).find('a').attr('href'), '/posts/600001');
});

test('MS-T02: notifications mark only mine read and the same response updates the badge', async () => {
  const mandy = await agentAs('mandy0hku');
  assert.equal(badge(await mandy.page('/messages')), 4);
  assert.equal(badge(await mandy.page('/messages/notifications')), 1);
  const second = await mandy.page('/messages/notifications');
  assert.equal(second.$('.is-unread').length, 0);
  assert.equal(badge(second), 1);
  assert.equal(
    await scalar('SELECT COUNT(*) FROM notifications WHERE recipient_id = 2 AND read_at IS NULL'),
    0,
  );
  assert.equal(
    await scalar('SELECT COUNT(*) FROM notifications WHERE recipient_id = 3 AND read_at IS NULL'),
    4,
  );
});

test('MS-T03: Kelvin sees deleted-comment markers among his nine notifications', async () => {
  const page = await (await agentAs('kelvin0hk')).page('/messages/notifications');
  assert.equal(page.$('.messages-notification').length, 9);
  assert.ok(page.$('main').text().includes('Carol commented on your post #600002: [deleted]'));
});

test('MS-T04: deleted, hidden or newly invisible post notifications have no content link', async () => {
  await q('UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = 600001');
  await q("UPDATE posts SET visibility = 'university' WHERE post_id = 600004");
  const page = await (await agentAs('mandy0hku')).page('/messages/notifications');
  for (const id of [1, 2, 14, 17]) {
    const row = page.$(`[data-notification-id="${id}"]`);
    assert.ok(row.text().includes('This post is no longer available'));
    assert.equal(row.find('a').length, 0);
  }
});

test('MS-T05: every seeded persona gets the specified initial unread badge', async () => {
  for (const [handle, expected] of Object.entries({
    mandy0hku: 4,
    kelvin0hk: 4,
    jason0ust: 1,
    hikeclub0: 2,
    wing0cuhk: 0,
    newbie0hk: 0,
    filmsoc00: 0,
    admin0000: 0,
  })) {
    const page = await (await agentAs(handle)).page('/messages');
    assert.equal(page.status, 200);
    assert.equal(badge(page), expected, handle);
  }
});

test('MS-T06: reply trigger notifies each eligible person once, using the per-post alias', async () => {
  const id = await make.comment({
    post: 600012,
    author: 'newbie0hk',
    replyTo: 10,
    body: 'Try this paper.',
  });
  assert.deepEqual(
    (
      await q(
        'SELECT recipient_id, type FROM notifications WHERE comment_id = ? ORDER BY recipient_id',
        [id],
      )
    ).map((r) => [r.recipient_id, r.type]),
    [
      [2, 'reply_to_comment'],
      [3, 'comment_on_post'],
    ],
  );
  const mandy = await agentAs('mandy0hku');
  assert.equal(badge(await mandy.page('/messages')), 5);
  assert.equal(badge(await (await agentAs('kelvin0hk')).page('/messages')), 5);
  assert.ok(
    (await mandy.page('/messages/notifications'))
      .$('main')
      .text()
      .includes('Dave replied to your comment'),
  );
});

test('MS-T07: Content like/unlike/re-like creates one anonymous like notification', async () => {
  const newbie = await agentAs('newbie0hk');
  for (const like of [1, 0, 1])
    assert.equal((await newbie.json('/posts/600004/like', { like })).status, 200);
  assert.equal(
    await scalar(
      "SELECT COUNT(*) FROM notifications WHERE recipient_id = 5 AND actor_id = 6 AND type = 'like_on_post'",
    ),
    1,
  );
  const jason = await agentAs('jason0ust');
  assert.equal(badge(await jason.page('/messages')), 2);
  const page = await jason.page('/messages/notifications');
  assert.ok(page.$('main').text().includes('Your post #600004 got a like'));
  assert.ok(!page.text.includes('newbie0hk'));
});

test('MS-T08: the existing notification preference suppresses Kelvin like notifications', async () => {
  assert.equal(
    (await (await agentAs('newbie0hk')).json('/posts/600012/like', { like: 1 })).status,
    200,
  );
  assert.equal(
    await scalar(
      "SELECT COUNT(*) FROM notifications WHERE recipient_id = 3 AND type = 'like_on_post'",
    ),
    0,
  );
  assert.equal(badge(await (await agentAs('kelvin0hk')).page('/messages')), 4);
});

test('MS-T09: Mandy conversation preview shows Visitor, the latest body and one unread', async () => {
  const page = await (await agentAs('mandy0hku')).page('/messages');
  const row = page.$('.messages-conversation');
  assert.equal(row.length, 1);
  assert.ok(row.text().includes('Visitor · #600005'));
  assert.ok(row.text().includes('Deal. Friday 2pm at the entrance?'));
  assert.equal(row.find('.badge').text(), '1');
  assert.equal(page.$('a[href="/messages/notifications"] .badge').text(), '3');
});

test('MS-T10: public conversations show handles, post conversations keep aliases', async () => {
  const jason = await (await agentAs('jason0ust')).page('/messages');
  assert.ok(jason.$('.messages-conversation').text().includes('wing0cuhk'));
  assert.ok(jason.$('.messages-conversation').text().includes('You: A big one in Central'));
  assert.equal(jason.$('.messages-conversation .badge').text(), '1');
  const kelvin = await (await agentAs('kelvin0hk')).page('/messages');
  assert.ok(kelvin.$('.messages-conversation').text().includes('Host · #600005'));
  assert.equal(kelvin.$('.messages-conversation .badge').length, 0);
});

test('MS-T11: first post-context message atomically creates a conversation as Visitor', async () => {
  const newbie = await agentAs('newbie0hk');
  const form = await newbie.page('/messages/new?post=600001');
  assert.equal(form.status, 200);
  assert.ok(form.$('main').text().includes('To: Host · #600001'));
  assert.ok(form.$('main').text().includes('You will appear as Visitor'));
  const sent = await newbie.form('/messages/new?post=600001', { body: '  Is Sunday quiet?  ' });
  assert.equal(sent.status, 303);
  assert.equal(sent.headers.location, '/messages/c/3');
  const chat = await newbie.page(sent.headers.location);
  assert.equal(chat.$('.messages-bubble.is-mine').text().includes('Is Sunday quiet?'), true);
  assert.equal(await scalar('SELECT COUNT(*) FROM conversations'), 3);
  assert.equal(badge(await (await agentAs('mandy0hku')).page('/messages')), 5);
});

test('MS-T12: alias and handle recipients use their distinct naming contracts', async () => {
  const wing = await agentAs('wing0cuhk');
  const form = await wing.page('/messages/new?post=600012&alias=1');
  assert.ok(form.$('main').text().includes('To: Alice · #600012'));
  assert.ok(form.$('main').text().includes('You will appear as Bob'));
  assert.equal(
    (await wing.form('/messages/new?post=600012&alias=1', { body: 'Hi Alice' })).status,
    303,
  );
  assert.ok(
    (await (await agentAs('mandy0hku')).page('/messages'))
      .$('.messages-conversation')
      .first()
      .text()
      .includes('Bob · #600012'),
  );
  const newbie = await agentAs('newbie0hk');
  const publicForm = await newbie.page('/messages/new?to=jason0ust');
  assert.ok(publicForm.$('main').text().includes('They will see your handle'));
  assert.equal(
    (await newbie.form('/messages/new?to=jason0ust', { body: 'Hello Jason' })).status,
    303,
  );
  assert.ok(
    (await (await agentAs('jason0ust')).page('/messages'))
      .$('.messages-conversation')
      .first()
      .text()
      .includes('newbie0hk'),
  );
});

test('MS-T13: either direction reuses an existing conversation, including POST', async () => {
  assert.equal(
    (await (await agentAs('kelvin0hk')).page('/messages/new?post=600005')).headers.location,
    '/messages/c/1',
  );
  const jason = await agentAs('jason0ust');
  assert.equal((await jason.page('/messages/new?to=wing0cuhk')).headers.location, '/messages/c/2');
  assert.equal(
    (await jason.form('/messages/new?to=wing0cuhk', { body: 'One more thought' })).headers.location,
    '/messages/c/2',
  );
  assert.equal(await scalar('SELECT COUNT(*) FROM conversations'), 2);
  assert.equal(await scalar('SELECT COUNT(*) FROM messages WHERE conversation_id = 2'), 3);
});

test('MS-T14: self, invisible, deleted, hidden and invalid recipients refuse without writes', async () => {
  const mandy = await agentAs('mandy0hku');
  for (const [url, status] of [
    ['?post=600005', 400],
    ['?to=mandy0hku', 400],
    ['?post=600009', 404],
    ['?post=600010', 404],
    ['?post=600012&alias=9', 404],
    ['?to=nobody000', 404],
    ['?post=600012&alias=x', 404],
  ]) {
    assert.equal((await mandy.page('/messages/new' + url)).status, status, url);
    assert.equal((await mandy.form('/messages/new' + url, { body: 'hello' })).status, status, url);
  }
  assert.equal((await (await agentAs('wing0cuhk')).page('/messages/new?post=600001')).status, 404);
  assert.equal((await mandy.form('/messages/new?post=600012', { body: '   ' })).status, 400);
  assert.equal(await scalar('SELECT COUNT(*) FROM conversations'), 2);
});

test('MS-T15: non-members cannot read or write private conversations', async () => {
  for (const handle of ['newbie0hk', 'wing0cuhk']) {
    const agent = await agentAs(handle);
    assert.equal((await agent.page('/messages/c/1')).status, 404);
    assert.equal((await agent.form('/messages/c/1', { body: 'intrusion' })).status, 404);
    assert.equal((await agent.page('/messages/c/999')).status, 404);
  }
  assert.equal(await scalar('SELECT COUNT(*) FROM messages WHERE conversation_id = 1'), 3);
});

test('MS-T16: reading a conversation updates its pointer and badge on that response', async () => {
  const mandy = await agentAs('mandy0hku');
  const page = await mandy.page('/messages/c/1');
  assert.equal(page.status, 200);
  assert.equal(page.$('.messages-bubble').length, 3);
  assert.equal(page.$('[data-message-id="2"]').hasClass('is-mine'), true);
  assert.ok(page.$('main').text().includes('You appear as Host'));
  assert.equal(badge(page), 3);
  assert.equal((await mandy.page('/messages')).$('.messages-conversation .badge').length, 0);
  assert.equal(badge(await (await agentAs('jason0ust')).page('/messages/c/2')), 0);
});

test('MS-T17: sends trim text; invalid bodies and CSRF failures leave messages untouched', async () => {
  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.form('/messages/c/1', { body: '  Friday 2pm works.  ' })).status, 303);
  assert.equal(
    await scalar('SELECT body FROM messages ORDER BY message_id DESC LIMIT 1'),
    'Friday 2pm works.',
  );
  assert.equal(badge(await (await agentAs('kelvin0hk')).page('/messages')), 5);
  for (const body of ['', '  ', 'x'.repeat(1001)]) {
    const failed = await mandy.form('/messages/c/1', { body });
    assert.equal(failed.status, 400);
    assert.equal(failed.$('textarea[name="body"]').val(), body);
  }
  assert.equal(
    (await mandy.raw.post('/messages/c/1').type('form').send({ body: 'no token' })).status,
    403,
  );
  assert.equal(await scalar('SELECT COUNT(*) FROM messages WHERE conversation_id = 1'), 4);
});

test('MS-T18: post/comment reports redirect correctly and duplicates add no row', async () => {
  const newbie = await agentAs('newbie0hk');
  const form = await newbie.page('/report?type=post&id=600007');
  assert.equal(form.$('input[name="reason"]').length, 4);
  assert.equal(
    (await newbie.form('/report?type=post&id=600007', { reason: 'spam' })).headers.location,
    '/posts/600007',
  );
  assert.equal(await scalar('SELECT COUNT(*) FROM reports'), 4);
  assert.equal((await newbie.form('/report?type=post&id=600007', { reason: 'other' })).status, 303);
  assert.ok((await newbie.page('/posts/600007')).text.includes('You have already reported this'));
  assert.equal(await scalar('SELECT COUNT(*) FROM reports'), 4);
  assert.equal(
    (await newbie.form('/report?type=comment&id=11', { reason: 'other' })).headers.location,
    '/posts/600012#c11',
  );
});

test('MS-T19: report ownership, visibility, target types and required reason are enforced', async () => {
  assert.equal(
    (await (await agentAs('kelvin0hk')).page('/report?type=post&id=600007')).status,
    400,
  );
  assert.equal((await (await agentAs('mandy0hku')).page('/report?type=comment&id=10')).status, 400);
  assert.equal(
    (await (await agentAs('wing0cuhk')).page('/report?type=post&id=600007')).status,
    404,
  );
  const newbie = await agentAs('newbie0hk');
  for (const url of ['?type=comment&id=12', '?type=comment&id=6', '?type=user&id=2'])
    assert.equal((await newbie.page('/report' + url)).status, 404);
  const invalid = await newbie.form('/report?type=post&id=600007', {
    details: 'Please look at this',
  });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.text.includes('Pick a reason'));
  assert.equal(invalid.$('textarea[name="details"]').val(), 'Please look at this');
});

test('MS-T20: admins see one grouped target, raw text, authors and hidden audit records', async () => {
  const admin = await agentAs('admin0000');
  const initial = await admin.page('/admin/reports');
  assert.equal(initial.status, 200);
  assert.equal(initial.$('.messages-report').length, 1);
  assert.ok(initial.$('.messages-report').text().includes('kelvin0hk'));
  assert.equal(initial.$('.messages-hidden').length, 2);
  await (await agentAs('newbie0hk')).form('/report?type=post&id=600007', { reason: 'spam' });
  const grouped = await admin.page('/admin/reports');
  assert.equal(grouped.$('.messages-report').length, 1);
  assert.ok(grouped.$('.messages-report').text().includes('2 reports'));
  assert.ok(grouped.$('.messages-report').text().includes('spam, other'));
  assert.ok(
    grouped
      .$('.messages-report')
      .text()
      .includes('Who else heard the fire alarm in Haking Wong at 3am?'),
  );
});

test('MS-T21: hide resolves every open report and shared views hide posts and comment text', async () => {
  const newbie = await agentAs('newbie0hk');
  await newbie.form('/report?type=post&id=600007', { reason: 'spam' });
  const admin = await agentAs('admin0000');
  assert.equal((await admin.form('/admin/reports/3/hide')).status, 303);
  assert.ok((await admin.page('/admin/reports')).text.includes('Hidden. 2 reports resolved.'));
  assert.equal(
    await scalar(
      "SELECT COUNT(*) FROM reports WHERE target_type = 'post' AND target_id = 600007 AND resolution = 'hidden' AND resolved_by = 1",
    ),
    2,
  );
  assert.equal((await newbie.page('/posts/600007')).status, 404);
  assert.equal(await scalar('SELECT COUNT(*) FROM v_live_posts WHERE post_id = 600007'), 0);
  await newbie.form('/report?type=comment&id=11', { reason: 'harassment' });
  const reportId = await scalar(
    "SELECT report_id FROM reports WHERE reporter_id = 6 AND target_type = 'comment' AND target_id = 11",
  );
  await admin.form(`/admin/reports/${reportId}/hide`);
  assert.equal((await q.one('SELECT body FROM v_comment_items WHERE comment_id = 11')).body, null);
  assert.ok(
    (await (await agentAs('mandy0hku')).page('/messages/notifications'))
      .$('[data-notification-id="27"]')
      .text()
      .includes('[hidden by a moderator]'),
  );
});

test('MS-T22: dismiss preserves content and resolves the whole reported target', async () => {
  const newbie = await agentAs('newbie0hk');
  await newbie.form('/report?type=comment&id=13', { reason: 'other' });
  const id = await scalar(
    "SELECT report_id FROM reports WHERE target_type = 'comment' AND target_id = 13",
  );
  const admin = await agentAs('admin0000');
  assert.equal((await admin.form(`/admin/reports/${id}/dismiss`)).status, 303);
  await admin.form('/admin/reports/3/dismiss');
  assert.equal(
    await scalar('SELECT resolution FROM reports WHERE report_id = ?', [id]),
    'dismissed',
  );
  assert.equal(
    await scalar(
      "SELECT COUNT(*) FROM hidden_content WHERE target_type = 'comment' AND target_id = 13",
    ),
    0,
  );
  assert.ok((await admin.page('/admin/reports')).text.includes('No open reports.'));
});

test('MS-T23: restore is idempotent and retains resolved reports as an audit trail', async () => {
  const admin = await agentAs('admin0000');
  for (let i = 0; i < 2; i++)
    assert.equal((await admin.form('/admin/hidden/post/600010/restore')).status, 303);
  assert.equal(await scalar('SELECT COUNT(*) FROM v_live_posts WHERE post_id = 600010'), 1);
  assert.equal(await scalar('SELECT resolution FROM reports WHERE report_id = 1'), 'hidden');
  assert.equal((await admin.form('/admin/hidden/user/5/restore')).status, 404);
});

test('MS-T24: ordinary users cannot invoke any moderation action', async () => {
  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.page('/admin/reports')).status, 403);
  for (const url of [
    '/admin/reports/3/hide',
    '/admin/reports/3/dismiss',
    '/admin/hidden/post/600010/restore',
  ])
    assert.equal((await mandy.form(url)).status, 403);
  assert.equal(await scalar('SELECT resolution FROM reports WHERE report_id = 3'), null);
  assert.equal(await scalar('SELECT COUNT(*) FROM hidden_content'), 2);
  assert.equal((await (await agentAs('admin0000')).form('/admin/reports/999/hide')).status, 404);
});

test('MS-T25: anonymous message content never discloses participant handles or user IDs', async () => {
  for (const [handle, newPost] of [
    ['mandy0hku', 600012],
    ['kelvin0hk', 600001],
  ]) {
    const agent = await agentAs(handle);
    for (const url of [
      '/messages',
      '/messages/notifications',
      '/messages/c/1',
      `/messages/new?post=${newPost}`,
    ]) {
      const page = await agent.page(url);
      assert.equal(page.status, 200);
      const content = page.$('main').html();
      for (const hidden of ['mandy0hku', 'kelvin0hk', 'wing0cuhk', 'jason0ust', 'newbie0hk'])
        assert.ok(!content.includes(hidden), `${handle} sees ${hidden} on ${url}`);
      assert.ok(!/author_id|sender_id|recipient_id/.test(content));
    }
  }
});

test('MS-T26: Newbie has useful empty notifications and conversation states', async () => {
  const newbie = await agentAs('newbie0hk');
  const home = await newbie.page('/messages');
  assert.ok(home.text.includes('No conversations yet.'));
  assert.equal(home.$('a[href="/messages/notifications"]').length, 1);
  const notifications = await newbie.page('/messages/notifications');
  assert.ok(notifications.text.includes('No notifications yet.'));
  assert.equal(badge(notifications), 0);
});
