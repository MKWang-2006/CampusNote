# Messages module: developer guide

> Local implementation note (25 Oct 2026): MS-1 to MS-7 are implemented on `codex/messages-local`, synchronized to main `f9e8f68` (Discover DS-1, DS-5 My posts and DS-6). MS-8 controls are deferred. The schema, existing triggers and shared code are unchanged. Six integration tests exercise profile/private-message links, identity contexts, moderation across lists and shared badges. See `MAIN_ADAPTATION.md` and `VALIDATION.md` for actual results and remaining handoff. The existing shared renderer runs locals hooks during `res.page`, after the route's read-state updates; references below to hooks running before the handler describe the original guide, not the actual timing used by this implementation.

| | |
|---|---|
| **Owner** | Member 3 — Messages: [MKWang-2006](https://github.com/MKWang-2006), claim confirmed by Michael on 21 Oct |
| **Folder** | `modules/messages/` (including `db/triggers.sql`), `docs/modules/messages/` |
| **Features** | MS-1 to MS-8 (`PRODUCT_SPEC.md` §4) |
| **Read first** | `ARCHITECTURE.md` §1, §5, §6, §9; `PRODUCT_SPEC.md` BR-5, BR-6, BR-8, BR-9, BR-13, BR-14, BR-15, BR-17, BR-18; [responsive layout](../../architecture/RESPONSIVE.md); this guide |
| **Tested SQL** | `queries.sql` (this folder) and `modules/messages/db/triggers.sql` |

You can build this module without knowing the rest of the app. Everything you need from other modules is listed in §3.

## 1. The module in one paragraph

Messages is the app's inbox and its safety desk. It tells people when someone comments on their post, replies to their comment, comments on a post they watch, or likes their post (notifications, created by database triggers so the content module never has to call this one); it lets two people talk privately, starting from a post (both stay anonymous under their alias on that post, or "Visitor") or from a public user page (handles shown); it shows the unread total on the Messages tab; it lets anyone report a post or comment, which admins then hide or dismiss from a queue; and, as a Could feature, it lets either member block a conversation so that nobody can send in it. It is the project's trigger showcase: the presentation shows `trg_comment_notify` and the conversation list query.

## 2. What you own

**Tables you write:** `notifications` (only through your triggers, never from `queries.js`), `conversations`, `messages`, `conversation_reads`, `blocks` (MS-8), `reports`, `hidden_content`. **Tables and views you read:** `v_live_posts` (is the post still live and visible?), `v_comment_items` (comment text, NULL when deleted or hidden), `post_participants` (aliases), `posts` and `comments` (only in the admin queue, which must show deleted text), `users`, `organizations`.

**Database objects you own:** `modules/messages/db/triggers.sql`, already in the repository with the backbone (tested by `db/tests/contract_checks.sql`). `npm run db:reset` applies it after the schema and **before** the seed, so the seeded comments and likes produce the seed's 31 notifications. It uses `DELIMITER $$` like the mysql client; `db/reset.js` understands it. §5 explains what each trigger does.

| Object | Fires | Does |
|---|---|---|
| `trg_comment_notify` | AFTER INSERT on `comments` | Notifies the replied-to author, the post's author and the watchers, each at most once, never the commenter, respecting `notify_comments` (BR-13) |
| `trg_like_notify` | AFTER INSERT on `post_likes` | Notifies the post's author once per liker, respecting `notify_likes` (BR-13) |
| `trg_message_sender_is_member` | BEFORE INSERT on `messages` | Refuses a sender who is not one of the two members: `SIGNAL SQLSTATE '45000'`, error 1644 (BR-14) |

**Routes** (from `WORK_DIVISION.md` §3):

| Method | Path | Who | Feature |
|---|---|---|---|
| GET | `/messages` | everyone | MS-3 |
| GET | `/messages/notifications` | everyone (marks mine read) | MS-1 |
| GET | `/messages/new?post=<id>[&alias=<n>]` or `?to=<handle>` | everyone who can see the post or the user | MS-4 |
| POST | `/messages/new` (same query) | same | MS-4 |
| GET | `/messages/c/:id` | the two members (else 404) | MS-5 |
| POST | `/messages/c/:id` | the two members (else 404) | MS-5 |
| POST | `/messages/c/:id/block`, `/messages/c/:id/unblock` | the two members (else 404) | MS-8 (Could) |
| GET, POST | `/report?type=post\|comment&id=<id>` | everyone who can see the target, except its author | MS-6 |
| GET | `/admin/reports` | admin (`requireRole('admin')`) | MS-7 |
| POST | `/admin/reports/:id/hide`, `/admin/reports/:id/dismiss` | admin | MS-7 |
| POST | `/admin/hidden/:type/:id/restore` | admin | MS-7 |

**Manifest** (`modules/messages/index.js`):

```js
const { countUnread } = require('./queries');

module.exports = {
  name: 'messages',
  router: require('./routes'),
  // MS-2: runs on every logged-in page, before the route handler (ARCHITECTURE §4 step 6)
  locals: async (req) => {
    const { notifications, messages } = await countUnread(req.me.userId);
    return { badges: { messages: notifications + messages } };
  },
  // Not /admin/reports: it is 403 for everyone but admins (and the privacy contract test
  // skips it, because it shows authors' handles to admins on purpose, BR-15).
  // Not /messages/c/1: it is 404 for non-members.
  smoke: ['/messages', '/messages/notifications'],
};
```

## 3. Contracts

**You rely on** the backbone: `q`, `q.one`, `tx`, `isDuplicate` (`core/db`), `req.me` and `requireRole` (`core/auth`), `res.page` and `res.done` (`core/render`), `notFound`, `forbidden`, `badRequest` (`core/errors`), `findVisible` and `VISIBLE` (`core/cards`), `text`, `int`, `oneOf` (`core/validate`); the partials `menu`, `empty`, `field`, `avatar`, `confirm-dialog` and the icons `bell`, `messages`, `comment`, `heart`, `flag`; the helpers `ui.alias`, `ui.timeAgo`, `ui.hkt`, `ui.postNo`, `ui.excerpt`, `ui.avatarUrl`. From the content module you rely on two things only: it inserts `comments` and `post_likes` rows as the schema says (your triggers do the rest), and its post page renders `id="c<comment_id>"` on each comment so `/posts/:id#c<comment_id>` lands on it (`WORK_DIVISION.md` §4 row 4). From identity: `users.notify_comments` and `notify_likes`, which your triggers read (row 12). From discover: the user page `/u/:handle`, which your "New message" back link and the header of a conversation by handle link to (row 14).

**Others rely on you for** (`WORK_DIVISION.md` §4):
- Row 2: your comment and like triggers only read other tables, only write `notifications`, and **never make a content insert fail**. Do not add a SIGNAL to them.
- Row 3: content's post page links to `/messages/new?post=:id` ("Message the host"), `/messages/new?post=:id&alias=:n` ("Message" on a comment), `/report?type=post&id=:id` and `/report?type=comment&id=:commentId`.
- Row 7: identity's Me menu links admins to `/admin/reports`.
- Row 8: discover's user page links to `/messages/new?to=:handle` (not on your own page, nor on a banned user's page).
- Row 10: a `hidden_content` row hides that post or comment everywhere through the shared views, with no code in other modules. Deleting the row restores it.
- Row 11: the `locals` hook returns `{ badges: { messages: <unread notifications + unread messages> } }`; the layout draws the badge.

