// Routes of the identity module (docs/modules/identity/DEV_GUIDE.md §5): sign-up, login and logout,
// password reset, the Me hub, profile, settings, the four public pages and the admin user list.
// Every SQL statement is in queries.js; codes and passwords are only ever hashed, never logged.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../../core/config');
const { isDuplicate } = require('../../core/db');
const { requireRole, login, logout } = require('../../core/auth');
const { notFound, badRequest } = require('../../core/errors');
const { text, int, oneOf, bool } = require('../../core/validate');
const mailer = require('../../core/mailer');
const ui = require('../../core/ui');
const queries = require('./queries');
const { newCode, hashCode, sameHash, normaliseEmail, safeNext } = require('./secrets');

const router = express.Router();

// ---------------------------------------------------------------- constants

// ID-1 step 2: ASCII only on purpose (users.email ignores case and accents), at most 254 characters.
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// ID-2: compared against when the e-mail is unknown, so both failures take the same time.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(18).toString('base64'), 10);

// ID-7: the team fills this in before the demo (DEV_GUIDE §5, Contact).
const TEAM_CONTACT_URL = 'https://github.com/Michael-wzl/CampusNote/issues';

// ID-2: the development persona list on the login page (seed personas, DATA_MODEL.md §5).
const DEV_PERSONAS = [
  { handle: 'admin0000', role: 'admin', university: 'HKU' },
  { handle: 'mandy0hku', role: 'student', university: 'HKU' },
  { handle: 'kelvin0hk', role: 'student', university: 'HKU' },
  { handle: 'wing0cuhk', role: 'student', university: 'CUHK' },
  { handle: 'jason0ust', role: 'student', university: 'HKUST' },
  { handle: 'newbie0hk', role: 'student', university: 'HKU' },
  { handle: 'filmsoc00', role: 'organization', university: 'HKU' },
  { handle: 'hikeclub0', role: 'organization', university: 'CUHK' },
];

const SUBJECT = 'Your Campus Notes code';
const MSG = {
  badEmail: 'Enter a valid e-mail address.',
  notUniversity: 'Use your HKU, CUHK or HKUST e-mail address.',
  taken: 'This e-mail is already registered.',
  wait: 'Please wait a minute before asking for another code.',
  codeFormat: 'Enter the 6-digit code.',
  tooShort: 'Use at least 8 characters.',
  tooLong: 'Use at most 72 characters.',
  mismatch: 'The passwords do not match.',
  codeInvalid: 'This code is no longer valid. Request a new one.',
  codeExpired: 'This code has expired. Request a new one.',
  codeLocked: 'Too many wrong tries. Request a new code.',
  loginFailed: 'Wrong e-mail or password.',
  suspended: 'This account is suspended.',
  forgotSent: 'If an account exists for that e-mail, we sent a code.',
  currentWrong: 'Your current password is wrong.',
  pickAvatar: 'Pick an avatar.',
  selfBan: 'You cannot ban yourself.',
  notStudent: 'Only a student account can become an organization.',
};
const wrongCode = (left) => `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.`;

const STYLES = ['/m/identity/identity.css'];

// ---------------------------------------------------------------- helpers

const str = (v) => (typeof v === 'string' ? v : '');
const validEmail = (email) => email.length <= 254 && EMAIL_RE.test(email);
const domainOf = (email) => email.slice(email.lastIndexOf('@') + 1);
// The persona list and the mailbox link exist only in development, exactly when the backbone
// mounts /dev/* (ID-T17).
const devTools = () => config.isDev;

// Every local the field partial reads, so a page local of the same name never leaks into it.
const field = (locals) => ({
  type: 'text',
  value: '',
  error: null,
  max: null,
  hint: null,
  rows: null,
  autocomplete: null,
  inputmode: null,
  placeholder: null,
  ...locals,
});

function show(res, view, locals, status = 200) {
  return res.status(status).page(`identity/${view}`, {
    styles: STYLES,
    errors: {},
    values: {},
    alert: null,
    taken: false,
    field,
    ...locals,
  });
}

// A logged-in user who opens a sign-up, login or reset page goes to the feed (DEV_GUIDE §2).
function guestOnly(req, res, next) {
  if (req.me) return res.redirect(303, '/feed');
  next();
}

