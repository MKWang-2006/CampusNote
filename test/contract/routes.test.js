// The module contract (ARCHITECTURE.md §5) and the URL contract (WORK_DIVISION.md §3).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { moduleRoutes, routeTable, loadModules } = require('./routes-helper');
const { duplicateRoutes } = require('../../core/modules');

const ROOT = path.join(__dirname, '..', '..');

test('every module folder has a manifest named after it', () => {
  const folders = fs
    .readdirSync(path.join(ROOT, 'modules'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  assert.deepEqual(
    loadModules().map((m) => m.name),
    folders,
  );
});

test('only identity has public routes (BR-4)', () => {
  for (const m of loadModules()) {
    if (m.name !== 'identity') assert.deepEqual(m.publicRoutes, [], `${m.name} has publicRoutes`);
  }
});

test('no two modules register the same method and path', () => {
  assert.deepEqual(duplicateRoutes(loadModules()), []);
});

test('every route is listed for its module in WORK_DIVISION.md §3', () => {
  const table = routeTable();
  const unlisted = moduleRoutes()
    .filter((r) => !(table[r.module] || new Set()).has(r.path))
    .map((r) => `${r.module}: ${r.method} ${r.path}`);
  assert.deepEqual(unlisted, [], 'add the route to the table with a contract-change issue');
});

test('every page the tab bar and the Me menu link to exists (CP1)', () => {
  const gets = new Set(
    moduleRoutes()
      .filter((r) => r.method === 'GET')
      .map((r) => r.path),
  );
  const links = ['/feed', '/search', '/compose', '/messages', '/me',
    '/me/posts', '/me/watching', '/me/comments', '/me/history', '/me/likes', '/me/tickets',
    '/me/profile', '/me/settings', '/about', '/contact', '/terms', '/privacy',
    '/events', '/events/new', '/admin/reports', '/admin/announcements', '/admin/users']; // prettier-ignore
  assert.deepEqual(
    links.filter((l) => !gets.has(l)),
    [],
  );
});

test('module templates live in views/<module>/ so they never clash', () => {
  for (const m of loadModules()) {
    const views = path.join(m.dir, 'views');
    if (!fs.existsSync(views)) continue;
    const stray = fs.readdirSync(views).filter((f) => f !== m.name);
    assert.deepEqual(stray, [], `modules/${m.name}/views/ should only contain ${m.name}/`);
  }
});
