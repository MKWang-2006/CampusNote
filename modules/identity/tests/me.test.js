// ID-4 Me hub, ID-5 profile, ID-6 settings and password (DEV_GUIDE §7, ID-T21 to ID-T29).
// The count-to-list check still needs Discover's lists (CP2); Clear history is integrated.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, anon, agentAs, make, q } = require('../../../test/helpers');
const {
  problems,
  flashAfter,
  count,
  hashOf,
  restoreHash,
  meStats,
  menuLabels,
  menuLinks,
} = require('./support');

before(resetDb);

const STAT_LINKS = ['/me/posts', '/me/watching', '/me/comments', '/me/history'];
const COMMON_MENU = [
  'My posts',
  'Watching',
  'My comments',
  'History',
  'Liked',
  'My tickets',
  'Profile',
  'Settings',
  'About',
  'Contact',
  'Terms',
  'Privacy',
];
const values = (page) => meStats(page).map((s) => s.value);

test("ID-T21 Mandy's Me hub: counts, identity and menu", async () => {
  const mandy = await agentAs('mandy0hku');
  const page = await mandy.page('/me');
  assert.equal(page.status, 200);
  const stats = meStats(page);
  assert.deepEqual(
    stats.map((s) => s.label),
    ['My posts', 'Watching', 'Comments', 'Viewed'],
  );
  assert.deepEqual(values(page), [3, 2, 4, 4]);
  assert.deepEqual(
    stats.map((s) => s.href),
    STAT_LINKS,
  );
  assert.equal(page.$('.me-handle').text().trim(), 'mandy0hku');
  assert.equal(page.$('.me-card .chip').text().trim(), 'HKU');
  assert.equal(page.$('img.me-banner').attr('src'), '/m/identity/banner.svg');
  assert.equal(page.$('nav.tabbar a[aria-current="page"]').attr('href'), '/me');

  assert.deepEqual(menuLabels(page), [...COMMON_MENU, 'Log out']);
  for (const label of ['My events', 'New event', 'Reports', 'Announcements', 'Users']) {
    assert.ok(!menuLabels(page).includes(label), label);
  }
  const last = page.$('.menu-row').last();
  const form = last.find('form');
  assert.equal(form.attr('method'), 'post');
  assert.equal(form.attr('action'), '/auth/logout');
  const token = page.$('meta[name="csrf-token"]').attr('content');
  assert.ok(token);
  assert.equal(form.find('input[name="_csrf"]').val(), token);
  assert.equal(last.find('.menu-label').text().trim(), 'Log out');

  // Every menu link answers (the placeholder pages of modules not built yet count, CP1).
  for (const href of Object.values(menuLinks(page))) {
    assert.equal((await mandy.page(href)).status, 200, href);
  }
});

test('ID-T22 an organization sees the events group, not the admin group', async () => {
  const film = await agentAs('filmsoc00');
  const page = await film.page('/me');
  assert.deepEqual(values(page), [1, 0, 0, 0]);
  const links = menuLinks(page);
  assert.equal(links['My events'], '/events?mine=1');
  assert.equal(links['New event'], '/events/new');
  assert.equal(links.Reports, undefined);
  assert.equal(links.Users, undefined);
  assert.equal(links.Announcements, undefined);
});

test('ID-T23 an admin sees the events group and the admin group', async () => {
  const admin = await agentAs('admin0000');
  const page = await admin.page('/me');
  assert.deepEqual(values(page), [0, 0, 0, 0]);
  const links = menuLinks(page);
  assert.equal(links['My events'], '/events?mine=1');
  assert.equal(links['New event'], '/events/new');
  assert.equal(links.Reports, '/admin/reports');
  assert.equal(links.Announcements, '/admin/announcements');
  assert.equal(links.Users, '/admin/users');
  assert.equal(menuLabels(page).at(-1), 'Log out');
});

test('ID-T24 Newbie has four zeros and only the common groups; a post counts at once', async () => {
  const newbie = await agentAs('newbie0hk');
  let page = await newbie.page('/me');
  assert.deepEqual(values(page), [0, 0, 0, 0]);
  assert.deepEqual(menuLabels(page), [...COMMON_MENU, 'Log out']);
  assert.equal(page.$('ul.menu-group').length, 5, 'four common groups and Log out');
  await make.post({ author: 'newbie0hk' });
  page = await newbie.page('/me');
  assert.deepEqual(values(page), [1, 0, 0, 0]);
});

