// The demo's golden path across all modules (PRODUCT_SPEC.md §6), written in integration week
// (COORDINATOR_ROADMAP.md §7, Sat 7 Nov). Flow 1 runs today; the others wait for their modules.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, q } = require('../helpers');

before(resetDb);

test('1. Sign up: register, read the code from the mail, choose a password, land on the feed', async () => {
  const sam = anon();
  const email = 'sam@connect.hku.hk';
  const reg = await sam.form('/auth/register', { email });
  assert.equal(reg.status, 303);
  assert.equal(reg.headers.location, '/auth/verify');
  const mail = await q.one(
    'SELECT body_text FROM outbox WHERE to_email = ? ORDER BY mail_id DESC LIMIT 1',
    [email],
  );
  const code = mail.body_text.match(/\b(\d{6})\b/)[1];
  const done = await sam.form('/auth/verify', {
    code,
    password: 'secret123',
    confirm: 'secret123',
  });
  assert.equal(done.status, 303);
  assert.equal(done.headers.location, '/feed');
  const feed = await sam.page('/feed');
  assert.equal(feed.status, 200);
  assert.match(feed.text, /Welcome to Campus Notes\. Your handle is [a-z0-9]{9}\./);
  assert.ok(feed.$('.post-card').length > 0);
});

test('2. Post: + -> text, a photo, Academics, anonymous -> Publish -> the new post page', {
  todo: 'content (CT-1, CT-2)',
});
test('3. Discuss: a comment as Alice, the badge, the notification, the Host reply', {
  todo: 'content, messages',
});
test('4. Message privately: "Message the host" as Visitor', { todo: 'messages (MS-4, MS-5)' });
test('5. Moderate: report, Hide, "[hidden by a moderator]"', { todo: 'messages (MS-6, MS-7)' });
test('6. Book a ticket: Search -> Campus events -> Film night -> Book -> My tickets', {
  todo: 'discover, events',
});
