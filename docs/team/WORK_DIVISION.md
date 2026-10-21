# Work division

**Updated 21 Oct 2026.** Who owns what, where the modules meet, and how the work balances. It follows Michael's decisions D1 to D5 in `DECISIONS.md` (17 Oct 2026, option A for each); §6 records what would change under the other options.

## 1. The split at a glance

| | Coordinator (Michael) | Member 1 — Content (unclaimed) | Member 2 — Discover (unclaimed) | Member 3 — Messages (unclaimed) |
|---|---|---|---|---|
| **Module** | backbone + identity (built before kickoff) and **events** | **content**: posts, comments, likes, watches, history | **discover**: feeds, hot ranking, search, lists, user pages, announcements | **messages**: notifications, private messages, reports and moderation |
| **Folder** | `core/`, `views/`, `public/`, `db/`, `test/`, `.github/`, `modules/identity/`, `modules/events/` | `modules/content/` | `modules/discover/` | `modules/messages/` |
| **Tables written** | users, organizations, email_codes, sessions, outbox, events, tickets | posts, post_images, post_participants, comments, post_likes, post_watches, post_views | announcements | notifications (by trigger), conversations, messages, conversation_reads, blocks, reports, hidden_content |
| **Tabs owned** | Me (hub, profile, settings) | + (compose) and the post page | Feed and Search | Messages |
| **Feature IDs** | BB-1 to BB-6, ID-1 to ID-8, EV-1 to EV-7 | CT-1 to CT-8 | DS-1 to DS-7 | MS-1 to MS-8 |
| **Presents** | intro, E-R diagram, booking transaction | alias transaction | hot ranking and search | notification trigger and conversation list |
| **Shared duty** | integration, E-R drawing, README, rehearsals | demo video | slides | rebuild test, bug bash, Moodle package |
| **Effort (points)** | 10.5 module + 4.5 coordination = 15 | 11 + 2 = 13 | 11 + 2 = 13 | 10.5 + 2 = 12.5 |

Member 1, Member 2 and Member 3 are three available roles, not assignments to particular people. Each teammate chooses one unclaimed role, then records their name in that module's README. Start with [START_HERE.md](../../START_HERE.md). Content focuses on posting and interaction; Discover on feeds and search; Messages on private conversations, notifications and moderation.

## 2. Why this split

The goal is the least communication, clear boundaries, the least aggregation work and roughly equal shares. Starting from first principles, communication in a team comes from **shared things that change**: shared files, shared tables, shared assumptions. So the split removes them one by one.

1. **Shared files.** Each member owns a folder and nothing else. The backbone discovers modules by folder, so no member ever edits `app.js`, the layout or another member's code. This limits merge conflicts to shared contract changes and work in the same module.
2. **Shared tables.** Each table has one writer (§1). Where a module needs something to happen elsewhere (a comment must create a notification), the module that owns the result owns a database trigger. Content never calls messages code; messages never writes content tables.
3. **Shared assumptions.** The rules everyone must agree on (visibility, anonymity, deletion, counts) are written once, in the schema's views and in `PRODUCT_SPEC.md` §5. Nobody re-implements them, so nobody can implement them differently.
4. **Waiting.** The schema and the seed data are complete before anyone starts, and `/dev/login-as` gives everyone a logged-in user. Nobody waits for anyone's tables, pages or login.
5. **Aggregation.** Everything merges into `main` continuously behind CI, from the first week. The final week is for polishing, not for joining four codebases.
6. **Balance.** The split follows the product's own seams (the five tabs), which happen to cut the work into similar sizes (§5). Each module also contains one strong SQL story for its owner to present, since every member must speak.

The backbone and identity go to the coordinator because every module depends on them from day one. Building them before kickoff (decision D2) means the dependency is satisfied before anyone needs it.

## 3. Route table (the URL contract)

Modules link to each other only through these URLs. A route not in this table needs a `contract-change` issue. GET routes are pages; POST routes end with a redirect (or JSON for `kit.js`).

### Backbone

