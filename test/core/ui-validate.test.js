// Unit checks of the template helpers (UI_KIT §4) and the validators (ARCHITECTURE §6.9).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ui = require('../../core/ui');
const { text, int, oneOf, bool } = require('../../core/validate');

test('ui.alias: Host, Alice to Zoe, then Alice 2 (BR-7)', () => {
  assert.equal(ui.alias(0), 'Host');
  assert.equal(ui.alias(1), 'Alice');
  assert.equal(ui.alias(26), 'Zoe');
  assert.equal(ui.alias(27), 'Alice 2');
  assert.equal(ui.alias(53), 'Alice 3');
  assert.equal(ui.alias(null), 'Visitor');
});

test('ui.hkt and ui.timeAgo show Hong Kong time (BR-17)', () => {
  const d = new Date('2026-10-16T14:19:00Z'); // 22:19 in Hong Kong
  assert.equal(ui.hkt(d), '16 Oct 22:19');
  assert.equal(ui.hkt(d, true), '16 Oct 2026 22:19');
  assert.equal(ui.hkt(new Date('2026-12-31T16:30:00Z'), true), '1 Jan 2027 00:30');
  assert.equal(ui.date(new Date('2026-12-31T16:30:00Z')), '1 Jan 2027');
  assert.equal(ui.date(null), '');
  const now = new Date('2026-10-18T12:00:00Z');
  assert.equal(ui.timeAgo(new Date(now - 30e3), now), 'just now');
  assert.equal(ui.timeAgo(new Date(now - 5 * 60e3), now), '5 min ago');
  assert.equal(ui.timeAgo(new Date(now - 3 * 3600e3), now), '3 h ago');
  assert.equal(ui.timeAgo(d, now), '16 Oct 22:19');
  assert.equal(ui.timeAgo(new Date('2025-10-16T14:19:00Z'), now), '16 Oct 2025 22:19');
});

test('ui.avatarUrl, postNo, excerpt, plural, countdownAttr', () => {
  assert.ok(ui.avatars.includes('cat') && ui.avatars.includes('mountain'));
  assert.equal(ui.avatarUrl('fox'), '/static/img/avatars/fox.svg');
  assert.equal(ui.avatarUrl('../x'), '/static/img/avatars/cat.svg');
  assert.equal(ui.postNo(600012), '#600012');
  assert.equal(ui.excerpt('abcdef', 3), 'abc…');
  assert.equal(ui.excerpt('😀😀😀😀', 2), '😀😀…');
  assert.equal(ui.plural(1, 'comment'), '1 comment');
  assert.equal(ui.plural(3, 'comment'), '3 comments');
  assert.equal(
    ui.countdownAttr(new Date('2026-10-17T10:00:00Z')),
    'data-countdown="2026-10-17T10:00:00.000Z"',
  );
});

test('ui.icon points into the sprite and refuses unknown names', () => {
  assert.equal(ui.icons.length, 25);
  assert.match(
    ui.icon('star'),
    /^<svg class="icon icon-star"[^>]*><use href="\/static\/img\/icons\.svg#star"><\/use><\/svg>$/,
  );
  assert.throws(() => ui.icon('nope'), /no icon named "nope"/);
});

test('every icon named in the views and menus exists in the sprite', () => {
  const root = path.join(__dirname, '..', '..');
  const source = ['views', 'modules']
    .flatMap((dir) =>
      fs.readdirSync(path.join(root, dir), { recursive: true }).map((f) => path.join(root, dir, f)),
    )
    .filter((f) => /\.(ejs|js)$/.test(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const named = [...source.matchAll(/ui\.icon\('([a-z-]+)'\)|icon: '([a-z-]+)'/g)];
  assert.ok(named.length > 20);
  for (const [, a, b] of named) assert.ok(ui.icons.includes(a || b), a || b);
});

test('every avatar used by the seed exists', () => {
  for (const code of [
    'cat',
    'fox',
    'panda',
    'penguin',
    'koala',
    'tiger',
    'whale',
    'owl',
    'rabbit',
    'film',
    'mountain',
  ]) {
    assert.ok(ui.avatars.includes(code), code);
  }
});

test('validate.text trims, refuses blank and counts characters, not bytes (BR-18)', () => {
  const errors = {};
  assert.equal(text('  hi  ', { max: 5, label: 'Your post' }, errors, 'body'), 'hi');
  assert.deepEqual(errors, {});
  text('   ', { max: 5, label: 'Your post' }, errors, 'body');
  assert.equal(errors.body, 'Your post cannot be blank');
  const e2 = {};
  text('六個中文字字', { max: 5, label: 'Your post' }, e2, 'body');
  assert.equal(e2.body, 'Your post is too long (at most 5 characters)');
  const e3 = {};
  text('😀😀😀😀😀', { max: 5, label: 'Bio' }, e3, 'bio');
  assert.deepEqual(e3, {});
});

test('validate.int, oneOf and bool', () => {
  assert.equal(int('42', { min: 1 }), 42);
  assert.equal(int(' 7 '), 7);
  assert.equal(int('0', { min: 1 }), null);
  assert.equal(int('4.5'), null);
  assert.equal(int('1e3'), null);
  assert.equal(int(undefined), null);
  assert.equal(int(['1', '2']), null);
  assert.equal(int('99999999999999999999'), null);
  assert.equal(oneOf('new', ['new', 'old']), 'new');
  assert.equal(oneOf('x', ['new', 'old']), null);
  const errors = {};
  assert.equal(oneOf(undefined, ['a'], errors, 'topic', 'Pick a topic'), null);
  assert.equal(errors.topic, 'Pick a topic');
  assert.equal(bool('1'), true);
  assert.equal(bool(['0', '1']), true); // a toggle: hidden 0, then the checked box
  assert.equal(bool(['0']), false);
  assert.equal(bool('0'), false);
  assert.equal(bool(undefined), false);
  assert.equal(bool('on'), true);
});
