-- =====================================================================================
-- Content module: reference SQL (tested). Each block becomes one function in
-- modules/content/queries.js; @variables become ? placeholders in the same order.
-- Run: ONLY=modules/content DB=cn_content bash db/tests/run_all.sh  (fresh seeded database; CALL t_eq / t_err are checks)
-- Writer of: posts, post_images, post_participants, comments, post_likes, post_watches,
-- post_views. Reads: v_live_posts, v_post_cards, v_comment_items (never printing author_id).
-- Every route about a post first calls core/cards.js findVisible(postId, req.me) and answers
-- 404 when it returns null (BR-5); the blocks below assume that check has passed.
-- Order: the read-only page queries first (they pin the seed facts the tests use), then the
-- writes, which change the seed state for the blocks after them.
-- =====================================================================================
SET time_zone = '+00:00';

-- -------------------------------------------------------------------------------------
-- (core) findVisible(postId, me): NOT a content function (core/cards.js owns it), but every
-- content route starts with it. Its SQL is the card read by id plus the visibility predicate:
--   SELECT * FROM v_post_cards c WHERE c.post_id = ? AND (c.visibility = 'all' OR c.author_university_id = ?)
-- The checks pin the 404 cases the acceptance tests use (BR-5, BR-8, BR-9).
-- -------------------------------------------------------------------------------------
SET @post = 600012, @my_uni = 1;                 -- Mandy (HKU) opens the hot post
SELECT c.* FROM v_post_cards c
WHERE c.post_id = @post AND (c.visibility = 'all' OR c.author_university_id = @my_uni);

CALL t_eq('findVisible: the hot post 600012 header (avatar, topic, university, no name: anonymous)',
  (SELECT CONCAT(avatar_code, '/', topic_code, '/', author_university_code, '/', IFNULL(author_name, 'NULL'), '/', IFNULL(author_handle, 'NULL'))
   FROM v_post_cards WHERE post_id = 600012), 'tiger/feelings/HKU/NULL/NULL');
CALL t_eq('findVisible: an HKU viewer gets nothing for 600008 (CUHK only) or 600014 (HKUST only)',
  (SELECT COUNT(*) FROM v_post_cards c WHERE c.post_id IN (600008, 600014) AND (c.visibility = 'all' OR c.author_university_id = 1)), '0');
CALL t_eq('findVisible: a CUHK viewer gets nothing for HKU-only 600001 (the page and every POST answer 404)',
  (SELECT COUNT(*) FROM v_post_cards c WHERE c.post_id = 600001 AND (c.visibility = 'all' OR c.author_university_id = 2)), '0');
CALL t_eq('findVisible: deleted 600009 and hidden 600010 give nothing, even to their authors',
  (SELECT COUNT(*) FROM v_post_cards WHERE post_id IN (600009, 600010)), '0');
CALL t_eq('findVisible: 600012 is visible to all three universities',
  (SELECT COUNT(*) FROM v_post_cards c, (SELECT 1 AS u UNION SELECT 2 UNION SELECT 3) v
    WHERE c.post_id = 600012 AND (c.visibility = 'all' OR c.author_university_id = v.u)), '3');
CALL t_eq('findVisible: a named post carries the handle, an organization post its display name',
  (SELECT GROUP_CONCAT(CONCAT(post_id, ':', author_name, ':', author_handle) ORDER BY post_id SEPARATOR ' ')
   FROM v_post_cards WHERE post_id IN (600004, 600006)), '600004:jason0ust:jason0ust 600006:HKU Film Society:filmsoc00');

-- -------------------------------------------------------------------------------------
-- listImages(postId): the post's images in upload order (CT-2, CT-8)
-- -------------------------------------------------------------------------------------
SET @post = 600005;
SELECT i.position, i.file_path
FROM post_images i
WHERE i.post_id = @post
ORDER BY i.position;

CALL t_eq('listImages: 600005 has two images in position order',
  (SELECT GROUP_CONCAT(CONCAT(position, ':', file_path) ORDER BY position) FROM post_images WHERE post_id = 600005),
  '1:/static/seed/textbook-1.svg,2:/static/seed/textbook-2.svg');
CALL t_eq('listImages: 600012 has none (the page shows no image strip)',
  (SELECT COUNT(*) FROM post_images WHERE post_id = 600012), '0');

-- -------------------------------------------------------------------------------------
-- viewerState(postId, me): my like, my watch and my alias on this post (CT-2, CT-3, BR-7)
-- my_alias is NULL when I have never commented and am not the author ("a new alias").
-- is_mine is not needed here: the route compares card.author_id with req.me.userId
-- (author_id is for filtering only and is never printed).
-- -------------------------------------------------------------------------------------
SET @post = 600012, @me = 2;
SELECT EXISTS (SELECT 1 FROM post_likes   l WHERE l.user_id = @me AND l.post_id = @post) AS liked_by_me,
       EXISTS (SELECT 1 FROM post_watches w WHERE w.user_id = @me AND w.post_id = @post) AS watched_by_me,
       (SELECT pp.alias_no FROM post_participants pp WHERE pp.post_id = @post AND pp.user_id = @me) AS my_alias;

CALL t_eq('viewerState: Mandy on 600012 likes it, watches it and is Alice (1)',
  (SELECT CONCAT(EXISTS (SELECT 1 FROM post_likes WHERE user_id = 2 AND post_id = 600012), '/',
                 EXISTS (SELECT 1 FROM post_watches WHERE user_id = 2 AND post_id = 600012), '/',
                 IFNULL((SELECT alias_no FROM post_participants WHERE post_id = 600012 AND user_id = 2), 'NULL'))), '1/1/1');
