# messages module

Owner: Member 3 — Messages ([MKWang-2006](https://github.com/MKWang-2006)). This folder holds the messages module: notifications, private messages, reports and moderation. Everything about it (routes, SQL, pages, tests, the build plan and a ready-made prompt for a coding agent) is in [`docs/modules/messages/DEV_GUIDE.md`](../../docs/modules/messages/DEV_GUIDE.md); what users see is in [`USER_GUIDE.md`](../../docs/modules/messages/USER_GUIDE.md).

MS-1 to MS-7 are implemented locally: notifications and unread badges, conversations, sending and read pointers, reports, and admin hide/dismiss/restore. The existing triggers, shared schema and layout are unchanged. Discover is synchronized from main without Messages-authored edits. MS-8 block/unblock controls are outside this delivery; sending still respects any existing conversation block.

Routes call named SQL functions in `queries.js`; templates and scoped styles use the shared UI kit. `tests/acceptance.test.js` covers MS-T01 to MS-T26, `tests/regressions.test.js` covers eight boundary/concurrency cases, and `tests/integration.test.js` covers six real-link and shared-view interactions with Discover and Content. Run `npm test -- modules/messages`.

See [HANDOFF.md](../../docs/modules/messages/HANDOFF.md) for team integration and [LOCAL_ACCEPTANCE.md](../../docs/modules/messages/LOCAL_ACCEPTANCE.md) for startup and a repeatable manual check, [VALIDATION.md](../../docs/modules/messages/VALIDATION.md) for actual results and integration limitations, and [SQL_CARD.md](../../docs/modules/messages/SQL_CARD.md) for the presentation.

## Start working

**Member 3 — Messages: MKWang-2006.** On 25 Oct 2026, the local branch `codex/messages-local` was fast-forwarded to main commit `f9e8f68703731219c6994c38e035203b4bf64572`, retaining all uncommitted Messages work. The publication branch is `codex/messages-ms1-ms7` in the owner's fork; upstream main is not changed by this delivery. See [MAIN_ADAPTATION.md](../../docs/modules/messages/MAIN_ADAPTATION.md) for the delivery and cross-module acceptance. Ownership remains tracked in [issue #3](https://github.com/Michael-wzl/CampusNote/issues/3).
