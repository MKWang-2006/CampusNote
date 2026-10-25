# Messages validation

The original sections below record the 22 Oct implementation against `995b84d`. The [25 Oct synchronized-main run](#25-oct-2026-synchronized-main-validation) at the end supersedes the old Discover-placeholder limitation and gives the current delivery results. Historical counts are retained rather than presented as new runs.

## Baseline and boundaries

- Base: `995b84d7e9849e4acbe9c395bc6cf2fdb5fc0149`; local branch: `codex/messages-local`.
- Runtime: Windows, PowerShell 7.6.5, Node 24.15.0, npm 11.12.1, MySQL 8.0.46 on isolated loopback port 3307. Local `.cmd` launchers select the existing bundled PowerShell 7 explicitly.
- Development: `campus_notes_messages_local`; application tests: `campus_notes_messages_test`; SQL suite: `campus_notes_messages_sqlcheck`.
- Scope: MS-1 to MS-7. MS-8 controls deferred; existing blocks still prevent sends as prescribed by the guide.
- Existing schema, triggers, shared code, dependencies, Content, Discover, Identity and Events are unchanged. Changes are limited to the Messages module and its documentation. Local runtime files and credentials are outside the versioned changes.

The initial Windows checkout converted LF to CRLF and caused formatting warnings. Checkout bytes were restored to the committed LF representation, then unchanged files were verified by their Git blob hashes. This introduced no shared content changes. Git metadata was refreshed only for byte-identical files; no changes were staged.

## Commands actually executed

| Check | Actual result |
| --- | --- |
| Original `npm test`, before wiring Messages | 159 tests: 152 passed, 1 failed, 6 TODO |
| Baseline `npm run lint`, after restoring checkout LF | Passed |
| `npm test -- modules/messages` with the 26 acceptance cases | 26 passed, 0 failed, 0 skipped, 0 TODO |
| `npm test -- modules/messages/tests/regressions.test.js` | 8 passed, 0 failed, 0 skipped, 0 TODO |
| Final `npm test`, including all 34 Messages tests | 193 tests: 186 passed, 1 failed, 6 TODO; no new failures |
| `npm run lint` after implementation | Passed |
| Original `db/tests/run_all.sh`, using portable Bash and isolated SQL database | 456 PASS checks; ALL SQL CHECKS PASSED |
| Delivered `Start-Local.ps1`, `Stop-Local.ps1`, then `Start-Local.ps1` | Actual app/database stop and restart passed; data retained |
| Delivered `Reset-Demo.ps1` | Dedicated development database restored successfully |

The SQL suite includes constraints, shared views, existing triggers, all modules' reference SQL and the existing alias/booking races. Its expected INFO output demonstrates failures in the deliberately unlocked alias race; it is not a failed locked implementation.

Logs are kept locally under `C:\Users\Yizheng\Desktop\COMP3278\CampusNote-local`: `baseline-tests.log`, `messages-tests.log`, `messages-regressions.log`, `final-tests.log`, `baseline-sql.log` and `final-lint.log`.

## Meaningful additional regressions

- Thirty-row notification pages do not duplicate entries; a notification arriving after the read snapshot stays unread.
- Concurrent first sends create one conversation containing both messages.
- First-message and send failures roll back conversations, messages and read pointers; non-members are rejected by both route and trigger protections.
- Public-handle and per-post conversations remain separate contexts.
- Stale pointers cannot move backwards; only the last 100 messages display in chronological order.
- Unicode character limits, literal HTML, malformed repeated form fields and optional report details are covered.
- An injected report-update error rolls back the hidden-content insert.
- Concurrent hides on different report IDs for one target resolve reports once and leave one audit row.

## Browser evidence

Screenshots are in `screenshots/`; 78 measured layout checks are in `screenshots/browser-layout-results.json`. Normal, empty, long-text and validation-error states were checked at 390, 768 and 1440 px for document overflow, navigation and 44 px controls, including Mandy, Kelvin, Jason, Newbie and Admin as applicable. A scrollbar can make the measured document client width 15 px narrower than the configured viewport. Keyboard Tab navigation reached Send with a visible solid focus outline; its screenshot is included.

The real browser demonstrated Mandy's badge transition 4 → 1 → 0, two-account anonymous sending/replying, empty states, non-member rejection, the existing Content message/report links, duplicate reporting, grouped moderation, hiding and restoration.

The no-page-JavaScript check used a local-only proxy on port 3001 adding `Content-Security-Policy: script-src 'none'; object-src 'none'`. Native HTML forms successfully created/sent a conversation, reported content, hid it and restored it. This blocks application scripts; the global browser JavaScript preference was not changed. The adapter is outside project source and is not a new app endpoint.

## Existing limitations and handoff

1. **Existing Windows assertion:** `test/core/reset.test.js:37` expects `modules/messages/db/triggers.sql` with `/`, while `sqlFiles()` returns a path built with Windows `\`. The same single failure exists before and after this implementation. Real database resets apply the trigger successfully, and the SQL suite passes. No shared source or test was modified. Michael can normalize separators in that shared test through the team's contract-change process.
2. **Six existing TODO markers** remain in the full suite. Their owning modules and shared tests were not edited; passing Messages tests do not claim the entire project is integration-complete.
3. At the original `995b84d` base, Discover's public user page and some personal-list targets were unfinished. The user page and My posts were subsequently merged upstream and are integrated in the 25 Oct run below; Watching and other unfinished targets remain outside Messages.
4. A fresh rebuild was exercised locally using the real schema, triggers and seed. The work division's second-laptop rebuild test remains a team handoff task.
5. No commit, push, pull request, issue comment or external deployment was performed.

## Implementation notes against the guide

- The current shared `res.page` executes module locals hooks after route work. It therefore refreshes the badge after mark-read without manually changing shared rendering code.
- All test and UI anonymity assertions follow approved decision D23: own-account navigation may name the viewer; anonymous participants and post-context counterparts remain unnamed.
- The guide's introductory seed-report sentence incorrectly attributes post 600007 to Mandy. Actual schema/seed and its acceptance cases correctly identify Kelvin as the author; tests and admin display use the actual data.
- Moderation locks the target's reports in report-ID order before resolving them, keeping simultaneous actions transactional without a schema change.

## 25 Oct 2026 synchronized-main validation

### Source and backup

- Retained branch `codex/messages-local`; fast-forwarded from `995b84d` to upstream `f9e8f68703731219c6994c38e035203b4bf64572` without a conflict.
- All 38 incoming files belong to Discover's source/docs. No Messages-authored change was made to Discover, the shared shell, schema, dependencies or existing triggers.
- Before synchronization, copied 58 Messages files, recorded the tracked binary patch and deleted-file list, and preserved a SHA-256 manifest outside the repository in `Messages-before-main-20261025-9282c0a2`.
- Before browser writes/reset, backed up the isolated development database to `development-before-browser.sql` in that backup folder. No test or SQL-check database shares its name.
- A raw Git-blob audit of every tracked file outside the two Messages directories found **zero content differences**. There are **zero untracked files outside those directories**. SHA-256 comparison against the backup found **zero changes to the existing Messages business source**; the source addition is the integration test file. Documentation is updated separately.

### Commands actually executed in this run

| Check | Actual result |
| --- | --- |
| `npm test -- modules/messages` | **40 passed**, 0 failed, 0 skipped, 0 TODO: 26 guide cases + 8 regressions + 6 integration cases |
| `npm run lint` | Passed; the new integration test was formatted with the already installed Prettier, limited to that file |
| `npm test` after synchronization | **225 tests: 218 passed, 1 failed, 6 TODO**, 0 skipped; duration about 558 seconds |
| Existing `Check-SQL.ps1` / unchanged `db/tests/run_all.sh` | **456 PASS**, `ALL SQL CHECKS PASSED`, exit 0 |
| Local stop/start after main synchronization | Passed; application reloaded the incoming Discover routes |
| Dedicated development reset after backup | Passed; only `campus_notes_messages_local` was rebuilt |

The one non-TODO full-suite failure is still `test/core/reset.test.js:37`: the Windows path separator assertion described above. No new non-TODO failure appeared. The six existing TODO markers remain, including the unfinished Watching/Me-count integration and four shared walkthrough stubs; actual Messages feature acceptance is covered by the 40 executed module tests, not those stubs. Full-suite exit code is **1**, not a full pass. Shared tests were not edited or weakened.

Logs are in `C:\Users\Yizheng\Desktop\COMP3278\CampusNote-local`: `adapt-messages-tests.log`, `adapt-lint.log`, `adapt-full-tests.log`, `adapt-sql.log` and `adapt-scope-audit.json`. No credentials are included in the source bundle.

### Browser checks actually executed

- **54 layout checks** at 390 × 844, 768 × 1024 and 1440 × 900, with no horizontal document overflow. Measured form/button targets are at least 44 px; radio/checkbox targets are their clickable labels, not just the small native glyph. The report radio glyph is 20 px inside a 44 px label.
- Normal Messages, Feed, My posts, public profile, public compose, anonymous/public conversation, notification, empty, validation-error and moderation states were checked. A 1,000-character unbroken message remained within the document at all three widths. Keyboard Tab reached Send with a visible 2 px solid outline.
- Mandy's initial badge changed **4 → 1 → 0**; Mandy/Kelvin sent and replied, and a reload retained both new messages. Kelvin's badge went **5 → 4** when he opened Mandy's message.
- Newbie's student-profile Message entry created conversation 3, returned to the profile and reused that conversation. The organization entry created conversation 4, displayed **HKU Film Society** and returned to `/u/filmsoc00`.
- With page scripts prohibited, Newbie used Content's Message the host link for conversation 5, then Mandy's public profile for conversation 6. The same user pair stayed in separate anonymous and public contexts.
- Newbie's own empty inbox/notifications and third-person/private/admin denials were checked; banned-profile behavior is exercised in isolated integration test MS-I03 rather than changing development accounts.
- With page scripts prohibited, Newbie reported named post **600013** twice: one report was stored and the second showed the duplicate notice. Admin hid it, and Mandy's All Feed, university Feed, My posts and public profile all omitted it; the detail page was not found. Restore made the post reappear in all four lists. A direct database read confirmed report 4 still had `resolution = hidden`, `resolved_by = 1`, while the target had zero remaining hidden rows.
- The no-page-JavaScript adapter on local port 3001 supplied verified CSP `script-src 'none'; object-src 'none'`. Native forms completed anonymous/public first sends, report, duplicate report, hide and restore. This does not claim that the global browser JavaScript setting was changed. The adapter was stopped after verification.

Published screenshots use `screenshots/adapt-*.jpg` and show English UI/example text; 54 measurements and 18 flow records are in `screenshots/main-adaptation-browser-results.json`. Omitted historical screenshots are preserved in the local pre-publication backup. Development data is restored to the seed for repeatable user acceptance; the pre-run backup remains available.

### Remaining handoff

The existing Windows assertion, unfinished Discover destinations, shared walkthrough stubs, second-laptop rebuild and Moodle packaging remain team tasks. The recorded checks were run before publication; consult the feature branch/PR for subsequent GitHub CI. The upstream main CI result alone does not validate the Messages changes. See [MAIN_ADAPTATION.md](MAIN_ADAPTATION.md) for ownership, requirement mapping and approval boundaries.

## English publication preparation — 25 Oct 2026

- Translated the acceptance runbook and main-adaptation report; added the English `HANDOFF.md` integration summary.
- Replaced literal multilingual seed expectations with equivalent JavaScript Unicode escapes and MySQL UTF-8 byte expressions. The seed data and assertion results are unchanged; no shared database file was edited.
- Selected 19 English screenshots and retained the two existing measurement JSON files. Other historical images are preserved in the local pre-publication backup, outside the submission.
- Scanned all Messages text files, including SQL, templates, tests and JSON: no CJK characters remain. Checked documentation links and `git diff --check`: passed.
- Re-ran `npm test -- modules/messages`: **40 passed**, 0 failed/skipped/TODO. Re-ran `npm run lint`: passed. Re-ran the original SQL suite: **456 PASS**, exit 0.
- The full 225-test Windows result above predates these behavior-preserving language changes; it is not relabelled as a new full run. Subsequent PR CI is a separate check.
- Publication target is the verified personal fork `MKWang-2006/CampusNote`, branch `codex/messages-ms1-ms7`. Its parent is `Michael-wzl/CampusNote`. Only the feature ref is updated; neither main branch is a publication target.