test('ID-T25 the profile shows the account; organizations also see their name', async () => {
  const mandy = await agentAs('mandy0hku');
  const page = await mandy.page('/me/profile');
  assert.equal(page.status, 200);
  for (const s of ['mandy0hku', 'mandy@connect.hku.hk', 'The University of Hong Kong']) {
    assert.ok(page.text.includes(s), s);
  }
  assert.match(page.text, /Member since \d{1,2} [A-Z][a-z]{2} \d{4}</);
  assert.ok(page.text.includes('Your public id. It never changes.'));
  assert.equal(page.$('.org-profile').length, 0);
  assert.ok(!page.text.includes('Ask an admin to change these.'));
  assert.equal(page.$('a.topbar-back').attr('href'), '/me');
  assert.equal(page.$('input[name="avatar"][checked]').val(), 'cat');
  assert.equal(page.$('textarea[name="bio"]').text(), 'Year 3, FinTech');

  const film = await agentAs('filmsoc00');
  const org = await film.page('/me/profile');
  assert.ok(org.text.includes('HKU Film Society'));
  assert.ok(org.text.includes('Weekly screenings and director talks.'));
  assert.ok(org.text.includes('Ask an admin to change these.'));
});

test('ID-T26 Mandy changes her avatar and bio; bad input changes nothing', async () => {
  const mandy = await agentAs('mandy0hku');
  const row = () => q.one(`SELECT avatar_code, bio FROM users WHERE handle = 'mandy0hku'`);

  const res = await mandy.form('/me/profile', { avatar: 'fox', bio: 'Film lover' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/me/profile');
  assert.equal(await flashAfter(mandy, res), 'Profile saved');
  assert.deepEqual(await row(), { avatar_code: 'fox', bio: 'Film lover' });
  const me = await mandy.page('/me');
  assert.equal(me.$('.me-card img.avatar').attr('src'), '/static/img/avatars/fox.svg');

  const long = await mandy.form('/me/profile', { avatar: 'fox', bio: 'x'.repeat(161) });
  assert.equal(long.status, 400);
  assert.equal(long.$('#f-bio-error').text().trim(), 'Bio is too long (at most 160 characters)');
  const bad = await mandy.form('/me/profile', { avatar: '../x', bio: 'Film lover' });
  assert.equal(bad.status, 400);
  assert.equal(bad.$('#f-avatar-error').text().trim(), 'Pick an avatar.');
  assert.deepEqual(await row(), { avatar_code: 'fox', bio: 'Film lover' });

  const empty = await mandy.form('/me/profile', { avatar: 'fox', bio: '   ' });
  assert.equal(empty.status, 303);
  assert.deepEqual(await row(), { avatar_code: 'fox', bio: '' });
});

test('ID-T27 settings show and save the four switches', async () => {
  const toggles = (page) => {
    const state = {};
    page.$('label.toggle').each((i, el) => {
      const box = page.$(el).find('input[type="checkbox"]');
      state[box.attr('name')] = box.is('[checked]');
    });
    return state;
  };
  const labelOf = (page, name) =>
    page
      .$(`input[type="checkbox"][name="${name}"]`)
      .closest('label')
      .find('.toggle-text')
      .text()
      .trim();

  const kelvin = await agentAs('kelvin0hk');
  const his = await kelvin.page('/me/settings');
  assert.equal(his.status, 200);
  assert.equal(labelOf(his, 'notify_likes'), 'Notify me about likes');
  assert.equal(labelOf(his, 'share_all'), 'Share new posts with all universities by default');
  assert.equal(toggles(his).notify_likes, false);
  assert.equal(toggles(his).share_all, true);

  const mandy = await agentAs('mandy0hku');
  // as a browser sends the toggle partial: the hidden 0, then the checkbox's 1 when on
  const res = await mandy.form('/me/settings', {
    default_anonymous: '0',
    share_all: ['0', '1'],
    notify_comments: '0',
    notify_likes: ['0', '1'],
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/me/settings');
  const row = await q.one(
    `SELECT default_anonymous, default_visibility, notify_comments, notify_likes
     FROM users WHERE handle = 'mandy0hku'`,
  );
  assert.deepEqual(
    [row.default_anonymous, row.default_visibility, row.notify_comments, row.notify_likes].map(
      String,
    ),
    ['0', 'all', '0', '1'],
  );
  const page = await mandy.page('/me/settings');
  assert.equal(page.$('.flash').text().trim(), 'Settings saved');
  assert.deepEqual(toggles(page), {
    default_anonymous: false,
    share_all: true,
    notify_comments: false,
    notify_likes: true,
  });
});

test('ID-T28 contract with messages: the triggers read notify_comments', async () => {
  const mandy = await agentAs('mandy0hku');
  const save = (notifyComments) =>
    mandy.form('/me/settings', {
      default_anonymous: '1',
      share_all: '0',
      notify_comments: notifyComments ? ['0', '1'] : '0',
      notify_likes: ['0', '1'],
    });
  const forMandy = (commentId) =>
    q('SELECT type FROM notifications WHERE comment_id = ? AND recipient_id = 2', [commentId]);

  assert.equal((await save(false)).status, 303);
  const quiet = await make.comment({ post: 600001, author: 'kelvin0hk' });
  assert.deepEqual(await forMandy(quiet), []);

  assert.equal((await save(true)).status, 303);
  const loud = await make.comment({ post: 600001, author: 'kelvin0hk' });
  assert.deepEqual(
    (await forMandy(loud)).map((r) => r.type),
    ['comment_on_post'],
  );
});

test('ID-T29 change password', async () => {
  const oldHash = await hashOf('mandy0hku');
  try {
    const mandy = await agentAs('mandy0hku');
    const wrong = await mandy.form('/me/password', {
      current: 'not-my-password',
      password: 'newpass123',
      confirm: 'newpass123',
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.$('#f-current-error').text().trim(), 'Your current password is wrong.');
    assert.equal(await hashOf('mandy0hku'), oldHash);

    const short = await mandy.form('/me/password', {
      current: 'campus123',
      password: 'short',
      confirm: 'other',
    });
    assert.equal(short.status, 400);
    assert.deepEqual(problems(short), [
      'Use at least 8 characters.',
      'The passwords do not match.',
    ]);
    assert.equal(await hashOf('mandy0hku'), oldHash);

    const res = await mandy.form('/me/password', {
      current: 'campus123',
      password: 'newpass123',
      confirm: 'newpass123',
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, '/me/settings');
    assert.equal(await flashAfter(mandy, res), 'Password changed');
    assert.equal((await mandy.page('/me')).status, 200, 'the session stays logged in');

    const email = 'mandy@connect.hku.hk';
    const fresh = await anon().form('/auth/login', { email, password: 'newpass123' });
    assert.equal(fresh.status, 303);
    const old = await anon().form('/auth/login', { email, password: 'campus123' });
    assert.equal(old.status, 400);
  } finally {
    await restoreHash('mandy0hku', oldHash);
  }
});

// ---------------------------------------------------------------- CP2 (other modules' lists)

test(
  'ID-T21 (CP2) each Me count equals the number of items on the page it links to',
  { todo: 'needs content/discover lists (CP2)' },
  async () => {
    const mandy = await agentAs('mandy0hku');
    const me = await mandy.page('/me');
    for (const s of meStats(me)) {
      const list = await mandy.page(s.href);
      assert.equal(list.status, 200, s.href);
      // discover's lists are post cards; content's My comments links each item to /posts/<id>#c<id>
      const items =
        s.href === '/me/comments'
          ? list.$('main a[href^="/posts/"][href*="#c"]').length
          : list.$('main .post-card').length;
      assert.equal(items, s.value, `${s.label} (${s.href})`);
    }
  },
);

test("ID-T24 (CP2) after Clear history, Mandy's Viewed count is 0", async () => {
  const mandy = await agentAs('mandy0hku');
  const before = meStats(await mandy.page('/me')).find((s) => s.label === 'Viewed');
  assert.ok(before.value > 0);
  const res = await mandy.form('/me/history/clear');
  assert.equal(res.status, 303);
  const after = meStats(await mandy.page('/me')).find((s) => s.label === 'Viewed');
  assert.equal(after.value, 0);
  assert.equal(
    await count('SELECT COUNT(*) AS n FROM post_views WHERE user_id = 2 AND cleared_at IS NULL'),
    0,
  );
});
