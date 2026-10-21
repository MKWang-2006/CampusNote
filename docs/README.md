# Campus Notes design pack

Campus Notes is our COMP3278 group project: an anonymous campus forum for Hong Kong university students, modelled on the Triple Uni / HKU Pootal mini-program. This folder is everything needed to build it in three weeks with four people and very little coordination. It is the `docs/` folder of the repository; the code it describes is next to it (`../README.md` says how to run it).

**Current status (21 Oct 2026):** backbone, identity and events are implemented; Content, Discover and Messages are unclaimed starter modules. CI and CODEOWNERS are installed.

**Team kickoff:** choose an unclaimed role in [START_HERE.md](../START_HERE.md). This pack is the detailed reference.

**Build history (17 Oct 2026):** version 1.1. Michael decided D1 to D5 on 17 Oct 2026, choosing the recommended option for each (`team/DECISIONS.md`), and the backbone, the identity module and the four module skeletons are built (D2). All SQL in the pack has been run on MySQL 8.0.46 (§4).

## 1. What to read

| You are | Read, in order | Time |
|---|---|---|
| **Any member** | `../START_HERE.md` → your module DEV_GUIDE; consult this page and `product/PRODUCT_SPEC.md` §1 to §5 → `architecture/ARCHITECTURE.md` §1 → `team/WORKFLOW.md` | 30 min |
| **A module owner** | the above, then `modules/<your module>/DEV_GUIDE.md` (your tasks and tests), `USER_GUIDE.md` (what users see) and `queries.sql` (tested SQL to start from), then `architecture/ARCHITECTURE.md` §5 to §10 and `architecture/UI_KIT.md` | 2 hours |
| **The coordinator** | everything, starting with `team/DECISIONS.md`, `team/WORK_DIVISION.md` and `team/COORDINATOR_ROADMAP.md` | half a day |
| **A coding agent** | `../AGENTS.md`, then the DEV_GUIDE of the module it works on | |

You do not need the whole picture to build your module. Your DEV_GUIDE tells you which tables you write, which URLs you own, what the pages must do, how to test them, and where your module touches the others.

## 2. Map

| File | What it answers |
|---|---|
| `product/PRODUCT_SPEC.md` | What the product does: roles, screens, features with IDs and priorities, business rules (BR-1 to BR-18), demo script |
| `architecture/ARCHITECTURE.md` | How it is built: the seven rules, stack, repository layout, module contract, core API, security, testing, setup |
| `architecture/UI_KIT.md` | Colours, layout, shared partials, template helpers, `kit.js` behaviours |
| `../db/schema.sql` | The database: every table, constraint and view. The contract between modules |
| `../db/seed/core.sql` | Eight personas and realistic data in every table |
| `data/DATA_MODEL.md` | The E-R model in the course's notation, table ownership, seed map, constraints, design decisions, SQL showcase |
| `../db/tests/` | The SQL check suite (`run_all.sh`, `contract_checks.sql`); each module's checks are its `queries.sql` |
| `team/DECISIONS.md` | Cross-module decisions, including D1 to D5 already decided and the self-selected roles |
| `team/WORK_DIVISION.md` | Who owns which folder, tables and URLs; every place modules meet; effort balance |
| `team/COORDINATOR_ROADMAP.md` | Timeline, checkpoints, kickoff agenda, integration runbook, risks |
| `team/WORKFLOW.md` | Branches, pull requests, weekly status, using coding agents |
| `modules/<m>/DEV_GUIDE.md` | One module's scope, tasks, SQL, acceptance tests and agent prompt |
| `modules/<m>/USER_GUIDE.md` | One module's features from the user's side; becomes the user manual |
| `modules/<m>/queries.sql` | One module's SQL, runnable against the seed, with checks |
| `reference/triple-uni-screenshots/` | Local-only original-app references; excluded from the public repo. Build against the specification and UI kit |

## 3. Words we use

| Word | Meaning |
|---|---|
| post, #600012 | A note in the forum. Ids start at 600001 and are shown with `#`. |
| card | The summary of a post in a list (`v_post_cards`, partial `post-card`). |
| anonymous | The post shows no handle. Posts are anonymous by default. |
| handle | A user's public 9-character id, such as `mandy0hku`. |
| alias, Host | A commenter's name on one post: the author is Host, then Alice, Bob, ... in order of first comment. |
| watch (star) | Save a post and follow its comments. Different from like (heart). |
| visibility | "My university" (only the author's university) or "All universities". |
| live | Not deleted by its author and not hidden by a moderator. |
| persona | A seed user used for development and tests, such as `kelvin0hk`. |
| backbone | The shared code every module uses (`core/`, layout, database tools, tests). |
| module | One member's vertical slice: `identity`, `content`, `discover`, `messages`, `events`. |
| writer | The one module allowed to change a table. |
| contract change | A change to anything shared, made only by the coordinator after an issue labelled `contract-change`. |
| CP1, CP2 | Checkpoints on Sun 25 Oct (pages render) and Sun 1 Nov (Must features merged). |
| Must / Should / Could | Feature priority (MoSCoW). |

## 4. Checking the SQL

The schema, the seed, the triggers, each module's `queries.sql` and two concurrency races run in a throwaway database:

```bash
npm run check:sql                                  # = bash db/tests/run_all.sh, uses: mysql -uroot
MYSQL="mysql -uroot -pYOURPASS" npm run check:sql
```

It prints one PASS or FAIL line per check (456 on 17 Oct 2026) and ends with `ALL SQL CHECKS PASSED`. Two INFO lines show the deadlocks that happen when the comment race runs without its row lock; they are expected.

## 5. Change log

| Date | Version | Change |
|---|---|---|
| 16 Oct 2026 | 1.0 | First complete pack: spec, architecture, data model with tested schema and seed, work division, roadmap, decisions, and a developer and user guide per module. |
| 17 Oct 2026 | 1.0 (reviewed) | An independent review cross-checked the five module guides against the shared files. Fixes: blocks are per conversation (new `blocks` table) so blocking cannot reveal who is behind an alias; `post_views.cleared_at` keeps view counts after Clear history; test helper signatures in `ARCHITECTURE.md` §10; the `/u/:handle` touchpoint (`WORK_DIVISION.md` §4 row 14); no Message button for banned users; event buttons by role; one heading format for every feature; USER_GUIDE messages match the DEV_GUIDEs word for word. 456 SQL checks pass. |
| 17 Oct 2026 | 1.1 | Decisions D1 to D5 recorded (option A each). The backbone is built: the schema, seed and SQL checks moved to `db/`, the triggers to `modules/messages/db/`. `ARCHITECTURE.md` and `UI_KIT.md` describe the built backbone (own session store, `process.loadEnvFile`, multipart CSRF token in the form's action URL, `--brand-soft`, CSS classes, reserved page-local names, `ui.date`). The identity module was built from its DEV_GUIDE by a separate coding agent as a test of the guide; what it found is now in the guide: labels and alert placement on the sign-up, login and reset pages, back arrows on forgot and reset, `config.isDev` for the persona list, the outbox as the one copy of a code (not kept once `SMTP_URL` is set), admins may ban other admins. `btn btn-cta` replaces the term "`--cta` button" in every guide. |
