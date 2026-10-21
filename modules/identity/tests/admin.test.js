// ID-8 admin user list: search, ban and unban, make organization (DEV_GUIDE §7, ID-T30 to ID-T33).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, agentAs, q } = require('../../../test/helpers');
const { problems, flashAfter, count, menuLinks } = require('./support');

before(resetDb);

const JASON = { email: 'jason@connect.ust.hk', password: 'campus123' };
const rows = (page) =>
  page
    .$('article.user-row')
    .map((i, el) => {
      const row = page.$(el);
      const actions = row
        .find('form input[name="action"]')
        .map((j, input) => page.$(input).val())
        .get();
      return { handle: row.find('.user-handle').text().trim(), actions };
    })
    .get();
const statusOf = async (id) =>
  (await q.one('SELECT status FROM users WHERE user_id = ?', [id])).status;

test('ID-T30 the admin searches users; everyone else gets 403', async () => {
  const admin = await agentAs('admin0000');
  const page = await admin.page('/admin/users?q=cuhk');
  assert.equal(page.status, 200);
  assert.equal(page.$('input[name="q"]').val(), 'cuhk');
  assert.deepEqual(rows(page), [
    { handle: 'wing0cuhk', actions: ['ban', 'make_org'] },
    { handle: 'hikeclub0', actions: ['ban'] },
  ]);
  const ban = page.$('#u4 button[data-confirm]');
  assert.equal(ban.attr('data-confirm'), 'Ban wing0cuhk? They are logged out and cannot log in.');
  assert.ok(page.$('#u4').text().includes('wing@link.cuhk.edu.hk'));
  assert.equal(page.$('#u4 input[name="q"]').first().val(), 'cuhk');

  // An empty search lists every account; the admin's own row has no Ban; "_" is not a wildcard.
  const all = await admin.page('/admin/users');
  assert.equal(rows(all).length, await count('SELECT COUNT(*) AS n FROM users'));
  assert.deepEqual(rows(all)[0], { handle: 'admin0000', actions: [] });
  const underscore = await admin.page('/admin/users?q=_');
  assert.equal(rows(underscore).length, 0);
  assert.ok(underscore.text.includes('No accounts match this search.'));

  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.page('/admin/users')).status, 403);
  assert.equal((await mandy.form('/admin/users/5', { action: 'ban', q: '' })).status, 403);
  assert.equal(await statusOf(5), 'active');

  const missing = await admin.form('/admin/users/999', { action: 'ban', q: '' });
  assert.equal(missing.status, 404);
});

test('ID-T31 a ban logs Jason out and keeps him out until he is unbanned', async () => {
  const jason = await agentAs('jason0ust');
  assert.equal((await jason.page('/me')).status, 200);

  const admin = await agentAs('admin0000');
  const res = await admin.form('/admin/users/5', { action: 'ban', q: 'jason' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/admin/users?q=jason');
  assert.equal(await statusOf(5), 'banned');
  const list = await admin.page(res.headers.location);
  assert.equal(list.$('.flash').text().trim(), 'Banned jason0ust');
  assert.ok(list.$('#u5 .chip-danger').text().includes('Banned'));
  assert.deepEqual(rows(list), [{ handle: 'jason0ust', actions: ['unban', 'make_org'] }]);

  const me = await jason.page('/me');
  assert.equal(me.status, 303);
  assert.equal(me.headers.location, '/auth/login?next=%2Fme');
  const refused = await anon().form('/auth/login', JASON);
  assert.equal(refused.status, 403);
  assert.deepEqual(problems(refused), ['This account is suspended.']);

  const again = await admin.form('/admin/users/5', { action: 'ban', q: 'jason' });
  assert.equal(await flashAfter(admin, again), 'Already banned');

  const unban = await admin.form('/admin/users/5', { action: 'unban', q: 'jason' });
  assert.equal(unban.status, 303);
  assert.equal(await flashAfter(admin, unban), 'Unbanned jason0ust');
  assert.equal(await statusOf(5), 'active');
  const back = await anon().form('/auth/login', JASON);
  assert.equal(back.status, 303);
  assert.equal(back.headers.location, '/feed');
});

test('ID-T32 the admin cannot ban themself', async () => {
  const admin = await agentAs('admin0000');
  const res = await admin.form('/admin/users/1', { action: 'ban', q: 'admin' });
  assert.equal(res.status, 400);
  assert.deepEqual(problems(res), ['You cannot ban yourself.']);
  assert.equal(res.$('input[name="q"]').first().val(), 'admin');
  assert.equal(await statusOf(1), 'active');

  const unknown = await admin.form('/admin/users/4', { action: 'delete', q: '' });
  assert.equal(unknown.status, 400);
});

test('ID-T33 the admin turns Newbie into an organization', async () => {
  const admin = await agentAs('admin0000');
  const orgs = () => count('SELECT COUNT(*) AS n FROM organizations');
  const res = await admin.form('/admin/users/6', {
    action: 'make_org',
    display_name: 'HKU Chess Club',
    q: 'newbie',
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/admin/users?q=newbie');
  assert.equal(await flashAfter(admin, res), 'newbie0hk is now an organization: HKU Chess Club');
  const user = await q.one(
    `SELECT u.role, o.display_name FROM users u JOIN organizations o USING (user_id)
     WHERE u.user_id = 6`,
  );
  assert.deepEqual(user, { role: 'organization', display_name: 'HKU Chess Club' });
  const newbie = await agentAs('newbie0hk');
  assert.equal(menuLinks(await newbie.page('/me'))['My events'], '/events?mine=1');

  const n = await orgs();
  const again = await admin.form('/admin/users/6', {
    action: 'make_org',
    display_name: 'HKU Chess Club 2',
    q: 'newbie',
  });
  assert.equal(again.status, 400);
  assert.deepEqual(problems(again), ['Only a student account can become an organization.']);
  const blank = await admin.form('/admin/users/4', {
    action: 'make_org',
    display_name: '  ',
    q: '',
  });
  assert.equal(blank.status, 400);
  assert.deepEqual(problems(blank), ['Display name cannot be blank']);
  const long = await admin.form('/admin/users/4', {
    action: 'make_org',
    display_name: 'x'.repeat(61),
    q: '',
  });
  assert.equal(long.status, 400);
  assert.equal(await orgs(), n);
  const wing = await q.one('SELECT role FROM users WHERE user_id = 4');
  assert.equal(wing.role, 'student');
  const name = await q.one('SELECT display_name FROM organizations WHERE user_id = 6');
  assert.equal(name.display_name, 'HKU Chess Club');
});
