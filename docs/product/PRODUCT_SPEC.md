# Campus Notes: product specification

**Version 1.1, 21 Oct 2026.** This is the single source for *what* the product does. `ARCHITECTURE.md` says how it is built, and each module's `DEV_GUIDE.md` turns this spec into tasks. If a guide disagrees with this file, this file wins; raise an issue so the guide gets fixed.

## 1. What it is

Campus Notes is an anonymous campus forum (a "tree hole", 树洞) for Hong Kong university students, closely modelled on the Triple Uni / HKU Pootal WeChat mini-program. Only people with a university e-mail address can join. Students post short notes, anonymously by default, under one topic, with up to six images. Others comment under per-post aliases, like and watch posts, and message each other privately. Campus organizations also run events with a limited number of tickets released at a set time.

It is a course project for COMP3278 (databases), so the design deliberately puts its interesting logic in the database: constraints, views, triggers and transactions that the presentation can show.

Reference screenshots of the original app are in `docs/reference/triple-uni-screenshots/` (internal reference only; do not ship them or copy their branding).

## 2. Users and roles

| Role | Who | Can do |
|---|---|---|
| Visitor | not logged in | Log in, register, reset a password, read About, Contact, Terms and Privacy. Nothing else. |
| Student | anyone who registered with a university e-mail | Everything in sections 4 and 5, except the organizer and admin features. |
| Organization | a society or office account, created by an admin (seed data in v1) | Everything a student can do, plus create and manage events. Its posts that show its name show its display name instead of its handle; like anyone, it can also post anonymously. |
| Admin | moderators (seed data) | Everything a student can do, plus the report queue, hiding and restoring content, and announcements. |

## 3. Navigation and screens

One dark, desktop-first responsive website adapts to the browser width. At 1024 px and above, a left sidebar sits beside a comfortable, wider content area; tablet widths (768 to 1023 px) use an expanded content column with optional two-column card lists; phones below 768 px use one column. Both tablet and phone layouts use a fixed bottom tab bar. The same pages and features work at every width. Forms and prose stay at a readable width, while suitable lists and cards can use multiple columns. [RESPONSIVE.md](../architecture/RESPONSIVE.md) defines the shared layout.

The primary destinations are:

**Feed** (树洞) · **Search** (搜索) · **+** (compose, the pink round button) · **Messages** (消息, with an unread badge) · **Me** (我的)

| Screen | URL | Owner | Reference |
|---|---|---|---|
| Log in | `/auth/login` | identity | |
| Register: e-mail, then code, then password | `/auth/register`, `/auth/verify` | identity | |
| Forgot password | `/auth/forgot`, `/auth/reset` | identity | |
| Feed with tabs | `/feed?tab=` | discover | 01_feed |
| Search | `/search?q=` | discover | 02_search |
| Compose, with the leave-confirm dialog | `/compose` | content | 03_compose, 04_compose_leave_dialog |
| Post page with comments | `/posts/:id` | content | |
| Messages home: notifications entry and conversations | `/messages` | messages | 05_messages |
| Notifications | `/messages/notifications` | messages | |
| Conversation | `/messages/c/:id` | messages | |
| Report a post or comment | `/report?type=&id=` | messages | |
| Me hub: avatar, handle, four counts, menu | `/me` | identity | 06_me, 07_me_scrolled |
| My posts, Watching, Liked, History | `/me/posts`, `/me/watching`, `/me/likes`, `/me/history` | discover | |
| My comments | `/me/comments` | content | |
| My tickets | `/me/tickets` | events | |
| Profile, Settings | `/me/profile`, `/me/settings` | identity | |
| About, Contact, Terms, Privacy | `/about`, `/contact`, `/terms`, `/privacy` | identity | |
| A user's public page | `/u/:handle` | discover | |
| Events list, event page | `/events`, `/events/:id` | events | |
| Create or edit an event; attendees | `/events/new`, `/events/:id/edit`, `/events/:id/attendees` | events | |
| Admin: reports and hidden content | `/admin/reports` | messages | |
| Admin: announcements | `/admin/announcements` | discover | |
| Dev only: mailbox, log in as anyone | `/dev/mailbox`, `/dev/login-as/:handle` | backbone | |

The full route list, including every form POST, is in `docs/team/WORK_DIVISION.md` §3.

**Where events appear:** an announcement on the feed can link to an event; the Search page shows a "Campus events" entry card; the Me menu has "My tickets"; organizations see "My events" in their Me menu.

## 4. Features

