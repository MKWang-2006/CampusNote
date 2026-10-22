# Campus Notes

An anonymous notice board for students of HKU, CUHK and HKUST, in the style of the Triple Uni "tree hole": post a note under a topic (anonymously or with your handle), comment under a per-post alias such as Host or Alice, like and watch posts, message people privately, report abuse, and book tickets for campus events. Only people with a university e-mail address can join.

Built by Group 8 for COMP3278 (Introduction to Database Management Systems), HKU, autumn 2026. A desktop-first responsive website that also adapts to tablets and phones. A server-rendered Node.js app: Express 5, EJS templates and MySQL 8 through `mysql2` with hand-written SQL (no ORM).

## Team: start here

**[Check your role and start working → START_HERE.md](START_HERE.md)**

Repository: [Michael-wzl/CampusNote](https://github.com/Michael-wzl/CampusNote). The shared backbone, identity, events and Content modules are built. Discover and Messages remain starter pages; Content links into them will be completed during integration. The detailed design pack is reference material, not a reading prerequisite for starting work. The [responsive guide](docs/architecture/RESPONSIVE.md) explains desktop/sidebar and phone/bottom-navigation behavior.

## Run locally

You need **Node.js 22 or later** and **MySQL 8.0.19 or later** (8.4 LTS recommended).

```bash
git clone https://github.com/Michael-wzl/CampusNote.git
cd CampusNote
npm ci
npm run setup               # creates .env with a random session secret; keeps any existing .env
```

Start MySQL and set `DB_USER` / `DB_PASSWORD` in `.env` to your local account. If you already have Docker, you can instead run `docker compose up -d mysql --wait`; its database runs only on localhost:3306, using the default `.env.example` root account with an empty development password. Stop any other service using port 3306 first, or use your existing MySQL. This is a local development setup.

```bash
npm run db:reset            # rebuilds campus_notes with schema, triggers and demo data
npm run dev                 # http://localhost:3000
```

`db:reset` replaces the configured development database; use a dedicated local database, not a shared or production one. Tests use `DB_NAME_TEST` and replace its contents.

Open http://localhost:3000. In development the login page lists every demo account under "Developer shortcuts"; click one to log in. Or use `mandy@connect.hku.hk` / `campus123`. Sign-up and password-reset codes appear at http://localhost:3000/dev/mailbox, so no real e-mail service is needed. Placeholder pages in Discover and Messages are expected until their owners implement them. Publishing, comments, likes, watches, images and My comments are available through Content.

### Setting up MySQL

macOS: `brew install node mysql@8.4`, then `brew services start mysql@8.4`. Windows: the MySQL Installer (choose 8.4). Then either put the root password in `.env`, or create a user for the app once (as root, in `mysql -uroot -p`):

```sql
CREATE USER 'campus'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON campus_notes.* TO 'campus'@'localhost';
GRANT ALL PRIVILEGES ON campus_notes_test.* TO 'campus'@'localhost';
SET PERSIST log_bin_trust_function_creators = 1;   -- lets that user create the triggers
```

and set `DB_USER=campus` and `DB_PASSWORD=choose-a-password` in `.env`.

### Troubleshooting

| Message | Fix |
|---|---|
| `db:reset failed: ... You do not have the SUPER privilege and binary logging is enabled` (error 1419) | Run `SET PERSIST log_bin_trust_function_creators = 1;` once as root. |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL is not running: `brew services start mysql@8.4` (macOS) or start the MySQL service. |
| `Access denied for user` | `DB_USER` or `DB_PASSWORD` in `.env` is wrong. |
| `npm run check:sql` cannot connect, or fails with error 1044 | It runs the `mysql` command-line client as `mysql -uroot` and creates its own scratch database (`cn_check`), so it needs root or another user who may create databases. Pass your own login: `MYSQL="mysql -uroot -pYOURPASSWORD" npm run check:sql`. |
| The login page shows no "Developer shortcuts" | `NODE_ENV` in `.env` must be `development` (or left out). |

## Demo accounts

All use the password `campus123`.

| Handle | E-mail | Who |
|---|---|---|
| `admin0000` | admin@hku.hk | moderator (reports, announcements, users) |
| `mandy0hku` | mandy@connect.hku.hk | HKU student with posts, comments, a ticket and messages |
| `kelvin0hk` | kelvin@connect.hku.hk | HKU student who always posts anonymously |
| `wing0cuhk` | wing@link.cuhk.edu.hk | CUHK student |
| `jason0ust` | jason@connect.ust.hk | HKUST student who posts with his handle |
| `newbie0hk` | newbie@connect.hku.hk | new HKU student with no data (empty states) |
| `filmsoc00` | filmsoc@hku.hk | organization: HKU Film Society (events) |
| `hikeclub0` | hikeclub@cuhk.edu.hk | organization: CUHK Hiking Club (events) |

## Commands

| Command | Does |
|---|---|
| `npm run setup` | Create `.env` once with a random session secret. |
| `npm run dev` | Start with auto-reload (http://localhost:3000). |
| `npm start` | Start without reload. |
| `npm run db:reset` | Drop and rebuild the development database (`npm run db:reset -- --test` for the test database). |
| `npm test` | Every test, one file at a time, against `DB_NAME_TEST`. `npm test -- modules/content` runs one module's. |
| `npm run check:sql` | The SQL check suite (constraints, views, triggers, every module's queries, the race tests). Needs the `mysql` client. |
| `npm run lint` / `npm run format` | ESLint and Prettier. |
| `npm run load-test` | Adds 20,000 posts to the development database and times every page. |

## Where things are

| Path | What |
|---|---|
| `START_HERE.md` | Role selection, first task and checkpoints. |
| `docs/README.md` | The design pack: product spec, architecture, data model, module guides, team process. Start here. |
| `AGENTS.md` | Rules for coding agents (Claude Code, Codex, Cursor), and a good summary of the rules for people. |
| `db/schema.sql` | The database: every table, constraint and shared view. |
| `db/seed/core.sql` | The demo data. |
| `modules/<name>/queries.js` | Every SQL statement of a module (identity, content, discover, messages, events). |
| `modules/messages/db/triggers.sql` | The notification triggers. |
| `core/` | The shared backbone: database, sessions, login, CSRF, pages, uploads, mail. |
| `db/tests/`, `docs/modules/*/queries.sql` | The SQL check suite. |

How the code is organised and why: `docs/architecture/ARCHITECTURE.md`. How the team works: `docs/team/WORKFLOW.md`.
