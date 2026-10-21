// ID-1 sign-up: register, verify and resend (DEV_GUIDE §7, ID-T01 to ID-T09).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, make, q } = require('../../../test/helpers');
const {
  lastCode,
  otherCode,
  sha256,
  letAMinutePass,
  problems,
  flashAfter,
  count,
} = require('./support');

before(resetDb);

const PASSWORD = { password: 'secret123', confirm: 'secret123' };

// Steps 1 and 2 up to the code: a visitor with a pending sign-up, and the mailed code.
async function startSignUp(email) {
  const visitor = anon();
  const res = await visitor.form('/auth/register', { email });
  assert.equal(res.status, 303, `register ${email}`);
  assert.equal(res.headers.location, '/auth/verify');
  return { visitor, code: await lastCode(email.trim().toLowerCase()) };
}

const usersWith = (email) => count('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email]);

test('ID-T01 register, verify and land on the feed', async () => {
  const email = 't01@connect.hku.hk';
  const visitor = anon();
  const res = await visitor.form('/auth/register', { email });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/auth/verify');

  const mails = await q('SELECT subject, body_text FROM outbox WHERE to_email = ?', [email]);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].subject, 'Your Campus Notes code');
  const code = mails[0].body_text.match(/\b(\d{6})\b/)[1];
  assert.equal(mails[0].body_text, `Your verification code is ${code}. It expires in 10 minutes.`);
  const rows = await q('SELECT code_hash FROM email_codes WHERE email = ?', [email]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code_hash, sha256(code)); // the SHA-256 of the mailed code
  assert.notEqual(rows[0].code_hash, code); // not the code

  const verify = await visitor.page('/auth/verify');
  assert.equal(verify.status, 200);
  assert.equal(verify.$('.flash').text().trim(), `We sent a 6-digit code to ${email}.`);
  assert.match(
    verify.text,
    /Enter the code we sent to t01@connect\.hku\.hk\. It is valid for 10 minutes\./,
  );
  assert.equal(verify.$('nav.tabbar').length, 0);

  const done = await visitor.form('/auth/verify', { code, ...PASSWORD });
  assert.equal(done.status, 303);
  assert.equal(done.headers.location, '/feed');
  assert.match(
    await flashAfter(visitor, done),
    /^Welcome to Campus Notes\. Your handle is [a-z0-9]{9}\.$/,
  );

  const user = await q.one('SELECT * FROM users WHERE email = ?', [email]);
  assert.equal(user.university_id, 1);
  assert.equal(user.role, 'student');
  assert.match(user.handle, /^[a-z0-9]{9}$/);
  assert.ok(user.password_hash.startsWith('$2'));
  assert.equal(Number(user.default_anonymous), 1);
  assert.equal(user.default_visibility, 'university');
  assert.ok(user.last_login_at, 'touchLogin ran');

  const me = await visitor.page('/me');
  assert.equal(me.status, 200);
  assert.equal(me.$('.me-handle').text().trim(), user.handle);
  assert.match(me.$('.me-card').text(), /\bHKU\b/);
});

test('ID-T02 other domains and malformed addresses are refused', async () => {
  const codes = await count('SELECT COUNT(*) AS n FROM email_codes');
  const mails = await count('SELECT COUNT(*) AS n FROM outbox');
  const visitor = anon();
  for (const email of ['x@gmail.com', 'x@cs.hku.hk', 'x@hku.hk.evil.com']) {
    const res = await visitor.form('/auth/register', { email });
    assert.equal(res.status, 400, email);
    assert.deepEqual(problems(res), ['Use your HKU, CUHK or HKUST e-mail address.'], email);
  }
  const bad = await visitor.form('/auth/register', { email: 'not-an-email' });
  assert.equal(bad.status, 400);
  assert.deepEqual(problems(bad), ['Enter a valid e-mail address.']);
  assert.equal(await count('SELECT COUNT(*) AS n FROM email_codes'), codes);
  assert.equal(await count('SELECT COUNT(*) AS n FROM outbox'), mails);
});

test('ID-T03 the address is trimmed and lower-cased; the domain picks CUHK', async () => {
  const { visitor, code } = await startSignUp('  T03@Link.CUHK.edu.hk ');
  const email = 't03@link.cuhk.edu.hk';
  assert.equal(await count('SELECT COUNT(*) AS n FROM email_codes WHERE email = ?', [email]), 1);
  assert.equal(await count('SELECT COUNT(*) AS n FROM outbox WHERE to_email = ?', [email]), 1);
  assert.ok(code);
  const done = await visitor.form('/auth/verify', { code, ...PASSWORD });
  assert.equal(done.status, 303);
  const user = await q.one('SELECT university_id FROM users WHERE email = ?', [email]);
  assert.equal(user.university_id, 2);
});

test('ID-T04 a wrong code costs a try; then the right code works', async () => {
  const email = 't04@connect.hku.hk';
  const { visitor, code } = await startSignUp(email);
  const wrong = await visitor.form('/auth/verify', { code: otherCode(code), ...PASSWORD });
  assert.equal(wrong.status, 400);
  assert.deepEqual(problems(wrong), ['Wrong code. 4 tries left.']);
  const row = await q.one('SELECT attempts FROM email_codes WHERE email = ?', [email]);
  assert.equal(row.attempts, 1);
  assert.equal(await usersWith(email), 0);

  const right = await visitor.form('/auth/verify', { code, ...PASSWORD });
  assert.equal(right.status, 303);
  assert.equal(right.headers.location, '/feed');
  assert.equal(await usersWith(email), 1);
});

