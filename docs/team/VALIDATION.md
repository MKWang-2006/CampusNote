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

## Responsive update

The desktop-first shared shell and module examples were checked at 390, 768 and 1440 px, with additional 320, 767, 1023, 1024 and 1920 px edge checks and short desktop windows. Browser checks cover real login/settings saves, normal and empty pages, 44 px navigation targets, visible keyboard focus/skip link, grid/navigation breakpoints, and JavaScript-disabled forms. The shared layout uses CSS viewport rules, without device detection or duplicate routes. Representative screenshots are in [RESPONSIVE.md](../architecture/RESPONSIVE.md#reference-views).

Fresh full application suite after this update: **122 total, 115 pass, 0 fail, 7 TODO**. The TODOs still belong to the teammate modules. Lint/format pass. SQL and database behavior are unchanged; remote CI runs the SQL suite on the new commit.

Browser evidence includes 105 page visits, 94 edge checks and a long-content component fixture; it used Chromium emulation. Physical phones, Safari and Firefox have not been tested. Local evidence is retained in the course workspace’s AI working folder rather than the public repo.

## Content integration review — 22 Oct 2026

The coordinator reviewed the combined Content PRs #6–#11 against current main. Content publishing/images, detail/comments, likes/watches, history writes and image viewer are implemented. Discover lists and Messages screens still need their owners. D23 resolves issue #5: own-account sidebar identity is allowed, while post/participant identities remain anonymous. The shared privacy test now checks the viewer's own identity in anonymous content too.

Coordinator checks: **154 application cases: 148 pass, 0 fail, 6 TODO**; lint/format pass; **456 SQL checks pass**. The six TODOs are one Content Watching destination check, one Identity count-to-list check, and four cross-module demo stages requiring Discover/Messages. Two formerly pending checks now run: Identity clear-history count and real multipart image publishing through the demo path.

Installed Chrome browser QA passed 130 layout checks across four personas, 320/390/768/1440 px and JavaScript on/off, plus publishing/comment/reply/like/watch/deletion workflows, viewer keyboard/focus/scroll/error fallback and simulated touch swipe. Desktop and phone screenshots were visually checked. This coordinator run used Chromium; physical phones, Firefox and installed Safari were not run. The member's earlier engine/zoom evidence is recorded in [Content validation](../modules/content/VALIDATION.md).

One intermediate local full run failed during Events race setup because a fresh login response lacked the expected CSRF meta tag. The original log did not identify the HTTP status; no SQL/session error was logged. Twenty-six isolated Events race runs (780 buyer logins/bookings) did not reproduce it. The final full application run passed all 148 enabled cases. Safe response-status/type/path diagnostics were added to the test helper, without retries or changes to application authentication. The cause remains unconfirmed; a passing rerun does not establish a fix.

## Login-test transport investigation and fix — 22 Oct 2026

The earlier post-merge CI run [39713097806](https://github.com/Michael-wzl/CampusNote/actions/runs/39713097806) passed. Further investigation reproduced the missing-CSRF symptom without Campus Notes or MySQL: a synthetic Express login app returned a foreign HTTP 401 JSON response, without its app marker, and the request never entered its handler.

The installed SuperTest 7.3.0 automatic-server path calls `listen(0)` on the IPv6 wildcard `::`, then constructs a `127.0.0.1` URL. On this Mac, an IPv6 listener and an unrelated IPv4 listener can own the same port. The client therefore sometimes contacted the other process. The controlled fixture demonstrated the same port reaching two different apps depending on its address family. The original failure log had no response trace, but this reproduction establishes a concrete cause of the same intermittent missing-token failure.

A synthetic comparison attempted 4,108 automatic-lifecycle agents: two foreign responses and three transport/parser errors. Explicit IPv4 binding then completed 20,000 redirect/login pairs with zero anomalies or errors. This evidence isolates transport routing; it does not justify weakening authentication or retrying failed assertions.

`test/http-server.js` now awaits an explicit `127.0.0.1` listener. Shared test agents use one stable server per test file, with independent cookie jars, and close it before the database pool. App creation remains lazy so file-local upload/config fixtures still apply. Render/upload tests and the developer load-test client use the same helper. Production routing, login, session storage, CSRF checks and dependencies are unchanged.

Five DB-free regressions cover the request address family, independent cookies, concurrent requests to separate apps, occupied IPv4-port refusal, and an IPv4/IPv6 same-port collision. An in-memory mutation to the unsafe address family makes the relevant regressions fail. The normal fixed tests pass. The collision fixture skips only when IPv6 is unavailable; the ordinary IPv4 and cookie/concurrency checks always run.

Final local verification: **159 cases, 153 pass, 0 fail, 0 skip, 6 TODO**; lint/format pass; **456 SQL checks pass** concurrently with the application suite; the load-test client’s seeded `--pages` smoke check passes. The six TODOs still belong to unfinished Discover/Messages integration. Original traces, the synthetic comparison, regression results and fixed-suite logs are retained in the local course workspace’s `AI_work/gp/validation/2026-10-22-login-investigation/`.
