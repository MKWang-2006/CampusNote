# Start here

Repository: **[Michael-wzl/CampusNote](https://github.com/Michael-wzl/CampusNote)**.

Campus Notes is our COMP3278 anonymous campus forum. The shared app, database, demo data, login/profile and events modules are built. Content, Discover and Messages are starter modules for teammates to implement. Michael owns shared code, identity and events.

## 1. Roles and repository access

| Role | Owner | What you build | Detailed guide |
|---|---|---|---|
| **Member 1 — Content** | **[Catherine135](https://github.com/Catherine135)** — claimed | Posts/images, comments, likes, watches and history | [Content DEV_GUIDE](docs/modules/content/DEV_GUIDE.md) |
| **Member 2 — Discover** | **[hX1-dev](https://github.com/hX1-dev)** — claimed | Feeds, ranking, search, personal lists, user pages and announcements | [Discover DEV_GUIDE](docs/modules/discover/DEV_GUIDE.md) |
| **Member 3 — Messages** | **[MKWang-2006](https://github.com/MKWang-2006)** — claimed | Notifications, private messages, reports and moderation | [Messages DEV_GUIDE](docs/modules/messages/DEV_GUIDE.md) |

All three roles are claimed. Michael recorded MKWang-2006’s Messages claim on 21 Oct. Start your module directly; no name-only PR is needed.

Repository invitations have been sent to all three members. Accept yours on GitHub before pushing if you have not already. Ownership is tracked in [Content #1](https://github.com/Michael-wzl/CampusNote/issues/1), [Discover #2](https://github.com/Michael-wzl/CampusNote/issues/2) and [Messages #3](https://github.com/Michael-wzl/CampusNote/issues/3).

[Weekly status — Done / Next / Blocked](https://github.com/Michael-wzl/CampusNote/issues/4)

## 2. Run the app

Follow [README.md](README.md#run-locally). You need Node 22+ and MySQL 8 (or Docker for the database). Log in using the development shortcuts. Placeholder pages for the three teammate modules are expected.

## 3. Build for desktop and phones

The shared layout adapts automatically: a sidebar and wider content on desktop, an expanded layout on tablets, and bottom navigation with one-column content on phones. Read the short [responsive guide](docs/architecture/RESPONSIVE.md); your module should use its fluid widths and shared helpers. Check pages at **390, 768 and 1440 px**, including without JavaScript.

## 4. Start your first task

1. Read your DEV_GUIDE's scope, build plan and acceptance tests. It includes tested SQL and a coding-agent prompt.
2. Work only in `modules/<your module>/` and `docs/modules/<your module>/`. Ask Michael about shared-file or schema changes.
3. Start with the read-only pages using seed data. Use a branch such as `content/CT-2-post-page` and open a small PR.
4. Before merging, run `npm test` and `npm run lint`; CI also checks the SQL. Read [WORKFLOW.md](docs/team/WORKFLOW.md) when opening your first PR.

**Checkpoints:** 25 Oct — pages render with seed data; 1 Nov — Must features merged; 6 Nov — module complete. Post Done / Next / Blocked in the weekly status issue each Sunday.

For the full specification, architecture and database design, see [docs/README.md](docs/README.md). You do not need to read the entire pack before starting your module.