| Method | Path | Does |
|---|---|---|
| GET | `/` | Redirect to `/feed`, or to `/auth/login` when logged out |
| GET | `/dev/login-as/:handle` | Development only: log in as a persona |
| GET | `/dev/mailbox` | Development only: every e-mail the app sent |
| GET | `/static/*`, `/uploads/*`, `/m/:module/*` | Files |

### Identity (coordinator)

| Method | Path | Does | Feature |
|---|---|---|---|
| GET, POST | `/auth/register` | Enter a university e-mail; sends a code | ID-1 |
| GET, POST | `/auth/verify` | Enter the code and choose a password | ID-1 |
| POST | `/auth/resend` | Send a new code (after 60 s) | ID-1 |
| GET, POST | `/auth/login` | Log in (`?next=` is honoured if internal) | ID-2 |
| POST | `/auth/logout` | Log out | ID-2 |
| GET, POST | `/auth/forgot`, `/auth/reset` | Password reset by code | ID-3 |
| GET | `/me` | Me hub | ID-4 |
| GET, POST | `/me/profile` | Avatar and bio | ID-5 |
| GET, POST | `/me/settings` | Defaults and notification switches | ID-6 |
| POST | `/me/password` | Change password | ID-6 |
| GET | `/about`, `/contact`, `/terms`, `/privacy` | Static pages (public) | ID-7 |
| GET | `/admin/users` | User list and search | ID-8 |
| POST | `/admin/users/:id` | Ban, unban, make organization (`action=ban\|unban\|make_org`) | ID-8 |

### Content

| Method | Path | Does | Feature |
|---|---|---|---|
| GET | `/compose` | Compose page | CT-1 |
| POST | `/compose` | Publish (multipart), then redirect to `/posts/:id` | CT-1 |
| GET | `/posts/:id` | Post page; records a view. Comments have anchors `#c<comment_id>` | CT-2, CT-6 |
| POST | `/posts/:id/like` | Body `like=1` or `like=0` | CT-4 |
| POST | `/posts/:id/watch` | Body `watch=1` or `watch=0` | CT-5 |
| POST | `/posts/:id/delete` | Author only | CT-2 |
| POST | `/posts/:id/comments` | Body `body`, optional `reply_to` (a comment id) | CT-3 |
| POST | `/comments/:id/delete` | Comment author only | CT-3 |
| GET | `/me/comments` | My comments | CT-7 |
| POST | `/me/history/clear` | Delete my browsing history | CT-6 |

### Discover

| Method | Path | Does | Feature |
|---|---|---|---|
| GET | `/feed?tab=all\|uni\|hot\|watching\|<topic code>&before=<id>&page=<n>` | Feed (default tab `all`) | DS-1, DS-2, DS-3 |
| GET | `/search?q=&sort=relevance\|newest&topic=&page=` | Search; `#600012` jumps to the post | DS-4 |
| GET | `/me/posts`, `/me/watching`, `/me/likes`, `/me/history` | My lists (`/me/posts?before=`; the other three use `?page=`) | DS-5 |
| GET | `/u/:handle` | User page | DS-6 |
| GET, POST | `/admin/announcements`, `/admin/announcements/:id`, POST `/admin/announcements/:id/delete` | Manage announcements | DS-7 |

### Messages

| Method | Path | Does | Feature |
|---|---|---|---|
| GET | `/messages` | Messages home | MS-3 |
| GET | `/messages/notifications` | Notifications; marks them read | MS-1 |
| GET | `/messages/new?post=<id>[&alias=<n>]` or `?to=<handle>` | Redirect to the existing conversation, or show a "new message" box | MS-4 |
| POST | `/messages/new` (same query) | Create the conversation with its first message, then redirect to it | MS-4 |
| GET | `/messages/c/:id` | Conversation; marks it read | MS-5 |
| POST | `/messages/c/:id` | Send a message | MS-5 |
| GET, POST | `/report?type=post\|comment&id=<id>` | Report form | MS-6 |
| GET | `/admin/reports` | Open reports and hidden content | MS-7 |
| POST | `/admin/reports/:id/hide`, `/admin/reports/:id/dismiss` | Resolve a report | MS-7 |
| POST | `/admin/hidden/:type/:id/restore` | Un-hide | MS-7 |
| POST | `/messages/c/:id/block`, `/messages/c/:id/unblock` | Block or unblock this conversation (Could) | MS-8 |

