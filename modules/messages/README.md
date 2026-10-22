# messages module

Owner: Member 3 — Messages ([MKWang-2006](https://github.com/MKWang-2006)). This folder holds the messages module: notifications, private messages, reports and moderation. Everything about it (routes, SQL, pages, tests, the build plan and a ready-made prompt for a coding agent) is in [`docs/modules/messages/DEV_GUIDE.md`](../../docs/modules/messages/DEV_GUIDE.md); what users see is in [`USER_GUIDE.md`](../../docs/modules/messages/USER_GUIDE.md).

The backbone shipped this folder as a skeleton: `index.js` (the manifest), `routes.js` with placeholder pages for the paths other modules link to, and `views/messages/placeholder.ejs`. Replace the placeholders as you build the real pages, add `queries.js` for your SQL and your tests in `tests/`. Only change files in this folder and in `docs/modules/messages/` (see `AGENTS.md`).

## Start working

**Member 3 — Messages: MKWang-2006.** Michael confirmed the claim on 21 Oct and sent the collaborator invitation. Accept it, follow [START_HERE.md](../../START_HERE.md), then build your first read-only page using the DEV_GUIDE above. Track progress in [issue #3](https://github.com/Michael-wzl/CampusNote/issues/3); no name-only PR is needed.