**Seed data for you** (`DATA_MODEL.md` §5, checked in `queries.sql`):

| Persona | Notifications (unread) | Conversations | Badge |
|---|---|---|---|
| `mandy0hku` | 7 (3): #30, #29, #27 unread, then #17, #14, #2, #1 | 1 (conversation 1, with Kelvin about #600005: 1 unread) | **4** (3 + 1) |
| `kelvin0hk` | 9 (4); like notifications switched off | 1 (conversation 1, with Mandy, 0 unread) | **4** (4 + 0) |
| `wing0cuhk` | 4 (0) | 1 (conversation 2, with Jason, by handle, 0 unread) | 0 |
| `jason0ust` | 5 (0) | 1 (conversation 2, with Wing; no read row: 1 unread) | **1** (0 + 1) |
| `hikeclub0` | 2 (2) | none | **2** |
| `filmsoc00` | 4 (0) | none | 0 |
| `admin0000`, `newbie0hk` | none | none | 0 |

- Conversation 1: Kelvin (starter) and Mandy, started from post 600005. Kelvin never commented on 600005, so Mandy sees him as **Visitor**; Kelvin sees Mandy as **Host**. Messages 1 to 3; Mandy's read pointer is 2, Kelvin's is 3.
- Conversation 2: Wing (starter) and Jason, no post, so handles are shown. Messages 4 and 5; Jason has no read row, so Wing's message 4 counts as unread for him.
- Notification ids follow time (the seed renumbers them after the triggers ran), so newest first by id is newest first by time.
- Reports: 1 (post 600010, resolved, hidden), 2 (comment 12, resolved, hidden), **3 (post 600007 by Mandy, open)**. Hidden: post 600010 and comment 12. No blocks.

## 4. Build plan

| By | Tasks |
|---|---|
| Before kickoff | `db/triggers.sql` is in the repo with the backbone (the seed needs it); from kickoff it is yours. |
| CP1, Sun 25 Oct | `index.js` with the `locals` badge (MS-2), `routes.js`, `queries.js` with `countUnread`, `listNotifications`, `listConversations`, `getConversation`, `listMessages`; the Messages home, notifications list and conversation page render the seed (read-only: no marking read, no sending yet). |
| CP2, Sun 1 Nov (Must) | MS-1 with mark-read, MS-2, MS-3, MS-4 (start or reuse), MS-5 (send, mark read); tests MS-T01 to MS-T17, MS-T25 and MS-T26. |
| Fri 6 Nov (Should) | MS-6 report form, MS-7 admin queue (hide, dismiss, restore); tests MS-T18 to MS-T24; USER_GUIDE screenshots; `SQL_CARD.md` (§9). |
| Could | MS-8 block and unblock a conversation (§5): `block`, `unblock`, `isBlocked`, the notices from the `blocked_by_me` and `blocked_by_other` columns of `getConversation`, and the checks already shown in `sendMessage` and `startConversation`; tests MS-T27 to MS-T29. Only after every Should is merged. |
| Weeks 4 and 5 | Your shared duties: lead the bug bash (Sun 8 Nov), do the rebuild test on a second laptop, assemble the Moodle package (`WORK_DIVISION.md` §5). |

## 5. Features

### Responsive page layout (every feature)

Keep conversations and notifications readable at all widths. Message text and long aliases wrap; compose and report forms use `form-width`. A conversation remains one chronological column on desktop. Use `table-wrap` for moderation tables, and let action buttons wrap instead of widening the page. Read [RESPONSIVE.md](../../architecture/RESPONSIVE.md) before adding page CSS. Do not create another sidebar/bottom bar or use a fixed 480 px page width. Keep module CSS under `modules/messages/public/` and scope selectors to this module.

### The triggers (`db/triggers.sql`), the base of MS-1 and MS-5

**Why triggers.** Comments and likes are written by the content module, but notifications belong to messages (one writer per table, rule 3). A trigger lets your module react to content's inserts without content calling your code, so neither owner waits for or edits the other. The triggers read other modules' tables and write only `notifications`.

**`trg_comment_notify`** (AFTER INSERT on `comments`, BR-13). A new comment notifies, in this order, and each person at most once, never the commenter:

| Rule | Recipient | Type | Skipped when |
|---|---|---|---|
| 1 | the author of the comment being replied to | `reply_to_comment` | not a reply; the commenter replies to themself; that author turned comment notifications off |
| 2 | the post's author | `comment_on_post` | the commenter is the author; **the author is the replied-to person (rule 1 covers them)**; switched off |
| 3 | everyone watching the post | `comment_on_watched` | the watcher is the commenter, the post's author or the replied-to author (already told); switched off |

