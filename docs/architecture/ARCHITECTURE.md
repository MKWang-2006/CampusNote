# Campus Notes: architecture and developer handbook

**Version 1.2, 21 Oct 2026** (the backbone is built; §2, §4, §6.3, §6.8 and §6.10 describe it as built). Read this once before writing code. It explains how four people can build one app with almost no coordination, and it is the reference for the shared code (the "backbone") that every module uses. What the product does is in `docs/product/PRODUCT_SPEC.md`; what you own is in `docs/team/WORK_DIVISION.md`; your tasks are in `docs/modules/<your module>/DEV_GUIDE.md`.

Status: the stack (decision D1) and the backbone plan (D2) were decided on 17 Oct 2026, as recommended. The 21 Oct update adopts one desktop-first responsive website (D22); [RESPONSIVE.md](RESPONSIVE.md) is the layout contract for every module.

## 1. Seven rules that let four people work apart

1. **Vertical modules.** Each member owns one folder, `modules/<name>/`, which contains that feature's routes, SQL, templates and tests. Nobody edits another member's folder. The backbone discovers modules automatically, so adding one never touches a shared file.
2. **One schema, owned by the coordinator.** `db/schema.sql` is the contract. It is complete from day one, so nobody waits for anyone's tables. Changing it needs a `contract-change` issue (§13).
3. **One writer per table.** Every table names the module allowed to INSERT, UPDATE or DELETE it. Any module may read any table. When module A needs something to happen in B's tables, B owns a database trigger that does it (for example, notifications), or A links to a page B owns.
4. **Shared views for display rules.** Deletion, hiding, anonymity and counts are computed once, in `v_live_posts`, `v_post_cards` and `v_comment_items`. You never re-implement "is this post visible" or "how many likes".
5. **URL contracts instead of code imports.** Modules link to each other's pages using the route table in `WORK_DIVISION.md` §3. A module never `require`s another module.
6. **Seed data and dev login.** The core seed fills every table with realistic data, and `/dev/login-as/<handle>` logs you in as any persona. You can build your pages before anyone else has built theirs.
7. **Continuous integration.** Small pull requests merge to `main` every few days after CI passes. The final "aggregation week" is then polishing, not merging.

## 2. Stack

| Part | Choice | Notes |
|---|---|---|
| Runtime | Node.js 22 LTS or later | CommonJS modules (`require`). |
| Web | Express 5 | Express 5 sends errors thrown in `async` handlers to the error handler, so no `try`/`catch` boilerplate. |
| Views | EJS 3, server-rendered | Plus a small `public/js/kit.js` for progressive enhancement. No front-end framework and no build step. |
| Database | MySQL 8.0.19 or later (8.4 LTS recommended) | `mysql2/promise`, raw SQL with `?` placeholders, no ORM. |
| Sessions | `express-session` with a small MySQL store (`core/session.js`) | Stored in the `sessions` table, on the app's own connection pool. |
| Passwords | `bcryptjs`, cost 10 | |
| Uploads | `multer` | Files in `uploads/` (git-ignored), served at `/uploads/`. |
| Config | Node's built-in `process.loadEnvFile` | `.env`, with `.env.example` committed. No extra package. |
| Tests | `node:test` + `supertest` + `cheerio` | No extra test runner. |
| Quality | ESLint 9 + Prettier 3 | `npm run lint`, `npm run format`. |
| CI | GitHub Actions with a MySQL 8.4 service | Runs lint, all tests and the SQL checks on every PR. |

Exact versions are pinned in `package.json`: Express 5.2.1, EJS 3.1.10, mysql2 3.24.5, express-session 1.19.0, bcryptjs 3.0.3, multer 2.4.0, nodemailer 10.0.13 (used only when `SMTP_URL` is set); for development ESLint 9.39, Prettier 3.9, supertest 7.3 and cheerio 1.2. `npm run dev` uses Node's own `--watch` (it restarts when a `.js` file changes; templates are re-read on every request in development).

## 3. Repository layout

