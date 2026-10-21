# Discover module: developer guide

| | |
|---|---|
| **Owner** | Member 2 — Discover (unclaimed; teammates choose their own role) |
| **Folder** | `modules/discover/`, `docs/modules/discover/` |
| **Features** | DS-1 to DS-7 (`PRODUCT_SPEC.md` §4) |
| **Read first** | `ARCHITECTURE.md` §1, §5, §6 (above all §6.5), §8, §9; `PRODUCT_SPEC.md` BR-5, BR-6, BR-8 to BR-12, BR-17; `DATA_MODEL.md` §7.5 and §7.6; this guide |
| **Tested SQL** | `queries.sql` (this folder) |

You can build this module without knowing the rest of the app. Everything you need from other modules is listed in §3.

## 1. The module in one paragraph

Discover is how people find posts. The Feed tab shows every post the reader may see, newest first, with tabs for the posts they watch (👀), the week's hot posts (🔥), their own university and each topic, plus an announcement banner on top. The Search tab finds posts that contain all the words typed, in Chinese or English, and jumps straight to a post when a number like `#600012` is typed. The module also owns the four personal lists on the Me page (my posts, watching, liked, history), each user's public page, and the admin page for announcements. It writes only one table (`announcements`); everything about posts is read through the shared views, so deletion, hiding, visibility and anonymity are never re-implemented here. It is the project's ranking and search showcase: a hot score built from correlated subqueries and time arithmetic, and an ngram full-text index that searches Chinese.

## 2. What you own

**Tables you write:** `announcements`. **Tables you read:** `v_live_posts` (every list, step 1), `v_post_cards` (only through `cards.byIds` and `cards.findVisible`), `post_watches`, `post_likes`, `post_views`, `comments` and `hidden_content` (hot score, watching order), `users`, `organizations`, `universities`, and `topics` (through `ref`).

**Routes** (from `WORK_DIVISION.md` §3):

| Method | Path | Who | Feature |
|---|---|---|---|
| GET | `/feed?tab=&before=&page=` | everyone | DS-1, DS-2, DS-3 |
| GET | `/search?q=&sort=&topic=&page=` | everyone | DS-4 |
| GET | `/me/posts?before=` | everyone (their own) | DS-5 |
| GET | `/me/watching?page=`, `/me/likes?page=`, `/me/history?page=` | everyone (their own) | DS-5 |
| GET | `/u/:handle?before=` | everyone | DS-6 |
| GET | `/admin/announcements` | admin | DS-7 (list and the "New announcement" form) |
| POST | `/admin/announcements` | admin | DS-7 (create) |
| GET, POST | `/admin/announcements/:id` | admin | DS-7 (edit form, save) |
| POST | `/admin/announcements/:id/delete` | admin | DS-7 |

**Manifest** (`modules/discover/index.js`):

```js
module.exports = {
  name: 'discover',
  router: require('./routes'),
  smoke: ['/feed', '/feed?tab=hot', '/feed?tab=watching', '/feed?tab=uni', '/feed?tab=food',
          '/search', '/search?q=library', '/me/posts', '/me/watching', '/me/likes', '/me/history',
          '/u/mandy0hku', '/u/jason0ust', '/u/filmsoc00'],
};
```

`/u/kelvin0hk` is deliberately not a smoke path: a user page prints its own handle by design, and the privacy contract test looks for `kelvin0hk` on every smoke page. `/admin/announcements` is not one either, because it answers 403 to everyone but admins.

## 3. Contracts

**You rely on** the backbone: `q` (`core/db`; no transactions are needed here, every write is one statement), `req.me` (`userId`, `handle`, `universityId`, `universityCode`, `isAdmin`) and `requireRole('admin')` (`core/auth`), `res.page` and `res.done` (`core/render`), `notFound` and `badRequest` (`core/errors`), `VISIBLE`, `byIds` and `findVisible` (`core/cards`), `ref.topics` and `ref.topic(code)` (`core/ref`), `uploads.images` and `uploads.remove` (`core/uploads`), `text`, `int`, `oneOf` and `bool` (`core/validate`), the partials `tabs`, `post-list` (which renders `post-card`), `empty`, `field`, `toggle`, `avatar` and `confirm-dialog`, and the helpers `ui.hkt`, `ui.timeAgo`, `ui.avatarUrl` and `ui.postNo`.

