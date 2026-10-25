const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, q, make } = require('../../../test/helpers');

beforeEach(resetDb);

const badge = (page) => Number(page.$('a[href="/messages"] .badge').first().text() || 0);

test('MS-I01: a student profile links to first send, conversation reuse and the return profile', async () => {
  const newbie = await agentAs('newbie0hk');
  const profile = await newbie.page('/u/jason0ust');
  const entry = profile.$('.user-summary a').attr('href');
  assert.equal(entry, '/messages/new?to=jason0ust');
  const compose = await newbie.page(entry);
  assert.equal(compose.status, 200);
  assert.equal(compose.$('.topbar-back').attr('href'), '/u/jason0ust');
  assert.ok(compose.$('main').text().includes('They will see your handle'));
  const sent = await newbie.form(compose.$('form[method="post"]').attr('action'), {
    body: 'Hello from your public profile.',
  });
  assert.equal(sent.status, 303);
  const conversation = await newbie.page(sent.headers.location);
  assert.ok(conversation.$('.messages-thread').text().includes('Hello from your public profile.'));
  const back = conversation.$('.messages-context a').attr('href');
  assert.equal(back, '/u/jason0ust');
  assert.equal((await newbie.page(back)).status, 200);
  const reused = await newbie.page(entry);
  assert.equal(reused.status, 303);
  assert.equal(reused.headers.location, sent.headers.location);
  const rows = await q(
    'SELECT post_id FROM conversations WHERE user_lo = ? AND user_hi = ?',
    [5, 6],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].post_id, null);
  assert.ok(
    (await (await agentAs('jason0ust')).page(sent.headers.location))
      .$('.messages-context')
      .text()
      .includes('newbie0hk'),
  );
});

test('MS-I02: an organization profile keeps its display name and a working return link', async () => {
  const newbie = await agentAs('newbie0hk');
  const profile = await newbie.page('/u/filmsoc00');
  assert.equal(profile.$('h1').text(), 'HKU Film Society');
  const compose = await newbie.page(profile.$('.user-summary a').attr('href'));
  assert.equal(compose.status, 200);
  assert.ok(compose.$('h2').text().includes('HKU Film Society'));
  const sent = await newbie.form(compose.$('form[method="post"]').attr('action'), {
    body: 'Is the next screening open to new members?',
  });
  assert.equal(sent.status, 303);
  const conversation = await newbie.page(sent.headers.location);
  const link = conversation.$('.messages-context a');
  assert.equal(link.text(), 'HKU Film Society');
  assert.equal(link.attr('href'), '/u/filmsoc00');
  assert.equal((await newbie.page(link.attr('href'))).status, 200);
});

test('MS-I03: own and banned profiles have no Message entry and direct requests stay protected', async () => {
  const newbie = await agentAs('newbie0hk');
  assert.equal((await newbie.page('/u/newbie0hk')).$('.user-summary a').length, 0);
  assert.equal((await newbie.page('/messages/new?to=newbie0hk')).status, 400);
  // Identity fixture: a banned profile remains public while Messages refuses new conversations.
  await q("UPDATE users SET status = 'banned' WHERE user_id = ?", [5]);
  const banned = await newbie.page('/u/jason0ust');
  assert.equal(banned.status, 200);
  assert.equal(banned.$('.user-summary a').length, 0);
  assert.equal((await newbie.page('/messages/new?to=jason0ust')).status, 404);
  assert.equal(
    (await newbie.form('/messages/new?to=jason0ust', { body: 'Not allowed' })).status,
    404,
  );
  assert.equal((await q('SELECT conversation_id FROM conversations')).length, 2);
});

