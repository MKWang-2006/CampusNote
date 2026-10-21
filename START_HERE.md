# Start here

Repository: **[Michael-wzl/CampusNote](https://github.com/Michael-wzl/CampusNote)**.

Campus Notes is our COMP3278 anonymous campus forum. The shared app, database, demo data, login/profile and events modules are built. Content, Discover and Messages are starter modules for teammates to implement. Michael owns shared code, identity and events.

## 1. Choose one role

These are job options, not assignments to people. Reply on one unclaimed role issue with your name and GitHub username; check that nobody else has claimed it. Record your ownership in your module's README in your first pull request.

| Available role | What you build | Detailed guide |
|---|---|---|
| **Member 1 — Content** | Posts and images, comments and aliases, likes, watches and history | [Content DEV_GUIDE](docs/modules/content/DEV_GUIDE.md) |
| **Member 2 — Discover** | Feeds, hot ranking, search, personal lists, user pages and announcements | [Discover DEV_GUIDE](docs/modules/discover/DEV_GUIDE.md) |
| **Member 3 — Messages** | Notifications, private messages, reports and moderation | [Messages DEV_GUIDE](docs/modules/messages/DEV_GUIDE.md) |

Claim a role: [Member 1 — Content](https://github.com/Michael-wzl/CampusNote/issues/1) · [Member 2 — Discover](https://github.com/Michael-wzl/CampusNote/issues/2) · [Member 3 — Messages](https://github.com/Michael-wzl/CampusNote/issues/3).

[Weekly status — Done / Next / Blocked](https://github.com/Michael-wzl/CampusNote/issues/4)

## 2. Run the app

Follow [README.md](README.md#run-locally). You need Node 22+ and MySQL 8 (or Docker for the database). Log in using the development shortcuts. Placeholder pages for the three teammate modules are expected.

## 3. Start your first task

1. Read your DEV_GUIDE's scope, build plan and acceptance tests. It includes tested SQL and a coding-agent prompt.
2. Work only in `modules/<your module>/` and `docs/modules/<your module>/`. Ask Michael about shared-file or schema changes.
3. Start with the read-only pages using seed data. Use a branch such as `content/CT-2-post-page` and open a small PR.
4. Before merging, run `npm test` and `npm run lint`; CI also checks the SQL. Read [WORKFLOW.md](docs/team/WORKFLOW.md) when opening your first PR.

**Checkpoints:** 25 Oct — pages render with seed data; 1 Nov — Must features merged; 6 Nov — module complete. Post Done / Next / Blocked in the weekly status issue each Sunday.

For the full specification, architecture and database design, see [docs/README.md](docs/README.md). You do not need to read the entire pack before starting your module.
