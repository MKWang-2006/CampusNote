// ID-3 forgot password and reset (DEV_GUIDE §7, ID-T18 to ID-T20).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, make, q } = require('../../../test/helpers');
const {
  lastCode,
  otherCode,
  problems,
  flashAfter,
  count,
  hashOf,
  restoreHash,
} = require('./support');

before(resetDb);

const SENT = 'If an account exists for that e-mail, we sent a code.';
const mailsTo = (email) => count('SELECT COUNT(*) AS n FROM outbox WHERE to_email = ?', [email]);
const codesFor = (email) => count('SELECT COUNT(*) AS n FROM email_codes WHERE email = ?', [email]);

test('ID-T18 forgot answers the same for unknown and foreign addresses, and sends nothing', async () => {
  const mails = await count('SELECT COUNT(*) AS n FROM outbox');
  const codes = await count('SELECT COUNT(*) AS n FROM email_codes');
  for (const email of ['nobody@connect.hku.hk', 'x@gmail.com']) {
    const visitor = anon();
    const res = await visitor.form('/auth/forgot', { email });
    assert.equal(res.status, 303, email);
    assert.equal(res.headers.location, '/auth/reset', email);
    assert.equal(await flashAfter(visitor, res), SENT, email);
  }
  assert.equal(await count('SELECT COUNT(*) AS n FROM outbox'), mails);
  assert.equal(await count('SELECT COUNT(*) AS n FROM email_codes'), codes);

  const bad = await anon().form('/auth/forgot', { email: 'not-an-email' });
  assert.equal(bad.status, 400);
  assert.deepEqual(problems(bad), ['Enter a valid e-mail address.']);
});

test('ID-T19 Mandy resets her password by code', async () => {
  const email = 'mandy@connect.hku.hk';
  const oldHash = await hashOf('mandy0hku');
  try {
    const visitor = anon();
    const first = await visitor.form('/auth/forgot', { email });
    assert.equal(first.status, 303);
    assert.equal(await mailsTo(email), 1);
    const mail = await q.one('SELECT subject, body_text FROM outbox WHERE to_email = ?', [email]);
    assert.equal(mail.subject, 'Your Campus Notes code');
    const code = await lastCode(email);
    assert.equal(
      mail.body_text,
      `Your password reset code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this e-mail.`,
    );

    const again = await visitor.form('/auth/forgot', { email });
    assert.equal(again.status, 303);
    assert.equal(again.headers.location, '/auth/reset');
    assert.equal(await flashAfter(visitor, again), SENT);
    assert.equal(await mailsTo(email), 1, 'the throttle is silent: no second mail');

    const res = await visitor.form('/auth/reset', {
      code,
      password: 'newpass123',
      confirm: 'newpass123',
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, '/feed');
    assert.equal(await flashAfter(visitor, res), 'Password changed. You are logged in.');
    const me = await visitor.page('/me');
    assert.equal(me.status, 200);
    assert.equal(me.$('.me-handle').text().trim(), 'mandy0hku');

    const out = await visitor.form('/auth/logout');
    assert.equal(out.status, 303);
    const old = await anon().form('/auth/login', { email, password: 'campus123' });
    assert.equal(old.status, 400);
    const fresh = await anon().form('/auth/login', { email, password: 'newpass123' });
    assert.equal(fresh.status, 303);
    assert.equal(fresh.headers.location, '/feed');
  } finally {
    await restoreHash('mandy0hku', oldHash);
  }
});

test('ID-T20 a wrong reset code costs a try; no pending reset, no reset page', async () => {
  const { handle } = await make.user();
  const { email } = await q.one('SELECT email FROM users WHERE handle = ?', [handle]);
  const visitor = anon();
  await visitor.form('/auth/forgot', { email });
  assert.equal(await codesFor(email), 1);
  const code = await lastCode(email);

  const page = await visitor.page('/auth/reset');
  assert.equal(page.status, 200);
  assert.equal(page.$('form[action="/auth/forgot"] input[name="email"]').val(), email);

  const res = await visitor.form('/auth/reset', {
    code: otherCode(code),
    password: 'newpass123',
    confirm: 'newpass123',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(problems(res), ['Wrong code. 4 tries left.']);

  // A reset code never works for sign-up, nor a sign-up code for a reset.
  assert.equal(await codesFor(email), 1);
  const row = await q.one('SELECT purpose, attempts FROM email_codes WHERE email = ?', [email]);
  assert.deepEqual(row, { purpose: 'reset', attempts: 1 });

  const none = await anon().page('/auth/reset');
  assert.equal(none.status, 303);
  assert.equal(none.headers.location, '/auth/forgot');
});