Each feature has an ID used in issues, branches and PR titles. Priority uses MoSCoW: **M**ust (needed for the demo), **S**hould (expected, done by 6 Nov), **C**ould (only if time allows), and **W**on't (out of scope, see §8).

### Identity (built with the backbone)

| ID | Feature | P |
|---|---|---|
| ID-1 | Register with a university e-mail: the domain decides the university; a 6-digit code is sent; the user then sets a password and gets a random 9-character handle | M |
| ID-2 | Log in and log out | M |
| ID-3 | Forgot password: code by e-mail, then a new password | S |
| ID-4 | Me hub: avatar, handle, university, four counts (My posts, Watching, Comments, Viewed) and the menu | M |
| ID-5 | Profile: choose an avatar from a set, edit the bio | S |
| ID-6 | Settings: default anonymity and visibility for new posts, comment and like notifications on or off, change password | M |
| ID-7 | Static pages: About, Contact, Terms, Privacy | S |
| ID-8 | Admin user list: ban and unban, turn a user into an organization | C |

### Content (posts and comments)

| ID | Feature | P |
|---|---|---|
| CT-1 | Compose: text (1 to 750 characters, live counter), 0 to 6 images, a required topic, toggles "Show my handle" and "Visible to all universities" (pre-filled from Settings), and a confirm dialog when leaving with a draft | M |
| CT-2 | Post page: header (avatar, #number, topic, time, university, handle when shown), text, images, like and watch buttons with counts, comment thread, "Message the host", "Report", and Delete for the author | M |
| CT-3 | Comments: add, reply to a comment, delete your own; everyone appears under their alias on that post | M |
| CT-4 | Like and unlike | M |
| CT-5 | Watch and unwatch (save the post and follow its comments) | M |
| CT-6 | Record browsing history on every post view; "Clear history" (empties your History list; posts keep their view counts) | M |
| CT-7 | My comments: every comment I wrote, newest first, linking to its post | S |
| CT-8 | Image viewer: tap an image to see it full size | C |

### Discover (feeds, search, lists)

| ID | Feature | P |
|---|---|---|
| DS-1 | Feed with tabs: Watching (👀), Hot (🔥), All, my university (labelled e.g. "HKU"), then one tab per topic; 20 posts per page with "Load more" | M |
| DS-2 | Hot ranking over the last 7 days (§5, BR-12) | M |
| DS-3 | Announcement banner at the top of the feed | S |
| DS-4 | Search: all words must appear (Chinese or English); sort by relevance or newest; optional topic filter; typing `#600012` or `600012` opens that post; the empty search page shows a "Campus events" card and recent posts from organizations | M |
| DS-5 | My posts, Watching, Liked, History lists | M |
| DS-6 | A user's public page: avatar, handle, university, bio (or the organization's name and description) and their posts that show their handle; never their anonymous posts | S |
| DS-7 | Admin: create, edit and delete announcements | S |

### Messages (notifications, private messages, safety)