```
campus-notes/
├── AGENTS.md                 instructions for coding agents (Claude Code, Codex, Cursor)
├── README.md                 setup and run; also the README handed in on Moodle
├── package.json  .env.example  eslint.config.js  .prettierrc
├── app.js                    builds the Express app (exported for tests)
├── server.js                 starts it on PORT
├── core/                     backbone code (coordinator)
│   ├── config.js  db.js  session.js  auth.js  csrf.js  errors.js  render.js
│   ├── ui.js  cards.js  ref.js  mailer.js  uploads.js  validate.js  modules.js  dev.js
├── views/                    layout, shared partials, error pages (coordinator)
│   ├── layout.ejs  errors/404.ejs  errors/500.ejs
│   └── partials/             post-card, post-list, empty, toggle, topic-chips, tabs, menu, ...
├── public/                   kit.css, kit.js, avatars, seed/ images (coordinator)
├── db/
│   ├── schema.sql            THE contract (coordinator)
│   ├── seed/core.sql         personas and demo data for every table (coordinator)
│   ├── reset.js              schema -> modules' db/*.sql -> core seed -> modules' db/seed.sql
│   └── tests/                SQL check suite (run_all.sh, contract_checks.sql, check_*.sh)
├── modules/
│   ├── identity/  content/  discover/  messages/  events/
│   │   ├── index.js          manifest (§5)
│   │   ├── routes.js         express.Router with full paths
│   │   ├── queries.js        every SQL statement of this module, as named functions
│   │   ├── views/<module>/   EJS templates, namespaced by the folder name
│   │   ├── db/               triggers.sql (messages), seed.sql (optional extra rows)
│   │   ├── public/           optional module CSS/JS, served at /m/<module>/
│   │   ├── tests/            *.test.js
│   │   └── README.md         one paragraph plus a link to docs/modules/<module>/
├── test/                     helpers.js, contract/*.test.js, e2e/golden-path.test.js (coordinator)
├── scripts/                  load-test.js (coordinator), demo-race.js (events)
├── docs/                     this design pack
└── .github/                  CODEOWNERS, pull_request_template.md, workflows/ci.yml
```

## 4. How a request flows

`app.js` installs middleware in this order. Modules see only the end result: `req.me`, `res.page()` and the helpers in §6.