// ID-1 step 2 (format) and ID-3: the code field of the verify and reset forms.
function readCode(body, errors) {
  const code = str(body.code).trim();
  if (!/^\d{6}$/.test(code)) errors.code = MSG.codeFormat;
  return code;
}

// BR-3: 8 to 72 characters (bcrypt ignores anything after 72 bytes, so the limit is in bytes),
// typed twice.
function readNewPassword(body, errors) {
  const password = str(body.password);
  if ([...password].length < 8) errors.password = MSG.tooShort;
  else if (Buffer.byteLength(password, 'utf8') > 72) errors.password = MSG.tooLong;
  if (str(body.confirm) !== password) errors.confirm = MSG.mismatch;
  return password;
}

// BR-2: the code table of ID-1 step 3, shared with ID-3. -> { codeId } or { error }.
async function checkCode(email, purpose, code) {
  const row = await queries.latestCode(email, purpose);
  if (!row || row.consumed) return { error: MSG.codeInvalid };
  if (row.expired) return { error: MSG.codeExpired };
  if (row.attempts >= 5) return { error: MSG.codeLocked };
  if (!sameHash(hashCode(code), row.code_hash)) {
    await queries.addWrongTry(row.code_id);
    const left = 4 - row.attempts;
    return { error: left > 0 ? wrongCode(left) : MSG.codeLocked };
  }
  return { codeId: row.code_id };
}