"Exactly once" comes from the exclusions, not from de-duplicating afterwards: rule 2 skips the replied-to author, and rule 3 skips both people rules 1 and 2 considered. Seed example: comment 14 is Mandy replying to Kelvin's comment 13 on Kelvin's own post 600012, which Mandy watches. Kelvin is both the replied-to author and the post's author, so he gets one `reply_to_comment`; Mandy is the commenter, so nothing. Comment 11 (Wing on 600012) gives Kelvin `comment_on_post` and Mandy `comment_on_watched`.

**`trg_like_notify`** (AFTER INSERT on `post_likes`). The post's author gets one `like_on_post` per liker, unless they liked their own post or switched likes off. Un-liking deletes the `post_likes` row but not the notification, and the `NOT EXISTS` check stops a second one when the same person likes again, so like, unlike, like cannot spam the author. Content's like uses `INSERT ... ON DUPLICATE KEY UPDATE`, so a repeated like inserts nothing and the trigger does not fire.

**`trg_message_sender_is_member`** (BEFORE INSERT on `messages`, BR-14). If the sender is not the conversation's starter or recipient, it raises `SIGNAL SQLSTATE '45000'` (MySQL error 1644) and the insert fails. Your routes check membership first and answer 404; the trigger is the last line of defence against a bug in that check. This is the one trigger that may fail an insert, because `messages` is your own table.

**Seed results:** the 14 seeded comments and 18 likes produce **31 notifications: 19 from comments and 12 from likes**. Kelvin has like notifications off (`notify_likes = 0`), so the 6 likes on his posts 600002 and 600012 notify nobody. The seed then marks notifications older than a day as read.

### MS-1 Notifications: `GET /messages/notifications` (Must)

- Top bar "Notifications", `tab: 'messages'`, `back: '/messages'`.
- **Load first, then mark read.** `listNotifications(me.userId, me.universityId, before)`: my notifications, newest id first, 30 per page with keyset paging (`?before=<notification_id>`; fetch 31, and if 31 come back show 30 and a "Load more" link with `before` = the 30th id). Then, if any row was shown, `markNotificationsRead(me.userId, newestIdShown)`. Rows that were unread when loaded get the class `is-unread` (highlighted); a notification that arrives while the page renders has a higher id and stays unread.
- Because `locals` ran before your handler, the tab badge on this response is stale: after marking read, recompute it (`res.locals.badges = { messages: n + m }` from `countUnread`) so the page itself shows the new number.
- Each row: an icon (`comment` or `heart`), the text, `ui.timeAgo(created_at)`, and a link. Texts (`n` = `ui.alias(actor_alias_no)`, `#` = `ui.postNo(post_id)`, `“…”` = `“${ui.excerpt(comment_body, 60)}”`):

  | Type | Text | Link |
  |---|---|---|
  | `comment_on_post` | Alice commented on your post #600012: “…” | `/posts/:id#c<comment_id>` |
  | `reply_to_comment` | Alice replied to your comment on #600012: “…” | `/posts/:id#c<comment_id>` |
  | `comment_on_watched` | Alice commented on #600004, which you watch: “…” | `/posts/:id#c<comment_id>` |
  | `like_on_post` | Your post #600004 got a like | `/posts/:id` |
  | any, when `post_available` is 0 | This post is no longer available | none |

- When `comment_body` is NULL, the quoted excerpt is replaced by `[deleted]` (`comment_deleted`) or `[hidden by a moderator]` (`comment_hidden`), without quotes (BR-8, BR-9).
- Rules: BR-13 people are named only by their alias on that post; the actor's handle is never shown and never selected. A like names nobody (the liker may have no alias, and naming them would break anonymity). BR-5: `post_available` uses the `VISIBLE` predicate on `v_live_posts`, so a deleted, hidden or invisible post gives "This post is no longer available" and no link.
- Empty state: "No notifications yet."
- SQL: `listNotifications`, `markNotificationsRead`.

### MS-2 Unread badge (Must)

- The manifest's `locals(req)` (§2) calls `countUnread(me.userId)`, one query with two scalar subqueries: unread notifications (`read_at IS NULL`) and unread messages (messages in my conversations, sent by the other person, with `message_id > COALESCE(my last_read_message_id, 0)`). It returns `{ badges: { messages: notifications + messages } }`; the layout hides the badge at 0.
- Pages that mark something read (MS-1, MS-5) recompute the badge for their own response.
- SQL: `countUnread`.

### MS-3 Messages home: `GET /messages` (Must)

- Top bar "Messages", `tab: 'messages'` (screenshot 05).
- First a `menu` group with one row: the `bell` icon, "Notifications", `badge` = the unread notification count (none at 0), linking to `/messages/notifications`.
- Then `listConversations(me.userId)`, newest last message first. Each row links to `/messages/c/:id` and shows:
  - the other person's display name (BR-14, below) and, for a post conversation, `· #600005`;
  - the last message, `ui.excerpt(last_body, 60)`, prefixed "You: " when `last_is_mine`;
  - `ui.timeAgo(last_at)`;
  - the unread count in an accent chip when above 0.
  - An icon: `ui.avatarUrl(other_avatar_code)` for a handle conversation, the `messages` icon for a post conversation (an avatar would tie the alias to a person, so the query returns NULL there).
- **Display names (BR-14):** with a post, `ui.alias(other_alias_no)` (the post's author is "Host"), or "Visitor" when `other_alias_no` is NULL (they never commented there); without a post, `other_public_name` (the organization's display name, or the handle). Put this in one helper, `modules/messages/names.js` `otherName(row)`, used by MS-3, MS-4 and MS-5.
- Empty state below the Notifications row: "No conversations yet."
- How the query works: greatest-per-group by joining each conversation to the message whose id is the `MAX(message_id)` of that conversation, and a correlated `COUNT` of the other person's messages after my read pointer (`LEFT JOIN conversation_reads`: no pointer means 0, so everything is unread). This is half of your SQL card (§9).
- SQL: `countUnread` (for the Notifications row), `listConversations`.

### MS-4 Start or reuse a conversation: `GET /messages/new`, `POST /messages/new` (Must)

