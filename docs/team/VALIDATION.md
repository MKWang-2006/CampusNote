# Handoff validation — 21 Oct 2026

## Fresh local checks

- Node 24.9.0 and isolated Oracle MySQL 8.4.13, on loopback port 13378 with dedicated development/test/scratch databases.
- `npm ci` from the lockfile; `npm run lint`: pass.
- Full `npm test`: **119 total, 112 pass, 0 fail, 7 TODO**.
- SQL suite: **456 PASS lines**, ending `ALL SQL CHECKS PASSED`. Includes 120 buyers / 50 tickets and comment-alias races.
- Events: **23 tests pass**, including dates, malformed bodies, upload cleanup, authorization and concurrent booking. Its 200-buyer HTTP demo repeatedly returned 50 booked, 150 sold out and no overselling. See [events validation](../modules/events/VALIDATION.md) for mobile screenshots and JavaScript-disabled checks.
- Public export excludes `.env`, uploaded files, dependencies, original-app reference screenshots and all course/history/AI working files. A targeted staged-file scan found no private keys or credential token patterns.
- `.env` setup preserves existing files and generates a random session secret for a new file.

## Scope and limitations

The seven TODO tests are the two cross-module identity/list/history checks and five end-to-end steps awaiting Content, Discover and Messages. They are visible in test output; they are not completed features. The three modules intentionally remain for the teammates to implement.

One earlier full run intermittently returned 404 instead of the upload rejection handler's 200 for an oversized image. One hundred isolated pre-fix repetitions did not reproduce it, so its exact root cause is unconfirmed. The upload wrapper now accepts only one completion callback per request, with a regression for a late callback after size refusal. The subsequent full suite passes; this is a safeguard, not proof that the earlier failure's cause was established.

The optional Docker Compose setup was syntax/formatted-checked but not started on this Mac, where Docker is unavailable. Application and SQL validation used a real isolated MySQL server. GitHub CI runs the pinned project with Node 22 and a MySQL 8.4 service; check its latest result in [Actions](https://github.com/Michael-wzl/CampusNote/actions).

No live deployment or real email service is configured. Local signup/reset codes use the development mailbox. Test databases and the demo race must remain separate from any real data.