// ID-1 steps 4 to 6, for register and resend: null when a code was sent, else why not.
async function sendRegisterCode(email) {
  if (await queries.findUserByEmail(email)) return { status: 400, taken: true };
  if (await queries.codeRequestedRecently(email, 'register'))
    return { status: 429, alert: MSG.wait };
  const code = newCode();
  await queries.createCode(email, 'register', hashCode(code));
  await mailer.send({
    to: email,
    subject: SUBJECT,
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
  return null;
}

// ---------------------------------------------------------------- ID-1 register

const registerPage = (res, locals, status) =>
  show(res, 'register', { title: 'Join Campus Notes', hideTabs: true, ...locals }, status);

const verifyPage = (res, email, locals, status) =>
  show(
    res,
    'verify',
    { title: 'Check your e-mail', hideTabs: true, email, devTools: devTools(), ...locals },
    status,
  );

router.get('/auth/register', guestOnly, (req, res) => registerPage(res, {}));

router.post('/auth/register', guestOnly, async (req, res) => {
  const email = normaliseEmail(req.body.email);
  const values = { email };
  if (!validEmail(email))
    return registerPage(res, { values, errors: { email: MSG.badEmail } }, 400);
  // BR-1: the domain decides the university, exactly
  if (!(await queries.universityForDomain(domainOf(email)))) {
    return registerPage(res, { values, errors: { email: MSG.notUniversity } }, 400);
  }
  const refused = await sendRegisterCode(email);
  if (refused) {
    const { status, ...why } = refused;
    return registerPage(res, { values, ...why }, status);
  }
  req.session.pendingEmail = email;
  res.done({ to: '/auth/verify', flash: `We sent a 6-digit code to ${email}.` });
});

router.get('/auth/verify', guestOnly, (req, res) => {
  const email = req.session.pendingEmail;
  if (!email) return res.redirect(303, '/auth/register');
  verifyPage(res, email, {});
});

router.post('/auth/verify', guestOnly, async (req, res) => {
  const email = req.session.pendingEmail;
  if (!email) return res.done({ to: '/auth/register' });

  // The form first: none of these counts as a try.
  const errors = {};
  const code = readCode(req.body, errors);
  const password = readNewPassword(req.body, errors);
  if (Object.keys(errors).length) return verifyPage(res, email, { errors }, 400);

  const check = await checkCode(email, 'register', code);
  if (check.error) return verifyPage(res, email, { errors: { code: check.error } }, 400);

  // bcrypt takes about 70 ms: before the transaction, never while holding a row lock.
  const passwordHash = await bcrypt.hash(password, 10);
  const university = await queries.universityForDomain(domainOf(email));
  if (!university) return verifyPage(res, email, { alert: MSG.notUniversity }, 400);
  const avatarCode = ui.avatars[crypto.randomInt(ui.avatars.length)];

  let result;
  try {
    result = await queries.registerUser(
      check.codeId,
      email,
      university.university_id,
      passwordHash,
      avatarCode,
    );
  } catch (err) {
    // registered meanwhile (users.email): rolled back, so the code stays unused
    if (isDuplicate(err)) return verifyPage(res, email, { alert: MSG.taken }, 400);
    throw err;
  }
  if (!result.ok) return verifyPage(res, email, { errors: { code: MSG.codeInvalid } }, 400);

  await login(req, result.userId);
  await queries.touchLogin(result.userId);
  res.done({ to: '/feed', flash: `Welcome to Campus Notes. Your handle is ${result.handle}.` });
});

router.post('/auth/resend', guestOnly, async (req, res) => {
  const email = req.session.pendingEmail;
  if (!email) return res.done({ to: '/auth/register' });
  const refused = await sendRegisterCode(email);
  if (refused) {
    const { status, ...why } = refused;
    return verifyPage(res, email, why, status);
  }
  res.done({ to: '/auth/verify', flash: `We sent a new code to ${email}.` });
});

// ---------------------------------------------------------------- ID-2 login and logout

function loginPage(req, res, locals, status) {
  const next = str(req.query.next);
  const action = next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login';
  const after = next && safeNext(next) === next ? `?next=${encodeURIComponent(next)}` : '';
  const personas = devTools()
    ? DEV_PERSONAS.map((p) => ({
        href: `/dev/login-as/${p.handle}${after}`,
        icon: 'me',
        label: `${p.handle} · ${p.role} · ${p.university}`,
      }))
    : [];
  return show(
    res,
    'login',
    { title: 'Log in', hideTabs: true, action, personas, ...locals },
    status,
  );
}

router.get('/auth/login', (req, res) => {
  if (req.me) return res.redirect(303, safeNext(req.query.next));
  loginPage(req, res, {});
});

router.post('/auth/login', async (req, res) => {
  if (req.me) return res.done({ to: safeNext(req.query.next) });
  const email = normaliseEmail(req.body.email);
  const password = str(req.body.password);
  const values = { email };
  // BR-3: the same words for an unknown e-mail and a wrong password
  const failed = () => loginPage(req, res, { values, alert: MSG.loginFailed }, 400);

  if (!validEmail(email)) return failed();
  const user = await queries.findUserByEmail(email);
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return failed();
  }
  if (!(await bcrypt.compare(password, user.password_hash))) return failed();
  // BR-3: checked after the password, so only the owner learns it
  if (user.status === 'banned') return loginPage(req, res, { values, alert: MSG.suspended }, 403);

  await login(req, user.user_id);
  await queries.touchLogin(user.user_id);
  res.done({ to: safeNext(req.query.next) });
});

// No GET logout: a link or an image could otherwise log people out.
router.post('/auth/logout', async (req, res) => {
  await logout(req);
  res.done({ to: '/auth/login' });
});

// ---------------------------------------------------------------- ID-3 forgot and reset

const forgotPage = (res, locals, status) =>
  show(
    res,
    'forgot',
    { title: 'Reset password', hideTabs: true, back: '/auth/login', ...locals },
    status,
  );

const resetPage = (res, email, locals, status) =>
  show(
    res,
    'reset',
    { title: 'Reset password', hideTabs: true, back: '/auth/forgot', email, ...locals },
    status,
  );

router.get('/auth/forgot', guestOnly, (req, res) => forgotPage(res, {}));

router.post('/auth/forgot', guestOnly, async (req, res) => {
  const email = normaliseEmail(req.body.email);
  if (!validEmail(email)) {
    return forgotPage(res, { values: { email }, errors: { email: MSG.badEmail } }, 400);
  }
  // The answer is the same for every address: no domain check, and the throttle is silent.
  const user = await queries.findUserByEmail(email);
  if (user && !(await queries.codeRequestedRecently(email, 'reset'))) {
    const code = newCode();
    await queries.createCode(email, 'reset', hashCode(code));
    await mailer.send({
      to: email,
      subject: SUBJECT,
      text: `Your password reset code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this e-mail.`,
    });
  }
  req.session.resetEmail = email;
  res.done({ to: '/auth/reset', flash: MSG.forgotSent });
});

router.get('/auth/reset', guestOnly, (req, res) => {
  const email = req.session.resetEmail;
  if (!email) return res.redirect(303, '/auth/forgot');
  resetPage(res, email, {});
});

router.post('/auth/reset', guestOnly, async (req, res) => {
  const email = req.session.resetEmail;
  if (!email) return res.done({ to: '/auth/forgot' });

  const errors = {};
  const code = readCode(req.body, errors);
  const password = readNewPassword(req.body, errors);
  if (Object.keys(errors).length) return resetPage(res, email, { errors }, 400);

  // A register code never works here (purpose 'reset'), nor the reverse.
  const check = await checkCode(email, 'reset', code);
  if (check.error) return resetPage(res, email, { errors: { code: check.error } }, 400);

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await queries.resetPassword(check.codeId, email, passwordHash);
  if (!result.ok) return resetPage(res, email, { errors: { code: MSG.codeInvalid } }, 400);
  if (result.status === 'banned') {
    delete req.session.resetEmail;
    return res.done({ to: '/auth/login', flash: MSG.suspended });
  }
  await login(req, result.userId);
  await queries.touchLogin(result.userId);
  res.done({ to: '/feed', flash: 'Password changed. You are logged in.' });
});

// ---------------------------------------------------------------- ID-4 Me hub

// WORK_DIVISION.md §4 row 7: the Me menu is the way into several other modules' pages.
function meMenu(me) {
  const groups = [
    [
      { href: '/me/posts', icon: 'feed', label: 'My posts' },
      { href: '/me/watching', icon: 'star', label: 'Watching' },
      { href: '/me/comments', icon: 'comment', label: 'My comments' },
      { href: '/me/history', icon: 'clock', label: 'History' },
      { href: '/me/likes', icon: 'heart', label: 'Liked' },
      { href: '/me/tickets', icon: 'ticket', label: 'My tickets' },
    ],
    [
      { href: '/me/profile', icon: 'me', label: 'Profile' },
      { href: '/me/settings', icon: 'gear', label: 'Settings' },
    ],
    [
      { href: '/about', icon: 'info', label: 'About' },
      { href: '/contact', icon: 'messages', label: 'Contact' },
    ],
    [
      { href: '/terms', icon: 'doc', label: 'Terms' },
      { href: '/privacy', icon: 'lock', label: 'Privacy' },
    ],
  ];
  // EV-6: organizations and admins create events, and this menu is the only way in
  if (me.isOrg || me.isAdmin) {
    groups.push([
      { href: '/events?mine=1', icon: 'calendar', label: 'My events' },
      { href: '/events/new', icon: 'plus', label: 'New event' },
    ]);
  }
  if (me.isAdmin) {
    groups.push([
      { href: '/admin/reports', icon: 'flag', label: 'Reports' },
      { href: '/admin/announcements', icon: 'bell', label: 'Announcements' },
      { href: '/admin/users', icon: 'me', label: 'Users' },
    ]);
  }
  groups.push([{ form: '/auth/logout', icon: 'logout', label: 'Log out', danger: true }]);
  return groups;
}

router.get('/me', async (req, res) => {
  const s = await queries.meStats(req.me.userId, req.me.universityId);
  show(res, 'me', {
    title: 'Me',
    tab: 'me',
    stats: [
      { label: 'My posts', value: s.posts, href: '/me/posts' },
      { label: 'Watching', value: s.watching, href: '/me/watching' },
      { label: 'Comments', value: s.comments, href: '/me/comments' },
      { label: 'Viewed', value: s.history, href: '/me/history' },
    ],
    groups: meMenu(req.me),
  });
});

// ---------------------------------------------------------------- ID-5 profile

async function profilePage(req, res, locals, status) {
  const profile = await queries.getProfile(req.me.userId);
  if (!profile) throw notFound();
  return show(
    res,
    'profile',
    {
      title: 'Profile',
      tab: null,
      back: '/me',
      profile,
      since: ui.date(profile.created_at), // "Member since 16 Oct 2026"
      values: { avatar: profile.avatar_code, bio: profile.bio },
      ...locals,
    },
    status,
  );
}

router.get('/me/profile', (req, res) => profilePage(req, res, {}));

router.post('/me/profile', async (req, res) => {
  const errors = {};
  const avatar = oneOf(req.body.avatar, ui.avatars, errors, 'avatar', MSG.pickAvatar);
  // BR-18: a bio may be empty; text() refuses blank input, so it checks only a non-empty one
  const bio =
    str(req.body.bio).trim() === ''
      ? ''
      : text(req.body.bio, { max: 160, label: 'Bio' }, errors, 'bio');
  if (Object.keys(errors).length) {
    return profilePage(req, res, { errors, values: { avatar, bio: str(req.body.bio) } }, 400);
  }
  await queries.updateProfile(req.me.userId, avatar, bio);
  res.done({ to: '/me/profile', flash: 'Profile saved' });
});

// ---------------------------------------------------------------- ID-6 settings and password

const settingsPage = (req, res, locals, status) =>
  show(
    res,
    'settings',
    {
      title: 'Settings',
      tab: null,
      back: '/me',
      prefs: {
        defaultAnonymous: req.me.defaultAnonymous,
        shareAll: req.me.defaultVisibility === 'all',
        notifyComments: req.me.notifyComments,
        notifyLikes: req.me.notifyLikes,
      },
      ...locals,
    },
    status,
  );

router.get('/me/settings', (req, res) => settingsPage(req, res, {}));

router.post('/me/settings', async (req, res) => {
  await queries.updateSettings(
    req.me.userId,
    bool(req.body.default_anonymous),
    bool(req.body.share_all) ? 'all' : 'university',
    bool(req.body.notify_comments),
    bool(req.body.notify_likes),
  );
  res.done({ to: '/me/settings', flash: 'Settings saved' });
});

router.post('/me/password', async (req, res) => {
  const errors = {};
  const current = str(req.body.current);
  const password = readNewPassword(req.body, errors);
  if (Object.keys(errors).length) return settingsPage(req, res, { errors }, 400);
  const hash = await queries.passwordHash(req.me.userId);
  if (!hash || !(await bcrypt.compare(current, hash))) {
    return settingsPage(req, res, { errors: { current: MSG.currentWrong } }, 400);
  }
  await queries.setPassword(req.me.userId, await bcrypt.hash(password, 10));
  res.done({ to: '/me/settings', flash: 'Password changed' });
});

// ---------------------------------------------------------------- ID-7 static pages

for (const [name, title] of [
  ['about', 'About'],
  ['contact', 'Contact'],
  ['terms', 'Terms'],
  ['privacy', 'Privacy'],
]) {
  router.get(`/${name}`, (req, res) =>
    show(res, name, {
      title,
      teamContactUrl: TEAM_CONTACT_URL,
      // logged out, the tab bar would only lead to the login wall
      ...(req.me ? { tab: 'me', back: '/me' } : { tab: null, back: '/auth/login', hideTabs: true }),
    }),
  );
}

// ---------------------------------------------------------------- ID-8 admin user list

const term = (v) => str(v).trim();

async function usersPage(res, q, locals, status) {
  const users = await queries.searchUsers(q);
  return show(
    res,
    'users',
    { title: 'Users', tab: null, back: '/me', q, users, ...locals },
    status,
  );
}

router.get('/admin/users', requireRole('admin'), (req, res) =>
  usersPage(res, term(req.query.q), {}),
);

router.post('/admin/users/:id', requireRole('admin'), async (req, res) => {
  const id = int(req.params.id, { min: 1 });
  const user = id === null ? null : await queries.getProfile(id);
  if (!user) throw notFound();
  const q = term(req.body.q);
  const to = '/admin/users?q=' + encodeURIComponent(q);

  switch (req.body.action) {
    case 'ban': {
      if (id === req.me.userId) return usersPage(res, q, { alert: MSG.selfBan }, 400);
      const changed = await queries.banUser(id, req.me.userId);
      return res.done({ to, flash: changed ? `Banned ${user.handle}` : 'Already banned' });
    }
    case 'unban':
      await queries.unbanUser(id);
      return res.done({ to, flash: `Unbanned ${user.handle}` });
    case 'make_org': {
      const errors = {};
      const name = text(
        req.body.display_name,
        { max: 60, label: 'Display name' },
        errors,
        'display_name',
      );
      if (errors.display_name) return usersPage(res, q, { alert: errors.display_name }, 400);
      if (!(await queries.makeOrganization(id, name))) {
        return usersPage(res, q, { alert: MSG.notStudent }, 400);
      }
      return res.done({ to, flash: `${user.handle} is now an organization: ${name}` });
    }
    default:
      throw badRequest();
  }
});

module.exports = router;