1. **Resolve the recipient** (both GET and POST):
   - `?post=<id>`: `findVisible(id, req.me)` must return the card, else 404 (BR-5; also for deleted and hidden posts). Without `alias` (or with `alias=0`), the recipient is `card.author_id`. With `&alias=<n>` (an integer, else 404), `participantByAlias(id, n)`, else 404. Their display name is `ui.alias(n)` ("Host" for 0).
   - `?to=<handle>`: `userByHandle(handle)` must return an active user, else 404. Display name: the organization's `display_name` or the handle.
   - If both are given, `post` wins; if neither, 404.
   - Recipient is me: 400 "You cannot message yourself".
2. **Reuse:** `findConversation(me, recipient, postId)` looks the pair up in either direction through the generated columns (`user_lo`, `user_hi`, `context_key`). Found: 303 to `/messages/c/:id`.
3. **GET, nothing found:** render "New message" (`tab: 'messages'`, `back` = `/posts/:id` or `/u/:handle`): "To: Host · #600001" and one line saying how you will appear: "You will appear as Visitor" (or your alias, from `aliasOn(postId, me)`) for a post, "They will see your handle" for a handle. A `field` textarea `body` (`max: 1000`, label "Message") and a `btn btn-cta` "Send" button. The form posts to the same URL, query included.
4. **POST:** resolve the recipient again (step 1, with the same 400 and 404 answers; no redirect, so the typed message is never lost), validate `body` with `text(body, { max: 1000, label: 'Your message' })` (400 with the error and the typed text on failure), then `startConversation(me, recipient, postId, body)` in one `tx()`: INSERT the conversation; on `isDuplicate(err)` (the pair already has a conversation in this context, someone created it at the same moment, or a double click) SELECT the existing one (`FOR SHARE`) instead and carry on with it (this is how a POST for a pair and context that already has a conversation adds its message there), but first run the MS-8 check `isBlocked(t, id, me)`: if that conversation is blocked, nothing is written, it returns `{ blocked }`, and the route answers 403 with the same text as MS-5 ("You blocked this conversation. Unblock to reply." or "You can no longer reply in this conversation."). Then INSERT the message and upsert my read pointer to it. `res.done({ to: '/messages/c/' + id })`. Creating the conversation with its first message means there is never an empty conversation. A conversation this transaction has just created cannot be blocked yet, so the check is only needed on the duplicate path.
- Rules: BR-14 (one conversation per pair per post plus one without a post; nobody messages themself). A post conversation and a handle conversation between the same two people are deliberately different contexts: reusing one for the other would reveal which handle is behind an alias.
- Banned users: reachable from a visible post (the post is still there) but not by handle (`status = 'active'`). They cannot log in to read it anyway.
- SQL: `participantByAlias`, `aliasOn`, `userByHandle`, `findConversation`, `startConversation`.

### MS-5 Conversation: `GET /messages/c/:id`, `POST /messages/c/:id` (Must)

- `getConversation(id, me.userId, me.universityId)`: no row (not a member, or no such conversation) means 404, never 403.
- Top bar: the other person's display name (BR-14), `tab: 'messages'`, `back: '/messages'`. Under it, for a post conversation: "#600005" linking to `/posts/600005` when `post_available`, plain text otherwise, and "You appear as Host" (`my_alias_no`, or "Visitor"). For a handle conversation: a link to `/u/<other_handle>`.
- MS-8: when `blocked_by_me` is 1, the send box is replaced by "You blocked this conversation. Unblock to reply." and an "Unblock" button. Otherwise, when `blocked_by_other` is 1, it is replaced by "You can no longer reply in this conversation." with no Unblock button (only the blocker can unblock), but with the "Block" button, so you can keep the conversation blocked whatever the other member does. With no block, a small "Block" button sits under the send box, in post and handle conversations alike (§5 MS-8).
- `listMessages(id, me.userId)`: the last 100 messages, oldest first. Mine are right-aligned (class `is-mine`), theirs left; each shows `ui.timeAgo(created_at)`. If 100 came back, a note "Showing the last 100 messages." No names on bubbles.
- **Mark read:** `markConversationRead(id, me, lastShownId)`: `INSERT ... VALUES (?, ?, ?) AS new ON DUPLICATE KEY UPDATE last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id)`. The row alias syntax is why the project needs MySQL 8.0.19 or later (D21; `VALUES()` is deprecated); `GREATEST` stops an older tab moving the pointer back. Then recompute the badge for this response (as in MS-1).
- **Send:** `POST /messages/c/:id`: membership check with `getConversation` (404), `text(body, { max: 1000, label: 'Your message' })` (400 re-renders the page with the error), then `sendMessage(id, me, body)` (one `tx()`: the MS-8 check `isBlocked(t, id, me)` with `FOR SHARE`, then INSERT the message and move my pointer to it), `res.done({ to: '/messages/c/' + id })`. While the conversation has any block, `sendMessage` writes nothing and returns `{ blocked }`, and the route answers 403, re-rendering the page with "You blocked this conversation. Unblock to reply." when `blocked.blocked_by_me` is 1, else "You can no longer reply in this conversation.". Both members are refused, whoever blocked. Error 1644 from the trigger (a membership bug) is turned into 404.
- Rules: BR-14 (members only, also enforced by the trigger), BR-18 (1 to 1,000 characters, trimmed), BR-17 (times).
- Pages refresh on load; there is no live push (PRODUCT_SPEC §8).
- SQL: `getConversation`, `listMessages`, `markConversationRead`, `sendMessage`.

### MS-6 Report a post or comment: `GET /report?type=&id=`, `POST /report?type=&id=` (Should)

