// The demo's golden path across all modules (PRODUCT_SPEC.md §6), written in integration week
// (COORDINATOR_ROADMAP.md §7, Sat 7 Nov). Sign-up and publishing run; later flows await integration.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resetDb, anon, agentAs, q } = require('../helpers');
const config = require('../../core/config');

// The upload belongs to this test process, separate from demo and other module test files.
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campusnote-golden-path-'));
config.uploadDir = uploadDir;
after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));
const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN5kAAAAASUVORK5CYII=',
  'base64',
);

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

test('2. Post: + -> text, a photo, Academics, anonymous -> Publish -> the new post page', async () => {
  const mandy = await agentAs('mandy0hku');
  const feed = await mandy.page('/feed');
  const composeLink = feed.$('a[href="/compose"]').first().attr('href');
  assert.equal(composeLink, '/compose');
  const compose = await mandy.page(composeLink);
  assert.equal(compose.status, 200);
  const form = compose.$('form[enctype="multipart/form-data"]');
  assert.equal(form.length, 1);
  const body = 'Study group for the database course, Thursday at the library.';
  const published = await mandy.raw
    .post(form.attr('action'))
    .field('body', body)
    .field('topic', 'academics')
    .field('show_handle', '0')
    .field('all_universities', '0')
    .attach('images', photo, { filename: 'study.png', contentType: 'image/png' });
  assert.equal(published.status, 303);
  assert.match(published.headers.location, /^\/posts\/\d+$/);
  const postId = Number(published.headers.location.split('/').pop());
  assert.deepEqual(
    await q.one(
      `SELECT p.author_id, p.body, p.is_anonymous, p.visibility, t.code AS topic
       FROM posts p JOIN topics t ON t.topic_id = p.topic_id WHERE p.post_id = ?`,
      [postId],
    ),
    { author_id: 2, body, is_anonymous: 1, visibility: 'university', topic: 'academics' },
  );
  assert.deepEqual(
    await q('SELECT user_id, alias_no FROM post_participants WHERE post_id = ?', [postId]),
    [{ user_id: 2, alias_no: 0 }],
  );
  const images = await q('SELECT position, file_path FROM post_images WHERE post_id = ?', [postId]);
  assert.equal(images.length, 1);
  assert.equal(images[0].position, 1);
  assert.deepEqual(
    fs.readFileSync(path.join(uploadDir, images[0].file_path.slice('/uploads/'.length))),
    photo,
  );
  const page = await mandy.page(published.headers.location);
  assert.equal(page.status, 200);
  assert.match(page.text, /Posted/);
  assert.equal(page.$('h1').text(), '#' + postId);
  assert.equal(page.$('.content-post .content-text').first().text(), body);
  assert.match(page.$('.content-post').text(), /Academics/);
  assert.equal(page.$('[data-content-image]').attr('href'), images[0].file_path);
  assert.equal(page.$('[data-content-image] img').attr('src'), images[0].file_path);
  assert.ok(!page.$('.content-post').html().includes('mandy0hku'));
  assert.equal(page.$('.sidebar-account strong').text(), 'mandy0hku');
  // Another HKU viewer sees the anonymous post; a CUHK viewer cannot open it.
  const reader = await (await agentAs('newbie0hk')).page(published.headers.location);
  assert.equal(reader.status, 200);
  assert.ok(!reader.text.includes('mandy0hku'));
  assert.equal((await (await agentAs('wing0cuhk')).page(published.headers.location)).status, 404);
});
test('3. Discuss: a comment as Alice, the badge, the notification, the Host reply', {
  todo: 'messages notification UI (MS-1, MS-2)',
});
test('4. Message privately: "Message the host" as Visitor', { todo: 'messages (MS-4, MS-5)' });
test('5. Moderate: report, Hide, "[hidden by a moderator]"', { todo: 'messages (MS-6, MS-7)' });
test('6. Book a ticket: Search -> Campus events -> Film night -> Book -> My tickets', {
  todo: 'discover, events',
});
