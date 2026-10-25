# Messages handoff - MS-1 to MS-7

**Owner:** MKWang-2006, Member 3. **Upstream:** `Michael-wzl/CampusNote`. **Baseline:** `f9e8f68`. **Publication:** `MKWang-2006/CampusNote`, branch `codex/messages-ms1-ms7`.

## Delivered behavior

| Feature | Behavior |
| --- | --- |
| MS-1 / MS-2 | Trigger-backed notifications, read state and shared unread badge |
| MS-3 | Conversation previews, latest message and unread count |
| MS-4 / MS-5 | Start/reuse, transactional send/read pointers, member-only access and separate public/anonymous contexts |
| MS-6 / MS-7 | Report deduplication, grouped queue, hide/dismiss/restore and retained moderation history |

MS-8 controls are excluded. Existing block records still prevent sends.

## Integration boundaries

- The proposed diff contains only `modules/messages/` and `docs/modules/messages/`.
- Shared code, schema, seed data, dependencies, existing triggers and other members' modules are retained.
- Discover profile links use `/messages/new?to=<handle>`; public conversations return to `/u/:handle`.
- Content's post/alias Message and post/comment Report links follow the existing contracts.
- Hiding writes `hidden_content`; shared views remove targets from Discover without editing Discover.
- This upload does not merge or push directly to main. Review/integration are separate steps.

## Verification

Run `npm test -- modules/messages`, `npm run lint`, `npm test` and `npm run check:sql`.

Recorded checks: **40 Messages tests passed**, lint passed, **456 SQL checks passed**. Full Windows run: **225 tests, 218 passed, one existing path-separator failure, six existing TODO markers**. Browser checks covered 54 layouts at 390/768/1440 px and native forms with page scripts prohibited. See [VALIDATION.md](VALIDATION.md) for exact results and subsequent publication checks.

After English preparation, all 40 Messages tests, lint and all 456 SQL checks were rerun successfully. The full Windows result is retained with its original limitations rather than claimed as a fresh all-green run.

Authored prose, UI labels, comments, filenames and handoff material are English. Original multilingual seed fixtures are preserved using Unicode/UTF-8 escapes. Published screenshots show English UI/example text; omitted historical images remain in the local backup.

## Review order

1. Manifest and shared badge.
2. Route validation, visibility, identity contexts and membership.
3. SQL: latest message, read pointers and creation/send/moderation transactions.
4. EJS escaping and CSRF-protected forms.
5. Acceptance, regression and real-link integration tests.

Use [SQL_CARD.md](SQL_CARD.md) for presentation, [LOCAL_ACCEPTANCE.md](LOCAL_ACCEPTANCE.md) for manual checks and [MAIN_ADAPTATION.md](MAIN_ADAPTATION.md) for provenance and milestone mapping.

## Remaining team work

Coordinate the existing shared Windows assertion, finish Discover destinations, run the second-laptop rebuild/bug bash and prepare the final Moodle package. This submission does not claim those tasks are complete.
