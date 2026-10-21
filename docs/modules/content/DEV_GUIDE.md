# Content module: developer guide

| | |
|---|---|
| **Owner** | Member 1 — Content: [Catherine135](https://github.com/Catherine135), self-selected in issue #1 |
| **Folder** | `modules/content/`, `docs/modules/content/` |
| **Features** | CT-1 to CT-8 (`PRODUCT_SPEC.md` §4) |
| **Read first** | `ARCHITECTURE.md` §1, §5, §6, §9; `PRODUCT_SPEC.md` BR-5 to BR-10, BR-17 and BR-18; `UI_KIT.md` §3 to §5; [responsive layout](../../architecture/RESPONSIVE.md); this guide |
| **Tested SQL** | `queries.sql` (this folder) and `check_race_alias.sh` |

You can build this module without knowing the rest of the app. Everything you need from other modules is listed in §3.

## 1. The module in one paragraph

Content is where notes are written and read. A student composes a short post (up to 750 characters and six images) under one topic, anonymous and visible to their own university by default. The post page shows the note, its images, a like (heart) and a watch (star) button, and a flat thread of comments in which everyone appears under a per-post alias: the author is "Host", the first other commenter "Alice", the next "Bob", and so on. Authors delete their own posts and comments; every visit is recorded in the reader's history. Every card in every list links to your post page, so it is the most visited page in the app. Its SQL story is the first-comment transaction: a row lock that hands out aliases correctly even when 30 people comment at the same moment.

## 2. What you own

**Tables you write:** `posts`, `post_images`, `post_participants`, `comments`, `post_likes`, `post_watches`, `post_views`. **Tables and views you read:** `v_post_cards` (by id only, through `findVisible`), `v_live_posts`, `v_comment_items`; `users` only through `req.me`; topics through `ref`.

**Routes** (from `WORK_DIVISION.md` §3):

| Method | Path | Who | Feature |
|---|---|---|---|
| GET | `/compose` | everyone | CT-1 |
| POST | `/compose` | everyone (multipart) | CT-1 |
| GET | `/posts/:id` | everyone who may see the post; records a view; `?reply=<comment_id>` pre-fills a reply | CT-2, CT-3, CT-6, CT-8 |
| POST | `/posts/:id/like` | everyone who may see the post; body `like=1` or `like=0` | CT-4 |
| POST | `/posts/:id/watch` | everyone who may see the post; body `watch=1` or `watch=0` | CT-5 |
| POST | `/posts/:id/delete` | the post's author | CT-2 |
| POST | `/posts/:id/comments` | everyone who may see the post; body `body`, optional `reply_to` | CT-3 |
| POST | `/comments/:id/delete` | the comment's author | CT-3 |
| GET | `/me/comments` | everyone; `?before=<comment_id>` | CT-7 |
| POST | `/me/history/clear` | everyone (the button is on discover's History page) | CT-6 |

**Manifest** (`modules/content/index.js`):

```js
module.exports = {
  name: 'content',
  router: require('./routes'),
  smoke: ['/compose', '/posts/600012', '/posts/600006', '/me/comments'],
};
```

Posts 600012 (anonymous, with a thread) and 600006 (an organization's post with an image) are visible to every persona, so the contract tests can open them as anyone. No `locals` hook: content adds nothing to every page.

## 3. Contracts

**You rely on** the backbone only: `q`, `q.one`, `tx` (`core/db`), `req.me` (`userId`, `handle`, `universityId`, `universityCode`, `defaultAnonymous`, `defaultVisibility`), `res.page` and `res.done` (`core/render`), `notFound` and `badRequest` (`core/errors`), `findVisible` and `VISIBLE` (`core/cards`), `ref.topics` and `ref.topic(code)` (`core/ref`), `uploads.images` and `uploads.remove` (`core/uploads`), `text`, `int`, `oneOf` and `bool` (`core/validate`), and `ui.avatars` (the list of avatar codes). Partials: `field`, `toggle`, `topic-chips`, `avatar`, `like-watch`, `confirm-dialog`, `empty`. Helpers: `ui.alias`, `ui.timeAgo`, `ui.hkt`, `ui.postNo`, `ui.excerpt`, `ui.plural`. `kit.js` attributes: `data-leave-guard`, `data-max`, `data-preview`, `data-ajax`, `data-confirm`. Image paths are stored as URLs and printed as they are: the seed's start with `/static/seed/` (files in `public/seed/`, served by the backbone's `/static` mount), uploaded ones with `/uploads/`.

**The messages module's triggers** fire on your inserts into `comments` and `post_likes` (`WORK_DIVISION.md` §4, row 2). You do nothing for notifications: never insert into `notifications`, never call messages code. If an insert of yours ever fails with error 1644 or an error naming `notifications`, that is a messages bug: report it, do not work around it.

**Others rely on you for:**
- `GET /posts/:id` for every post the viewer may see, and 404 for every other id (discover's cards and its `#600012` search jump, messages' notifications and conversations).
- `id="c<comment_id>"` on every comment element, including deleted and hidden ones, because notifications link to `/posts/:id#c:commentId` (`WORK_DIVISION.md` §4 row 4).
- The Host row: `post_participants (post_id, author_id, 0)` inserted in the same transaction as the post. Messages names both sides of a conversation by alias ("Host", "Alice", or "Visitor" when there is no row), and the comment foreign key needs it when the author comments.
- Rows exactly as the schema says: `post_likes` and `post_watches` feed the hot ranking and the Watching and Liked lists (discover); `post_views` feeds the History list (discover) and the "Viewed" count on the Me page (identity), which both show only rows with `cleared_at IS NULL`, and the posts' view counts in `v_post_cards`, which count every row; `comments` feed the "Comments" count (identity).
- `/compose` (the + tab), `/me/comments` (Me menu, `WORK_DIVISION.md` §4 row 7) and `POST /me/history/clear` (discover's History page, `WORK_DIVISION.md` §4 row 6) existing.
- Your links into messages being exactly: `/messages/new?post=:id` ("Message the host"), `/messages/new?post=:id&alias=:n` ("Message" on a comment), `/report?type=post&id=:id` and `/report?type=comment&id=:commentId` (`WORK_DIVISION.md` §4 row 3).
- Your one link into discover being exactly: the post header's author name links to `/u/<author_handle>`, and only when `card.author_name` is not null (`WORK_DIVISION.md` §4 row 14).

**Seed data for you** (`DATA_MODEL.md` §5, checked in `queries.sql`):

| What | Where |
|---|---|
| The hot post with a full thread | 600012 (Kelvin, anonymous, all universities): comments 10 to 14 by aliases Alice, Bob, Carol, Host, Alice; 12 is hidden; 13 replies to Alice (10), 14 replies to Host (13). Mandy (Alice) likes and watches it. 3 likes, 1 watch, 4 live comments. |
| A deleted comment | 600002: comments 3 to 6 (Alice, Bob, Carol, Carol); 6 is deleted; 5 replies to Bob. |
| No comments yet | 600003 (Wing, CUHK, all universities): the first commenter becomes Alice. |
| Images | 600005 (two, HKU only), 600001, 600006, 600011 (one each). |
| Shown names | 600004 shows `jason0ust`; 600006 shows "HKU Film Society"; 600013 shows `mandy0hku` (HKU only). Every other post is anonymous. |
| Not visible | 600008 (CUHK only) and 600014 (HKUST only) for an HKU viewer; 600001, 600005, 600007, 600013 (HKU only) for Wing and Jason; 600009 (deleted) and 600010 (hidden) for everyone. |
| Likes | Mandy likes 600002, 600003, 600004, 600006, 600012. |
| Comments per persona | Mandy 2, 3, 10, 14; Kelvin 1, 9, 13; Wing 5, 6 (deleted), 7, 11; Jason 4, 8, 12 (hidden). |
| Settings defaults | Mandy and Newbie: anonymous, my university. Kelvin: anonymous, all universities. Jason: handle shown, all universities. |
| No data at all | Newbie (`newbie0hk`): no posts, comments, likes, watches or history. |
| Next ids after a reset | post 600015, comment 15. |

## 4. Build plan

| By | Tasks |
|---|---|
| CP1, Sun 25 Oct | `index.js`, `routes.js`, `queries.js` with `listImages`, `viewerState`, `listThread`, `listMyComments`. `GET /posts/:id` renders the seed (header, text, images, like and watch state, the thread with aliases, labels and anchors) without its forms working yet; `GET /compose` renders the form; `GET /me/comments` lists comments (it is a Should, but it is cheap and the Me menu links to it from day one). |
| CP2, Sun 1 Nov (Must) | CT-1 publish with images; CT-2 delete and the Message and Report links; CT-3 add, reply and delete comments; CT-4 and CT-5 (AJAX and plain forms); CT-6 view recording and Clear history. Tests CT-T01 to CT-T24, CT-T27, CT-T28, CT-T30. |
| Fri 6 Nov (Should) | CT-7 paging and its tests (CT-T25, CT-T26); remaining tests; USER_GUIDE screenshots; `SQL_CARD.md`. |
| Could | CT-8 full-screen image viewer (the plain link from CP2 already satisfies the feature). |

Your shared duty in weeks 4 and 5 is the demo video (`PRODUCT_SPEC.md` §9); most of its first minute happens on your pages.

## 5. Features

### Responsive page layout (every feature)

Keep compose and comment forms within `form-width`, and post text within `readable`. Images must scale within their container; image groups and action rows wrap. Keep comments in reading order in one column, including on desktop. `hideTabs: true` on compose hides the compact tab bar; let the shared shell handle desktop navigation. Read [RESPONSIVE.md](../../architecture/RESPONSIVE.md) before adding page CSS. Do not create another sidebar/bottom bar or use a fixed 480 px page width. Keep module CSS under `modules/content/public/` and scope selectors to this module.

Every route about a post starts the same way: `const card = await findVisible(id, req.me); if (!card) throw notFound();` (BR-5). An id that is not a positive integer is also 404. Use 404, never 403, so the answer does not reveal that the post exists.

### CT-1 Compose and publish: `GET /compose`, `POST /compose` (Must)

- `res.page('content/compose', { title: 'New post', tab: 'compose', back: '/feed', hideTabs: true, errors, values })`. The compact tab bar is hidden; desktop sidebar navigation remains available.
- One form: `method="post" action="<%= csrfUrl('/compose') %>" enctype="multipart/form-data" data-leave-guard`. A multipart form carries its CSRF token in the action URL (`ARCHITECTURE.md` §6.8): the backbone checks it before any route runs and answers 403 for a missing or wrong token. Put the image input last in the form.
- Fields, top to bottom:

  | Field | Markup | Name | Notes |
  |---|---|---|---|
  | Text | `field` partial, textarea, `max: 750`, 8 rows, label "Your post" | `body` | `data-max="750"` gives the live "750 characters left" counter |
  | Images | `<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" data-preview="images">`, label "Images (up to 6)" | `images` | thumbnails and the 6-image limit in the browser |
  | Show my handle | `toggle` partial | `show_handle` | hint: "Others see mandy0hku and can open your page." (`me.handle`; an organization sees its display name) |
  | Visible to all universities | `toggle` partial | `all_universities` | hint: "Off: only HKU students can see it." (`me.universityCode`) |
  | Topic | `topic-chips` partial with `ref.topics` | `topic` | required; 7 chips in `sort_order` |
  | Publish | `btn btn-cta` submit button | | |

- First load: `values = { show_handle: !req.me.defaultAnonymous, all_universities: req.me.defaultVisibility === 'all' }` (identity's settings, `WORK_DIVISION.md` §4 row 12). After a failed submit, show the submitted values instead.
- Leave guard: when the form has changed, the back arrow (or closing the tab) asks "Leave and discard this draft?" through `confirm-dialog` (screenshot 04). Submitting does not ask.

**Publish** (`POST /compose`, route `uploads.images({ field: 'images', max: 6 })`, then your handler):

1. The backbone has already checked CSRF from the action URL (a bad token is a 403 before your handler). `uploads.images` checks the number of files (at most 6), their type (JPEG, PNG, WebP, GIF) and their size (5 MB each) (BR-18). If any of those fails, it keeps no file, sets `req.files = []` and `req.uploadError` (a message, `ARCHITECTURE.md` §6.8), and still calls your handler. Otherwise `req.files` holds the saved files in upload order.
2. Validate: `if (req.uploadError) errors.images = req.uploadError;`, then `text(req.body.body, { max: 750, label: 'Your post' }, errors, 'body')` (trimmed; blank or too long is an error), `oneOf(req.body.topic, ref.topics.map(t => t.code), errors, 'topic', 'Pick a topic')`, `bool(req.body.show_handle)`, `bool(req.body.all_universities)`.
3. On any error: `uploads.remove(paths)` (files saved for a form that fails on another field must not stay on disk), then `res.status(400).page('content/compose', { errors, values: req.body, ... })`. The draft (text, topic, switches) is kept. The image field shows `errors.images`; when there is no upload error but files had been sent, it shows "Please add your images again." instead, because a browser cannot pre-fill a file input.
4. `createPost(req.me.userId, { topicId: ref.topic(topic).topic_id, body, isAnonymous: !showHandle, visibility: allUniversities ? 'all' : 'university', avatarCode: <random from ui.avatars>, imagePaths })`: one `tx()` that inserts the post, its images (positions 1 to n in upload order) and the Host row (`queries.sql`).
5. If it throws, call `uploads.remove(paths)` and re-throw (the error page answers 500).
6. `res.done({ to: '/posts/' + id, flash: 'Posted' })`.

Rules: BR-5 (visibility), BR-6 (anonymous by default; "Show my handle" shows the handle, or an organization's display name), BR-7 (the author is Host from the start), BR-18 (limits). Posts cannot be edited (D11), so there is no edit page.

Decided here: the post's avatar is drawn at random from `ui.avatars` for every post, never the author's profile avatar, which would identify an anonymous author. The body is stored trimmed; line breaks inside it are kept.

| Case | Answer |
|---|---|
| Blank text (spaces or line breaks only) | 400, "Your post cannot be blank" (the `text()` message, `ARCHITECTURE.md` §6.9) under the text field; topic and toggles kept |
| 751 characters or more | 400, "Your post is too long (at most 750 characters)"; exactly 750 is accepted. Characters are counted, not bytes: 750 Chinese characters are fine |
| No topic, or an unknown code | 400, "Pick a topic" under the chips |
| 7 images, a wrong file type, a file over 5 MB | 400, the compose page with the draft kept and `req.uploadError` ("Up to 6 images, JPEG, PNG, WebP or GIF, 5 MB each.") under the image field; no file kept, nothing inserted (`kit.js` normally stops the first case in the browser) |
| Missing or wrong CSRF token | 403 from the backbone, before your handler |
| A database error during publish | the transaction rolls back, the files are removed, 500 |

### CT-2 Post page: `GET /posts/:id`, `POST /posts/:id/delete` (Must)

1. `findVisible(id, req.me)`; null means 404 (deleted, hidden, another university only, or no such post).
2. `recordView(req.me.userId, id)` (CT-6) before anything else is loaded.
3. Load `listImages(id)`, `viewerState(id, me.userId)` and `listThread(id, me.userId)` (they are independent; `Promise.all` is fine).
4. `isMine = card.author_id === req.me.userId`. `author_id` is for this comparison only; never print it.
5. `res.page('content/post', { title: '#' + id, tab: null, back: '/feed', card, images, state, thread, isMine, replyTo, errors: {}, values: {} })`.

Keep steps 3 to 5 in one helper (`showPost`), because a failed comment re-renders the same page (CT-3).

The page, top to bottom:

| Part | Shows |
|---|---|
| Header | `avatar` partial with `card.avatar_code`; `ui.postNo(id)`; a topic chip (`topic_name_en`); `ui.timeAgo(card.created_at)` (with `title="<ui.hkt(created_at, true)>"`); `author_university_code`. Only when `card.author_name` is not null: `<a href="/u/<%= card.author_handle %>"><%= card.author_name %></a>`. Nothing else about the author, ever (BR-6). |
| Text | `card.body`, escaped, with line breaks kept (`white-space: pre-wrap`) |
| Images | thumbnails in position order, each a link to its file (CT-8) |
| Actions | `like-watch` partial (`postId`, `liked: state.liked_by_me`, `watched: state.watched_by_me`, `likeCount`, `watchCount` from the card); "Message the host" → `/messages/new?post=:id` and "Report" → `/report?type=post&id=:id`, both hidden when `isMine` |
| Thread | CT-3 |
| Delete | only when `isMine`: a `--danger` button at the bottom, `<form method="post" action="/posts/:id/delete" data-confirm="Delete this post? This cannot be undone.">` |

**Delete** (`POST /posts/:id/delete`): `deletePost(id, me.userId)`; 0 rows means 404 (not yours, already deleted, or no such post). Then `res.done({ to: '/feed', flash: 'Post deleted' })`. The rows stay (soft delete, BR-8): the views drop the post from every list, its page answers 404, and its notifications and conversations keep working as messages decides.

Rules: BR-5, BR-6, BR-8, BR-9, BR-17. The author of an anonymous post sees it anonymous too (Kelvin's own post shows no handle). Liking or watching your own post is allowed; the trigger never notifies you about yourself.

### CT-3 Comments, replies and deleting: `POST /posts/:id/comments`, `POST /comments/:id/delete` (Must)

**The thread** (in the post page, `listThread`, oldest first):

- Heading: `ui.plural(card.comment_count, 'comment')` (deleted and hidden comments are not counted, BR-10). Empty thread: "No comments yet. Be the first."
- One `<article class="comment" id="c<comment_id>">` per row, deleted and hidden ones included:

  | Part | Shows |
  |---|---|
  | Name | `ui.alias(alias_no)`; class `is-host` when `alias_no === 0` (highlighted); "(you)" after it when `is_mine` |
  | Reply line | "replying to <`ui.alias(reply_to_alias_no)`>", linking to `#c<reply_to_comment_id>`, when `reply_to_alias_no != null`. Alias 0 means "replying to Host": never test it for truthiness |
  | Text | `body`; or "[deleted]" when `is_deleted`; otherwise "[hidden by a moderator]" when `is_hidden` (a comment both hidden and deleted shows "[deleted]") |
  | Time | `ui.timeAgo(created_at)` |
  | Actions | only when `body !== null`: **Reply** → `?reply=<comment_id>#comment-box`; **Message** → `/messages/new?post=:id&alias=<alias_no>` unless `is_mine`; **Report** → `/report?type=comment&id=<comment_id>` unless `is_mine`; **Delete** (a form posting to `/comments/<comment_id>/delete`, `data-confirm="Delete this comment?"`) when `is_mine` |

  Because "Message" and "Report" are hidden on your own comments, you can never message or report yourself, whether you are the Host or a commenter.

- The comment box, `id="comment-box"`, below the thread:
  - First line: "You will appear as Host" (`state.my_alias === 0`), "You will appear as Alice" (any other number, through `ui.alias`), or "You will appear under a new alias" (`null`). Never predict the next alias: two people may be about to take it.
  - When `?reply=<n>` names a row of this thread whose `body` is not null: "Replying to Bob" with a "Cancel" link (`/posts/:id#comment-box`) and `<input type="hidden" name="reply_to" value="n">`. Any other value is ignored silently. No JavaScript is needed.
  - `<form method="post" action="/posts/:id/comments">`, a `field` textarea `body` with `max: 500` (live counter) and 3 rows, a "Send" button.

**Add a comment** (`POST /posts/:id/comments`):

1. `findVisible` → 404.
2. `text(req.body.body, { max: 500, label: 'Your comment' }, errors, 'body')`; `reply_to` through `int()`, empty meaning "not a reply".
3. On an error: re-render with `showPost` and status 400, the message under the box and the text kept. No view is recorded on a re-render.
4. `addComment(id, me.userId, body, replyTo)`, one `tx()` (`queries.sql`):
   1. if `replyTo`: it must be a comment on this post whose `body` is not null in `v_comment_items`; otherwise return `{ ok: false, reason: 'bad_reply' }` and the route re-renders as in step 3 with "You can only reply to a visible comment";
   2. `SELECT post_id FROM posts WHERE post_id = ? FOR UPDATE`: first comments on the same post queue here;
   3. `SELECT alias_no FROM post_participants WHERE post_id = ? AND user_id = ?`;
   4. if there is no row: `INSERT INTO post_participants (post_id, user_id, alias_no) SELECT ?, ?, COALESCE(MAX(alias_no), 0) + 1 FROM post_participants WHERE post_id = ?`;
   5. `INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (?, ?, ?, ?)`.
5. `res.done({ to: '/posts/' + id + '#c' + commentId })`. The anchor scrolls to the new comment; no flash.

Why the lock: without step 2, two first comments read the same `MAX(alias_no)`. `check_race_alias.sh` fires 30 simultaneous first comments: with the lock they get aliases 1 to 30 and no errors; without it 28 of 30 fail with deadlocks. Never compute the alias outside the transaction, and never retry by catching duplicate keys instead of locking.

**Delete a comment** (`POST /comments/:id/delete`): `deleteComment(commentId, me.userId)` runs the soft-delete `UPDATE ... WHERE comment_id = ? AND author_id = ? AND deleted_at IS NULL`; 0 rows means 404. It returns the comment's `post_id`, and the route answers `res.done({ to: '/posts/' + postId + '#c' + commentId, flash: 'Comment deleted' })`. Decided here: no visibility check, because the `WHERE` matches only your own row and reveals nothing about the post.

Rules: BR-7 (aliases in order of first comment; the author is Host even on a post that shows the handle; an alias is never reused, so deleting every comment keeps it), BR-8 (a deleted comment keeps its place), BR-9 (hidden comments), BR-13 (notifications come from the messages trigger, not from you), BR-18 (500 characters).

| Case | Answer |
|---|---|
| Blank comment, or more than 500 characters | 400, the post page with "Your comment cannot be blank" or "Your comment is too long (at most 500 characters)" (the `text()` messages) under the box, the text kept |
| `reply_to` hidden, deleted, on another post, or unknown | 400, "You can only reply to a visible comment"; nothing inserted (the database alone would accept a reply to a deleted comment, so this check matters) |
| Commenting on a post you cannot see, or that was just deleted | 404 |
| Double-clicking Send | two comments (no rule forbids it); both under the same alias |
| The 27th commenter on a post | "Alice 2" (`ui.alias` handles it) |

### CT-4 Like and CT-5 Watch: `POST /posts/:id/like`, `POST /posts/:id/watch` (Must)

- `findVisible` → 404. `on = bool(req.body.like)` (or `req.body.watch`): the form always says what it wants, so a double click cannot undo itself.
- `setLike(me.userId, id, on)`: `like=1` runs `INSERT ... ON DUPLICATE KEY UPDATE created_at = created_at` (a repeat is a no-op); `like=0` runs the `DELETE` (a repeat deletes nothing). Do not use `INSERT IGNORE`: it would also turn a foreign key error into a silent no-op.
- Re-read the counts with `postCounts(id)`, then `res.done({ to: '/posts/' + id, json: { liked: on, likeCount } })`; for watch, `json: { watched: on, watchCount }`. With `kit.js` the `like-watch` partial updates in place; without JavaScript the form redirects back to the post.
- A like is what the hot ranking counts (BR-12, discover); the messages trigger notifies the author once per liker (BR-13). A watch saves the post to Watching (discover's `/me/watching`) and subscribes to its comments (the trigger again, D14).

### CT-6 History and Clear history: `POST /me/history/clear` (Must)

- Every successful `GET /posts/:id` runs `recordView` (step 2 of CT-2): one row per person and post (`INSERT ... ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = UTC_TIMESTAMP(), cleared_at = NULL`). Every view counts, the author's too. A 404 records nothing; a 400 re-render records nothing. Setting `cleared_at` back to NULL puts a post you open again back into your history.
- `POST /me/history/clear`: `clearHistory(me.userId)` marks the rows instead of deleting them (`UPDATE post_views SET cleared_at = UTC_TIMESTAMP() WHERE user_id = ? AND cleared_at IS NULL`), then `res.done({ to: '/me/history', flash: 'History cleared' })`. Clearing an empty history changes 0 rows and answers the same. The History list is discover's page; its button posts here.
- The History list (discover) and the Me page's "Viewed" count (identity) show only rows with `cleared_at IS NULL`. A post's view count is `SUM(view_count)` over all its rows, cleared or not (BR-10), so clearing your history never lowers it.

### CT-7 My comments: `GET /me/comments` (Should)

- `res.page('content/my-comments', { title: 'My comments', tab: 'me', back: '/me', items, nextUrl })`.
- `listMyComments(me.userId, me.universityId, before)`: my comments that are not deleted, on posts that are live and visible, newest first, 20 per page. `before` is `int(req.query.before)` or 4294967295 when absent or invalid.
- Each item is one link to `/posts/<post_id>#c<comment_id>` and shows "as Alice" (`ui.alias(alias_no)`; "as Host" on my own posts), the text or "[hidden by a moderator]", `ui.timeAgo(created_at)`, and the post's `ui.postNo(post_id)` with `ui.excerpt(post_body, 60)`.
- "Load more" (`/me/comments?before=<last comment_id>`) when the page has 20 items.
- Empty state (`partials/empty`): "You have not commented on anything yet." with a button "Browse the feed" → `/feed`.
- Comments on posts that were deleted or hidden afterwards disappear from the list (their page would be 404).

### CT-8 Image viewer (Could)

- From CP2: each thumbnail is `<a href="<%= img.file_path %>">`, which opens the image full size; the browser's back button returns. This already satisfies the feature.
- If time allows: a full-screen overlay in `modules/content/public/content.js` (served at `/m/content/content.js`) that opens on tap, swipes between the post's images and closes with a button or Escape. The plain link keeps working without JavaScript.

## 6. `queries.js`

Each function corresponds to a block in `queries.sql`; `@variables` become `?` in the same order. `findVisible` is not yours: import it from `core/cards`.

| Function | Returns | Used by |
|---|---|---|
| `listImages(postId)` | rows `{ position, file_path }` | CT-2, CT-8 |
| `viewerState(postId, userId)` | `{ liked_by_me, watched_by_me, my_alias }` (`my_alias` null if none) | CT-2, CT-3 |
| `listThread(postId, userId)` | rows with `alias_no`, `reply_to_alias_no`, `body`, `is_deleted`, `is_hidden`, `is_mine` | CT-3 |
| `listMyComments(userId, universityId, before)` | up to 20 rows | CT-7 |
| `createPost(authorId, { topicId, body, isAnonymous, visibility, avatarCode, imagePaths })` | new post id | CT-1 |
| `recordView(userId, postId)` | nothing (upsert; also sets `cleared_at` back to NULL) | CT-6 |
| `addComment(postId, userId, body, replyTo)` | `{ ok: true, commentId }` or `{ ok: false, reason: 'bad_reply' }` | CT-3 |
| `deleteComment(commentId, userId)` | the comment's `post_id`, or null | CT-3 |
| `deletePost(postId, userId)` | `affectedRows` | CT-2 |
| `setLike(userId, postId, on)` | nothing | CT-4 |
| `setWatch(userId, postId, on)` | nothing | CT-5 |
| `postCounts(postId)` | `{ like_count, watch_count }` | CT-4, CT-5 |
| `clearHistory(userId)` | `affectedRows` (rows newly marked `cleared_at`; 0 is fine) | CT-6 |

`listMyComments` may use the `VISIBLE` fragment from `core/cards` (it aliases `v_live_posts` as `p`, as the fragment expects).

## 7. Tests (`modules/content/tests/`)

Call `before(resetDb)` in each file. Personas are in `DATA_MODEL.md` §5. After a reset the next post is 600015 and the next comment 15, but read new ids from the `Location` header where you can.

| ID | Feature | Test |
|---|---|---|
| CT-T01 | CT-1 | As `mandy0hku`, `/compose` answers 200 with no tab bar; the form has `data-leave-guard` and `enctype="multipart/form-data"`; the textarea `body` has `data-max="750"`; the file input has `data-preview`; there are 7 topic chips; neither toggle is on. |
| CT-T02 | CT-1 | Defaults from Settings: `jason0ust`'s `/compose` has both toggles on; `kelvin0hk`'s only "Visible to all universities"; `newbie0hk`'s neither. After `UPDATE users SET default_anonymous = 0 WHERE handle = 'newbie0hk'`, Newbie's "Show my handle" is on. |
| CT-T03 | CT-1 | `mandy0hku` publishes "Selling a desk lamp, HKD 50." under `trade` with two PNG files (`a.png`, then `b.png`), toggles off: 303 to `/posts/600015`, flash "Posted". The page shows `#600015`, the Trade chip, two images in upload order and no handle. In the database: `post_images` positions 1 and 2, `post_participants (600015, 2, 0)`, `is_anonymous = 1`, `visibility = 'university'`. |
| CT-T04 | CT-1 | `wing0cuhk` gets 404 on `/posts/600015`. Mandy then publishes with both toggles on: the new post shows `mandy0hku` linking to `/u/mandy0hku`, and Wing can open it. |
| CT-T05 | CT-1 | A body of three spaces with one image: 400, an error under the text field, the topic still selected, no new post, and the uploaded file removed again (no new file in `UPLOAD_DIR`). 751 characters: 400. Exactly 750: 303. |
| CT-T06 | CT-1 | No topic: 400 with "Pick a topic"; no new post. |
| CT-T07 | CT-1 | Seven images with a valid body and topic: 400, the compose page with the text and topic kept and "Up to 6 images, JPEG, PNG, WebP or GIF, 5 MB each." under the image field. One `notes.txt` (`text/plain`): the same. In both cases no new post and no file left in `UPLOAD_DIR`. A compose POST without a CSRF token: 403. |
| CT-T08 | CT-2 | As `mandy0hku`, `/posts/600012` shows `#600012`, "Feelings", "HKU" and no handle; the heart is on with 3, the star on with 1; "Message the host" links to `/messages/new?post=600012`; "Report" to `/report?type=post&id=600012`; there is no Delete button. As `kelvin0hk` (the author): a Delete button, no "Message the host", no post Report link. |
| CT-T09 | CT-2 | Privacy: as `mandy0hku`, the HTML of `/posts/600012` contains none of `kelvin0hk`, `wing0cuhk`, `jason0ust`. `/posts/600004` shows `jason0ust` linking to `/u/jason0ust`; `/posts/600006` shows "HKU Film Society". |
| CT-T10 | CT-3 | As `mandy0hku`, `/posts/600012` shows `.comment` elements `#c10` to `#c14` named Alice, Bob, Carol, Host, Alice. `#c12` says "[hidden by a moderator]" and has no Reply, Message, Report or Delete. `#c13` says "replying to Alice", `#c14` "replying to Host". `#c10` and `#c14` have Delete and no Message; `#c11` has Message → `/messages/new?post=600012&alias=2`; `#c13` → `alias=0`. The box says "You will appear as Alice". `/posts/600002` shows `#c6` as "[deleted]". |
| CT-T11 | CT-2 | As `mandy0hku`, these answer 404: `/posts/600008` (CUHK only), `/posts/600014` (HKUST only), `/posts/600009` (her own deleted post), `/posts/600010` (hidden), `/posts/999999`, `/posts/abc`. |
| CT-T12 | CT-2, CT-3, CT-4, CT-5 | As `wing0cuhk` on HKU-only 600001: `GET` 404; `POST /posts/600001/like` with `like=1` 404; `POST /posts/600001/watch` with `watch=1` 404; `POST /posts/600001/comments` with `body=hi` 404. Wing has no row for 600001 in `post_likes`, `post_watches`, `post_participants`, `comments` or `post_views`. |
| CT-T13 | CT-3 | `newbie0hk` comments "Good luck!" on 600012: 303 to `/posts/600012#c15`; `#c15` is named Dave and the box now says "You will appear as Dave". A second comment is also Dave; `post_participants` has one row for (600012, Newbie). |
| CT-T14 | CT-3 | On 600003 (no comments): `newbie0hk`'s first comment is Alice, then `mandy0hku`'s is Bob. `wing0cuhk` (the author) sees "You will appear as Host" and her comment is named Host. |
| CT-T15 | CT-3 | `GET /posts/600012?reply=11` as `newbie0hk` shows "Replying to Bob" and a hidden `reply_to` of 11. Posting with `reply_to=11` gives a comment that says "replying to Bob". `?reply=12` (hidden) shows no reply line. |
| CT-T16 | CT-3 | As `newbie0hk`, refused replies answer 400 with "You can only reply to a visible comment": `reply_to=12` on 600012 (hidden), `reply_to=6` on 600002 (deleted), `reply_to=1` on 600012 (a comment on 600001). No comment is added and Newbie has no `post_participants` row on 600002 or 600012. |
| CT-T17 | CT-3 | As `newbie0hk` on 600012: a blank comment and a 501-character comment each answer 400 with the text kept in the box; no comment and no `post_participants` row are added. |
| CT-T18 | CT-3 | `mandy0hku` deletes comment 14: 303 to `/posts/600012#c14`; `#c14` shows "[deleted]" in its place; the heading goes from "4 comments" to "3 comments"; her next comment is still Alice. Deleting 14 again: 404. |
| CT-T19 | CT-2, CT-3 | `mandy0hku` posts to `/posts/600012/delete`: 404, and the post still opens. She posts to `/comments/11/delete` (Wing's): 404, and `#c11` still shows its text. |
| CT-T20 | CT-2 | `mandy0hku` deletes 600013: 303 to `/feed` with "Post deleted"; `/posts/600013` answers 404 for her and for `kelvin0hk`; `/feed` has no link to `/posts/600013`; deleting again answers 404. |
| CT-T21 | CT-4 | As `newbie0hk` on 600012, with `newbie.json('/posts/600012/like', { like: 1 })` and so on (`ARCHITECTURE.md` §10): `like=1` → `{ liked: true, likeCount: 4 }`; `like=1` again → `{ liked: true, likeCount: 4 }`; `like=0` → `{ liked: false, likeCount: 3 }`; `like=0` again → `{ liked: false, likeCount: 3 }`. A plain `newbie.form(...)` with `like=1` answers 303 to `/posts/600012`. |
| CT-T22 | CT-5 | As `newbie0hk` on 600003: `watch=1` → `{ watched: true, watchCount: 1 }` and `/me/watching` contains a link to `/posts/600003` (discover renders it); `watch=0` → `{ watched: false, watchCount: 0 }` and the link is gone. |
| CT-T23 | CT-6 | `newbie0hk` opens `/posts/600003` twice: one `post_views` row with `view_count` 2. `mandy0hku` opens `/posts/600012`: her row goes from 4 to 5. Mandy's 404 on `/posts/600008` records nothing. |
| CT-T24 | CT-6 | After a reset, `mandy0hku` posts to `/me/history/clear`: 303 to `/me/history`; her 4 `post_views` rows remain but none has `cleared_at IS NULL`; `kelvin0hk`'s 3 rows are untouched; the view count of 600012 in `v_post_cards` stays 11. Clearing again also answers 303. Mandy then opens `/posts/600012`: her row has `cleared_at` NULL again and `view_count` 5, and the card's view count is 12. |
| CT-T25 | CT-7 | `mandy0hku`'s `/me/comments` lists comments 14, 10, 3, 2 in that order, "as Alice", "as Alice", "as Alice", "as Host", linking to `/posts/600012#c14`, `/posts/600012#c10`, `/posts/600002#c3`, `/posts/600001#c2`; `?before=10` lists 3 and 2 only. `jason0ust`'s list shows comment 12 as "[hidden by a moderator]"; `wing0cuhk`'s leaves out comment 6. |
| CT-T26 | CT-7 | `newbie0hk`'s `/me/comments` shows the empty state. `kelvin0hk` comments on 600005 and the comment is first in his list; after `mandy0hku` deletes 600005 it is gone from his list. |
| CT-T27 | CT-3 | Anchors: `/posts/600012` has elements with ids `c10` to `c14`; `/posts/600002` has `c3` to `c6`, the deleted one included. |
| CT-T28 | CT-3 | Concurrency through HTTP: 20 HKU users made with `make.user()` (HKU is the default university), each logged in with `agentAs(handle)`, post a first comment on 600003 at once (`Promise.all`). All 20 answer 303; `post_participants` for 600003 holds aliases 0 to 20 with no gap or repeat; 600003 has 20 comments. |
| CT-T29 | CT-8 | As `mandy0hku` (600005 is HKU only), on `/posts/600005` the two thumbnails link to `/static/seed/textbook-1.svg` and `/static/seed/textbook-2.svg`, in that order. |
| CT-T30 | CT-3 | A comment POST without a CSRF token answers 403, and nothing is inserted. |

Run them with `npm test -- modules/content`. The SQL itself is checked by `npm run check:sql` (`queries.sql` and the 30-commenter race).

## 8. Definition of done

- The [responsive acceptance checklist](../../architecture/RESPONSIVE.md#acceptance-checks-for-every-page) passes: no horizontal document overflow, appropriate navigation, readable forms, wrapping long text, visible focus and touch targets at least 44 px high. Add phone and desktop screenshots to the PR.

- CT-T01 to CT-T30 pass, and `npm test`, `npm run lint` and `npm run check:sql` are green in CI.
- Every page checked as `mandy0hku`, `kelvin0hk`, `wing0cuhk` and `newbie0hk`, at 390, 768 and 1440 CSS pixels, and with JavaScript off (compose still publishes, like and watch redirect back, Reply still works through `?reply=`).
- No handle appears on an anonymous post's page for anyone, including its author (CT-T09 and the contract privacy test).
- `USER_GUIDE.md` has screenshots, and its §10 matches what the pages really print (the blank and too-long messages come from `core/validate`; copy their exact wording into the guide); `SQL_CARD.md` is written (§9).

## 9. Presentation (SQL card)

`docs/modules/content/SQL_CARD.md` holds one slide's worth:

1. The first-comment transaction (the five steps of `addComment`), with three talking points: `SELECT ... FOR UPDATE` on the post row makes first comments on one post queue, so each reads the latest `MAX(alias_no)`; the alias is assigned once and kept for ever (BR-7); `UNIQUE (post_id, alias_no)` and the `(post_id, user_id)` primary key are the last line of defence.
2. The race result from `check_race_alias.sh`: 30 simultaneous first comments get aliases 1 to 30 with no errors; the same 30 without the lock fail 28 times with deadlock 1213 (each client holds a shared lock on the post's alias rows from `INSERT ... SELECT MAX(...)` and waits for the other's to insert).
3. The two composite foreign keys on `comments`: `(post_id, author_id) → post_participants` forces "every commenter has an alias on that post", and `(reply_to_comment_id, post_id) → comments (comment_id, post_id)` forces "a reply answers a comment on the same post" (the recursive relationship *replies to*, with roles). Show both failing with error 1452.

## 10. Prompt for a coding agent

> You are working in the Campus Notes repository on the **content** module only. Read `AGENTS.md`, `docs/architecture/RESPONSIVE.md`, `docs/architecture/ARCHITECTURE.md` (§1, §5, §6, §9), `docs/architecture/UI_KIT.md` (§3 to §5) and `docs/modules/content/DEV_GUIDE.md`. Implement feature **CT-3** (replace with the feature you want) exactly as specified in §5 of the guide, using the SQL in `docs/modules/content/queries.sql` (turn `@variables` into `?` placeholders in `modules/content/queries.js`). Every route about a post starts with `findVisible(id, req.me)` and answers 404 when it returns null. Never print `author_id`, an e-mail, or a handle that the views return as NULL. Write the tests listed for that feature in §7 in `modules/content/tests/`. Change no file outside `modules/content/` and `docs/modules/content/`. When done, run `npm test -- modules/content` and `npm run lint`, check the changed pages at 390, 768 and 1440 px with JavaScript on and off, and summarise what you changed and anything in the guide you could not follow.