CALL t_eq('viewerState: Kelvin on his own post 600012 neither likes nor watches it and is Host (0)',
  (SELECT CONCAT(EXISTS (SELECT 1 FROM post_likes WHERE user_id = 3 AND post_id = 600012), '/',
                 EXISTS (SELECT 1 FROM post_watches WHERE user_id = 3 AND post_id = 600012), '/',
                 IFNULL((SELECT alias_no FROM post_participants WHERE post_id = 600012 AND user_id = 3), 'NULL'))), '0/0/0');
CALL t_eq('viewerState: Newbie on 600012 has no like, no watch, no alias yet',
  (SELECT CONCAT(EXISTS (SELECT 1 FROM post_likes WHERE user_id = 6 AND post_id = 600012), '/',
                 EXISTS (SELECT 1 FROM post_watches WHERE user_id = 6 AND post_id = 600012), '/',
                 IFNULL((SELECT alias_no FROM post_participants WHERE post_id = 600012 AND user_id = 6), 'NULL'))), '0/0/NULL');
CALL t_eq('viewerState: Mandy likes exactly 600002, 600003, 600004, 600006, 600012',
  (SELECT GROUP_CONCAT(post_id ORDER BY post_id) FROM post_likes WHERE user_id = 2), '600002,600003,600004,600006,600012');

-- -------------------------------------------------------------------------------------
-- listThread(postId, me): the flat thread, oldest first (CT-3, BR-7, BR-8, BR-9)
-- body is NULL for deleted or hidden comments: print "[deleted]" when is_deleted, else
-- "[hidden by a moderator]" when is_hidden. reply_to_alias_no 0 means "replying to Host"
-- (test it with != null in JavaScript, never with truthiness). No handle, no author_id.
-- -------------------------------------------------------------------------------------
SET @post = 600012, @me = 2;
SELECT ci.comment_id, ci.alias_no, ci.reply_to_comment_id, ci.reply_to_alias_no,
       ci.body, ci.created_at, ci.is_deleted, ci.is_hidden,
       ci.author_id = @me AS is_mine
FROM v_comment_items ci
WHERE ci.post_id = @post
ORDER BY ci.comment_id;

-- state: t = text shown, h = hidden, d = deleted; then alias, replying-to alias, is_mine for Mandy
CALL t_eq('listThread: 600012 as Mandy: Alice, Bob, Carol (hidden), Host replying to Alice, Alice replying to Host',
  (SELECT GROUP_CONCAT(CONCAT(comment_id, ':', alias_no, ':', IFNULL(reply_to_alias_no, '-'), ':',
                              IF(is_deleted, 'd', IF(is_hidden, 'h', 't')), ':', author_id = 2) ORDER BY comment_id SEPARATOR ' ')
   FROM v_comment_items WHERE post_id = 600012),
  '10:1:-:t:1 11:2:-:t:0 12:3:-:h:0 13:0:1:t:0 14:1:0:t:1');
CALL t_eq('listThread: 600002 keeps deleted comment 6 in place (Carol, no text)',
  (SELECT GROUP_CONCAT(CONCAT(comment_id, ':', alias_no, ':', IFNULL(reply_to_alias_no, '-'), ':',
                              IF(is_deleted, 'd', IF(is_hidden, 'h', 't'))) ORDER BY comment_id SEPARATOR ' ')
   FROM v_comment_items WHERE post_id = 600002),
  '3:1:-:t 4:2:-:t 5:3:2:t 6:3:-:d');
CALL t_eq('listThread: 600003 has no comments (empty thread)',
  (SELECT COUNT(*) FROM v_comment_items WHERE post_id = 600003), '0');
CALL t_eq('listThread: hidden comment 12 and deleted comment 6 lose their text',
  (SELECT COUNT(*) FROM v_comment_items WHERE comment_id IN (6, 12) AND body IS NULL), '2');

