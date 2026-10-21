# Content validation

Checked on 21 October 2026 against main `89fed67` and the updated responsive guide. A follow-up audit compared main `635a204`: its changes record the Messages owner and do not alter the Content contract. CT-1–CT-8 are implemented inside `modules/content/`; the code reuses the shared shell, authentication, uploads, validation, database views and notification triggers. No shared file, dependency or schema changes are required. Local Triple UNI research informed flat threads, image ordering and return navigation; project requirements take precedence. Original-app screenshots and real user content are not in this repository.

## Review order

1. [PR #6](https://github.com/Michael-wzl/CampusNote/pull/6): responsive compose form, post/thread pages and My comments (CT-2, CT-7).
2. [PR #7](https://github.com/Michael-wzl/CampusNote/pull/7): transactional publishing, comments/replies, deletion, likes, watches and history (CT-1, CT-3–CT-6).
3. [PR #8](https://github.com/Michael-wzl/CampusNote/pull/8): full image viewer, browser checks and delivery documentation (CT-8).
4. [PR #9](https://github.com/Michael-wzl/CampusNote/pull/9): regression coverage for deletion during comment/reply submission (CT-3).
5. `content/CT-acceptance-audit`: clause-by-clause acceptance assertions and executable pending integration checks.

The branches are stacked in this order so each diff contains only its own changes. After merging a preceding PR, retarget/rebase the following PR onto main; do not merge later branches first. Team review and merging are still pending.

## Automated results

| Check | Result |
|---|---|
| `npm test -- modules/content` | 21 tests: 19 passed, 0 unexpected failures, 2 explicit TODOs |
| `npm test` | 143 total: 134 passed, 0 unexpected failures, 9 TODOs (7 existing + 2 Content integration/contract checks) |
| `npm run lint` | Passed (ESLint and Prettier) |
| Full `npm run check:sql` on a disposable database | 456 PASS checks; `ALL SQL CHECKS PASSED` |
| HTTP race: 20 first-time participants | 20 successful 303 responses; aliases 0–20 including Host, no gaps or duplicates |
| HTTP race: one participant comments five times | Five independent sessions for one user; one participant row and unchanged alias |
| SQL race: 30 participants | All 30 names unique with the lock; the no-lock comparison failed 28/30 transactions in this run |

Local runtime: Node 25.8.1 and MySQL 8.0.46. Development, HTTP tests and SQL races use separate task-owned databases. Content upload tests now use a temporary directory per test process and remove it afterwards; they never write into the running demo's upload folder. GitHub checks exercise the repository CI environment as well; consult each PR's checks for its exact commit.

Seven of the nine TODOs are pre-existing integration checks (five end-to-end checks and two Identity checks). The Identity count-to-list check still reports its expected TODO assertion while Discover's lists are placeholders; the process exits successfully. These TODOs are **not** counted as completed integration tests. The upload rollback test deliberately causes one SQL error and expects HTTP 500, then proves that neither rows nor uploaded files remain.

## Acceptance mapping: every CT-T01–CT-T30 clause

Audit baseline: the latest fetched main `635a204`, whose Content guide is unchanged. **27 cases pass without a contract qualification. CT-T03 and CT-T08 pass the Content behavior but remain qualified by the ambiguous whole-page no-handle rule; CT-T22 is partial because Discover has no Watching list yet.** CT-T09's stated Mandy-viewer test passes; the broader author-viewer requirement in §8 remains a separate unmet contract, not a passed test.

Evidence links: [page tests](../../../modules/content/tests/pages.test.js), [write tests](../../../modules/content/tests/writes.test.js), [pending integration tests](../../../modules/content/tests/integration.test.js). The tests group related cases, but every acceptance ID is accounted for below.

| Case | Required behavior and evidence | Verdict |
|---|---|---|
| CT-T01 | Mandy compose 200, no compact tabs, multipart/leave guard, 750 counter, preview input, seven topics, both switches off (pages) | Pass |
| CT-T02 | Jason/Kelvin/Newbie defaults and updated Newbie preference reflected in the form (pages) | Pass |
| CT-T03 | Publish two distinguishable PNG byte streams; 303, Posted, post number, Trade, anonymous header, Host, database flags, and identical storage/HTML image order (writes) | **Content passes; whole-page privacy wording pending** |
| CT-T04 | Wing cannot open the HKU-only post; both toggles on exposes the new post and Mandy's author link to Wing (writes) | Pass |
| CT-T05 | Blank + image gives field error and preserves topic; no row/file; 751 rejected and exactly 750 Unicode code points accepted (writes) | Pass |
| CT-T06 | Missing/invalid topic gives Pick a topic; no post or file added (writes) | Pass |
| CT-T07 | Seven images/wrong MIME rejected with draft and exact upload error; files removed; missing multipart CSRF refused (writes) | Pass |
| CT-T08 | Seed metadata, like 3/watch 1 selected, non-owner Message/Report links; author-only Delete and no self Message/Report (pages) | **Content passes; whole-page privacy wording pending** |
| CT-T09 | Mandy's entire response excludes Kelvin/Wing/Jason identities; named Jason and Film Society posts show their required links/names (pages) | Pass for this exact case; broader author-viewer §8 wording remains unmet |
| CT-T10 | Anchors c10–c14, Alice/Bob/Carol/Host/Alice, hidden c12 has no actions, reply labels including Host=0, owner actions, alias links, deleted c6 (pages) | Pass |
| CT-T11 | All six specified unavailable/invalid IDs return 404, plus zero/negative/fraction/exponent/overflow IDs (pages) | Pass |
| CT-T12 | Wing's GET/like/watch/comment on HKU-only post return 404; all five relevant tables remain unchanged (writes) | Pass |
| CT-T13 | Newbie's first and second comments render Dave; composer says Dave; one participant row (writes) | Pass |
| CT-T14 | Empty-post first commenters render Alice, Bob, then author Host; database aliases 1, 2, 0 (writes) | Pass |
| CT-T15 | Newbie GET reply=11 shows Bob and hidden target; Cancel returns to box; POST reply says Bob; hidden reply=12 is ignored (pages/writes) | Pass |
| CT-T16 | Hidden/deleted/cross-post/unknown/malformed targets give 400 with the expected message and no comment/alias (writes) | Pass |
| CT-T17 | Blank/501-character comments give exact field errors, preserve input and allocate no alias; 500 accepted (writes) | Pass |
| CT-T18 | Delete c14 redirects to its anchor; deleted placeholder and flash; count 4→3; next comment stays Alice; repeat delete 404 (writes) | Pass |
| CT-T19 | Non-owner deletion of post/comment gives 404; post still opens and original comment text is unchanged (writes) | Pass |
| CT-T20 | Delete 600013 redirects to feed with Post deleted; feed link absent; owner/other viewer GET and repeat deletion give 404 (writes) | Pass, including the existing seed feed |
| CT-T21 | Like 1/1/0/0 returns exact states/counts; ordinary form redirects to post (writes; browser checks cover in-place updates) | Pass |
| CT-T22 | Watch/unwatch JSON and stored state pass; actual Watching page never displays the saved post (writes + executable integration TODO) | **Partial: Discover list assertion fails** |
| CT-T23 | Newbie's two visits create one row/count 2; Mandy count 4→5; inaccessible visit creates no row (writes) | Pass |
| CT-T24 | Clear marks Mandy's four rows, leaves Kelvin's rows unchanged and total 11; repeat safe; revisit restores row/count 5 and total 12 (writes) | Pass for all stated assertions; History page UI is separate pending integration |
| CT-T25 | Exact links/order 14,10,3,2 and Alice/Alice/Alice/Host labels; cursor 10 gives exactly 3,2; hidden text preserved as placeholder; deleted c6 omitted (pages) | Pass |
| CT-T26 | Newbie empty state; Kelvin's new comment is first; deleting its post removes it from My comments (pages/writes) | Pass |
| CT-T27 | All required anchors remain, including hidden/deleted comments (pages) | Pass |
| CT-T28 | 20 concurrent HTTP submissions all 303; exactly 20 comments and aliases 0–20, no duplicates/gaps (writes) | Pass |
| CT-T29 | Two seed thumbnails link to original files in order; no-JavaScript original links work (pages/browser) | Pass |
| CT-T30 | Missing comment CSRF gives 403 and no comment inserted (writes; shared CSRF tests cover every POST) | Pass |

### Unmet checks are executable, not silently counted as passed

`integration.test.js` actually executes the Watching-list and whole-page author-privacy assertions. Normal CI marks the known failures as TODO with their dependency/reason. They are excluded from the pass count. To turn them into strict release failures, run:

```sh
CONTENT_STRICT_ACCEPTANCE=1 npm test -- modules/content/tests/integration.test.js
```

On this baseline both assertions fail: the first belongs to Discover; the second needs Michael's decision in [issue #5](https://github.com/Michael-wzl/CampusNote/issues/5). Once resolved, remove their TODO declarations and rerun the full flows. This strict command is not a claim that release acceptance is already green.

The repeated-user race uses independent authenticated sessions. An earlier run sharing one agent hit `ECONNRESET` during concurrent request setup; this was not counted as a pass. The independent-session regression keeps concurrent HTTP writes while avoiding a shared test client and concurrent CSRF refresh.

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