test('ID-T05 form errors are not tries', async () => {
  const email = 't05@connect.hku.hk';
  const { visitor, code } = await startSignUp(email);
  const cases = [
    [{ code: 'abc', ...PASSWORD }, 'Enter the 6-digit code.'],
    [{ code, password: 'short', confirm: 'short' }, 'Use at least 8 characters.'],
    [{ code, password: 'secret123', confirm: 'secret124' }, 'The passwords do not match.'],
  ];
  for (const [body, message] of cases) {
    const res = await visitor.form('/auth/verify', body);
    assert.equal(res.status, 400, message);
    assert.deepEqual(problems(res), [message]);
  }
  const row = await q.one('SELECT attempts FROM email_codes WHERE email = ?', [email]);
  assert.equal(row.attempts, 0);
  assert.equal(await usersWith(email), 0);
});

test('ID-T06 five wrong codes use the code up', async () => {
  const email = 't06@connect.hku.hk';
  const { visitor, code } = await startSignUp(email);
  const answers = [];
  for (let i = 0; i < 5; i++) {
    const res = await visitor.form('/auth/verify', { code: otherCode(code), ...PASSWORD });
    assert.equal(res.status, 400);
    answers.push(...problems(res));
  }
  assert.deepEqual(answers, [
    'Wrong code. 4 tries left.',
    'Wrong code. 3 tries left.',
    'Wrong code. 2 tries left.',
    'Wrong code. 1 try left.',
    'Too many wrong tries. Request a new code.',
  ]);
  const right = await visitor.form('/auth/verify', { code, ...PASSWORD });
  assert.equal(right.status, 400);
  assert.deepEqual(problems(right), ['Too many wrong tries. Request a new code.']);
  assert.equal(await usersWith(email), 0);
});

test('ID-T07 an expired code is refused', async () => {
  const email = 't07@connect.hku.hk';
  const { visitor, code } = await startSignUp(email);
  await q(
    'UPDATE email_codes SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE email = ?',
    [email],
  );
  const res = await visitor.form('/auth/verify', { code, ...PASSWORD });
  assert.equal(res.status, 400);
  assert.deepEqual(problems(res), ['This code has expired. Request a new one.']);
  assert.equal(await usersWith(email), 0);
});

test('ID-T08 resend is throttled for a minute; only the newest code works', async () => {
  const email = 't08@connect.hku.hk';
  const { visitor, code: first } = await startSignUp(email);
  const codes = () => count('SELECT COUNT(*) AS n FROM email_codes WHERE email = ?', [email]);
  const mails = () => count('SELECT COUNT(*) AS n FROM outbox WHERE to_email = ?', [email]);

  const soon = await visitor.form('/auth/resend');
  assert.equal(soon.status, 429);
  assert.deepEqual(problems(soon), ['Please wait a minute before asking for another code.']);
  assert.equal(await codes(), 1);
  assert.equal(await mails(), 1);

  let second = first;
  while (second === first) {
    // a new code equal to the old one (one chance in a million) would prove nothing: ask again
    await letAMinutePass(email);
    const res = await visitor.form('/auth/resend');
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, '/auth/verify');
    assert.equal(await flashAfter(visitor, res), `We sent a new code to ${email}.`);
    second = await lastCode(email);
  }
  assert.ok((await codes()) >= 2);
  assert.ok((await mails()) >= 2);

  const old = await visitor.form('/auth/verify', { code: first, ...PASSWORD });
  assert.equal(old.status, 400);
  assert.deepEqual(problems(old), ['Wrong code. 4 tries left.']);
  const ok = await visitor.form('/auth/verify', { code: second, ...PASSWORD });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.location, '/feed');
  assert.equal(await usersWith(email), 1);
});

test('ID-T09 a registered e-mail is refused, also when it was registered meanwhile', async () => {
  const visitor = anon();
  for (const email of ['mandy@connect.hku.hk', 'MANDY@Connect.hku.hk']) {
    const res = await visitor.form('/auth/register', { email });
    assert.equal(res.status, 400, email);
    assert.deepEqual(problems(res), [
      'This e-mail is already registered. Log in or reset your password.',
    ]);
    assert.equal(res.$('.alert a[href="/auth/login"]').text(), 'Log in');
    assert.equal(res.$('.alert a[href="/auth/forgot"]').text(), 'reset your password');
  }
  assert.equal(
    await count('SELECT COUNT(*) AS n FROM email_codes WHERE email = ?', ['mandy@connect.hku.hk']),
    0,
  );

  // The race: the address gets an account after the code was sent.
  const email = 't09@connect.hku.hk';
  const { visitor: racer, code } = await startSignUp(email);
  await make.user({ email });
  const res = await racer.form('/auth/verify', { code, ...PASSWORD });
  assert.equal(res.status, 400);
  assert.deepEqual(problems(res), ['This e-mail is already registered.']);
  const row = await q.one('SELECT consumed_at FROM email_codes WHERE email = ?', [email]);
  assert.equal(row.consumed_at, null);
  assert.equal(await usersWith(email), 1);
});