- `type` must be `post` or `comment` (`oneOf`) and `id` an integer, else 404.
- **Target check** (GET and POST):
  - post: `findVisible(id, req.me)`, else 404; `card.author_id === me.userId` gives 400 "You cannot report your own post".
  - comment: `commentForReport(id, me.universityId)` (the comment's text is not NULL in `v_comment_items`, and its post is live and visible), else 404; its `author_id` equal to me gives 400 "You cannot report your own comment".
- Page: top bar "Report", `tab: null`, `back` = the post. It shows what is reported ("Post #600007: “…”" or "Bob's comment on #600012: “…”", aliases only), a radio group `reason` (Spam, Harassment, Privacy, Other; `oneOf`, error "Pick a reason"), an optional `details` field (`max: 300`; blank is allowed and stored as ''), and a "Send report" button.
- POST: `fileReport(me, type, id, reason, details)`. On `isDuplicate(err)` (BR-15: one report per person per target) the flash is "You have already reported this"; on success "Thanks. A moderator will review it.". Both redirect to the post: `/posts/:id`, or `/posts/:postId#c<commentId>` for a comment.
- Rules: BR-5, BR-15, BR-18 (details at most 300 characters).
- SQL: `commentForReport`, `fileReport` (plus core `findVisible`).

### MS-7 Admin report queue: `GET /admin/reports`, `POST /admin/reports/:id/hide`, `/admin/reports/:id/dismiss`, `/admin/hidden/:type/:id/restore` (Should)

- Every route here uses `requireRole('admin')` (403 for others). Top bar "Reports", `tab: null`, `back: '/me'`.
- **Open reports** (`listOpenReports()`): one card per reported target, oldest first, with the type and a link (`/posts/:id`, or `/posts/:postId#c<id>`), the number of reports, the reasons, the details, the first report's time, the content's text (read from `posts` or `comments`, so admins still see it after the author deleted it; marked "Deleted by its author"), and the **author's handle** (BR-15: admins need it to act on repeat offenders). Buttons: "Hide" (`--danger`, `data-confirm="Hide this for everyone?"`) posting to `/admin/reports/:reportId/hide`, and "Dismiss" posting to `/admin/reports/:reportId/dismiss`, where `:reportId` is any report on the target (the query returns the lowest). Empty state: "No open reports."
- **Hide** (`hideTarget(reportId, adminId)`, one `tx()`): read the report's target (none: 404), `INSERT INTO hidden_content ... ON DUPLICATE KEY UPDATE hidden_at = hidden_at` (already hidden is not an error), then resolve **every** open report on that target as `hidden` (BR-15). Flash "Hidden. 2 reports resolved." (the UPDATE's `affectedRows`), redirect to `/admin/reports`. The views do the rest: a hidden post leaves every list and its page answers 404; a hidden comment shows "[hidden by a moderator]" (BR-9).
- **Dismiss** (`dismissTarget(reportId, adminId)`): the same UPDATE with `dismissed`, no hidden row. Flash "Dismissed. 1 report resolved."
- **Hidden content** (`listHidden()`): every `hidden_content` row, newest first, with the text, the author's handle, the reason (such as "Spam (report 1)") and who hid it and when. "Restore" posts to `/admin/hidden/:type/:id/restore` (`type` must be `post` or `comment`, else 404): `restoreHidden(type, id)` deletes the row; the reports stay resolved as a record. Flash "Restored." (also when it was already restored). Empty state: "Nothing is hidden."
- SQL: `listOpenReports`, `hideTarget`, `dismissTarget`, `listHidden`, `restoreHidden`.

### MS-8 Block a conversation: `POST /messages/c/:id/block`, `/messages/c/:id/unblock` (Could)

**Why a block belongs to a conversation, not to a person.** A `blocks` row is `(conversation_id, blocker_id)`: a member blocks the conversation they are in. A block that followed the person (a pair of user ids) would refuse that pair everywhere, and the refusal would become an identity test. After blocking "Visitor" in a post conversation, a user could try `/messages/new?to=<handle>` with every handle they know, and the one refused would be the Visitor; the blocked person could probe the aliases on other posts the same way and tie the blocker's aliases to each other or to their handle. That would break BR-6, BR-14 and the privacy requirement in `PRODUCT_SPEC.md` §7. A block on one conversation tells nobody anything new: both members already know who they are talking to there, and every other conversation, including one between the same two people from another post or by handle, behaves exactly as if there were no block. That is also why blocking works the same in post and handle conversations. The cost: someone who wants to avoid a person everywhere has to block each conversation, because a new one can still be started from another post or by handle. For real abuse, the report queue (MS-6, MS-7) is the tool.

- **Where:** in every conversation, under the send box, a small `--danger` "Block" button (`data-confirm="Block this conversation? Neither of you will be able to send messages here until you unblock it."`) posting to `/messages/c/:id/block`.
- **Block:** `getConversation` (404 if not a member), then `block(id, me)`: an `INSERT ... SELECT` that writes `(conversation, me)` only when I am one of its two members. The schema does not check membership itself, so never write to `blocks` any other way. A second click changes nothing (`ON DUPLICATE KEY UPDATE`, 0 rows). Flash "Blocked. Nobody can send messages here until you unblock it.", redirect to the conversation.
- **Unblock:** `POST /messages/c/:id/unblock`, same check, then `unblock(id, me)` deletes my own row only, so the other member cannot lift my block. Flash "Unblocked." (also when there was nothing to lift). If the other member has also blocked the conversation, it stays blocked until they unblock too.
- **Effect:** while **any** block row exists for the conversation, **neither member can send in it**, whoever blocked: the page shows the notices in MS-5, and `sendMessage` re-checks inside its transaction (403, nothing written). `GET /messages/new` for that pair and context still redirects to the conversation (which shows the notice); a `POST /messages/new` that reaches it through the duplicate path is refused inside `startConversation` (403, the same texts), because without the check that path would add the message to the blocked conversation.
- **Not affected:** every other conversation, including the same two people's conversations in other contexts (a new one can still be started there); notifications (the triggers are unchanged); reports; the messages sent before the block (they stay, can be read, and still count as unread until read).
- **Concurrency:** `isBlocked` runs inside the send transactions with `FOR SHARE`, which locks the conversation's block rows and the gap where a new one would go. A block made at the same moment either waits until the message is committed, or commits first and is seen by the check, so a message is never sent after the block it should have obeyed (tested by hand with two clients, in both orders).
- **Edge cases:** both members may block (two rows; each lifts only their own); a non-member cannot block (the route answers 404, and the `INSERT ... SELECT` would write nothing anyway); an unknown conversation or user is refused by the foreign keys (1452); a conversation's blocks would go with it (`ON DELETE CASCADE`), though the app never deletes conversations.
- **Rules:** BR-14 (members only), BR-6 (a block never reveals who is behind an alias).
- SQL: `block`, `unblock`, `isBlocked`, plus the checks inside `sendMessage` and `startConversation` and the `blocked_by_me`, `blocked_by_other` columns of `getConversation`.

