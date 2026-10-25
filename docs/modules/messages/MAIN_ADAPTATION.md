# Messages: main synchronization and ownership report

Owner: **MKWang-2006**, Member 3. Baseline: upstream main `f9e8f68703731219c6994c38e035203b4bf64572`. The local branch was fast-forwarded from `995b84d` on 25 Oct 2026, retaining the complete MS-1 to MS-7 implementation. Six integration tests exercise the newly available Discover pages. Existing Messages business interfaces did not require a rewrite.

Review: [HANDOFF.md](HANDOFF.md). Manual checks: [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md).

## 1. Ownership

| Source | Work |
| --- | --- |
| Michael / original repository | Shared app, authentication, database/views, shell, form protection and existing notification/member-check triggers |
| Catherine / Content | Publishing, comments, likes, post/comment Message and Report links |
| hX1-dev / incoming main commits | Feed filters/paging, My posts, public student/organization profiles and Message links |
| Earlier local Messages work | Notification queries/read state, badges, conversations, transactional sends, anonymous contexts, reporting/moderation and 34 tests |
| Main adaptation | Import three Discover commits; add MS-I01 to MS-I06; verify real links/shared-view effects; update documentation/evidence |

Authored changes stay inside `modules/messages/` and `docs/modules/messages/`. Discover is imported through upstream Git history without Messages-authored edits. Shared schema, dependencies, triggers and URL contracts are retained. MS-8 controls are excluded.

## 2. Requirement mapping

| Requirement | Implementation and evidence |
| --- | --- |
| CP1: seed-backed inbox, notifications, conversation and badge | MS-1 to MS-3; MS-T01 to MS-T10; browser **4 -> 1 -> 0** |
| Must: start/reuse, send, read and access control | MS-4/MS-5; acceptance, concurrency and rollback tests; actual links in MS-I01 to MS-I04 |
| Should: report, hide, dismiss and restore | MS-6/MS-7, MS-T18 to MS-T24; MS-I05 covers every new list |
| Cross-module links | `/messages/new?to=<handle>`; post/alias parameters; public return link `/u/:handle` |
| Identity separation | Distinct pair/context keys; MS-I04 and no-page-JavaScript sends |
| Responsive shell and badge | Three widths; MS-I06 confirms Discover browsing does not mark data read |

Local verification is separate from GitHub CI and upstream acceptance. Publishing to the owner's feature branch does not merge anything into upstream main.

## 3. Integration coverage

`modules/messages/tests/integration.test.js` uses the existing real HTTP, login, CSRF and isolated-database helpers, without importing another module.

- **MS-I01:** Student profile link, first send, return profile, reuse and recipient-side public identity.
- **MS-I02:** Organization display name and return profile.
- **MS-I03:** Own/banned profiles omit Message; direct requests remain protected.
- **MS-I04:** Content and public-profile entries preserve separate contexts for the same pair, with no anonymous-thread handle leak.
- **MS-I05:** Hide/restore propagates to All/university Feed, My posts and public profile, retaining the report audit.
- **MS-I06:** Shared badges agree; ordinary Discover browsing leaves read state unchanged.

Recorded checks: **40/40 Messages tests**, lint passed, **456 SQL PASS**, **54 browser layouts**. Full Windows run: **225 tests, 218 passed, one existing failure, six existing TODO markers**. See [VALIDATION.md](VALIDATION.md); the full suite is not reported as all green.

## 4. Three implementation explanations

**Notification trigger.** Content's comment insert triggers `trg_comment_notify` in the same transaction. It considers the replied-to author, post author, then watchers. Later groups exclude identities considered earlier, always exclude the commenter, and respect preferences. Comment rollback also removes its notifications. The like trigger uses `NOT EXISTS` to prevent repeated like notifications. These triggers already existed and are preserved.

**Unread calculation.** Notifications count rows addressed to the viewer with `read_at IS NULL`. Private messages count rows in the viewer's conversations sent by the other member with `message_id > COALESCE(last_read_message_id, 0)`. Navigation adds both counts. The per-conversation/user pointer advances using `GREATEST`. Notification read updates stop at the loaded maximum ID, leaving later arrivals unread. Previews select each group's `MAX(message_id)` and retrieve its full row.

**Transactions.** `startConversation` uses one `tx` connection to create/reuse a conversation, insert the first message and advance the sender's pointer. The existing `(user_lo, user_hi, context_key)` unique key handles direction/context. Expected duplicate-key errors reuse the committed conversation; other errors propagate and roll back. `sendMessage` commits message/pointer together without moving the recipient's pointer. Routes check membership; the database trigger checks it again. Repeated submissions can still save distinct messages.

See [SQL_CARD.md](SQL_CARD.md) for presentation SQL/results.

## 5. Publication and remaining work

Target fork: `MKWang-2006/CampusNote`. Feature branch: `codex/messages-ms1-ms7`. Only Messages source, tests, English documentation and selected English screenshots belong in the submission. Private configuration, databases, backups, runtime tools/logs and ZIP files are excluded. Existing multilingual seed values remain test data, represented with Unicode/UTF-8 escapes where needed.

The full app runs from the local repository. A Messages-only ZIP is a handoff for the specified baseline, not a standalone app. Pre-synchronization and pre-publication backups remain outside the repository.

Team work still includes the shared Windows assertion, unfinished Discover destinations, walkthrough stubs, second-laptop rebuild and Moodle packaging. Review the feature branch and CI before integration. No merge or direct push to either main branch is part of this delivery.
