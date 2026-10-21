# discover module

Owner: Member 2 — Discover ([hX1-dev](https://github.com/hX1-dev)). This folder holds the discover module: feeds, hot ranking, search, the four "my" lists, user pages and announcements. Everything about it (routes, SQL, pages, tests, the build plan and a ready-made prompt for a coding agent) is in [`docs/modules/discover/DEV_GUIDE.md`](../../docs/modules/discover/DEV_GUIDE.md); what users see is in [`USER_GUIDE.md`](../../docs/modules/discover/USER_GUIDE.md).

The backbone shipped this folder as a skeleton: `index.js` (the manifest), `routes.js` with placeholder pages for the paths other modules link to, and `views/discover/placeholder.ejs`. Replace the placeholders as you build the real pages, add `queries.js` for your SQL and your tests in `tests/`. Only change files in this folder and in `docs/modules/discover/` (see `AGENTS.md`).

## Ownership and first step

**hX1-dev** claimed this role in [issue #2](https://github.com/Michael-wzl/CampusNote/issues/2). A write-access invitation has been sent; accept it on GitHub, then follow [START_HERE.md](../../START_HERE.md) and begin your first feature. Ownership is already recorded; a name-only PR is unnecessary.

Use the shared [responsive layout](../../docs/architecture/RESPONSIVE.md) and test desktop, tablet and phone widths.