## 6. `queries.js`

Each function corresponds to a block in `queries.sql`; `@variables` become `?` in the same order. None of them selects a handle or avatar for a person on a post; only the admin queries return authors' handles.

| Function | Returns | Used by |
|---|---|---|
| `countUnread(userId)` | `{ notifications, messages }` | MS-2 `locals`, MS-3, after mark-read in MS-1 and MS-5 |
| `listNotifications(userId, universityId, before)` | up to 31 rows with `is_unread`, `post_available`, `actor_alias_no`, `comment_body`, `comment_deleted`, `comment_hidden` | MS-1 |
| `markNotificationsRead(userId, upToId)` | `affectedRows` | MS-1 |
| `listConversations(userId)` | rows with `other_alias_no`, `other_public_name`, `other_avatar_code`, `last_body`, `last_at`, `last_is_mine`, `unread` | MS-3 |
| `participantByAlias(postId, aliasNo)` | user id or null (never printed) | MS-4 |
| `aliasOn(postId, userId)` | alias number or null ("Visitor") | MS-4 |
| `userByHandle(handle)` | `{ user_id, handle, display_name, avatar_code }` or null | MS-4 |
| `findConversation(userId, otherId, postId)` | conversation id or null | MS-4 |
| `startConversation(userId, otherId, postId, body)` | `{ id }`, or `{ blocked }` when it reaches an existing conversation that is blocked | MS-4, MS-8 |
| `getConversation(conversationId, userId, universityId)` | header row (with `my_alias_no`, `post_available`, `blocked_by_me`, `blocked_by_other`) or null | MS-5 (GET and POST), MS-8 |
| `listMessages(conversationId, userId)` | up to 100 rows, oldest first, with `is_mine` | MS-5 |
| `markConversationRead(conversationId, userId, messageId)` | nothing | MS-5 |
| `sendMessage(conversationId, userId, body)` | `{ id }` (the message id), or `{ blocked }` when the conversation is blocked | MS-5, MS-8 |
| `block(conversationId, userId)` | `affectedRows` (1: blocked; 0: already blocked by me, or not my conversation) | MS-8 |
| `unblock(conversationId, userId)` | `affectedRows` (1: my block lifted; 0: I had none here) | MS-8 |
| `isBlocked(t, conversationId, userId)` | `{ blocked_by_me, blocked_by_other }`; runs on the transaction handle `t` with `FOR SHARE`; internal, not exported | inside `sendMessage` and `startConversation` (MS-8) |
| `commentForReport(commentId, universityId)` | row or null | MS-6 |
| `fileReport(userId, targetType, targetId, reason, details)` | report id; throws a duplicate-key error | MS-6 |
| `listOpenReports()` | rows, one per target | MS-7 |
| `hideTarget(reportId, adminId)` | `{ target_type, target_id, resolved }` or null | MS-7 |
| `dismissTarget(reportId, adminId)` | `{ target_type, target_id, resolved }` or null | MS-7 |
| `listHidden()` | rows | MS-7 |
| `restoreHidden(targetType, targetId)` | `affectedRows` | MS-7 |

Error codes you will meet: 1062 (`isDuplicate`: a conversation created at the same moment, a second report), 1644 (the membership trigger), 3819 (CHECK: a blank message, messaging yourself), 1406 (too long). Turn the expected ones into the messages in §5.

## 7. Tests (`modules/messages/tests/`)

Call `before(resetDb)` in each file; every test below starts from the fresh seed (reset again, or put it in its own file, when an earlier test changed what it reads). Personas are in `DATA_MODEL.md` §5. "Badge" means the number on the Messages tab (`badges.messages`). Insert comments and likes with `make.comment()` or direct SQL (tests may write any table), so these tests do not depend on the content module.