| ID | Feature | P |
|---|---|---|
| MS-1 | Notifications: replies to my comments, comments on my posts, comments on posts I watch, likes on my posts; unread ones highlighted; opening the list marks them read | M |
| MS-2 | Unread badge on the Messages tab (unread notifications plus unread private messages) | M |
| MS-3 | Messages home: a Notifications row with its count, then my conversations with the other person's name, last message, time and unread count | M |
| MS-4 | Start a private conversation from a post ("Message the host"), from a comment ("Message" under the comment, which writes to that commenter's alias, such as Alice), or from a user page; an existing conversation is reused | M |
| MS-5 | Conversation page: messages, send, marked read on open | M |
| MS-6 | Report a post or comment, with a reason | S |
| MS-7 | Admin report queue: hide the content (resolves every report on it) or dismiss; list of hidden content with Restore | S |
| MS-8 | Block a conversation: nobody can send in it until I unblock it (per conversation, so it never reveals who is behind an alias) | C |

### Events (the extension; decision D3)

| ID | Feature | P |
|---|---|---|
| EV-1 | Events list: upcoming events I can see, each with a status (on sale, sold out, opens in hh:mm:ss, happening now, ended, cancelled) | M |
| EV-2 | Event page: details, tickets left, a live countdown to the release time, then Book; once booked, my ticket code and Cancel | M |
| EV-3 | Book a ticket: one per person, never oversold (§5, BR-16) | M |
| EV-4 | Cancel my booking before the event starts; the ticket goes back on sale | S |
| EV-5 | My tickets | M |
| EV-6 | Organizer: create, edit and cancel events; attendee list with check-in; tickets sold so far | S |
| EV-7 | Race demo: `npm run demo:race` sends 200 simultaneous booking requests for 50 tickets and prints the result | M |

### Backbone (shared, built before kickoff)

| ID | Feature | P |
|---|---|---|
| BB-1 | Layout, top bar, tab bar, flash messages, 404 and error pages, UI kit | M |
| BB-2 | Sessions stored in MySQL, CSRF protection, login guard, roles | M |
| BB-3 | Image upload handling and serving | M |
| BB-4 | Database reset (schema, module SQL, seed), core seed data, SQL check suite | M |
| BB-5 | Dev tools: log in as any seed user, dev mailbox | M |
| BB-6 | Test helpers, contract tests, CI | M |

## 5. Business rules

These rules cross module boundaries. Each module's guide repeats the ones it must implement, with the same ID.

| ID | Rule |
|---|---|
| BR-1 | Only an e-mail whose domain (lower-cased, exact match) is listed in `university_domains` can register. The domain decides the university. One account per e-mail; e-mails are stored lower-cased. Seeded domains: hku.hk, connect.hku.hk, cuhk.edu.hk, link.cuhk.edu.hk, ust.hk, connect.ust.hk. |
| BR-2 | Codes have 6 digits and are valid for 10 minutes. Only the latest code for an e-mail works; 5 wrong tries use it up; a new code can be requested after 60 seconds. Only a SHA-256 hash of the code is stored. |
| BR-3 | A handle is 9 random characters from a to z and 0 to 9, unique and never changed. Passwords have at least 8 characters and are stored as bcrypt hashes. Banned users cannot log in. |
| BR-4 | Every page except the visitor pages in §2 requires login. |
| BR-5 | **Visibility.** A post marked "my university" is visible only to users from the author's university; "all universities" makes it visible to everyone logged in. This applies everywhere: feeds, search, post pages, user pages, notifications and private messages started from a post. Liking, watching, commenting on or messaging about a post you cannot see answers 404. |
| BR-6 | **Anonymity.** An anonymous post shows no handle anywhere. A post with "Show my handle" shows the author's handle (an organization shows its display name), linking to their user page. A user page lists only posts that show the handle. |
| BR-7 | **Aliases.** On each post the author is "Host" (alias 0). Every other person who comments gets the next number in the order of their first comment: 1 is Alice, 2 Bob, 3 Carol, and so on (after Zoe, "Alice 2", ...). An alias never changes and is never reused, even if comments are deleted. Comments by the author show "Host" even on a post that shows the handle. |
| BR-8 | **Deleting.** Authors can delete their own posts and comments; nothing is edited. A deleted post disappears from every list and its page answers 404. A deleted comment keeps its place in the thread as "[deleted]" so replies still make sense. |
| BR-9 | **Hiding.** An admin can hide a reported post or comment. Hidden content behaves like deleted content for everyone ("[hidden by a moderator]" for a comment) until an admin restores it. |
| BR-10 | **Counts** are computed from the rows, never stored: likes, watches, views (total visits) and comments. A post's comment count excludes deleted and hidden comments; the Me page's Comments count matches My comments, which still lists my comments hidden by a moderator as "[hidden by a moderator]". |
| BR-11 | **Feeds** are newest first. "My university" means posts by authors from my university. "All" means every post I can see. Topic tabs filter by topic. "Watching" lists the posts I watch, most recently active first. |
| BR-12 | **Hot** ranks posts from the last 7 days by `(likes + 2 × comments + 3 × watches + 1) / (hours since posting + 2) ^ 1.5`. Ties go to the newer post. |
| BR-13 | **Notifications** are created by the database (triggers) when a comment or like is added. A comment notifies the author of the comment it replies to, the post's author, and everyone watching the post, each at most once, never the commenter themself. A like notifies the post's author once per person. Each user can turn comment or like notifications off in Settings. Notifications name people by their alias on that post. |
| BR-14 | **Private messages.** There is at most one conversation per pair of people per post, plus one without a post. In a conversation started from a post, both people appear under their alias on that post (or "Visitor" if they never commented). In a conversation started from a user page, handles are shown. Only the two members can read or write (also enforced by a trigger). Nobody can message themself. |
| BR-15 | **Reports.** One report per person per post or comment. Hiding the content resolves every open report on it. Admins see the author's handle in the queue so they can act on repeat offenders. |
| BR-16 | **Tickets.** Organizations and admins create events with a capacity, a release time and an audience (their university or all universities). Booking opens at the release time and closes when the event starts. Each person can hold at most one ticket per event, and an event can never sell more tickets than its capacity, even under hundreds of simultaneous requests. Cancelling a booking before the event returns the ticket. A cancelled event shows as cancelled, and its tickets stay as a record. |
| BR-17 | **Time.** Stored in UTC, shown in Hong Kong time. Times in the last 24 hours show as "5 min ago" or "3 h ago"; older ones show the date, such as "16 Oct 22:19". |
| BR-18 | **Limits.** Post 750 characters, comment 500, message 1,000, bio 160, report details 300, event description 2,000. Text is trimmed and cannot be blank, except a bio and report details, which may be empty. Up to 6 images per post, each JPEG, PNG, WebP or GIF and at most 5 MB. |

## 6. Key flows

1. **Sign up:** Register → enter `name@connect.hku.hk` → the code arrives (dev mailbox, or real e-mail when SMTP is set) → enter the code → choose a password → logged in, on the feed.
2. **Post:** + → type, add a photo, pick Academics, leave "Show my handle" off → Publish → the new post's page, #600015.
3. **Discuss:** another student opens the post → comments (appears as Alice) → the author sees the Messages badge → Notifications says "Alice commented on your post #600015" → the author replies (appears as Host).
4. **Message privately:** a student who has not commented on the post taps "Message the host" → a conversation where the two appear as Visitor and Host. (A student who has commented appears under their alias instead, such as Alice.)
5. **Moderate:** someone reports a comment → an admin opens Reports → Hide → the comment shows "[hidden by a moderator]" and the report is resolved.
6. **Book a ticket:** Search → "Campus events" → Director Q&A (HKU members) shows a live countdown (it opens 2 hours after a database reset) → back to the list → Film night (already on sale) → Book → ticket code shown, tickets left goes down by one → My tickets lists it. (The video's 1:35 shot shows the countdown reaching zero on Film night, because `npm run demo:race` first resets its release time.)

## 7. Quality requirements

- **Privacy:** no page may show the handle behind an anonymous post or comment. An automated contract test logs in as every persona, opens every page and checks this. The one exception is the admin report queue (`/admin/reports`), which shows authors to admins on purpose (BR-15); the test skips it.
- **Security:** parameterised SQL only; CSRF tokens on every form; output escaped by default; passwords hashed with bcrypt; codes hashed; uploads checked for type and size; every change checks that the user owns the thing or is an admin. (The 18 Nov lecture covers SQL injection, which the presentation can mention.)
- **Speed:** every page under 300 ms on a laptop, with the seed data and with 20,000 extra posts (load-test script). The one known exception is a search, sorted by relevance, for a word that appears in most posts (about 0.6 s measured), because MySQL must score every match.
- **Layout:** works in desktop, tablet and phone browsers; latest Chrome and Safari. Check at 390, 768 and 1440 CSS pixels: no horizontal document overflow, readable forms and text, and navigation appropriate to the viewport. Wide tables scroll within their own container.
- **Accessibility:** every input has a label; text contrast meets WCAG AA on the dark theme; keyboard focus is visible; touch targets are at least 44 px high. Browser resizing and 200% zoom preserve access to content and controls.
- **Runs anywhere:** `git clone`, `npm install`, set `.env`, `npm run db:reset`, `npm run dev`. No external services needed.

## 8. Out of scope (Won't, v1)

Editing posts; Markdown; the reference app's "百宝箱" toolbox (polls and so on); syncing to other platforms; following users; recommendation algorithms; real-time push (pages refresh on load); e-mail notifications; video; payments; a mobile app.

## 9. Demo video script (at most 2 minutes)

| Time | Shot | Shows |
|---|---|---|
| 0:00 | Register as a new HKU student; the code appears in the mailbox; set a password | university e-mail only (BR-1, BR-2) |
| 0:15 | Feed: All, HKU, Hot tabs; announcement banner | feeds, hot ranking |
| 0:25 | Compose an anonymous post with a photo under Academics, HKU only | compose, images, visibility |
| 0:40 | Second browser (Kelvin): comment as "Alice"; the author's badge lights up; the author replies as "Host" | aliases, triggers, notifications |
| 1:00 | Kelvin taps "Message the host": the private chat shows Alice and Host, because Kelvin commented as Alice | private messages |
| 1:10 | Search "library", then "叉烧" | full-text search in two languages |
| 1:20 | Log in as Wing (CUHK): the HKU-only post is not there | visibility |
| 1:25 | Report a rude comment; the admin hides it | moderation |
| 1:35 | Film night: the countdown reaches zero; `npm run demo:race` fires 200 buyers at 50 tickets; result: 50 sold, 150 told sold out, counter 0 | transaction and concurrency |
| 1:55 | End card: E-R diagram thumbnail and team names | |