test('MS-I04: Content and public profile entries keep the same user pair in separate contexts', async () => {
  const newbie = await agentAs('newbie0hk');
  const post = await newbie.page('/posts/600001');
  const anonymousEntry = post.$('a[href="/messages/new?post=600001"]').attr('href');
  assert.ok(anonymousEntry);
  const compose = await newbie.page(anonymousEntry);
  const anonymous = await newbie.form(compose.$('form[method="post"]').attr('action'), {
    body: 'Anonymous integration question.',
  });
  assert.equal(anonymous.status, 303);
  const profile = await newbie.page('/u/mandy0hku');
  const publicCompose = await newbie.page(profile.$('.user-summary a').attr('href'));
  const named = await newbie.form(publicCompose.$('form[method="post"]').attr('action'), {
    body: 'A separate public conversation.',
  });
  assert.equal(named.status, 303);
  assert.notEqual(anonymous.headers.location, named.headers.location);
  const anonymousPage = await newbie.page(anonymous.headers.location);
  assert.ok(anonymousPage.$('.messages-context').text().includes('You appear as Visitor'));
  assert.doesNotMatch(anonymousPage.$('main').html(), /mandy0hku|newbie0hk|\/u\//);
  assert.equal(
    (await newbie.page(named.headers.location)).$('.messages-context a').attr('href'),
    '/u/mandy0hku',
  );
  const contexts = await q(
    'SELECT context_key FROM conversations WHERE user_lo = ? AND user_hi = ? ORDER BY context_key',
    [2, 6],
  );
  assert.deepEqual(
    contexts.map((row) => row.context_key),
    [0, 600001],
  );
});

test('MS-I05: moderation hide and restore propagate to Feed, My posts and the public profile', async () => {
  // Content fixture: a named, all-university post exercises every newly merged list.
  const postId = await make.post({ author: 'mandy0hku', anonymous: false, visibility: 'all' });
  const newbie = await agentAs('newbie0hk');
  const mandy = await agentAs('mandy0hku');
  const lists = [
    [newbie, '/feed?tab=all'],
    [newbie, '/feed?tab=uni'],
    [mandy, '/me/posts'],
    [newbie, '/u/mandy0hku'],
  ];
  async function assertListed(expected) {
    for (const [agent, url] of lists) {
      const page = await agent.page(url);
      assert.equal(page.status, 200, url);
      assert.equal(page.$(`a.post-card[href="/posts/${postId}"]`).length, expected, url);
    }
  }
  await assertListed(1);
  const post = await newbie.page('/posts/' + postId);
  const reportLink = post.$(`a[href="/report?type=post&id=${postId}"]`).attr('href');
  assert.ok(reportLink);
  const report = await newbie.page(reportLink);
  assert.equal(
    (await newbie.form(report.$('form[method="post"]').attr('action'), { reason: 'spam' })).status,
    303,
  );
  const row = await q.one('SELECT report_id FROM reports WHERE target_type = ? AND target_id = ?', [
    'post',
    postId,
  ]);
  const admin = await agentAs('admin0000');
  assert.equal((await admin.form(`/admin/reports/${row.report_id}/hide`)).status, 303);
  await assertListed(0);
  assert.equal((await newbie.page('/posts/' + postId)).status, 404);
  assert.equal((await admin.form(`/admin/hidden/post/${postId}/restore`)).status, 303);
  await assertListed(1);
  assert.equal((await newbie.page('/posts/' + postId)).status, 200);
  const audit = await q.one('SELECT resolution, resolved_by FROM reports WHERE report_id = ?', [
    row.report_id,
  ]);
  assert.equal(audit.resolution, 'hidden');
  assert.equal(audit.resolved_by, 1);
});

test('MS-I06: Discover pages share the badge without marking notifications or conversations read', async () => {
  const mandy = await agentAs('mandy0hku');
  for (const url of ['/messages', '/feed?tab=all', '/feed?tab=uni', '/me/posts', '/u/jason0ust']) {
    const page = await mandy.page(url);
    assert.equal(page.status, 200, url);
    assert.equal(badge(page), 4, url);
  }
  const notifications = await q.one(
    'SELECT COUNT(*) AS unread FROM notifications WHERE recipient_id = ? AND read_at IS NULL',
    [2],
  );
  const pointer = await q.one(
    'SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = ? AND user_id = ?',
    [1, 2],
  );
  assert.equal(notifications.unread, 3);
  assert.equal(pointer.last_read_message_id, 2);
  assert.equal(badge(await mandy.page('/messages/notifications')), 1);
  assert.equal(badge(await mandy.page('/u/jason0ust')), 1);
  assert.equal(badge(await mandy.page('/messages/c/1')), 0);
  assert.equal(badge(await mandy.page('/feed')), 0);
});