| ID | Feature | Test |
|---|---|---|
| MS-T01 | MS-1 | As `mandy0hku`, `/messages/notifications` shows exactly 7 rows (notifications #30, #29, #27, #17, #14, #2, #1), in this order: "Host replied to your comment on #600012: “Thanks, doing the 2024 paper now.”"; "Carol commented on #600012, which you watch: [hidden by a moderator]"; "Bob commented on #600012, which you watch: “\u52a0\u6cb9\uff01You got this.”"; "Host commented on #600004, which you watch: “Only behavioural ones, about 5 questions, 2 minutes each.”"; "Alice commented on #600004, which you watch: “Did they ask technical questions in the video part?”"; "Your post #600001 got a like"; "Alice commented on your post #600001: “Thanks! Is 4/F quiet too?”". Rows 1, 2 and 3 have the class `is-unread`; row 1 links to `/posts/600012#c13`, row 6 to `/posts/600001`. |
| MS-T02 | MS-1 | Mandy opens the page twice: the second response has no `is-unread` row, her badge is 1 (the unread message), and the database has no unread notification for her. |
| MS-T03 | MS-1 | Kelvin's list has 9 rows and includes "Carol commented on your post #600002: [deleted]" (comment 6). |
| MS-T04 | MS-1 | With `posts.deleted_at` set on 600001, Mandy's rows for #600001 (the like and comment 1) say "This post is no longer available" and have no link. |
| MS-T05 | MS-2 | Badges on any page: `mandy0hku` 4, `kelvin0hk` 4, `jason0ust` 1, `hikeclub0` 2; no badge for `wing0cuhk`, `newbie0hk`, `filmsoc00` and `admin0000`. |
| MS-T06 | MS-1, triggers | `make.comment({ post: 600012, author: 'newbie0hk', replyTo: 10 })`: Newbie gets alias 4 (Dave) on 600012 and replies to Mandy's comment 10. Mandy's badge 4 → 5 and her newest row is "Dave replied to your comment on #600012: “…”" (one row, not also a "which you watch" row); Kelvin's badge 4 → 5 with "Dave commented on your post #600012: “…”". |
| MS-T07 | MS-1, triggers | Newbie likes 600004, unlikes, likes again: Jason has exactly one new notification ("Your post #600004 got a like"; badge 1 → 2) and the page contains neither "newbie0hk" nor an alias. |
| MS-T08 | MS-1, triggers | Newbie likes 600012: Kelvin's badge stays 4 and he has no `like_on_post` row. |
| MS-T09 | MS-3 | As `mandy0hku`, `/messages` shows the Notifications row with "3", then one conversation: "Visitor · #600005", "Deal. Friday 2pm at the entrance?", "4 h ago", unread "1". |
| MS-T10 | MS-3 | As `jason0ust`: one conversation "wing0cuhk" (no post number), "You: A big one in Central, I can share my notes.", unread "1"; the Notifications row has no count. As `kelvin0hk`: "Host · #600005", no unread chip. As `newbie0hk`: the Notifications row and "No conversations yet." |
| MS-T11 | MS-4 | Newbie opens `/messages/new?post=600001`: 200 with "To: Host · #600001" and "You will appear as Visitor". POST with a body: 303 to `/messages/c/3`; that page shows the message right-aligned. Mandy's `/messages` lists "Visitor · #600001" first with 1 unread, and her badge is 5. |
| MS-T12 | MS-4 | Wing opens `/messages/new?post=600012&alias=1`: "To: Alice · #600012", "You will appear as Bob"; after sending, Mandy's home shows "Bob · #600012". Newbie opens `/messages/new?to=jason0ust`: "To: jason0ust" and "They will see your handle"; after sending, Jason's home shows "newbie0hk". |
| MS-T13 | MS-4 | Reuse in either direction: Kelvin GET `/messages/new?post=600005` → 303 to `/messages/c/1`; Jason GET `/messages/new?to=wing0cuhk` → 303 to `/messages/c/2` (Wing started it); Jason POST `/messages/new?to=wing0cuhk` with a body → 303 to `/messages/c/2`, which now has 3 messages, and there are still 2 conversations. |
| MS-T14 | MS-4 | Refusals, and no conversation row is created: Mandy `?post=600005` → 400 "You cannot message yourself"; Mandy `?to=mandy0hku` → 400; Wing `?post=600001` (HKU only) → 404; Mandy `?post=600009` (deleted) → 404; `?post=600010` (hidden) → 404; `?post=600012&alias=9` → 404; `?to=nobody000` → 404; a POST with a blank body → 400 with the error under the box. |
| MS-T15 | MS-5 | Non-members: Newbie and Wing get 404 on `/messages/c/1`; Newbie's POST to `/messages/c/1` → 404 and the conversation still has 3 messages; `/messages/c/999` → 404. |
| MS-T16 | MS-5 | Mandy (badge 4) opens `/messages/c/1`: 3 messages, message 2 has the class `is-mine`, the header says "Visitor" with a link to `/posts/600005` and "You appear as Host"; the response's own badge is 3; `/messages` then shows no unread chip on conversation 1. Jason opens `/messages/c/2`: badge 1 → 0. |
| MS-T17 | MS-5 | Mandy POSTs "Friday 2pm works." to `/messages/c/1`: 303 back; Kelvin's badge 4 → 5 and his `/messages` shows "1" unread. A blank body or 1,001 characters → 400 and nothing inserted. A POST without the CSRF token → 403. |
| MS-T18 | MS-6 | Newbie opens `/report?type=post&id=600007`: the four reasons are shown. POST `reason=spam` → 303 to `/posts/600007` with the flash "Thanks. A moderator will review it."; `reports` has 4 rows. The same POST again → flash "You have already reported this"; still 4 rows. Newbie reports comment 11 → 303 to `/posts/600012#c11`. |
| MS-T19 | MS-6 | Refusals: Kelvin `/report?type=post&id=600007` → 400 "You cannot report your own post"; Mandy `/report?type=comment&id=10` → 400 "You cannot report your own comment"; Wing `/report?type=post&id=600007` → 404; `/report?type=comment&id=12` (hidden) and `id=6` (deleted) → 404; `type=user` → 404; a POST without a reason → 400 "Pick a reason". |
| MS-T20 | MS-7 | As `admin0000`, `/admin/reports` shows one open target: post #600007, 1 report, "other", "Is this a real alarm or a joke?", "Who else heard the fire alarm in Haking Wong at 3am?", author "kelvin0hk"; "Hidden content" lists post #600010 ("Spam (report 1)", jason0ust) and comment 12 ("Harassment (report 2)", jason0ust). After Newbie also reports 600007 as spam, the card shows 2 reports, "spam, other". |
| MS-T21 | MS-7 | After MS-T20, admin POSTs `/admin/reports/3/hide`: 303 to `/admin/reports` with "Hidden. 2 reports resolved."; reports 3 and 4 have `resolution = 'hidden'` and `resolved_by = 1`; 600007 is no longer in `v_live_posts` (an HKU viewer sees 9 posts) and Mandy gets 404 on `/posts/600007`. Hiding a comment the same way (Newbie reports comment 11, admin hides it) makes `v_comment_items.body` NULL and Mandy's notification #27 read "Bob commented on #600012, which you watch: [hidden by a moderator]". |
| MS-T22 | MS-7 | Newbie reports comment 13; admin dismisses it: `resolution = 'dismissed'`, no `hidden_content` row, comment 13 keeps its text, and the queue says "No open reports." once report 3 is also resolved. |
| MS-T23 | MS-7 | Admin POSTs `/admin/hidden/post/600010/restore`: the row is gone, 600010 is back in `v_live_posts` (an HKU viewer sees 11 posts), report 1 stays resolved; `/admin/hidden/user/5/restore` → 404. |
| MS-T24 | MS-7 | `mandy0hku` gets 403 on `GET /admin/reports` and on `POST /admin/reports/3/hide`, and nothing changes. |
| MS-T25 | privacy | No anonymous author's handle on messages pages for non-admins. As `mandy0hku`, `/messages`, `/messages/notifications`, `/messages/c/1` and `/messages/new?post=600012` contain none of `kelvin0hk`, `wing0cuhk`, `jason0ust`, `newbie0hk` (Kelvin is "Visitor" in conversation 1 and "Host" on 600012). As `kelvin0hk`, his `/messages`, `/messages/notifications` and `/messages/c/1` contain none of `mandy0hku`, `wing0cuhk`, `jason0ust`. The only other handles any persona sees on these pages are those of their handle conversations (Wing and Jason see each other's). |
| MS-T26 | MS-1, MS-3 | Empty states as `newbie0hk`: `/messages/notifications` shows "No notifications yet."; `/messages` shows "No conversations yet." |
| MS-T27 | MS-8 | Mandy opens `/messages/c/1` (a post conversation; Kelvin is "Visitor") and sees "Block". She POSTs `/messages/c/1/block` → 303 back with "Blocked. Nobody can send messages here until you unblock it."; `blocks` has one row (conversation 1, user 2); a second POST changes nothing. Newbie's POST to `/messages/c/1/block` → 404 and no row for him. Kelvin's `/messages/c/1` still contains no handle (MS-T25 holds). |
| MS-T28 | MS-8 | After Mandy's block: her page shows "You blocked this conversation. Unblock to reply." and "Unblock", no send box; Kelvin's shows "You can no longer reply in this conversation.", no send box and no "Unblock". Kelvin's POST to `/messages/c/1` → 403 "You can no longer reply in this conversation."; Mandy's → 403 "You blocked this conversation. Unblock to reply."; conversation 1 still has 3 messages. Kelvin GET `/messages/new?post=600005` → 303 to `/messages/c/1`; his POST to it → 403, still 3 messages and 2 conversations. Nothing leaks: Jason and Wing can still send in conversation 2 (303), and Mandy GET `/messages/new?to=kelvin0hk` → 200 "New message", exactly as without the block. |
| MS-T29 | MS-8 | Kelvin's POST to `/messages/c/1/unblock` → 303 "Unblocked." but Mandy's row stays and both are still refused. Kelvin blocks too (two rows); Mandy unblocks: her row is gone, but her page now shows "You can no longer reply in this conversation." and her POST → 403. Kelvin unblocks: no row left, and Mandy's POST to `/messages/c/1` → 303 (4 messages). Unblocking again → 303 "Unblocked.", no error. |