From the other modules you rely only on URLs and on rows they write:
- **content:** `/posts/:id` (every card links there through `post-card`); the "Clear history" form posts to `/me/history/clear`, which sets `post_views.cleared_at` on your rows and redirects back to `/me/history` with the flash "History cleared"; a later visit sets `cleared_at` back to NULL. You read `post_watches`, `post_likes`, `post_views` and `comments` as content writes them.
- **messages:** the "Message" button links to `/messages/new?to=<handle>`. Hidden posts and comments (`hidden_content`) disappear from your lists through the views, with no code here.
- **events:** the Search page's "Campus events" card links to `/events`; announcements may link to `/events/:id`.

**Others rely on you for:**
- `/feed` and `/search` (the tab bar), the four lists and `/admin/announcements` (the Me menu, `WORK_DIVISION.md` §4 row 7), and `/u/:handle` (content's post header, messages' conversation header and "New message" back link, and events' organizer name link there when a handle is shown, BR-6; `WORK_DIVISION.md` §4 row 14).
- Nothing else. No other module reads `announcements`.

**Full-text statistics:** relevance divides by the table's row-count statistic, which can still read 0 right after a reset; every match then scores "infinity" and the relevance order is lost (seen once in about ten fresh test runs; reproduced by setting the statistic to 0). The seed therefore ends with `ANALYZE TABLE posts`, so `db:reset` and `resetDb()` already refresh it. If relevance order ever looks random after loading data some other way, run that statement.

**Seed data for you** (`DATA_MODEL.md` §5). An HKU viewer sees 10 live posts, a CUHK viewer 7 and an HKUST viewer 7; 600009 (deleted) and 600010 (hidden) must never appear anywhere.

| Persona | All tab | Watching tab | Hot (top 5) | My lists |
|---|---|---|---|---|
| `mandy0hku` (HKU) | 600013, 600012, 600011, 600007, 600006, 600005, 600004, 600003, 600002, 600001 | 600012, 600004 | 600012, 600013, 600011, 600006, 600004 | posts 600013, 600005, 600001; watching 600012, 600004; liked 600012, 600006, 600004, 600003, 600002; history 600012, 600004, 600006, 600002 |
| `wing0cuhk` (CUHK) | 600012, 600011, 600008, 600006, 600004, 600003, 600002 | 600004 | 600012, 600011, 600006, 600004, 600008 | |
| `jason0ust` (HKUST) | 600014, 600012, 600011, 600006, 600004, 600003, 600002 | none | 600012, 600014, 600011, 600006, 600004 | posts 600014, 600004 |
| `newbie0hk` (HKU) | same as Mandy | none | same as Mandy | every list empty |

Announcement 1 ("Film night this Friday", links to `/events/1`, image `/static/seed/film-night.svg`) is current; announcement 2 ("Welcome week") has expired. Organization posts that show their name: 600011 (CUHK Hiking Club) and 600006 (HKU Film Society). Kelvin (`kelvin0hk`) posts only anonymously, so his user page lists nothing.

## 4. Build plan

| By | Tasks |
|---|---|
| CP1, Sun 25 Oct | `index.js`, `routes.js`, `queries.js` with `feedAllIds`, `feedUniIds`, `feedTopicIds`, `myPostIds`, `userByHandle` and `userPostIds`; `/feed` renders the tab strip and the All, university and topic tabs with "Load more"; `/me/posts` and `/u/:handle` render read-only. |
| CP2, Sun 1 Nov (Must) | DS-1 complete (Watching tab), DS-2 Hot, DS-4 search (with the `#id` jump and the empty page), DS-5 the four lists; tests DS-T01 to DS-T08, DS-T10 to DS-T19 and DS-T26. |
| Fri 6 Nov (Should) | DS-3 banner, DS-6 user page complete (Message button, own-page note), DS-7 admin announcements; tests DS-T09 and DS-T20 to DS-T28; USER_GUIDE screenshots; `SQL_CARD.md`; the slides (your shared duty). |
| Could | Nothing is planned for this module. Spend spare time timing the pages after `npm run load-test` (§5 DS-2 and DS-4 give the numbers to expect). |

## 5. Features

Every list in this module follows the same two steps (decision D18, `ARCHITECTURE.md` §6.5):

1. A `queries.js` function returns **up to 21 ids** from `v_live_posts p`, filtered with `${VISIBLE}` and the list's own condition, ordered and limited.
2. The route calls `byIds(ids.slice(0, 20))` and passes the cards to `partials/post-list` with `nextUrl` set only when 21 ids came back.

```js
const PAGE = 20;
function pageOf(ids, nextUrlFor) {          // shared by every list route
  const more = ids.length > PAGE;
  return { ids: ids.slice(0, PAGE), nextUrl: more ? nextUrlFor(ids[PAGE - 1]) : null };
}
```

Keyset lists (`?before=`) pass the 20th id as the next `before`; the first page passes `before = 4294967295` (the largest INT UNSIGNED), so every keyset query has one shape. Offset lists (`?page=`) pass `OFFSET (page - 1) * 20`. A missing, non-numeric or out-of-range `before` or `page` means the first page; a page past the end shows the list's empty state. Never `ORDER BY` or `LIMIT` on `v_post_cards`.

### DS-1 Feed with tabs: `GET /feed` (Must)

- `res.page('discover/feed', { title: 'Campus Notes', tab: 'feed' })`.
- The tab strip (`partials/tabs`), in this order, as in screenshot 01: 👀 (`watching`), 🔥 (`hot`), All (`all`), the reader's university code from `req.me.universityCode` (`uni`, for example "HKU"), then one tab per topic from `ref.topics` (Share, Random, Feelings, Academics, Careers, Trade, Food) with the topic code as the value. Each tab links to `/feed?tab=<value>`; the current one is `active`.
- `tab` is checked against that list; a missing or unknown value means `all` (no error).

  | Tab | Filter (besides `VISIBLE`) | Order | Paging | Function | Empty text |
  |---|---|---|---|---|---|
  | `all` | none | newest first (`post_id DESC`) | `?before=` | `feedAllIds` | "No posts yet. Be the first to write one." (button to `/compose`) |
  | `uni` | author from my university | newest first | `?before=` | `feedUniIds` | "No posts from HKU yet." |
  | topic | `topic_id` of that code | newest first | `?before=` | `feedTopicIds` | "No posts in Food yet." |
  | `watching` | posts I watch | last activity first (below) | `?page=` | `feedWatchingIds` | "Tap the star on a post to watch it. Watched posts appear here, the most recently active first." |
  | `hot` | last 7 days | hot score (DS-2) | `?page=` | `hotIds` | "Nothing is hot this week yet." |

- **Last activity** (BR-11) of a watched post is its newest comment that is not deleted, or the post's own time when it has none. Hidden comments count as activity, as in `v_post_cards.last_comment_at`.
- "Load more" keeps the tab: `/feed?tab=food&before=600002`, `/feed?tab=hot&page=2`.
- Rules: BR-5 (visibility), BR-8 and BR-9 (deleted and hidden posts never appear; `v_live_posts` does it), BR-11. Cards show the author only through `author_name` (NULL when anonymous, BR-6).

### DS-2 Hot ranking: `GET /feed?tab=hot` (Must)

- `hotIds(myUniversityId, offset)` ranks the posts I can see from the last 7 days by BR-12:

  `score = (likes + 2 × comments + 3 × watches + 1) / (hours since posting + 2) ^ 1.5`, ties to the newer post.

  Likes, comments and watches are counted at query time with correlated subqueries (BR-10); comments exclude deleted and hidden ones. Hours come from `TIMESTAMPDIFF(MINUTE, p.created_at, UTC_TIMESTAMP()) / 60`, so a post's score falls smoothly, minute by minute.
- Seed (HKU viewer): 600012 has 3 likes, 4 live comments (comment 12 is hidden) and 1 watch, 15 points at 3 hours old, score 15 / 5^1.5 ≈ 1.34. The full order is 600012, 600013, 600011, 600006, 600004, 600002, 600007, 600001, 600003, 600005. The new post 600013 is second with no interactions at all: the "+ 1" and the young age give every new post a short moment on Hot, which is how the formula is meant to work.
- Offset paging (`?page=`): scores change while someone reads, so a keyset on the score would skip or repeat posts anyway.
- Speed (measured on MySQL 8.0.46 with 20,000 extra posts all inside the 7-day window, the worst case): about 145 ms per page. Within the 300 ms budget; mention it if the load test shows more.

### DS-3 Announcement banner (Should)

- On the All tab's first page only (no `before`), above the list: `currentAnnouncements()` returns the announcements with `starts_at <= UTC_TIMESTAMP() < ends_at`, by `sort_order`, then `announcement_id`.
- Each is a card with its image (when set), title and subtitle (escaped with `<%= %>`). When `link_url` is set the whole card is a link to it; otherwise it is not a link. Links are internal paths (checked when saved, DS-7).
- No banner on any other tab, on page 2 of All, or when nothing is current.

### DS-4 Search: `GET /search` (Must)

`res.page('discover/search', { title: 'Search', tab: 'search' })`. The form is a GET form (no CSRF) with the box `q`, a sort select (`relevance`, `newest`), a topic select ("All topics" plus `ref.topics`) and a Search button; both selects have `data-autosubmit`, and the button keeps the page usable without JavaScript. Steps:

1. `q = String(req.query.q ?? '').trim().slice(0, 100)`.
2. **Jump to a post:** if `q` matches `^#?(\d{6,7})$` and `findVisible(id, req.me)` returns a card, redirect 303 to `/posts/:id`. If the post does not exist, is deleted or hidden, or is not visible to me, carry on and search the text (so `#600008` for an HKU student is an ordinary search with no result, and reveals nothing).
3. **Empty `q`:** show the empty page (below).
4. **Words:** `toBooleanQuery(q)` (in `modules/discover/search.js`, unit-tested):

   ```js
   function toBooleanQuery(q) {
     const words = q
       .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')   // + - < > ( ) ~ * " @ and all other punctuation become spaces
       .split(' ')
       .filter((w) => [...w].length >= 2)        // the index stores 2-character pieces (ngram)
       .slice(0, 10);
     return words.length ? words.map((w) => `+"${w}"`).join(' ') : null;
   }
   // 'Joy Hing' -> '+"Joy" +"Hing"', "Dragon's Back" -> '+"Dragon" +"Back"', '叉烧' -> '+"叉烧"', 'a' -> null
   ```

   Every word must appear (`+`), each word is a phrase (`"..."`) so the ngram parser matches it as a whole, and Chinese needs no spaces. Punctuation becomes a space rather than being removed because the ngram parser never matches a phrase that contains an apostrophe: `+"Dragon's"` finds nothing even though 600011 contains exactly that text (tested in `queries.sql`). No user character can reach the boolean syntax, and the expression is still passed as a `?` parameter. If it returns null, show "Type at least 2 characters" and no list.
5. `sort = oneOf(req.query.sort, ['relevance', 'newest'])`, default `relevance`; `topicId = ref.topic(req.query.topic)?.topic_id ?? null`; `page` as in the list rules.
6. `searchIds(expr, myUniversityId, topicId, sort, offset)`, then `byIds`. The two `ORDER BY` clauses are fixed strings chosen by `sort` (never user text). "Load more": `/search?q=<q>&sort=<sort>&topic=<code>&page=<n+1>`, each value URL-encoded.
7. No results: "No posts contain all of these words." Only posts are searched, never comments.

Search behaviour worth knowing (all tested): matching ignores case; parts of words match ("night" also finds "midnight", "book" finds "textbook"); stopwords are off, so short English words such as "main" or "in" work (D17); relevance ranks shorter posts with the words higher, so "book" lists 600005 before 600006 while "newest" lists 600006 first.

**The empty page** (`q` empty): the search form; a "Campus events" card ("Film nights, hikes and talks. Book free tickets.") linking to `/events`, with no data from the events tables; and "From organizations": `orgPostIds(myUniversityId)` returns the 10 newest live, visible posts whose author has the role `organization` and that show the name (`is_anonymous = 0`), as cards without "Load more". Anonymous organization posts stay out, because listing them under "From organizations" would reveal who wrote them (BR-6). Seed: 600011, 600006.

Speed (20,000 extra posts, measured): a rare word answers in under 1 ms. A word found in every one of the 20,000 posts takes about 620 ms sorted by relevance and 230 ms sorted by newest, because every match is scored and sorted before the page is cut. That breaks the 300 ms budget only for words that appear in thousands of posts; note it in your PR if the load test shows it.

### DS-5 My lists: `GET /me/posts`, `/me/watching`, `/me/likes`, `/me/history` (Must)

`res.page('discover/my-list', { title, tab: 'me', back: '/me' })`, one template for the four pages. They show only the reader's own rows, so there is nothing to check beyond `req.me`.

| Page | Title | Function | Order | Paging | Empty text (button) |
|---|---|---|---|---|---|
| `/me/posts` | My posts | `myPostIds` | newest first | `?before=` | "You have not posted yet." (Write a post → `/compose`) |
| `/me/watching` | Watching | `myWatchingIds` | latest watch first | `?page=` | "Posts you watch (the star) appear here." (Browse the feed → `/feed`) |
| `/me/likes` | Liked | `myLikedIds` | latest like first | `?page=` | "Posts you like (the heart) appear here." (Browse the feed → `/feed`) |
| `/me/history` | History | `myHistoryIds` | latest visit first | `?page=` | "Posts you open appear here." (Browse the feed → `/feed`) |

- **My posts** includes my anonymous posts: only I see this page. Under the title: "Anonymous posts show no name to others." Deleted and hidden posts are not listed.
- **Watching, Liked, History** join `v_live_posts` and apply `VISIBLE`, so a post that was deleted or hidden after I touched it simply drops out.
- **History** lists only rows with `cleared_at IS NULL`. When the list is not empty, the page shows a "Clear history" button: `<form method="post" action="/me/history/clear" data-confirm="Clear your history?">` with `csrfField()`. Content handles the POST (CT-6), keeps the view counts and redirects back here with "History cleared".
- Ties (same second) go to the higher post id.

### DS-6 A user's public page: `GET /u/:handle` (Should)

- Lower-case `:handle`; if it does not match `^[a-z0-9]{9}$`, or `userByHandle` returns nothing, throw `notFound()`.
- `res.page('discover/user', { title: <display name or handle>, tab: null, back: '/feed' })`.
- Header: for an organization, its logo (`logo_path`, or the avatar when there is none), `display_name`, the handle, the university code and `description`; for anyone else, the avatar (`ui.avatarUrl(avatar_code)`), the handle, the university code and the bio when it is not empty. Never print `user_id` or the e-mail.
- A "Message" button linking to `/messages/new?to=<handle>`, not shown on your own page or on a banned user's page (`status = 'banned'`), because messages answers 404 to a banned handle (`WORK_DIVISION.md` §4 row 8). `userByHandle` also returns `u.status` for this.
- On your own page, a note above the list: "Only posts that show your handle appear here."
- List: `userPostIds(userId, myUniversityId, before)`: that user's live posts with `is_anonymous = 0` that I can see, newest first, `?before=` paging. **Never** an anonymous post (BR-6): listing one would tie it to the handle. Empty text: "No public posts yet." (the same words whether or not the person has anonymous posts).
- A banned user's page still exists, as their earlier posts stay in the feeds.

### DS-7 Admin announcements: `/admin/announcements`, `/admin/announcements/:id`, `/admin/announcements/:id/delete` (Should)

Every route has `requireRole('admin')` (403 for everyone else).

- **List** (`GET /admin/announcements`, title "Announcements", `back: '/me'`): `listAnnouncements()` grouped under "Current", "Scheduled" and "Expired" (in that order, each by sort order). Each row shows the title, subtitle, the window in HKT (`ui.hkt(starts_at)` to `ui.hkt(ends_at)`), the sort order, the link, and "Edit" (`/admin/announcements/:id`). An empty group shows "None". Below the groups: the "New announcement" form, which posts to `/admin/announcements`.
- **Form** (`enctype="multipart/form-data"` with `action="<%= csrfUrl('/admin/announcements') %>"`, because a multipart form carries its CSRF token in the action URL, `ARCHITECTURE.md` §6.8; route `uploads.images({ field: 'image', max: 1 })`):

  | Field | Input | Rule | Message |
  |---|---|---|---|
  | `title` | text | required, at most 60 characters | "Enter a title" / "At most 60 characters" |
  | `subtitle` | text | optional, at most 120 characters | "At most 120 characters" |
  | `image` | file | optional, one JPEG, PNG, WebP or GIF up to 5 MB | `req.uploadError` |
  | `link` | text | optional; trimmed; must match `^/(?![/\\])\S*$` and be at most 255 characters | "Use a link inside Campus Notes that starts with /, such as /events/1" |
  | `starts`, `ends` | `datetime-local` | required, read as Hong Kong time; a real date; ends after starts | "Enter a date and time" / "The end must be after the start" |
  | `sort_order` | number | 0 to 255, default 0 (lower comes first) | "Use a number from 0 to 255" |
  | `remove_image` | `toggle` (edit form only, when there is an image) | | |

  Check `sort_order` with `int` (a null result gets the message above) and the other fields with your own small checks, not `text()`, because the messages above differ from the ones `text()` gives (`ARCHITECTURE.md` §6.9). Collect `errors`, and re-render with status 400 and the values. `uploads.images` no longer answers 400 itself: when `req.uploadError` is set, show it under the image field. If validation fails after a file was uploaded, call `uploads.remove(req.files.map((f) => f.publicPath))` before re-rendering, so no orphan file is left.
- **Times:** HTML sends `2026-10-20T18:00`. Check it with `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$` and that the day exists (build `Date.UTC(y, m - 1, d)` and compare the day back: JavaScript silently turns 30 February into 2 March). `ends > starts` can be compared as strings in this fixed format. The SQL converts with `CONVERT_TZ(?, '+08:00', '+00:00')` (Hong Kong has no daylight saving time), and `getAnnouncement` returns `starts_local` and `ends_local` in the same format for the edit form.
- **Last line of defence:** the CHECKs refuse a link that does not start with one `/` and an end before the start (error 3819), and MySQL refuses an impossible date (1292). The link CHECK also refuses `/\evil.example`, which browsers open as `//evil.example`, but your own link rule above must refuse it first so the user gets a message instead of an error. Turn an unexpected 3819 or 1292 into a 400 with "Check the link and the times".
- **Create** (`POST /admin/announcements`): `createAnnouncement(fields, req.me.userId)`, then `res.done({ to: '/admin/announcements', flash: 'Announcement saved' })`.
- **Edit** (`GET` and `POST /admin/announcements/:id`): a non-numeric id or no row from `getAnnouncement` is a 404. Saving keeps the image unless a new one is uploaded or "Remove image" is on. After a successful save that replaced or removed an image under `/uploads/`, remove the old file (`uploads.remove`); seed images under `/static/seed/` are never removed. Flash "Announcement saved".
- **Delete** (`POST /admin/announcements/:id/delete`, a `--danger` button at the bottom of the edit page with `data-confirm="Delete this announcement?"`): `deleteAnnouncement(id)`; 0 rows is a 404. Remove its uploaded image as above. Flash "Announcement deleted".

## 6. `queries.js`

Each function corresponds to a block in `queries.sql`; `@variables` become `?` in the same order (the `INSERT INTO got` line in that file is test scaffolding, not part of the query). `LIMIT 21 OFFSET ?` takes the offset as a number. The `${VISIBLE}` fragment takes `req.me.universityId`.

| Function | Returns | Used by |
|---|---|---|
| `feedAllIds(myUniversityId, before)` | up to 21 post ids | DS-1 |
| `feedUniIds(myUniversityId, before)` | up to 21 post ids | DS-1 |
| `feedTopicIds(myUniversityId, topicId, before)` | up to 21 post ids | DS-1 |
| `feedWatchingIds(userId, myUniversityId, offset)` | up to 21 post ids | DS-1 |
| `hotIds(myUniversityId, offset)` | up to 21 post ids (rows also carry `hot_score`) | DS-2 |
| `currentAnnouncements()` | rows | DS-3 |
| `searchIds(expr, myUniversityId, topicId, sort, offset)` | up to 21 post ids; parameters `[expr, expr, uni, topicId, topicId, offset]` for relevance, `[expr, uni, topicId, topicId, offset]` for newest | DS-4 |
| `orgPostIds(myUniversityId)` | up to 10 post ids | DS-4 |
| `myPostIds(userId, before)` | up to 21 post ids | DS-5 |
| `myWatchingIds(userId, myUniversityId, offset)` | up to 21 post ids | DS-5 |
| `myLikedIds(userId, myUniversityId, offset)` | up to 21 post ids | DS-5 |
| `myHistoryIds(userId, myUniversityId, offset)` | up to 21 post ids | DS-5 |
| `userByHandle(handle)` | one row or null | DS-6 |
| `userPostIds(userId, myUniversityId, before)` | up to 21 post ids | DS-6 |
| `listAnnouncements()` | rows with `state` | DS-7 |
| `getAnnouncement(id)` | one row (with `starts_local`, `ends_local`) or null | DS-7 |
| `createAnnouncement(fields, adminId)` | new id | DS-7 |
| `updateAnnouncement(id, fields)` | nothing (the route checked the row exists) | DS-7 |
| `deleteAnnouncement(id)` | `affectedRows` | DS-7 |

Not SQL, but in the module: `toBooleanQuery(q)` (`modules/discover/search.js`) and `pageOf(ids, nextUrlFor)` (§5). The cards come from the backbone's `byIds` and `findVisible`.

## 7. Tests (`modules/discover/tests/`)

Call `before(resetDb)` in each file. Personas are in `DATA_MODEL.md` §5. "Lists" means the post numbers of the cards in page order.

| ID | Feature | Test |
|---|---|---|
| DS-T01 | DS-1 | As `mandy0hku`, `/feed` shows the tabs 👀, 🔥, All, HKU, Share, Random, Feelings, Academics, Careers, Trade, Food in that order with All active, and lists 600013, 600012, 600011, 600007, 600006, 600005, 600004, 600003, 600002, 600001 with no "Load more". |
| DS-T02 | DS-1 | As `wing0cuhk`, `/feed` lists 600012, 600011, 600008, 600006, 600004, 600003, 600002 and the university tab reads "CUHK"; as `jason0ust`, 600014, 600012, 600011, 600006, 600004, 600003, 600002 and "HKUST". |
| DS-T03 | DS-1 | As `mandy0hku`: `?tab=uni` lists 600013, 600012, 600007, 600006, 600005, 600002, 600001; `?tab=share` 600011, 600006; `random` 600007; `feelings` 600012, 600003; `academics` 600001; `careers` 600004; `trade` 600005; `food` 600013, 600002. |
| DS-T04 | DS-1 | As `mandy0hku`, `/feed?tab=all&before=600006` lists 600005, 600004, 600003, 600002, 600001. `/feed?tab=nonsense` is the All tab. |
| DS-T05 | DS-1 | "Load more": after 25 calls of `make.post({ author: 'newbie0hk', visibility: 'all' })`, Mandy's All tab shows 20 cards and a link `/feed?tab=all&before=<20th id>`; that page shows the other 5 new posts and the 10 seed posts (15 cards) and no link. |
| DS-T06 | DS-1 | As `mandy0hku`, `?tab=watching` lists 600012, 600004. After `make.comment({ post: 600004, author: 'jason0ust' })`, it lists 600004, 600012. As `newbie0hk`, the empty text "Tap the star on a post to watch it." appears. |
| DS-T07 | DS-2 | As `mandy0hku`, `?tab=hot` lists 600012, 600013, 600011, 600006, 600004, 600002, 600007, 600001, 600003, 600005; as `wing0cuhk`, 600012, 600011, 600006, 600004, 600008, 600002, 600003. |
| DS-T08 | DS-2 | A post made with `make.post({ author: 'mandy0hku', visibility: 'all', createdAt: <8 days ago> })` and liked by five personas (rows inserted into `post_likes` with `q()`) is absent from Hot and present on the All tab. |
| DS-T09 | DS-3 | As `mandy0hku`, `/feed` shows the banner "Film night this Friday" linking to `/events/1` and not "Welcome week"; `?tab=hot`, `?tab=uni` and `?tab=all&before=600006` show no banner. |
| DS-T10 | DS-4 | `/search?q=library` lists 600001 for `mandy0hku`, 600008 (and not 600001) for `wing0cuhk`, and the "No posts contain all of these words." text for `jason0ust`. |
| DS-T11 | DS-4 | As `mandy0hku`: `q=叉烧` lists 600002; `q=main` lists 600001; `q=Joy Hing` lists nothing (the words are only in comments); `q=Dragon's Back` lists 600011; `q=a` shows "Type at least 2 characters". |
| DS-T12 | DS-4 | As `mandy0hku`: `q=book` lists 600005, 600006; `q=book&sort=newest` lists 600006, 600005; `q=book&topic=trade` lists 600005. |
| DS-T13 | DS-4 | As `mandy0hku`: `q=%23600012` and `q=600012` answer 303 to `/posts/600012`; `q=%23600008` (CUHK only), `q=%23600009` (deleted) and `q=%23600010` (hidden) answer 200 with no results. As `wing0cuhk`, `q=%23600008` answers 303 to `/posts/600008`. |
| DS-T14 | DS-4 | As `mandy0hku`, `/search` shows a link to `/events`, "From organizations" with 600011, 600006, and the sort select has `data-autosubmit`. |
| DS-T15 | DS-5 | As `mandy0hku`: `/me/posts` lists 600013, 600005, 600001; `/me/watching` 600012, 600004; `/me/likes` 600012, 600006, 600004, 600003, 600002; `/me/history` 600012, 600004, 600006, 600002 and has a form posting to `/me/history/clear` with `data-confirm`. |
| DS-T16 | DS-5 | As `newbie0hk`, the four lists show their empty texts (§5) and `/me/history` has no "Clear history" form. |
| DS-T17 | DS-5 | As `jason0ust`, `/me/posts` lists 600014, 600004 (not the hidden 600010); as `mandy0hku`, `/me/posts?before=600005` lists 600001. |
| DS-T18 | DS-5 | As `mandy0hku`, after `POST /me/history/clear` (or, before content merges it, `UPDATE post_views SET cleared_at = UTC_TIMESTAMP() WHERE user_id = 2`), `/me/history` shows the empty state; after opening `/posts/600004`, it lists 600004 only. |
| DS-T19 | DS-1, DS-5 | Neither 600009 nor 600010 appears on any feed tab, any of the four lists, Hot, or `/search?q=mistake` and `/search?q=followers`, for any persona. |
| DS-T20 | DS-6 | As `kelvin0hk`, `/u/mandy0hku` shows "mandy0hku", "HKU", "Year 3, FinTech", lists 600013 only, and links to `/messages/new?to=mandy0hku`. As `wing0cuhk`, the same page lists nothing and says "No public posts yet." |
| DS-T21 | DS-6 | As `mandy0hku`, `/u/kelvin0hk` lists no card. As `kelvin0hk`, the page shows "Only posts that show your handle appear here." and no Message link. |
| DS-T22 | DS-6 | `/u/filmsoc00` shows "HKU Film Society" and "Weekly screenings and director talks." and lists 600006; `/u/nobody000` and `/u/Bad-Handle` answer 404. After the test bans `jason0ust` with direct SQL (`UPDATE users SET status = 'banned'`), `/u/jason0ust` as `kelvin0hk` still answers 200 and has no link to `/messages/new`. |
| DS-T23 | DS-7 | As `admin0000`, `/admin/announcements` shows "Film night this Friday" under Current, "Welcome week" under Expired and "None" under Scheduled. As `mandy0hku`, GET `/admin/announcements` and POST `/admin/announcements/1/delete` answer 403. |
| DS-T24 | DS-7 | As `admin0000`, creating "Exam week quiet hours" with link `/feed?tab=academics`, starts one hour ago and ends in two days (HKT), sort order 0, answers 303 to `/admin/announcements`; Mandy's `/feed` banner then shows it before "Film night this Friday". |
| DS-T25 | DS-7 | Creating with link `https://evil.example`, `//evil.example` or `/\evil.example`, with the end before the start, or with a 61-character title answers 400 with the message under that field; the number of announcements is unchanged. Uploading a `.txt` file as the image answers 400 with the upload message. |
| DS-T26 | privacy | For every persona except `kelvin0hk`, no smoke page of this module contains the text `kelvin0hk`; no page contains `#600009` or `#600010`. |
| DS-T27 | DS-7 | As `admin0000`, editing announcement 1's title to "Film night: Wake Up" changes the banner; the edit form shows the start time in HKT (`starts_local`). |
| DS-T28 | DS-7 | As `admin0000`, deleting announcement 1 removes it from Mandy's banner; deleting it again answers 404. |

Run them with `npm test -- modules/discover`. The SQL itself is checked by `npm run check:sql` (`queries.sql`, 91 checks).

## 8. Definition of done

- DS-T01 to DS-T28 pass, and `npm test`, `npm run lint` and `npm run check:sql` are green in CI.
- No route builds SQL from user text; the only string choice is the search `ORDER BY` from the whitelist.
- Every page checked as `mandy0hku`, `wing0cuhk`, `jason0ust`, `newbie0hk` (empty states) and `admin0000`, on a phone-width window and with JavaScript off (the sort select then needs the form's Search button).
- The feed, Hot and search pages timed after `npm run load-test` (expected: feed under 10 ms, Hot about 150 ms, search under 1 ms for a rare word).
- `USER_GUIDE.md` has screenshots; `SQL_CARD.md` is written (§9).

## 9. Presentation (SQL card)

`docs/modules/discover/SQL_CARD.md` holds one slide's worth, and the Discover owner presents it:

1. **Hot ranking** (`hotIds` in `queries.sql`): three correlated subqueries count likes, live comments (deleted and hidden ones excluded with `NOT EXISTS`) and watches per post; `TIMESTAMPDIFF` and `POW` turn age into a decay; `INTERVAL 7 DAY` bounds the window; the visibility predicate filters before ranking. Show the HKU result: 600012 at 1.34 on top, and why the hour-old 600013 is second.
2. **Full-text search:** `FULLTEXT ... WITH PARSER ngram` cuts text into 2-character pieces, so "叉烧" is found without word breaks; the index was built with stopwords off, otherwise "main" is never found (D17); boolean mode with `+"word"` makes every word required. One finding: a phrase with an apostrophe never matches, so the app splits words at punctuation.
3. **Two-step pagination** (D18): ordering and limiting the card view `v_post_cards` took 760 ms per page at 20,000 posts (390 to 450 ms on our test machine), because MySQL must build the whole view first; paging the merged view `v_live_posts` for 20 ids and then reading 20 cards by id takes about 3 ms.

## 10. Prompt for a coding agent

> You are working in the Campus Notes repository on the **discover** module only. Read `AGENTS.md`, `docs/architecture/ARCHITECTURE.md` (§1, §5, §6, §8, §9) and `docs/modules/discover/DEV_GUIDE.md`. Implement feature **DS-1** (replace with the feature you want) exactly as specified in §5 of the guide, using the SQL in `docs/modules/discover/queries.sql` (turn `@variables` into `?` placeholders in `modules/discover/queries.js`; leave out the `INSERT INTO got` test lines). Every list must take two steps: ids from `v_live_posts` with the `VISIBLE` fragment, then `byIds`; never `ORDER BY` or `LIMIT` on `v_post_cards`. Write the tests listed for that feature in §7 in `modules/discover/tests/`. Change no file outside `modules/discover/` and `docs/modules/discover/`. When done, run `npm test -- modules/discover` and `npm run lint`, and summarise what you changed and anything in the guide you could not follow.