### Events (coordinator)

| Method | Path | Does | Feature |
|---|---|---|---|
| GET | `/events` | Upcoming events (`?mine=1` for an organizer's own) | EV-1 |
| GET | `/events/:id` | Event page | EV-2 |
| POST | `/events/:id/book` | Book | EV-3 |
| POST | `/events/:id/cancel-booking` | Cancel my booking | EV-4 |
| GET | `/me/tickets` | My tickets | EV-5 |
| GET, POST | `/events/new` | Create (organization or admin) | EV-6 |
| GET, POST | `/events/:id/edit` | Edit (the event's organizer) | EV-6 |
| POST | `/events/:id/cancel` | Cancel the event (the event's organizer) | EV-6 |
| GET | `/events/:id/attendees` | Attendees (the event's organizer, or an admin) | EV-6 |
| POST | `/events/:id/check-in` | Check in by ticket code (the event's organizer, or an admin) | EV-6 |

## 4. Every place two modules meet

This is the complete list. If you find yourself needing another one, open a `contract-change` issue.

| # | From → to | How | Contract |
|---|---|---|---|
| 1 | every module → backbone | `require('../../core/...')`, partials | `ARCHITECTURE.md` §6 and `UI_KIT.md`. |
| 2 | content → messages | database triggers on `comments` and `post_likes` | Content inserts rows as the schema says. Messages' triggers only read other tables and only write `notifications`; they must never make an insert fail. |
| 3 | content's post page → messages | links | "Message the host": `/messages/new?post=:id`. "Message" on a comment: `/messages/new?post=:id&alias=:n`. "Report": `/report?type=post&id=:id` and `/report?type=comment&id=:commentId`. |
| 4 | messages → content | links | Notifications link to `/posts/:id#c:commentId`; content renders `id="c<comment_id>"` on each comment. |
| 5 | discover → content | links | Every card links to `/posts/:id` (the `post-card` partial does this). |
| 6 | discover's History page → content | form | The "Clear history" button posts to `/me/history/clear`. |
| 7 | identity's Me hub → everyone | links | Menu items link to `/me/posts`, `/me/watching`, `/me/likes`, `/me/history` (discover), `/me/comments` (content), `/me/tickets` (events), `/admin/reports` (messages), `/admin/announcements` (discover), `/events/new` and `/events?mine=1` (events). |
| 8 | discover's user page → messages | link | "Message": `/messages/new?to=:handle` (not shown on your own page, nor on a banned user's page, because messages answers 404 for a banned handle). |
| 9 | discover → events | links | The Search page's "Campus events" card links to `/events`; announcements may link to `/events/:id`. |
| 10 | messages → everyone | `hidden_content` rows | The shared views hide that content everywhere, with no code in other modules. |
| 11 | messages → layout | `locals` hook | Returns `{ badges: { messages: <unread notifications + unread messages> } }`. |
| 12 | identity → content and messages | `users` columns | Content pre-fills compose from `req.me.defaultAnonymous` and `defaultVisibility`; the triggers read `notify_comments` and `notify_likes`. |
| 13 | events → identity | `organizations` table | Event pages show the organizer's `display_name`. |
| 14 | content, messages and events → discover | links | `/u/:handle`, only for a handle that is already shown: content's post header when the post shows its author's name, messages' "New message" back link and conversation header when the conversation is by handle, and events' organizer name on the event page. Never for an anonymous author or a person known only by an alias. |

Nothing else crosses a boundary. In particular, no module imports another module's code, and no page renders another module's template.

## 5. Effort balance

One point is about 3 focused hours for a year-3 student using an AI coding assistant, including tests. The estimates are judgments, made by sizing each feature against the same yardstick.

| Content | pts | Discover | pts | Messages | pts | Events | pts |
|---|---|---|---|---|---|---|---|
| CT-1 compose with images | 3 | DS-1 feed tabs, keyset paging | 2.5 | MS-1 notifications list | 1.5 | EV-1 list with statuses | 1.5 |
| CT-2 post page | 2 | DS-2 hot ranking | 1.5 | MS-2 badge hook | 0.5 | EV-2 event page, countdown | 1.5 |
| CT-3 comments, aliases, replies | 2 | DS-3 announcement banner | 0.5 | MS-3 messages home, conversation list | 1.5 | EV-3 booking transaction | 1.5 |
| CT-4, CT-5 like and watch | 1 | DS-4 search, modes, #id, empty page | 2 | MS-4 start or reuse a conversation | 1 | EV-4 cancel booking | 0.5 |
| CT-6 history | 0.5 | DS-5 four lists | 1.5 | MS-5 conversation page | 1.5 | EV-5 my tickets | 0.5 |
| CT-7 my comments | 0.5 | DS-6 user page | 1 | MS-6 report form | 1 | EV-6 organizer pages | 2.5 |
| tests | 2 | DS-7 admin announcements | 0.5 | MS-7 admin queue, hide, restore | 1.5 | EV-7 race script | 1 |
| | | tests | 1.5 | tests | 2 | tests | 1.5 |
| **Total** | **11** | | **11** | | **10.5** | | **10.5** |

Coordination for Michael (4.5 points): reviewing and running the backbone before kickoff (1.5), reviewing and merging PRs (1.5), integration week (1.5). The backbone and identity themselves (about 20 points) are built by Claude under decision D2.

Shared duties in weeks 4 and 5 (about 2 points each):
- **Michael:** draw the Chen E-R diagram, write the README for markers, run integration week, tag v1.0, lead the rehearsals.
- **Content owner:** record and edit the video (`PRODUCT_SPEC.md` §9), and write its voice-over.
- **Discover owner:** build the slides from the four SQL cards and the E-R diagram; time the talk.
- **Messages owner:** run the bug bash, do the rebuild test (fresh clone, README only, on a second laptop), and assemble the Moodle package.

## 6. What the other options would have changed

Michael chose option A for D1 to D5 on 17 Oct 2026, so none of these changes apply. The table stays as a record, and as a guide if the team ever reopens one of them with a `contract-change` issue.

| Decision | Change to this split |
|---|---|
| D1 Flask or SPA | Folders and ownership stay. The core API in `ARCHITECTURE.md` §6 is rewritten for the new stack before kickoff. An SPA adds an API contract per module (about +3 points each). |
| D2 Michael writes the backbone | Kickoff moves to about 25 Oct; members spend 22 to 25 Oct on SQL and templates only, using the design pack's `queries.sql`. |
| D3 Events as stretch | Michael's module becomes the backbone plus identity, built and owned by him; events start only if CP2 (1 Nov) is met. |
| D3 Drop events | Michael keeps coordination, identity and the backbone; the showcase table in `DATA_MODEL.md` §8 gives Michael the visibility predicate and the E-R walkthrough instead. |
| D4 HKU only | The visibility toggle and the "my university" tab disappear (−1 point for discover, −0.5 for content). |
| D5 Chinese or bilingual UI | Bilingual adds about 1 point per module. |

## 7. What each member hands in, and when

| By | Every member |
|---|---|
| Sun 25 Oct (CP1) | Your pages render with seed data (read-only paths), linked from the tab bar or Me menu; CI green. |
| Sun 1 Nov (CP2) | All **Must** features merged with their tests. |
| Fri 6 Nov (module complete) | **Should** features merged; `docs/modules/<m>/USER_GUIDE.md` updated with screenshots; `docs/modules/<m>/SQL_CARD.md` (your presentation query, its result and three talking points); a note in your DEV_GUIDE of anything built differently from the guide. |
| Integration week | Fix bugs found in your module within a day; do your shared duty. |

## 8. If someone falls behind

- Say so in the Sunday status comment, or in the issue for the feature, as soon as you know. Nobody gets blamed for a late feature; a late surprise is the only real problem.
- The coordinator first cuts **Could** features, then **Should** features of that module, then asks a buddy to take one feature (buddies: Content and Discover, which share the post card; Messages and Events, which are both "inbox" style).
- A buddy works in the owner's folder only on a branch the owner reviews.