-- -------------------------------------------------------------------------------------
-- listMyComments(me, myUniversityId, before): my comments, newest first, 20 per page (CT-7)
-- Keyset paging: ?before=<last comment_id shown>; without it, before = 4294967295 (the
-- largest INT UNSIGNED). Deleted comments are left out; hidden ones stay and show
-- "[hidden by a moderator]". Joining v_live_posts drops comments on deleted or hidden posts;
-- the visibility predicate is repeated for safety (a post's visibility never changes).
-- Each item links to /posts/<post_id>#c<comment_id>.
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1, @before = 4294967295;
SELECT ci.comment_id, ci.post_id, ci.alias_no, ci.body, ci.is_hidden, ci.created_at,
       p.body AS post_body
FROM v_comment_items ci
JOIN v_live_posts p ON p.post_id = ci.post_id
WHERE ci.author_id = @me
  AND ci.is_deleted = 0
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND ci.comment_id < @before
ORDER BY ci.comment_id DESC
LIMIT 20;

CALL t_eq('listMyComments: Mandy has 14, 10, 3, 2 with aliases Alice, Alice, Alice, Host',
  (SELECT GROUP_CONCAT(CONCAT(ci.comment_id, ':', ci.alias_no) ORDER BY ci.comment_id DESC)
   FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
   WHERE ci.author_id = 2 AND ci.is_deleted = 0 AND (p.visibility = 'all' OR p.author_university_id = 1)),
  '14:1,10:1,3:1,2:0');
CALL t_eq('listMyComments: Mandy, page 2 (?before=10) gives 3 and 2',
  (SELECT GROUP_CONCAT(ci.comment_id ORDER BY ci.comment_id DESC)
   FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
   WHERE ci.author_id = 2 AND ci.is_deleted = 0 AND (p.visibility = 'all' OR p.author_university_id = 1) AND ci.comment_id < 10),
  '3,2');
CALL t_eq('listMyComments: Jason keeps hidden comment 12 (no text, is_hidden), then 8 (Host) and 4',
  (SELECT GROUP_CONCAT(CONCAT(ci.comment_id, ':', ci.alias_no, ':', IF(ci.body IS NULL, 'hidden', 'text'), ':', ci.is_hidden) ORDER BY ci.comment_id DESC)
   FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
   WHERE ci.author_id = 5 AND ci.is_deleted = 0 AND (p.visibility = 'all' OR p.author_university_id = 3)),
  '12:3:hidden:1,8:0:text:0,4:2:text:0');
CALL t_eq('listMyComments: Wing''s deleted comment 6 is left out',
  (SELECT GROUP_CONCAT(ci.comment_id ORDER BY ci.comment_id DESC)
   FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
   WHERE ci.author_id = 4 AND ci.is_deleted = 0 AND (p.visibility = 'all' OR p.author_university_id = 2)),
  '11,7,5');
CALL t_eq('listMyComments: Newbie has none (empty state)',
  (SELECT COUNT(*) FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id WHERE ci.author_id = 6), '0');

-- -------------------------------------------------------------------------------------
-- createPost(authorId, topicId, body, isAnonymous, visibility, avatarCode, imagePaths):
-- publish in ONE transaction (CT-1, BR-7, BR-18)
-- In queries.js:
--   tx(async t => {
--     const r = await t.q(<INSERT posts>, [authorId, topicId, body, isAnonymous, visibility, avatarCode]);
--     for (const [i, p] of imagePaths.entries())                 // positions 1..n in upload order
--       await t.q(<INSERT post_images>, [r.insertId, i + 1, p]);
--     await t.q(<INSERT post_participants>, [r.insertId, authorId]);   // the author is Host (0)
--     return r.insertId;
--   })
-- The route has already trimmed and checked the body (1 to 750 characters), the topic
-- (topicId = ref.topic(code).topic_id) and the files (uploads.images, at most 6). On any
-- throw the tx rolls back and the route calls uploads.remove(paths) before re-throwing.
-- avatarCode is drawn at random from ui.avatars (the author's own avatar would identify them).
-- -------------------------------------------------------------------------------------
SET @me = 2, @topic = 6, @body = 'Selling a desk lamp, HKD 50. Pick up at Haking Wong.',
    @anon = 1, @vis = 'university', @avatar = 'owl';
START TRANSACTION;
INSERT INTO posts (author_id, topic_id, body, is_anonymous, visibility, avatar_code)
VALUES (@me, @topic, @body, @anon, @vis, @avatar);
SET @new_post = LAST_INSERT_ID();
INSERT INTO post_images (post_id, position, file_path) VALUES (@new_post, 1, '/uploads/2026/10/3f9a1c7e.jpg');
INSERT INTO post_images (post_id, position, file_path) VALUES (@new_post, 2, '/uploads/2026/10/8d02b4aa.png');
INSERT INTO post_participants (post_id, user_id, alias_no) VALUES (@new_post, @me, 0);   -- BR-7: author is Host
COMMIT;

CALL t_eq('createPost: the first post after the seed is #600015', @new_post, '600015');
CALL t_eq('createPost: its card shows topic, 2 images, the first as cover, no handle, my university only',
  (SELECT CONCAT_WS(' | ', topic_code, image_count, cover_path, IFNULL(author_handle, 'NULL'), visibility)
   FROM v_post_cards WHERE post_id = 600015), 'trade | 2 | /uploads/2026/10/3f9a1c7e.jpg | NULL | university');
CALL t_eq('createPost: the author holds alias 0 (Host) on the new post',
  (SELECT CONCAT(user_id, ':', alias_no) FROM post_participants WHERE post_id = 600015), '2:0');
CALL t_eq('createPost: created_at is UTC (DEFAULT CURRENT_TIMESTAMP with time_zone +00:00)',
  (SELECT ABS(TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())) <= 5 FROM posts WHERE post_id = 600015), '1');
CALL t_eq('createPost: an HKU-only post is invisible to a CUHK viewer (BR-5)',
  (SELECT COUNT(*) FROM v_post_cards c WHERE c.post_id = 600015 AND (c.visibility = 'all' OR c.author_university_id = 2)), '0');

-- A failure half-way rolls everything back: a 7th image breaks the CHECK, the post goes too.
-- (The app never gets here: uploads.images({ max: 6 }) keeps no file and sets
-- req.uploadError, so the route re-renders the form with 400 first. The database is the last
-- line of defence.)
START TRANSACTION;
INSERT INTO posts (author_id, topic_id, body, is_anonymous, visibility, avatar_code)
VALUES (2, 6, 'Seven photos of my room', 1, 'university', 'cat');
SET @bad_post = LAST_INSERT_ID();
CALL t_err('createPost: a 7th image is refused by the CHECK (position 1 to 6)',
  CONCAT('INSERT INTO post_images (post_id, position, file_path) VALUES (', @bad_post, ', 7, ''/uploads/x.jpg'')'), 3819);
ROLLBACK;
CALL t_eq('createPost: after the ROLLBACK the half-made post does not exist',
  (SELECT COUNT(*) FROM posts WHERE body = 'Seven photos of my room'), '0');
CALL t_err('createPost: a blank body is refused (CHECK; text() catches it first)',
  'INSERT INTO posts (author_id, topic_id, body, avatar_code) VALUES (2, 6, ''   '', ''cat'')', 3819);
CALL t_err('createPost: 751 characters is refused (VARCHAR(750), strict mode)',
  CONCAT('INSERT INTO posts (author_id, topic_id, body, avatar_code) VALUES (2, 6, ''', REPEAT('a', 751), ''', ''cat'')'), 1406);
CALL t_err('createPost: an unknown topic is refused (FK; oneOf() catches it first)',
  'INSERT INTO posts (author_id, topic_id, body, avatar_code) VALUES (2, 99, ''hello'', ''cat'')', 1452);
START TRANSACTION;                               -- the boundary, counted in characters (not bytes)
INSERT INTO posts (author_id, topic_id, body, avatar_code) VALUES (2, 6, REPEAT('字', 750), 'cat');
CALL t_eq('createPost: exactly 750 characters is accepted, even 750 Chinese characters (2,250 bytes)', ROW_COUNT(), '1');
ROLLBACK;

-- -------------------------------------------------------------------------------------
-- recordView(me, postId): one history row per (user, post), refreshed on every visit (CT-6)
-- Runs on every GET /posts/:id after findVisible, before the page is built. Every view
-- counts, including the author's (BR-10: a post's views are SUM(view_count)).
-- cleared_at = NULL puts the post back into my history after a "Clear history" (see clearHistory).
-- -------------------------------------------------------------------------------------
SET @me = 6, @post = 600003;                     -- Newbie opens Wing's post twice
INSERT INTO post_views (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = UTC_TIMESTAMP(), cleared_at = NULL;
INSERT INTO post_views (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = UTC_TIMESTAMP(), cleared_at = NULL;
CALL t_eq('recordView: two visits give one row with view_count 2, in the history (cleared_at NULL)',
  (SELECT CONCAT(COUNT(*), '/', MAX(view_count), '/', SUM(cleared_at IS NULL)) FROM post_views WHERE user_id = 6 AND post_id = 600003), '1/2/1');

SET @me = 2, @post = 600012;                     -- Mandy opens the hot post again
INSERT INTO post_views (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = UTC_TIMESTAMP(), cleared_at = NULL;
CALL t_eq('recordView: Mandy''s row for 600012 goes 4 -> 5, first_viewed_at kept, last_viewed_at now',
  (SELECT CONCAT(view_count, '/', first_viewed_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR, '/',
                 ABS(TIMESTAMPDIFF(SECOND, last_viewed_at, UTC_TIMESTAMP())) <= 5)
   FROM post_views WHERE user_id = 2 AND post_id = 600012), '5/1/1');
CALL t_eq('recordView: the card''s view count for 600012 goes 11 -> 12',
  (SELECT view_count FROM v_post_cards WHERE post_id = 600012), '12');

-- -------------------------------------------------------------------------------------
-- addComment(postId, me, body, replyTo): a comment, and on a first comment a new alias,
-- in ONE transaction (CT-3, BR-7, BR-18). The route has already run findVisible (404) and
-- text(body, { max: 500 }). In queries.js:
--   tx(async t => {
--     if (replyTo) {                                             // 1. a visible comment on THIS post
--       const ok = await t.q.one(<SELECT reply target>, [replyTo, postId]);
--       if (!ok) return { ok: false, reason: 'bad_reply' };    //    route: 400 "You can only reply to a visible comment"
--     }
--     await t.q(<SELECT ... FOR UPDATE>, [postId]);             // 2. first comments on this post queue here
--     const mine = await t.q.one(<SELECT alias>, [postId, me]); // 3. my alias, if any
--     if (!mine) await t.q(<INSERT participant>, [postId, me, postId]);   // 4. next number
--     const r = await t.q(<INSERT comment>, [postId, me, replyTo, body]); // 5.
--     return { ok: true, commentId: r.insertId };
--   })
-- Without step 2, two first comments both read the same MAX(alias_no): with 30 at once,
-- 28 of 30 failed with deadlocks. With it, aliases 1..30 and no errors (check_race_alias.sh).
-- Notifications are NOT content's job: the messages trigger trg_comment_notify fires on step 5.
-- -------------------------------------------------------------------------------------
-- Newbie's first comment on the hot post 600012: Host, Alice, Bob, Carol exist, so he is Dave (4)
SET @post = 600012, @me = 6, @body = 'Good luck! Sleep early.', @reply_to = NULL;
START TRANSACTION;
SELECT ci.comment_id FROM v_comment_items ci                              -- 1. (skipped: no reply_to)
 WHERE ci.comment_id = @reply_to AND ci.post_id = @post AND ci.body IS NOT NULL;
SELECT p.post_id FROM posts p WHERE p.post_id = @post FOR UPDATE;          -- 2. serialise alias assignment
SET @alias = NULL;                                                          --    (SELECT INTO keeps the old value on no row)
SELECT pp.alias_no INTO @alias FROM post_participants pp                    -- 3.
 WHERE pp.post_id = @post AND pp.user_id = @me;
INSERT INTO post_participants (post_id, user_id, alias_no)                  -- 4. only because @alias IS NULL
SELECT @post, @me, COALESCE(MAX(pp.alias_no), 0) + 1                        --    BR-7: order of first comment
  FROM post_participants pp WHERE pp.post_id = @post;
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body)        -- 5.
VALUES (@post, @me, @reply_to, @body);
SET @c_newbie_1 = LAST_INSERT_ID();
COMMIT;
CALL t_eq('addComment: the first comment after the seed is comment 15', @c_newbie_1, '15');
CALL t_eq('addComment: Newbie''s first comment on 600012 gets the next alias, Dave (4)',
  (SELECT alias_no FROM v_comment_items WHERE comment_id = @c_newbie_1), '4');
CALL t_eq('addComment: the messages trigger told the author (Kelvin) and the watcher (Mandy); content did nothing',
  (SELECT GROUP_CONCAT(CONCAT(recipient_id, ':', type) ORDER BY recipient_id) FROM notifications WHERE comment_id = @c_newbie_1),
  '2:comment_on_watched,3:comment_on_post');

-- His second comment, a reply to Bob (comment 11): step 1 finds the target, step 3 finds alias 4, step 4 is skipped
SET @post = 600012, @me = 6, @body = 'Bob is right, you got this.', @reply_to = 11;
START TRANSACTION;
SELECT COUNT(*) INTO @reply_ok FROM v_comment_items ci
 WHERE ci.comment_id = @reply_to AND ci.post_id = @post AND ci.body IS NOT NULL;
CALL t_eq('addComment: comment 11 is a visible comment on 600012, so the reply is allowed', @reply_ok, '1');
SELECT p.post_id FROM posts p WHERE p.post_id = @post FOR UPDATE;
SET @alias = NULL;
SELECT pp.alias_no INTO @alias FROM post_participants pp WHERE pp.post_id = @post AND pp.user_id = @me;
CALL t_eq('addComment: on his second comment Newbie already holds alias 4, so step 4 is skipped', @alias, '4');
CALL t_err('addComment: running step 4 anyway would be a duplicate participant (PK post_id, user_id)',
  'INSERT INTO post_participants (post_id, user_id, alias_no) SELECT 600012, 6, COALESCE(MAX(alias_no), 0) + 1 FROM post_participants WHERE post_id = 600012', 1062);
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (@post, @me, @reply_to, @body);
SET @c_newbie_2 = LAST_INSERT_ID();
COMMIT;
CALL t_eq('addComment: the reply keeps Dave and shows "replying to Bob" (2)',
  (SELECT CONCAT(alias_no, '/', reply_to_alias_no) FROM v_comment_items WHERE comment_id = @c_newbie_2), '4/2');
CALL t_eq('addComment: Newbie has one alias row and two comments on 600012',
  (SELECT CONCAT((SELECT COUNT(*) FROM post_participants WHERE post_id = 600012 AND user_id = 6), '/',
                 (SELECT COUNT(*) FROM comments WHERE post_id = 600012 AND author_id = 6))), '1/2');
CALL t_eq('addComment: the reply notified Bob (Wing), the author and the watcher, once each',
  (SELECT GROUP_CONCAT(CONCAT(recipient_id, ':', type) ORDER BY recipient_id) FROM notifications WHERE comment_id = @c_newbie_2),
  '2:comment_on_watched,3:comment_on_post,4:reply_to_comment');

-- First comments on 600003 (no comments yet): Newbie is Alice (1), Mandy Bob (2), the author Wing is Host
SET @post = 600003, @me = 6, @body = 'Same here. It gets better after reading week.', @reply_to = NULL;
START TRANSACTION;
SELECT p.post_id FROM posts p WHERE p.post_id = @post FOR UPDATE;
SET @alias = NULL;
SELECT pp.alias_no INTO @alias FROM post_participants pp WHERE pp.post_id = @post AND pp.user_id = @me;
INSERT INTO post_participants (post_id, user_id, alias_no)
SELECT @post, @me, COALESCE(MAX(pp.alias_no), 0) + 1 FROM post_participants pp WHERE pp.post_id = @post;
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (@post, @me, @reply_to, @body);
SET @c_alice = LAST_INSERT_ID();
COMMIT;
SET @post = 600003, @me = 2, @body = 'Call home every Sunday, it helps.', @reply_to = @c_alice;
START TRANSACTION;
SELECT COUNT(*) INTO @reply_ok FROM v_comment_items ci
 WHERE ci.comment_id = @reply_to AND ci.post_id = @post AND ci.body IS NOT NULL;
SELECT p.post_id FROM posts p WHERE p.post_id = @post FOR UPDATE;
SET @alias = NULL;
SELECT pp.alias_no INTO @alias FROM post_participants pp WHERE pp.post_id = @post AND pp.user_id = @me;
INSERT INTO post_participants (post_id, user_id, alias_no)
SELECT @post, @me, COALESCE(MAX(pp.alias_no), 0) + 1 FROM post_participants pp WHERE pp.post_id = @post;
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (@post, @me, @reply_to, @body);
SET @c_bob = LAST_INSERT_ID();
COMMIT;
SET @post = 600003, @me = 4, @body = 'Thank you both!', @reply_to = NULL;
START TRANSACTION;
SELECT p.post_id FROM posts p WHERE p.post_id = @post FOR UPDATE;
SET @alias = NULL;
SELECT pp.alias_no INTO @alias FROM post_participants pp WHERE pp.post_id = @post AND pp.user_id = @me;
CALL t_eq('addComment: the author already holds alias 0, so step 4 is skipped', @alias, '0');
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (@post, @me, @reply_to, @body);
SET @c_host = LAST_INSERT_ID();
COMMIT;
CALL t_eq('addComment: on 600003 the thread reads Alice, Bob (replying to Alice), Host',
  (SELECT GROUP_CONCAT(CONCAT(alias_no, ':', IFNULL(reply_to_alias_no, '-')) ORDER BY comment_id SEPARATOR ' ')
   FROM v_comment_items WHERE post_id = 600003), '1:- 2:1 0:-');

-- Refused replies: step 1 finds nothing, the app answers 400 and inserts nothing
CALL t_eq('addComment: reply to hidden comment 12 is refused (not visible)',
  (SELECT COUNT(*) FROM v_comment_items WHERE comment_id = 12 AND post_id = 600012 AND body IS NOT NULL), '0');
CALL t_eq('addComment: reply to deleted comment 6 on 600002 is refused',
  (SELECT COUNT(*) FROM v_comment_items WHERE comment_id = 6 AND post_id = 600002 AND body IS NOT NULL), '0');
CALL t_eq('addComment: reply to comment 1 (on 600001) from post 600012 is refused (other post)',
  (SELECT COUNT(*) FROM v_comment_items WHERE comment_id = 1 AND post_id = 600012 AND body IS NOT NULL), '0');
-- What the database itself enforces (the two composite foreign keys on comments)
CALL t_err('fk: a reply must answer a comment on the SAME post (reply_to 1 is on 600001)',
  'INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (600012, 2, 1, ''hi'')', 1452);
CALL t_err('fk: no comment without an alias first (Jason never joined 600003)',
  'INSERT INTO comments (post_id, author_id, body) VALUES (600003, 5, ''hi'')', 1452);
START TRANSACTION;
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (600002, 2, 6, 'reply to a deleted comment');
CALL t_eq('addComment: the database alone WOULD accept a reply to deleted comment 6, so the app check matters', ROW_COUNT(), '1');
ROLLBACK;
CALL t_err('addComment: 501 characters is refused (VARCHAR(500))',
  CONCAT('INSERT INTO comments (post_id, author_id, body) VALUES (600012, 2, ''', REPEAT('a', 501), ''')'), 1406);
CALL t_err('addComment: a blank comment is refused (CHECK)',
  'INSERT INTO comments (post_id, author_id, body) VALUES (600012, 2, ''  '')', 3819);

-- -------------------------------------------------------------------------------------
-- deleteComment(commentId, me): soft delete of my own comment (CT-3, BR-8)
-- 0 rows -> 404 (not mine, already deleted, or no such comment). On 1 row, read its post_id
-- and redirect to /posts/<post_id>#c<comment_id>. The comment keeps its place as "[deleted]",
-- and its author keeps the alias (BR-7: never reused). No visibility check is needed: the
-- WHERE clause only matches my own row and reveals nothing about the post.
-- -------------------------------------------------------------------------------------
SET @comment = 14, @me = 2;
UPDATE comments SET deleted_at = UTC_TIMESTAMP()
 WHERE comment_id = @comment AND author_id = @me AND deleted_at IS NULL;
CALL t_eq('deleteComment: Mandy deletes her comment 14', ROW_COUNT(), '1');
SELECT c.post_id FROM comments c WHERE c.comment_id = @comment;          -- for the redirect
CALL t_eq('deleteComment: 14 keeps its place as Alice with no text',
  (SELECT CONCAT(alias_no, '/', IFNULL(body, 'NULL'), '/', is_deleted) FROM v_comment_items WHERE comment_id = 14), '1/NULL/1');
UPDATE comments SET deleted_at = UTC_TIMESTAMP() WHERE comment_id = 14 AND author_id = 2 AND deleted_at IS NULL;
CALL t_eq('deleteComment: deleting it again changes nothing (404)', ROW_COUNT(), '0');
UPDATE comments SET deleted_at = UTC_TIMESTAMP() WHERE comment_id = 11 AND author_id = 2 AND deleted_at IS NULL;
CALL t_eq('deleteComment: Mandy cannot delete Wing''s comment 11 (404)', ROW_COUNT(), '0');
CALL t_eq('deleteComment: Mandy still holds alias 1 on 600012 (aliases are never reused)',
  (SELECT alias_no FROM post_participants WHERE post_id = 600012 AND user_id = 2), '1');
CALL t_eq('deleteComment: 600012 now counts 5 live comments (10, 11, 13 and Newbie''s two)',
  (SELECT comment_count FROM v_post_cards WHERE post_id = 600012), '5');

-- -------------------------------------------------------------------------------------
-- deletePost(postId, me): soft delete of my own post (CT-2, BR-8)
-- 0 rows -> 404. Then redirect to /feed with flash "Post deleted". Images, aliases, comments,
-- likes and views stay in the tables; every view and list stops showing the post.
-- -------------------------------------------------------------------------------------
-- Kelvin comments on Mandy's new post first, to show the comment leaving his list below
SET @post = 600015, @me = 3, @body = 'Is it still available?';
START TRANSACTION;
SELECT p.post_id FROM posts p WHERE p.post_id = @post FOR UPDATE;
SET @alias = NULL;
SELECT pp.alias_no INTO @alias FROM post_participants pp WHERE pp.post_id = @post AND pp.user_id = @me;
INSERT INTO post_participants (post_id, user_id, alias_no)
SELECT @post, @me, COALESCE(MAX(pp.alias_no), 0) + 1 FROM post_participants pp WHERE pp.post_id = @post;
INSERT INTO comments (post_id, author_id, body) VALUES (@post, @me, @body);
SET @c_kelvin = LAST_INSERT_ID();
COMMIT;
CALL t_eq('listMyComments: before the delete Kelvin''s list starts with his comment on 600015',
  (SELECT ci.comment_id = @c_kelvin FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
   WHERE ci.author_id = 3 AND ci.is_deleted = 0 ORDER BY ci.comment_id DESC LIMIT 1), '1');

SET @post = 600012, @me = 2;
UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = @post AND author_id = @me AND deleted_at IS NULL;
CALL t_eq('deletePost: Mandy cannot delete Kelvin''s post 600012 (404)', ROW_COUNT(), '0');
SET @post = 600015, @me = 2;
UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = @post AND author_id = @me AND deleted_at IS NULL;
CALL t_eq('deletePost: Mandy deletes her post 600015', ROW_COUNT(), '1');
UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = 600015 AND author_id = 2 AND deleted_at IS NULL;
CALL t_eq('deletePost: deleting it again changes nothing (404)', ROW_COUNT(), '0');
CALL t_eq('deletePost: the post leaves v_live_posts and v_post_cards (page 404, gone from feeds)',
  (SELECT CONCAT((SELECT COUNT(*) FROM v_live_posts WHERE post_id = 600015), '/', (SELECT COUNT(*) FROM v_post_cards WHERE post_id = 600015))), '0/0');
CALL t_eq('deletePost: an HKU viewer is back to 10 live posts',
  (SELECT COUNT(*) FROM v_live_posts p WHERE p.visibility = 'all' OR p.author_university_id = 1), '10');
CALL t_eq('deletePost: soft delete keeps the rows (2 images, 2 aliases, 1 comment)',
  (SELECT CONCAT((SELECT COUNT(*) FROM post_images WHERE post_id = 600015), '/',
                 (SELECT COUNT(*) FROM post_participants WHERE post_id = 600015), '/',
                 (SELECT COUNT(*) FROM comments WHERE post_id = 600015))), '2/2/1');
CALL t_eq('listMyComments: Kelvin''s comment on the deleted post is no longer listed',
  (SELECT GROUP_CONCAT(ci.comment_id ORDER BY ci.comment_id DESC)
   FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
   WHERE ci.author_id = 3 AND ci.is_deleted = 0 AND (p.visibility = 'all' OR p.author_university_id = 1)), '13,9,1');

-- -------------------------------------------------------------------------------------
-- setLike(me, postId, on): like=1 inserts, like=0 deletes; both idempotent (CT-4, BR-10)
-- ON DUPLICATE KEY UPDATE created_at = created_at makes a repeated like a no-op but, unlike
-- INSERT IGNORE, still raises foreign key errors. The app ignores affectedRows here and
-- re-reads the counts (postCounts) for res.done({ json: { liked, likeCount } }).
-- The like notification is made by the messages trigger trg_like_notify, once per liker.
-- -------------------------------------------------------------------------------------
SET @me = 6, @post = 600012;
INSERT INTO post_likes (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE created_at = created_at;
CALL t_eq('setLike: Newbie likes 600012: like_count 3 -> 4', (SELECT like_count FROM v_post_cards WHERE post_id = 600012), '4');
INSERT INTO post_likes (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE created_at = created_at;
CALL t_eq('setLike: like=1 again changes no row', ROW_COUNT(), '0');
CALL t_eq('setLike: ... and the count stays 4', (SELECT like_count FROM v_post_cards WHERE post_id = 600012), '4');
CALL t_eq('setLike: Kelvin turned like notifications off, so none for him',
  (SELECT COUNT(*) FROM notifications WHERE type = 'like_on_post' AND post_id = 600012 AND actor_id = 6), '0');
DELETE FROM post_likes WHERE user_id = @me AND post_id = @post;
CALL t_eq('setLike: like=0 removes the like: 4 -> 3', (SELECT like_count FROM v_post_cards WHERE post_id = 600012), '3');
DELETE FROM post_likes WHERE user_id = @me AND post_id = @post;
CALL t_eq('setLike: like=0 again changes no row (count stays 3)', ROW_COUNT(), '0');
CALL t_err('setLike: a bad post id still raises the foreign key error (1452)',
  'INSERT INTO post_likes (user_id, post_id) VALUES (6, 999999) ON DUPLICATE KEY UPDATE created_at = created_at', 1452);
CALL t_err('setLike: INSERT IGNORE would turn that error into a silent no-op, so it is not used',
  'INSERT IGNORE INTO post_likes (user_id, post_id) VALUES (6, 999999)', 0);

-- postCounts(postId): the counts sent back after a like or watch (card read by id only, D18)
SET @post = 600012;
SELECT c.like_count, c.watch_count FROM v_post_cards c WHERE c.post_id = @post;
CALL t_eq('postCounts: 600012 has 3 likes and 1 watch',
  (SELECT CONCAT(like_count, '/', watch_count) FROM v_post_cards WHERE post_id = 600012), '3/1');

-- -------------------------------------------------------------------------------------
-- setWatch(me, postId, on): watch=1 saves the post and follows its comments; watch=0 undoes
-- it (CT-5, D14). Same pattern as setLike; json: { watched, watchCount }.
-- discover's /me/watching lists post_watches rows (most recently active first).
-- -------------------------------------------------------------------------------------
SET @me = 6, @post = 600003;
INSERT INTO post_watches (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE created_at = created_at;
INSERT INTO post_watches (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE created_at = created_at;
CALL t_eq('setWatch: Newbie watches 600003 (twice = once): watch_count 0 -> 1',
  (SELECT watch_count FROM v_post_cards WHERE post_id = 600003), '1');
CALL t_eq('setWatch: the post is now in Newbie''s watching list (what discover reads)',
  (SELECT GROUP_CONCAT(w.post_id) FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id WHERE w.user_id = 6), '600003');
SET @post = 600003, @me = 2, @body = 'One more tip: join a hall society.';
START TRANSACTION;                               -- Mandy (Bob) comments again (steps 3-4 skipped: she has alias 2)
SELECT p.post_id FROM posts p WHERE p.post_id = @post FOR UPDATE;
INSERT INTO comments (post_id, author_id, body) VALUES (@post, @me, @body);
SET @c_watched = LAST_INSERT_ID();
COMMIT;
CALL t_eq('setWatch: a new comment notifies the watcher (Newbie) and the author (Wing)',
  (SELECT GROUP_CONCAT(CONCAT(recipient_id, ':', type) ORDER BY recipient_id) FROM notifications WHERE comment_id = @c_watched),
  '4:comment_on_post,6:comment_on_watched');
DELETE FROM post_watches WHERE user_id = 6 AND post_id = 600003;
CALL t_eq('setWatch: watch=0 removes it: watch_count 1 -> 0',
  (SELECT watch_count FROM v_post_cards WHERE post_id = 600003), '0');

-- -------------------------------------------------------------------------------------
-- clearHistory(me): "Clear history" on discover's History page posts here (CT-6)
-- Marks my rows instead of deleting them, then redirects to /me/history (flash "History
-- cleared"). The History list (discover) and the Me page's "Viewed" count (identity) read only
-- rows with cleared_at IS NULL; a post's view count (BR-10) is SUM(view_count) over ALL its
-- rows, so clearing never lowers it. 0 rows (nothing left to clear) is fine: same redirect.
-- -------------------------------------------------------------------------------------
SET @me = 2;
UPDATE post_views SET cleared_at = UTC_TIMESTAMP()
 WHERE user_id = @me AND cleared_at IS NULL;
CALL t_eq('clearHistory: Mandy''s 4 history rows are marked cleared', ROW_COUNT(), '4');
CALL t_eq('clearHistory: her history (uncleared rows) is empty, the 4 rows stay, Kelvin''s 3 are untouched',
  (SELECT CONCAT((SELECT COUNT(*) FROM post_views WHERE user_id = 2 AND cleared_at IS NULL), '/',
                 (SELECT COUNT(*) FROM post_views WHERE user_id = 2), '/',
                 (SELECT COUNT(*) FROM post_views WHERE user_id = 3 AND cleared_at IS NULL))), '0/4/3');
CALL t_eq('clearHistory: the view count of 600012 is unchanged (12): clearing never lowers it (BR-10)',
  (SELECT view_count FROM v_post_cards WHERE post_id = 600012), '12');
UPDATE post_views SET cleared_at = UTC_TIMESTAMP()
 WHERE user_id = @me AND cleared_at IS NULL;
CALL t_eq('clearHistory: clearing again changes no row (same redirect)', ROW_COUNT(), '0');

-- The next visit brings a post back (recordView sets cleared_at = NULL); the others stay cleared.
SET @me = 2, @post = 600012;
INSERT INTO post_views (user_id, post_id) VALUES (@me, @post)
ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = UTC_TIMESTAMP(), cleared_at = NULL;
CALL t_eq('clearHistory: opening 600012 again puts it back in her history (view_count 5 -> 6)',
  (SELECT CONCAT(cleared_at IS NULL, '/', view_count) FROM post_views WHERE user_id = 2 AND post_id = 600012), '1/6');
CALL t_eq('clearHistory: her history now holds only 600012',
  (SELECT GROUP_CONCAT(post_id) FROM post_views WHERE user_id = 2 AND cleared_at IS NULL), '600012');
CALL t_eq('clearHistory: the card keeps counting every visit (12 -> 13)',
  (SELECT view_count FROM v_post_cards WHERE post_id = 600012), '13');

-- -------------------------------------------------------------------------------------
-- Invariants this module must keep (checked after all the writes above)
-- -------------------------------------------------------------------------------------
CALL t_eq('invariant: every post has exactly one Host row, and it is its author',
  (SELECT COUNT(*) FROM posts p
    WHERE (SELECT COUNT(*) FROM post_participants pp WHERE pp.post_id = p.post_id AND pp.alias_no = 0) <> 1
       OR NOT EXISTS (SELECT 1 FROM post_participants pp WHERE pp.post_id = p.post_id AND pp.alias_no = 0 AND pp.user_id = p.author_id)), '0');
CALL t_eq('invariant: aliases on every post are 0..n with no gaps',
  (SELECT COUNT(*) FROM (SELECT post_id FROM post_participants GROUP BY post_id
                          HAVING MIN(alias_no) <> 0 OR MAX(alias_no) <> COUNT(*) - 1) g), '0');
CALL t_eq('invariant: images of every post are numbered 1..n with no gaps',
  (SELECT COUNT(*) FROM (SELECT post_id FROM post_images GROUP BY post_id
                          HAVING MIN(position) <> 1 OR MAX(position) <> COUNT(*)) g), '0');
