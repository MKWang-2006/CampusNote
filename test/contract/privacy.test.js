// PRODUCT_SPEC §7 privacy: no page shows the handle behind anonymous content, or anyone else's
// e-mail. Logs in as every persona and opens every page we know of; pages that do not exist yet
// answer 404 and are checked again automatically once they do. The admin pages that show
// authors and e-mails on purpose (/admin/reports, BR-15; /admin/users, ID-8) are skipped.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, q } = require('../helpers');
const { loadModules } = require('./routes-helper');

before(resetDb);

const PERSONAS = [
  'admin0000',
  'mandy0hku',
  'kelvin0hk',
  'wing0cuhk',
  'jason0ust',
  'newbie0hk',
  'filmsoc00',
  'hikeclub0',
];
const SKIP = new Set(['/admin/reports', '/admin/users']);

async function pagesToOpen() {
  const posts = await q('SELECT post_id FROM posts ORDER BY post_id');
  const users = await q('SELECT handle FROM users ORDER BY user_id');
  const convs = await q('SELECT conversation_id FROM conversations ORDER BY conversation_id');
  return [
    ...new Set([
      ...loadModules().flatMap((m) => m.smoke),
      ...posts.map((p) => `/posts/${p.post_id}`),
      ...users.map((u) => `/u/${u.handle}`),
      ...convs.map((c) => `/messages/c/${c.conversation_id}`),
      '/feed?tab=hot', '/feed?tab=watching', '/feed?tab=uni', '/search?q=library', '/search?q=the',
      '/messages/notifications', '/me/profile', '/me/settings',
    ]),
  ].filter((p) => !SKIP.has(p.split('?')[0])); // prettier-ignore
}

test("no page shows a hidden author or another person's e-mail", async () => {
  const pages = await pagesToOpen();
  const users = await q('SELECT user_id, handle, email FROM users');
  // Kelvin never shows his handle (DATA_MODEL §5), so it must appear nowhere but his own page.
  // On each anonymous post's page, neither its author nor any commenter may be named; on a named
  // post only its author may be (as the author, never as a commenter alias).
  const anonPosts = await q('SELECT post_id, author_id FROM posts WHERE is_anonymous = 1');
  const commenters = await q('SELECT DISTINCT post_id, author_id FROM comments');
  const handleOf = new Map(users.map((u) => [u.user_id, u.handle]));
  const hiddenOn = new Map(); // page -> handles that must not appear there
  for (const p of anonPosts)
    hiddenOn.set(`/posts/${p.post_id}`, new Set([handleOf.get(p.author_id)]));
  const authorOf = new Map(
    (await q('SELECT post_id, author_id FROM posts')).map((p) => [p.post_id, p.author_id]),
  );
  for (const c of commenters) {
    if (c.author_id === authorOf.get(c.post_id)) continue;
    const key = `/posts/${c.post_id}`;
    if (!hiddenOn.has(key)) hiddenOn.set(key, new Set());
    hiddenOn.get(key).add(handleOf.get(c.author_id));
  }

  let opened = 0;
  for (const me of PERSONAS) {
    const agent = await agentAs(me);
    const myEmail = users.find((u) => u.handle === me).email;
    for (const url of pages) {
      const res = await agent.page(url);
      if (res.status !== 200) continue;
      opened += 1;
      const html = res.text;
      if (me !== 'kelvin0hk' && url !== '/u/kelvin0hk') {
        assert.ok(!html.includes('kelvin0hk'), `${me} sees kelvin0hk on ${url}`);
      }
      for (const handle of hiddenOn.get(url.split('?')[0]) || []) {
        if (handle !== me) assert.ok(!html.includes(handle), `${me} sees ${handle} on ${url}`);
      }
      for (const u of users) {
        if (u.email !== myEmail)
          assert.ok(!html.includes(u.email), `${me} sees ${u.email} on ${url}`);
      }
    }
  }
  assert.ok(opened >= PERSONAS.length * 5, `only ${opened} pages opened`);
});