1. Static files: `/static` (public/), `/uploads`, `/m/<module>/` (module public folders).
2. Body parsing (urlencoded and JSON, 1 MB limit), cookie session (MySQL store).
3. `loadUser`: reads `session.userId`, loads the user and sets `req.me` and `res.locals.me` (or `null`). A banned user is logged out.
4. CSRF: issues a per-session token; every POST, PUT, PATCH and DELETE must carry it (`csrfField()` in forms, or the `X-CSRF-Token` header that `kit.js` adds to fetch calls, reading the token from the layout's `<meta name="csrf-token">`). A multipart form carries it in its action URL (`action="<%= csrfUrl('/compose') %>"`), because multer reads its body only later, in the route; a missing or wrong token is a 403 before any route runs.
5. Template locals: `ui`, `csrfField()`, `csrfUrl(path)`, `csrfToken`, `flash` (shown once), `ref` (topics and universities), `badges`, `isDev`.
6. Each module's `locals(req)` hook, for logged-in users (the messages module sets `badges.messages`). It runs when `res.page()` renders a page, so redirects and JSON replies cost no extra query.
7. Public routes (identity's `/auth/*` and static pages, backbone's `/dev/*` in development).
8. The login wall: any other route requires `req.me`. Logged-out GETs redirect to `/auth/login?next=...`; other methods get 401.
9. Module routers, mounted at `/` in alphabetical order. Routes use full paths (`/posts/:id`), never a prefix mount.
10. 404 handler, then the error handler (renders `errors/404` or `errors/500`, or JSON for fetch requests).

## 5. The module contract

A module is a folder in `modules/` whose `index.js` exports:

```js
// modules/content/index.js
module.exports = {
  name: 'content',                      // must equal the folder name
  router: require('./routes'),          // express.Router(); full paths only
  publicRoutes: [],                     // paths reachable without login (identity only)
  locals: async (req) => ({}),          // optional; merged into res.locals on every logged-in page
  smoke: ['/compose', '/posts/600012', '/me/comments'],  // GET pages the contract tests open as every persona
};
```

Rules:
- **Routes** only use paths listed for your module in `WORK_DIVISION.md` §3. A contract test fails if two modules register the same method and path.
- **Views** live in `modules/<m>/views/<m>/` and are rendered as `res.page('<m>/name', {...})`. The folder name is the namespace, so two modules' `index.ejs` never clash. Use the shared responsive shell and classes in [RESPONSIVE.md](RESPONSIVE.md); modules own their page content, not the global navigation or viewport width.
- **SQL** lives in `queries.js` as named async functions (`listFeed`, `addComment`). Route handlers never contain SQL strings. This keeps every query in one file for review and for the presentation.
- **Database objects** a module owns (triggers) live in `modules/<m>/db/*.sql` and are applied by `npm run db:reset`. They may use `DELIMITER $$` like the mysql client.
- **Tests** live in `modules/<m>/tests/` and use only the helpers in §10.
- **Never** `require` another module's files, and never write another module's tables.

## 6. Core API (what the backbone gives you)

Everything below is imported from `core/` with a relative path, for example `const { q, tx } = require('../../core/db');`.

### 6.1 Database: `core/db.js`

```js
const rows = await q('SELECT * FROM topics WHERE topic_id = ?', [id]);     // SELECT -> array of rows
const res  = await q('UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = ? AND author_id = ?', [id, me.userId]);
res.affectedRows; res.insertId;                                            // DML -> result header
// affectedRows counts MATCHED rows (mysql2 sets FOUND_ROWS); ROW_COUNT() in the SQL checks counts CHANGED rows
const row  = await q.one('SELECT ... LIMIT 1', [x]);                       // first row or null
const out  = await tx(async (t) => {                                       // BEGIN ... COMMIT
  await t.q('SELECT post_id FROM posts WHERE post_id = ? FOR UPDATE', [id]);
  const r = await t.q('INSERT INTO comments (...) VALUES (?, ?, ?)', [a, b, c]);
  const p = await t.q.one('SELECT alias_no FROM ... WHERE ...', [x]);       // t has q and q.one too
  return r.insertId;                                                       // returned by tx()
});                                                                        // any throw -> ROLLBACK, re-thrown
isDuplicate(err)  // true for ER_DUP_ENTRY (1062)
```

- Arrays expand in `IN (?)`: `q('... WHERE post_id IN (?)', [[1, 2, 3]])`.
- Every connection runs `SET time_zone = '+00:00'`, and dates come back as JavaScript `Date` objects in UTC. Use `UTC_TIMESTAMP()` in SQL, never `NOW()` in comparisons you reason about in HKT.
- Never build SQL by concatenating user input. The only allowed concatenation is choosing between fixed strings you wrote (for example an `ORDER BY` picked from a whitelist).
- Never `TRUNCATE` (it rebuilds the full-text index with the wrong stopword setting); tests use `resetDb()`.

### 6.2 Users and access: `core/auth.js`

```js
req.me  // null, or:
// { userId, handle, email, universityId, universityCode, role, isAdmin, isOrg,
//   avatarCode, defaultAnonymous, defaultVisibility, notifyComments, notifyLikes }
router.get('/admin/reports', requireRole('admin'), handler);              // 403 for others
router.get('/events/new', requireRole('organization', 'admin'), handler);
await login(req, userId); await logout(req);                             // identity module only
// login regenerates the session id first (no session fixation), then stores userId; logout destroys it
```

Every route outside `publicRoutes` already requires login (§4 step 8), so no route needs its own login check. A public route that behaves differently for logged-in users (identity's static pages) tests `req.me` itself.

### 6.3 Pages and responses: `core/render.js`

```js
res.page('content/compose', {
  title: 'New post',      // top bar text
  tab: 'compose',         // highlighted tab: feed | search | compose | messages | me | null
  back: '/feed',          // optional: shows a back arrow linking here
  hideTabs: true,         // optional: hide bottom tabs on compose; desktop navigation remains available
  styles: ['/m/content/content.css'],   // optional: extra stylesheets from your module's public/ folder
  scripts: ['/m/content/compose.js'],   // optional: extra scripts (loaded with defer, after kit.js)
  errors: {}, values: {}, // your own locals
});

res.done({                // finish a POST (Post/Redirect/Get)
  to: `/posts/${id}`,     // where a normal form submit is redirected (303)
  json: { liked: true, likeCount: 4 },  // what a fetch() from kit.js receives instead
  flash: 'Posted',        // optional one-time message shown on the next page
});
```

Some local names belong to Express or EJS, and `res.page` throws an error naming the clash if you use one: `settings` (Express keeps the views folders there, so every include would fail), `body` (the layout's slot for your page), `locals`, `cache`, `filename`, `async`, `client`, `strict`, `scope`, `context`, `debug`, `compileDebug`, `delimiter`, `rmWhitespace` and `_with`. Name yours differently (`prefs`, `postBody`).

### 6.4 Errors: `core/errors.js`

```js
throw notFound();                    // 404 page ("This page does not exist or you cannot see it")
throw forbidden();                   // 403
throw badRequest('Pick a topic');    // 400 with the message
throw new HttpError(409, 'Already booked');
```

Use 404, not 403, when a user asks for a post they cannot see (BR-5), so the response does not reveal that it exists.

### 6.5 Posts as cards: `core/cards.js`

```js
const { VISIBLE, byIds, findVisible } = require('../../core/cards');
// VISIBLE is the SQL fragment "(p.visibility = 'all' OR p.author_university_id = ?)" (alias p = v_live_posts)
const ids = (await q(`SELECT p.post_id FROM v_live_posts p
                      WHERE ${VISIBLE} AND p.post_id < ? ORDER BY p.post_id DESC LIMIT 20`,
                     [req.me.universityId, before])).map(r => r.post_id);
const cards = await byIds(ids);          // v_post_cards rows, in the same order as ids
const card  = await findVisible(600012, req.me);   // the card, or null if deleted, hidden or not visible
```

This is decision D18: list queries page through the merged view `v_live_posts`, then load at most 20 cards by id. Never `ORDER BY ... LIMIT` on `v_post_cards` directly; MySQL builds the whole view first (400 to 760 ms at 20,000 posts instead of 3 ms).

### 6.6 Reference data: `core/ref.js`

`ref.topics` (array in tab order), `ref.topic(code)`, `ref.universities`, `ref.university(id)`. Loaded once at start; the tables never change at run time. Also available in templates as `ref`.

### 6.7 E-mail: `core/mailer.js`

`await mailer.send({ to, subject, text })` stores the message in `outbox` (shown at `/dev/mailbox`). If `SMTP_URL` is set it sends the message instead, and the outbox keeps only the recipient and subject, because the text carries one-time codes.

### 6.8 Uploads: `core/uploads.js`

```js
router.post('/compose', uploads.images({ field: 'images', max: 6 }), handler);
// req.files = [{ publicPath: '/uploads/2026/10/3f9a1c7e.jpg', mimetype, size }, ...]
// too many files, a wrong type (also checked by content) or a file over 5 MB: nothing is kept, req.files = [] and
//   req.uploadError = 'Up to 6 images, JPEG, PNG, WebP or GIF, 5 MB each.'; your handler still runs,
//   so it can re-render the form with the draft and show the message under the image field
// with max: 1 the message is 'One image only: JPEG, PNG, WebP or GIF, at most 5 MB.'
uploads.remove(paths);  // delete files again, e.g. when the publish transaction failed
```

The form sends its CSRF token in the action URL, because the global check (§4 step 4) runs before multer has read a multipart body; a missing or wrong token is a 403 before your handler. Put the file input last, so the fields before it are still read when a file is refused:

```html
<form method="post" enctype="multipart/form-data" action="<%= csrfUrl('/compose') %>" data-leave-guard>
```

### 6.9 Validation: `core/validate.js`

```js
const { text, int, oneOf, bool } = require('../../core/validate');
const errors = {};
const body  = text(req.body.body, { max: 750, label: 'Your post' }, errors, 'body');   // trimmed; error if blank or too long
const topic = oneOf(req.body.topic, ref.topics.map(t => t.code), errors, 'topic', 'Pick a topic');
const showHandle = bool(req.body.show_handle);                                          // checkbox or toggle -> true/false
if (Object.keys(errors).length) return res.status(400).page('content/compose', { errors, values: req.body });

const before = int(req.query.before, { min: 1 });         // a whole number, or null (missing, not a number, out of range)
const sort   = oneOf(req.query.sort, ['relevance', 'newest']) ?? 'relevance';   // without errors: the value or null
```

| Function | Returns | Records an error |
|---|---|---|
| `text(value, { max, label }, errors, key)` | the trimmed string | in `errors[key]`: "`<label>` cannot be blank" when blank, "`<label>` is too long (at most `<max>` characters)" when longer, for example "Your post cannot be blank" and "Your post is too long (at most 750 characters)" |
| `int(value, { min, max } = {})` | a whole number, or null | never: the caller decides what null means |
| `oneOf(value, list, errors, key, message)` | the value if it is in `list`, else null | in `errors[key] = message` only when `errors` is passed |
| `bool(value)` | true for `'1'`, `'on'` or `'true'`, else false | never |

### 6.10 In templates

Every template receives `me`, `ui`, `ref`, `csrfField()`, `csrfUrl(path)`, `csrfToken`, `flash`, `badges` and `isDev` (true only in development). The UI kit (`docs/architecture/UI_KIT.md`) lists the partials, such as `<%- include('partials/post-list', { cards, nextUrl }) %>`, and the `ui` helpers such as `ui.alias(n)`, `ui.timeAgo(d)`, `ui.hkt(d)` and `ui.avatarUrl(code)`. Always print user text with `<%= %>` (escaped). `<%- %>` is only for `include` and for `ui` helpers that return markup, such as `ui.countdownAttr(d)`.

Route code uses the same helpers with `const ui = require('../../core/ui');`. Besides the template helpers, `ui.avatars` is the array of avatar codes (identity's profile form, and the random avatar content draws for each new post).

## 7. Data rules

- **Ownership:** the writer of every table is in its header comment in `db/schema.sql` and in `docs/data/DATA_MODEL.md` §3.
- **Visibility, anonymity, deletion, hiding:** always go through the views (rule 4). Templates never print `author_id` or the author's handle unless `author_handle` (already NULL for anonymous posts) is set.
- **Transactions:** anything that must happen together goes in one `tx()`: publishing a post with its images and its Host row, a first comment with its alias, a booking with its counter. Lock the row that serialises the operation (`SELECT ... FOR UPDATE` on the post for aliases; the conditional `UPDATE` on the event for tickets). The SQL check suite proves both under concurrency.
- **Error codes you will meet:** 1062 duplicate key (`isDuplicate(err)`), 1452 foreign key, 3819 CHECK constraint, 1644 a trigger's SIGNAL. Turn the expected ones into a friendly message; let the rest reach the error handler.
- **Times:** stored UTC (`UTC_TIMESTAMP()`), shown with `ui.timeAgo` or `ui.hkt`.
- **Ids:** post ids start at 600001 and are shown as `#600012`.

## 8. Pages and forms

- **Post/Redirect/Get:** every form POST ends with `res.done()` (a 303 redirect), or re-renders the form with status 400 and `errors` when validation fails.
- **Responsive layout:** one server-rendered page and the same routes work at every width. The shared shell supplies desktop sidebar navigation at 1024 px and above, bottom tabs below 1024 px, and an expanded tablet column with optional card grids from 768 px. Follow [RESPONSIVE.md](RESPONSIVE.md) for width helpers and browser acceptance checks; navigation and layout must work without JavaScript.
- **Progressive enhancement:** pages work without JavaScript. `kit.js` adds: AJAX for forms marked `data-ajax` (like and watch buttons update in place using the `json` from `res.done`), `data-confirm` dialogs, the compose page's leave guard, live character counters and countdowns. Never put essential logic only in JavaScript.
- **Toggles with explicit state:** a like button posts `like=1` or `like=0`, never "toggle", so a double click cannot undo itself.
- **Empty states:** every list has one (`partials/empty`). The `newbie0hk` persona has no data, so use it to check them.
- **Pagination:** keyset ("Load more" links with `?before=<last id>`) for lists in id order (feeds, My posts, My comments, notifications); `?page=` for every other order: Hot, search (both sorts), the Watching tab, and the lists ordered by when you watched, liked or visited (Watching, Liked, History).

## 9. Security checklist (every PR)

- [ ] SQL uses `?` placeholders only.
- [ ] Every POST route checks that `req.me` owns the thing it changes, or has the role (admin or organization).
- [ ] Anything about a post first checks it is visible to `req.me` (`findVisible` or the `VISIBLE` fragment); otherwise 404.
- [ ] User text is printed with `<%= %>`.
- [ ] No handle, e-mail or `author_id` is printed for anonymous content.
- [ ] Redirect targets are internal paths (never an unchecked `?next=` URL; identity's login uses `safeNext()`).
- [ ] No secrets in the repo (`.env` is git-ignored).

## 10. Testing

| Level | What | Who | Command |
|---|---|---|---|
| SQL checks | Constraints, views, triggers, races: `db/tests/` | coordinator, plus each module's checks | `npm run check:sql` |
| Module tests | Your routes through HTTP with `supertest`, against the seeded test database | each owner | `npm test -- modules/content` |
| Contract tests | Cross-module promises: login wall, CSRF, privacy, visibility, unique routes | coordinator | `npm test -- test/contract` |
| End-to-end | The demo's golden path across all modules | coordinator, integration week | `npm test -- test/e2e` |

In addition to these automated checks, every page must pass the 390 / 768 / 1440 px browser checklist in [RESPONSIVE.md](RESPONSIVE.md), with JavaScript enabled and disabled. HTTP tests alone do not verify layout.

Test helpers (`test/helpers.js`):

```js
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { resetDb, agentAs, anon, make } = require('../../../test/helpers');

before(resetDb);                                   // fresh seeded test database for this file

test('a student can comment and appears under an alias', async () => {
  const kelvin = await agentAs('kelvin0hk');       // logged-in supertest agent, CSRF handled
  const res = await kelvin.form('/posts/600003/comments', { body: 'Me too' });   // POST with token
  assert.equal(res.status, 303);
  const page = await kelvin.page('/posts/600003'); // GET -> { status, text, $ } ($ is cheerio)
  assert.match(page.$('.comment').last().text(), /Alice/);
});
```

- `anon()` is a logged-out agent. Every agent (`agentAs`, `anon`) has `page(path)`, `form(path, body)` and `json(path, body)`:

  ```js
  await agent.page(path)        // GET -> { status, text, $ }
  await agent.form(path, body)  // POST as a plain form, CSRF token included -> { status, text, $, headers }
  await agent.json(path, body)  // POST as kit.js does: Accept: application/json and X-CSRF-Token -> { status, body }
  ```

- The `make` helpers insert rows directly for edge cases the seed lacks (tests may write any table). `author` is a persona handle such as `'newbie0hk'` or a handle returned by `make.user()`:

  ```js
  make.user({ handle?, email?, university = 1, role = 'student' })   // -> { userId, handle }; random handle and e-mail when not given
  make.post({ author, body?, topic = 'random', anonymous = true, visibility = 'university', createdAt? })
                                                                     // -> postId; also inserts the Host row (alias 0)
  make.comment({ post, author, body?, replyTo? })                    // -> commentId; takes the author's alias on the post,
                                                                     //    or the next one as addComment does; the triggers fire
  ```

  A user from `make.user()` has the personas' password `campus123`, so `agentAs(handle)` can log in as it. `createdAt` is a JavaScript `Date` (for example `new Date(Date.now() - 8 * 24 * 3600e3)` for a post 8 days old). Likes, watches and views have no helper: insert them with `q()`.
- HTTP test agents share an explicitly bound IPv4 loopback server per file, with separate cookie jars. The helper starts and closes that listener automatically; create agents inside tests or after the before hooks. For isolated HTTP fixtures, use `startTestServer` / `stopTestServer` from `test/http-server.js` rather than passing an app function directly to SuperTest. This keeps the listener and request URL in the same address family; see [the transport investigation](../team/VALIDATION.md#login-test-transport-investigation-and-fix--22-oct-2026).
- Tests run one file at a time (`--test-concurrency=1`) against `DB_NAME_TEST`. Each file calls `resetDb()` once; write tests in a file so they do not depend on each other's order, or reset again.
- Seed personas and their data are listed in `docs/data/DATA_MODEL.md` §5. Use them by handle.
- **Definition of done** for any feature: its acceptance tests from your DEV_GUIDE pass, CI is green, the page has been checked in a browser as at least two personas (including `newbie0hk` for empty states), and the USER_GUIDE section for it is written.

## 11. Local setup

1. Install Node 22 or later and MySQL 8.4 (macOS: `brew install node mysql@8.4`, then `brew services start mysql@8.4`). Note the root password, or create a user with all privileges on `campus_notes` and `campus_notes_test`.
2. `git clone <repo>`, then `cd campus-notes && npm install`.
3. `cp .env.example .env` and set `DB_USER` and `DB_PASSWORD`.
4. `npm run db:reset` creates `campus_notes` with the schema, triggers and seed.
5. `npm run dev` and open http://localhost:3000. In development the login page lists every persona; click one to log in, or use `mandy@connect.hku.hk` with password `campus123`.

If `db:reset` fails with error 1419 (creating triggers while binary logging is on), run `SET PERSIST log_bin_trust_function_creators = 1;` once as root (`PERSIST` survives a MySQL restart; `GLOBAL` does not).

| Script | Does |
|---|---|
| `npm run dev` | Start with auto-reload (`node --watch`). |
| `npm start` | Start without reload. |
| `npm run db:reset` | Drop and rebuild the dev database (add `-- --test` for the test database). |
| `npm test` | All tests. `npm test -- modules/discover` runs one module's. |
| `npm run check:sql` | The SQL check suite (`db/tests/run_all.sh`; needs the `mysql` command-line client). |
| `npm run lint` / `npm run format` | ESLint / Prettier. |
| `npm run load-test` | Adds 20,000 posts to the dev database for speed checks. |
| `npm run demo:race` | The ticket race for the video (events). |

`.env` keys: `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_NAME_TEST`, `SESSION_SECRET`, `UPLOAD_DIR`, `SMTP_URL` (optional), `NODE_ENV`.

## 12. Code style

- Prettier decides formatting (single quotes, semicolons, width 100). ESLint must pass.
- Names: files `kebab-case.js`, functions `camelCase`, SQL keywords upper case, tables and columns `snake_case`.
- `queries.js` functions are named for what they return or do (`listFeed`, `countUnread`, `bookTicket`) and take plain values, not `req`.
- Comment the *why*, not the *what*. Every non-obvious SQL statement gets one line saying what rule it implements (for example `-- BR-7: alias = order of first comment`).
- User-facing text is English (decision D5), short, in sentence case.

## 13. Changing shared things

Shared files are `core/`, `views/` (except module views), `public/`, `db/`, `test/`, `.github/`, `package.json` and `docs/data/`. Only the coordinator merges changes to them (CODEOWNERS enforces this).

If you need a shared change (a column, a partial, a helper, a new dependency):
1. Open an issue with the `contract-change` label: what you need, why, and which feature ID it blocks.
2. Meanwhile, keep working around it inside your module (for example, a local helper).
3. The coordinator decides within a day, makes the change in one PR, updates `schema.sql`, the seed, `DATA_MODEL.md` and `DECISIONS.md`, and notes it in the weekly status issue.

The schema is **frozen at kickoff (22 Oct)** except through this process.
