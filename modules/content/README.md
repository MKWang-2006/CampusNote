# content module

Owner: Member 1 — Content (unclaimed). This folder holds the content module: posts, comments, likes, watches and history: the compose page (+) and the post page. Everything about it (routes, SQL, pages, tests, the build plan and a ready-made prompt for a coding agent) is in [`docs/modules/content/DEV_GUIDE.md`](../../docs/modules/content/DEV_GUIDE.md); what users see is in [`USER_GUIDE.md`](../../docs/modules/content/USER_GUIDE.md).

The backbone shipped this folder as a skeleton: `index.js` (the manifest), `routes.js` with placeholder pages for the paths other modules link to, and `views/content/placeholder.ejs`. Replace the placeholders as you build the real pages, add `queries.js` for your SQL and your tests in `tests/`. Only change files in this folder and in `docs/modules/content/` (see `AGENTS.md`).

## Claim this role

**Member 1 — Content: unclaimed.** Reply on the role issue linked from [START_HERE.md](../../START_HERE.md), then replace “unclaimed” here with your name and GitHub username in your first pull request. No teammate has been assigned this role.
