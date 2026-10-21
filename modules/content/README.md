# content module

Owner: Member 1 — Content ([Catherine135](https://github.com/Catherine135)). This folder holds the content module: posts, comments, likes, watches and history: the compose page (+) and the post page. Everything about it (routes, SQL, pages, tests, the build plan and a ready-made prompt for a coding agent) is in [`docs/modules/content/DEV_GUIDE.md`](../../docs/modules/content/DEV_GUIDE.md); what users see is in [`USER_GUIDE.md`](../../docs/modules/content/USER_GUIDE.md).

The backbone shipped this folder as a skeleton: `index.js` (the manifest), `routes.js` with placeholder pages for the paths other modules link to, and `views/content/placeholder.ejs`. Replace the placeholders as you build the real pages, add `queries.js` for your SQL and your tests in `tests/`. Only change files in this folder and in `docs/modules/content/` (see `AGENTS.md`).

## Ownership and first step

**Catherine135** claimed this role in [issue #1](https://github.com/Michael-wzl/CampusNote/issues/1). A write-access invitation has been sent; accept it on GitHub, then follow [START_HERE.md](../../START_HERE.md) and begin your first feature. Ownership is already recorded; a name-only PR is unnecessary.

Use the shared [responsive layout](../../docs/architecture/RESPONSIVE.md) and test desktop, tablet and phone widths.
