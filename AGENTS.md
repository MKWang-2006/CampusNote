# AGENTS.md: instructions for coding agents

Campus Notes is an anonymous campus forum for Hong Kong university students (a Triple Uni-style "tree hole"), built for the COMP3278 database course by four students. It is a server-rendered Node.js app: Express 5, EJS, MySQL 8 through `mysql2` with raw SQL.

## Read first

1. `docs/README.md`: map of the design pack.
2. `docs/architecture/ARCHITECTURE.md`: the rules and the core API. §1, §5, §6 and §9 are mandatory.
3. `docs/architecture/RESPONSIVE.md`: shared desktop, tablet and phone layout rules.
4. The DEV_GUIDE of the module you are working on: `docs/modules/<module>/DEV_GUIDE.md`.
5. When writing SQL: `db/schema.sql` (the contract) and `docs/data/DATA_MODEL.md` §3 to §5.

## Hard rules

- **Stay in one module.** Create and edit files only under `modules/<module>/` and `docs/modules/<module>/` for the module you were asked to work on. The events module additionally owns `scripts/demo-race.js` (EV-7). If a change seems to need a shared file (`core/`, `views/`, `public/`, `db/`, `test/`, `package.json`, another module), stop and say so; do not edit it.
- **Write only your module's tables** (the writer is named in each table's header in `db/schema.sql`). Reading any table or view is fine.
- **Never `require` another module.** Link to other modules' pages with the URLs in `docs/team/WORK_DIVISION.md` §3.
- **All SQL goes in `modules/<module>/queries.js`** as named functions taking plain values. Route handlers call those functions.
- **Placeholders only**: `q('... WHERE id = ?', [id])`. Never concatenate user input into SQL.
- **Use the shared views** for posts and comments: `v_live_posts` for filtering and paging, `v_post_cards` only by id (`core/cards.js` `byIds`), `v_comment_items` for threads. Never re-implement visibility, anonymity, deletion or hiding.
- **Visibility:** anything about a post checks `findVisible(postId, req.me)` (or the `VISIBLE` SQL fragment) and answers 404 when it is not visible.
- **Never print** `author_id`, e-mails, or a handle for anonymous content. Print user text only with `<%= %>`.
- **Transactions** with `tx()` for multi-statement changes; lock the row that serialises the operation.
- **Times:** `UTC_TIMESTAMP()` in SQL; `ui.timeAgo` or `ui.hkt` in templates.
- **Never `TRUNCATE`**, never change `db/schema.sql`, never add dependencies.
- **Responsive pages:** use the shared shell and UI kit. Do not add another navigation bar, fixed phone width, device detection or separate mobile routes. Keep module CSS scoped to your module; see `docs/architecture/RESPONSIVE.md`.
- **Forms:** POST handlers end with `res.done({ to, json, flash })`, or re-render with status 400 and `errors`.

## Commands

```bash
npm run db:reset                 # rebuild the dev database with seed data
npm run dev                      # http://localhost:3000; dev login lists every persona
npm test -- modules/<module>     # this module's tests
npm test                         # everything
npm run lint
npm run check:sql                # SQL check suite (needs the mysql client)
```

Seed personas (password `campus123`): `admin0000`, `mandy0hku`, `kelvin0hk` (always anonymous), `wing0cuhk` (CUHK), `jason0ust` (HKUST), `newbie0hk` (no data), `filmsoc00` and `hikeclub0` (organizations). In tests: `const kelvin = await agentAs('kelvin0hk')`.

## Definition of done

- The feature's acceptance tests from the DEV_GUIDE exist in `modules/<module>/tests/` and pass, and `npm test` and `npm run lint` pass.
- The page works as at least two personas, including `newbie0hk` for empty states, and without JavaScript.
- Browser checks at 390, 768 and 1440 CSS pixels pass the responsive checklist in `docs/architecture/RESPONSIVE.md`: no horizontal document overflow, usable navigation, visible keyboard focus and touch targets at least 44 px high. Include phone and desktop screenshots in the PR.
- No file outside the module changed (for events, `scripts/demo-race.js` is part of the module).
- Every SQL statement you added has a one-line comment naming the rule it implements (for example `-- BR-7`), and you can explain it.
