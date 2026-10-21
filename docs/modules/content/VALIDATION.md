# Content validation

Checked on 21 October 2026 against main `89fed67` and the updated responsive guide. A follow-up audit compared main `635a204`: its changes record the Messages owner and do not alter the Content contract. CT-1–CT-8 are implemented inside `modules/content/`; the code reuses the shared shell, authentication, uploads, validation, database views and notification triggers. No shared file, dependency or schema changes are required. Local Triple UNI research informed flat threads, image ordering and return navigation; project requirements take precedence. Original-app screenshots and real user content are not in this repository.

## Review order

1. [PR #6](https://github.com/Michael-wzl/CampusNote/pull/6): responsive compose form, post/thread pages and My comments (CT-2, CT-7).
2. [PR #7](https://github.com/Michael-wzl/CampusNote/pull/7): transactional publishing, comments/replies, deletion, likes, watches and history (CT-1, CT-3–CT-6).
3. [PR #8](https://github.com/Michael-wzl/CampusNote/pull/8): full image viewer, browser checks and delivery documentation (CT-8).
4. `content/CT-3-deletion-races`: regression coverage for deletion during comment/reply submission (CT-3).

The branches are stacked in this order so each diff contains only its own changes. After merging a preceding PR, retarget/rebase the following PR onto main; do not merge later branches first. Team review and merging are still pending.

## Automated results

| Check | Result |
|---|---|
| `npm test -- modules/content` | 19 tests passed; 0 failed |
| `npm test` | 141 total: 134 passed, 0 failed, 7 existing TODOs |
| `npm run lint` | Passed (ESLint and Prettier) |
| Full `npm run check:sql` on a disposable database | 456 PASS checks; `ALL SQL CHECKS PASSED` |
| HTTP race: 20 first-time participants | 20 successful 303 responses; aliases 0–20 including Host, no gaps or duplicates |
| HTTP race: one participant comments five times | One participant row and unchanged alias |
| SQL race: 30 participants | All 30 names unique with the lock; the no-lock comparison failed 28/30 transactions in this run |

Local runtime: Node 25.8.1 and MySQL 8.0.46. Development, HTTP tests and SQL races use separate task-owned databases. GitHub checks exercise the repository CI environment as well; consult each PR's checks for its exact commit.

The seven TODOs are pre-existing integration checks (five end-to-end checks and two Identity checks). The Identity count-to-list check still reports its expected TODO assertion while Discover's lists are placeholders; the process exits successfully. These TODOs are **not** counted as completed integration tests. The upload rollback test deliberately causes one SQL error and expects HTTP 500, then proves that neither rows nor uploaded files remain.

## Acceptance mapping

Tests group related acceptance cases to avoid resetting a database once per tiny assertion. `pages.test.js` and `writes.test.js` both live in `modules/content/tests/`.

| Guide cases | Executable evidence | Result / boundary |
|---|---|---|
| CT-T01–T02 | `pages.test.js`: compose contracts and preference defaults | Passed, including changed account defaults |
| CT-T03–T04 | `writes.test.js`: ordered images, Host, anonymity and university visibility | Passed |
| CT-T05–T07 | `writes.test.js`: blank/750/751 Unicode characters, required topic, 6/7 files, MIME/signature/size and CSRF | Passed; retained fields, no orphan uploads |
| CT-T08–T09 | `pages.test.js`: owner actions, public identities, anonymous page/Content-region privacy | Passed for Content; whole-page author wording has the shared-sidebar exception below |
| CT-T10–T11 | `pages.test.js`: flat thread, hidden/deleted placeholders and unavailable IDs | Passed |
| CT-T12 | `writes.test.js`: cross-university GET and writes | Passed; no data changes |
| CT-T13–T15 | `writes.test.js` plus reply-form GET assertions in `pages.test.js` | Passed; stable Dave/Alice/Bob/Host, reply/cancel and anchors |
| CT-T16–T17 | `writes.test.js`: invalid/hidden/deleted/cross-post reply targets, blank/500/501 characters | Passed; no consumed alias, no extra view on error |
| CT-T18–T20 | `writes.test.js`: owner-only soft deletion, counts, stable aliases and 404 | Passed on Content and shared data views; Discover lists still need integration |
| CT-T21 | `writes.test.js`: repeated like/unlike JSON and ordinary form | Passed; notification trigger checked |
| CT-T22 | `writes.test.js`: repeated watch/unwatch JSON/form and stored state | Content contract passed; actual Discover Watching list pending |
| CT-T23–T24 | `writes.test.js`: visit counts, clear history, repeated clear and reopening | Passed on data/route contract; actual Discover History list pending |
| CT-T25–T26 | `pages.test.js` and deletion checks in `writes.test.js` | Passed; real 20+1 paging, hidden/deleted visibility and empty state |
| CT-T27 | `pages.test.js` plus browser reply/delete flows | Passed; anchors survive soft deletion |
| CT-T28 | `writes.test.js`: 20 concurrent HTTP clients and repeated participant | Passed |
| CT-T29 | `pages.test.js` and browser original-link check | Passed; original order and no-JavaScript fallback |
| CT-T30 | `writes.test.js`: missing CSRF token | Passed; no insert |

Additional coverage includes escaped user text, strict positive IDs, malformed array fields, SQL-looking topic values, disguised image files and a forced database failure after partial post/image insertion. The latter verifies the real transaction rollback and file cleanup together.

Two follow-up HTTP tests deliberately pause a submission after its route-level visibility check, let an owner's real delete request finish, then resume the real comment transaction. A deleted post returns 404 without creating a comment, alias, notification or visit. A deleted reply target returns 400, retains the draft, removes the invalid reply target and shows its deleted placeholder, with the same absence of side effects. The barrier controls request order without timing sleeps or privileged database-monitoring queries; the existing 20-client test separately exercises simultaneous alias allocation.

## Browser checks

`modules/content/tests/browser-checks.js` exports a check function accepting a Playwright `page`. Run it against a **fresh seeded development database**, not production: it publishes and soft-deletes two sample posts. It does not add Playwright to the application dependencies. Load it using a separate Playwright installation/CLI and pass `{ baseURL, screenshotDir }`; the screenshot directory must already exist. Browser checks are local checks, separate from the HTTP/SQL CI suite.

- Chromium: 128 layout checks = four personas × four widths (390, 768, 1440 and 320 CSS px) × JavaScript on/off × compose, post, My comments and compose errors. No horizontal document overflow; appropriate shared navigation; relevant buttons, toggles and topic targets at least 44 px high.
- Two full browser workflows (JavaScript on/off): publish, Host comment, reply to Host, like, watch, delete a comment and delete the post; deleted page returns 404. Long unbroken text wraps.
- Viewer: single/multiple images, first/last bounds, arrow keys, Tab/Shift+Tab focus containment, Escape, Close, scroll/focus restoration, image-load failure and an ordinary original-file link with scripts disabled. Chromium touch dispatch verifies a real horizontal swipe; this is simulated touch, not a physical phone test.
- WebKit 26.6: the same 128 layout checks, two complete form workflows and viewer keyboard/focus/original-link checks passed. Native Tab preferences can skip buttons in this engine, so the viewer explicitly advances focus in both directions. Touch dispatch is checked in Chromium only. WebKit engine coverage does not claim a run in the installed Safari application or on physical iOS hardware.
- Chrome 155 at **real 200% browser zoom**: all three pages passed as all four personas (12 page checks), plus form errors and viewer navigation/close. The isolated test profile's Chrome Appearance setting was set to 200%; a 1440 px outer window yielded a 720 CSS px viewport and `devicePixelRatio = 2`. This was browser zoom, not CSS `zoom` or a page transform. See [the zoom screenshot](img/compose-zoom200.png).
- Phone, tablet and desktop screenshots in `img/` use only seeded demonstration content. Viewer captures show the viewport; normal pages use full-page captures.
- Follow-up Chrome audit: two selected PNG files produced two loaded thumbnails; keyboard activation of Next at the final-image boundary still allowed ArrowLeft to return. The audit used a separate browser session and preserved the user's demonstration posts.

## Pending integration and contract clarification

1. **Discover:** `/me/watching`, `/me/history`, `/me/posts`, liked lists and user pages are still placeholders on the checked baseline. Content writes the expected rows and links; rerun their list/count checks once Discover is integrated.
2. **Messages:** database triggers create the expected notifications. Notification screens, private-message destinations and report forms still require Messages. Their links are verified; their complete UI workflows are not represented as passed.
3. **[Issue #5](https://github.com/Michael-wzl/CampusNote/issues/5):** D22's shared desktop account sidebar displays the signed-in viewer's own handle. Thus Kelvin sees his own account name in the shell when opening his anonymous post. Content never exposes an anonymous author's or commenter's handle, including in the author's own Content area. The guide's older whole-page “including its author” wording cannot pass literally without a shared decision; no shared layout was changed to hide the conflict.
4. **Team video:** [DEMO_SCRIPT.md](DEMO_SCRIPT.md) supplies the Content segment and narration. Whole-team recording and integration shots remain pending until the destination modules are ready.

## Supporting material

- [User guide and screenshots](USER_GUIDE.md)
- [SQL slide, constraints and concurrency evidence](SQL_CARD.md)
- [Content demonstration script](DEMO_SCRIPT.md)