Run them with `npm test -- modules/messages`. The SQL itself is checked by `npm run check:sql` (`queries.sql`, and the triggers in `contract_checks.sql`).

## 8. Definition of done

- The [responsive acceptance checklist](../../architecture/RESPONSIVE.md#acceptance-checks-for-every-page) passes: no horizontal document overflow, appropriate navigation, readable forms, wrapping long text, visible focus and touch targets at least 44 px high. Add phone and desktop screenshots to the PR.

- MS-T01 to MS-T26 pass (and MS-T27 to MS-T29 if MS-8 is built), and `npm test`, `npm run lint` and `npm run check:sql` are green in CI.
- The privacy contract test passes for your smoke pages, and you have checked by hand that no page of yours prints a handle, avatar or user id for a person on an anonymous post (only `/admin/reports` shows handles, to admins).
- Every page checked as `mandy0hku`, `kelvin0hk`, `jason0ust`, `newbie0hk` (empty states) and `admin0000`, at 390, 768 and 1440 CSS pixels, and with JavaScript off.
- `USER_GUIDE.md` has screenshots; `SQL_CARD.md` is written (§9).

## 9. Presentation (SQL card)

`docs/modules/messages/SQL_CARD.md` holds one slide's worth:

1. **`trg_comment_notify`**, with three talking points: (a) why a trigger: the content module inserts comments and never calls messages code, yet the right people are told, because the module that owns notifications owns the trigger (one writer per table); (b) who is notified and why exactly once: the replied-to author, then the post's author unless already told, then the watchers except anyone already told and the commenter, each filtered by their `notify_comments` setting; the seed's comment 14 (Kelvin is both replied-to and author: one notification) is the example; (c) the result: the seed's 14 comments and 18 likes give 31 notifications (19 and 12), and Kelvin, who switched likes off, gets none of the 6 likes on his posts.
2. **The conversation list query** (`listConversations`), with three talking points: (a) greatest-per-group: join each conversation to its message with `message_id = (SELECT MAX(message_id) ...)`; (b) unread count with a read pointer: a correlated `COUNT` of the other person's messages after `last_read_message_id`, through a `LEFT JOIN` so a missing read row counts everything (Jason's conversation 2: 1 unread); (c) anonymity in SQL: the name column is the alias on the post, or "Visitor", and the handle is selected only for conversations started from a user page. Show the result for Mandy: "Visitor · #600005, 1 unread".
3. One line on the upsert `INSERT ... AS new ON DUPLICATE KEY UPDATE ... GREATEST(...)`, which can never move a read pointer backwards.

## 10. Prompt for a coding agent

> You are working in the Campus Notes repository on the **messages** module only. Read `AGENTS.md`, `docs/architecture/RESPONSIVE.md`, `docs/architecture/ARCHITECTURE.md` (§1, §5, §6, §9) and `docs/modules/messages/DEV_GUIDE.md`. Implement feature **MS-4** (replace with the feature you want) exactly as specified in §5 of the guide, using the SQL in `docs/modules/messages/queries.sql` (turn `@variables` into `?` placeholders in `modules/messages/queries.js`; drop the `CREATE TEMPORARY TABLE res AS` lines, which only exist for the checks). Never select or print a handle, avatar or user id for a person on an anonymous post: people on a post are shown by `ui.alias(n)` or "Visitor". Do not change `modules/messages/db/triggers.sql` unless the task says so. Write the tests listed for that feature in §7 in `modules/messages/tests/`. Change no file outside `modules/messages/` and `docs/modules/messages/`. When done, run `npm test -- modules/messages` and `npm run lint`, check the changed pages at 390, 768 and 1440 px with JavaScript on and off, and summarise what you changed and anything in the guide you could not follow.
