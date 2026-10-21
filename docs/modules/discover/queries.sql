-- =====================================================================================
-- Discover module: reference SQL (tested). Each block becomes one function in
-- modules/discover/queries.js; @variables become ? placeholders in the same order.
-- Run: ONLY=modules/discover DB=cn_discover bash db/tests/run_all.sh
-- Writer of: announcements. Reads (never writes): v_live_posts, v_post_cards, post_watches,
-- post_likes, post_views, comments, hidden_content, users, organizations, universities.
--
-- Every list takes two steps (decision D18, ARCHITECTURE §6.5):
--   step 1 (the blocks below): up to 21 post_ids from v_live_posts p, filtered with the
--          visibility fragment cards.VISIBLE = (p.visibility = 'all' OR p.author_university_id = ?)
--          plus the list's own filter, ordered and limited. 21 = a page of 20 plus one, so the
--          page knows whether to show "Load more" without a COUNT query.
--   step 2 (core): cards.byIds(ids.slice(0, 20)) reads v_post_cards WHERE post_id IN (?) and
--          returns the cards in the order of ids.
-- Never ORDER BY or LIMIT on v_post_cards: MySQL materialises it (760 ms instead of 3 ms per
-- page at 20,000 posts).
--
-- LIMIT and OFFSET: the mysql client does not accept @variables there, so the blocks show
-- literals; queries.js passes them as ? (OFFSET = (page - 1) * 20).
-- Keyset pages: the first page passes before = 4294967295 (the largest INT UNSIGNED), so every
-- keyset query has one shape; "Load more" passes the 20th id of the current page.
--
-- Test scaffolding (not app code): each step-1 SELECT runs as "INSERT INTO got (...) SELECT ..."
-- so the check reads exactly the ids the app would get, in order (got.seq follows the ORDER BY).
-- queries.js runs only the SELECT part. t_got(name, expected) compares and empties got.
-- =====================================================================================
SET time_zone = '+00:00';

CREATE TEMPORARY TABLE got (
  seq     INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT UNSIGNED NOT NULL,
  score   DOUBLE NULL                          -- hot score or relevance, when the query has one
);
DROP PROCEDURE IF EXISTS t_got;
DELIMITER $$
CREATE PROCEDURE t_got(IN p_name VARCHAR(200), IN p_expected TEXT)
BEGIN
  CALL t_eq(p_name, (SELECT IFNULL(GROUP_CONCAT(post_id ORDER BY seq), '') FROM got), p_expected);
  DELETE FROM got;
END$$
DELIMITER ;

-- Full-text relevance divides by the table's row-count statistic. Right after a reset the
-- statistic can still read 0 rows, and MATCH(...) AGAINST then scores every hit as infinity
-- (shown as 0; "Out of range" when stored), so relevance order is lost. Tested: forcing
-- mysql.innodb_table_stats.n_rows = 0 reproduces it; ANALYZE TABLE fixes it. The seed now ends
-- with the same statement; it is repeated here so this file also works on its own.
ANALYZE TABLE posts;

-- =====================================================================================
-- DS-1 Feed tabs: all, uni, topic (newest first, keyset), watching (offset)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- feedAllIds(myUniversityId, before): the All tab, every post I can see, newest first
-- (DS-1, BR-5, BR-8, BR-9, BR-11). "Load more": /feed?tab=all&before=<20th id>.
-- v_live_posts already drops deleted (600009) and hidden (600010) posts.
-- -------------------------------------------------------------------------------------
SET @my_uni = 1, @before = 4294967295;           -- Mandy (HKU), first page
INSERT INTO got (post_id)
SELECT p.post_id
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
  AND p.post_id < @before
ORDER BY p.post_id DESC
LIMIT 21;
CALL t_got('feedAllIds: an HKU viewer sees 10 live posts, newest first (no 600008, 600009, 600010, 600014)',
  '600013,600012,600011,600007,600006,600005,600004,600003,600002,600001');

SET @my_uni = 2, @before = 4294967295;           -- Wing (CUHK)
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('feedAllIds: a CUHK viewer sees 7 (shared posts and the CUHK-only 600008)',
  '600012,600011,600008,600006,600004,600003,600002');

SET @my_uni = 3, @before = 4294967295;           -- Jason (HKUST)
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('feedAllIds: an HKUST viewer sees 7 (shared posts and the HKUST-only 600014)',
  '600014,600012,600011,600006,600004,600003,600002');

SET @my_uni = 1, @before = 600006;               -- Mandy, "Load more" after 600006
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('feedAllIds: keyset page with before=600006 continues with the older posts',
  '600005,600004,600003,600002,600001');

-- -------------------------------------------------------------------------------------
-- (core) cards.byIds(ids): step 2, shown once. queries.js does not repeat it; the route calls
-- byIds(ids.slice(0, 20)). Read by post_id only, so MySQL builds just these rows.
-- author_handle and author_name are NULL for anonymous posts (BR-6): print nothing else.
-- -------------------------------------------------------------------------------------
SELECT post_id, topic_code, author_university_code, author_handle, author_name, author_is_org,
       like_count, watch_count, comment_count, cover_path, image_count, created_at
FROM v_post_cards
WHERE post_id IN (600013, 600012, 600011);
CALL t_eq('byIds: the named post shows its handle, the anonymous one nothing, the club its name',
  (SELECT GROUP_CONCAT(CONCAT(post_id, ':', IFNULL(author_name, '-')) ORDER BY FIELD(post_id, 600013, 600012, 600011))
   FROM v_post_cards WHERE post_id IN (600013, 600012, 600011)),
  '600013:mandy0hku,600012:-,600011:CUHK Hiking Club');

-- -------------------------------------------------------------------------------------
-- feedUniIds(myUniversityId, before): the "HKU" tab, posts by authors from my university
-- (DS-1, BR-11). Both visibilities are visible to me here; VISIBLE stays so every list has it.
-- -------------------------------------------------------------------------------------
SET @my_uni = 1, @before = 4294967295;
INSERT INTO got (post_id)
SELECT p.post_id
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
  AND p.author_university_id = @my_uni
  AND p.post_id < @before
ORDER BY p.post_id DESC
LIMIT 21;
CALL t_got('feedUniIds: Mandy''s HKU tab has the 7 live HKU posts (Film Society included)',
  '600013,600012,600007,600006,600005,600002,600001');

SET @my_uni = 2, @before = 4294967295;
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.author_university_id = @my_uni AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('feedUniIds: Wing''s CUHK tab', '600011,600008,600003');

-- -------------------------------------------------------------------------------------
-- feedTopicIds(myUniversityId, topicId, before): one topic tab (DS-1, BR-11)
-- topicId = ref.topic(code).topic_id; an unknown tab value falls back to All in the route.
-- Index ix_posts_topic (topic_id, post_id) serves the filter and the order.
-- -------------------------------------------------------------------------------------
SET @my_uni = 1, @topic = 4, @before = 4294967295;    -- academics
INSERT INTO got (post_id)
SELECT p.post_id
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
  AND p.topic_id = @topic
  AND p.post_id < @before
ORDER BY p.post_id DESC
LIMIT 21;
CALL t_got('feedTopicIds: Mandy''s Academics tab (600008 is CUHK-only, 600014 HKUST-only)', '600001');

SET @topic = 2;                                       -- random
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.topic_id = @topic AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('feedTopicIds: Random has 600007 only (600009 deleted, 600010 hidden)', '600007');

SET @topic = 7;                                       -- food
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.topic_id = @topic AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('feedTopicIds: Food', '600013,600002');

-- -------------------------------------------------------------------------------------
-- feedWatchingIds(me, myUniversityId, offset): the 👀 tab, posts I watch, most recently
-- active first (DS-1, BR-11). Last activity = the newest comment that is not deleted, or the
-- post's own time when it has none. Offset paging (?page=): the sort key changes over time.
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1;                        -- Mandy watches 600004 and 600012
INSERT INTO got (post_id)
SELECT p.post_id
FROM post_watches w
JOIN v_live_posts p ON p.post_id = w.post_id
WHERE w.user_id = @me
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
ORDER BY COALESCE((SELECT MAX(c.created_at) FROM comments c
                    WHERE c.post_id = p.post_id AND c.deleted_at IS NULL), p.created_at) DESC,
         p.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('feedWatchingIds: Mandy, 600012 (comment 90 min ago) before 600004 (68 h ago)', '600012,600004');

SET @me = 3, @my_uni = 1;                        -- Kelvin watches 600001 and 600006
INSERT INTO got (post_id)
SELECT p.post_id FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id
WHERE w.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY COALESCE((SELECT MAX(c.created_at) FROM comments c WHERE c.post_id = p.post_id AND c.deleted_at IS NULL), p.created_at) DESC, p.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('feedWatchingIds: Kelvin, 600006 (comment 40 h ago) before 600001 (141 h ago)', '600006,600001');

SET @me = 6, @my_uni = 1;                        -- Newbie watches nothing
INSERT INTO got (post_id)
SELECT p.post_id FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id
WHERE w.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY COALESCE((SELECT MAX(c.created_at) FROM comments c WHERE c.post_id = p.post_id AND c.deleted_at IS NULL), p.created_at) DESC, p.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('feedWatchingIds: Newbie gets the empty state', '');

-- Rolled back: a new comment moves a post up; watched deleted or hidden posts never show.
START TRANSACTION;
INSERT INTO comments (post_id, author_id, body) VALUES (600004, 5, 'Update: I got the offer!');  -- Jason is Host on 600004
INSERT INTO post_watches (user_id, post_id) VALUES (2, 600009), (2, 600010);                   -- deleted, hidden
SET @me = 2, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id
WHERE w.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY COALESCE((SELECT MAX(c.created_at) FROM comments c WHERE c.post_id = p.post_id AND c.deleted_at IS NULL), p.created_at) DESC, p.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('feedWatchingIds: a new comment on 600004 moves it to the top; 600009 and 600010 stay out', '600004,600012');
ROLLBACK;

-- =====================================================================================
-- DS-2 Hot (BR-12)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- hotIds(myUniversityId, offset): posts from the last 7 days ranked by
--   (likes + 2 x comments + 3 x watches + 1) / (hours since posting + 2) ^ 1.5
-- ties to the newer post (DS-2, BR-12). Comments exclude deleted and hidden ones (BR-10).
-- Correlated subqueries count each post's rows through the indexes ix_likes_post,
-- ix_comments_post and ix_watches_post. Offset paging (?page=). The score is selected only
-- for debugging and for this check; the route uses the ids.
-- Seed (HKU viewer): 600012 = (3 + 2x4 + 3x1 + 1) / (3 + 2)^1.5 = 15 / 11.18 = 1.34.
-- -------------------------------------------------------------------------------------
SET @my_uni = 1;
INSERT INTO got (post_id, score)
SELECT p.post_id,
       ( (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)
       + 2 * (SELECT COUNT(*) FROM comments c
               WHERE c.post_id = p.post_id AND c.deleted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM hidden_content h
                                  WHERE h.target_type = 'comment' AND h.target_id = c.comment_id))
       + 3 * (SELECT COUNT(*) FROM post_watches w WHERE w.post_id = p.post_id)
       + 1 )
       / POW(TIMESTAMPDIFF(MINUTE, p.created_at, UTC_TIMESTAMP()) / 60 + 2, 1.5) AS hot_score
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
  AND p.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
ORDER BY hot_score DESC, p.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_eq('hotIds: 600012 scores 1.3 (15 points, 3 hours old; the hidden comment 12 is not counted)',
  (SELECT ROUND(score, 1) FROM got WHERE post_id = 600012), '1.3');
CALL t_got('hotIds: HKU viewer order (top 5: 600012, 600013, 600011, 600006, 600004)',
  '600012,600013,600011,600006,600004,600002,600007,600001,600003,600005');

SET @my_uni = 2;
INSERT INTO got (post_id, score)
SELECT p.post_id,
       ((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)
        + 2 * (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id AND c.deleted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM hidden_content h WHERE h.target_type = 'comment' AND h.target_id = c.comment_id))
        + 3 * (SELECT COUNT(*) FROM post_watches w WHERE w.post_id = p.post_id) + 1)
       / POW(TIMESTAMPDIFF(MINUTE, p.created_at, UTC_TIMESTAMP()) / 60 + 2, 1.5) AS hot_score
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
ORDER BY hot_score DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('hotIds: CUHK viewer order', '600012,600011,600006,600004,600008,600002,600003');

SET @my_uni = 3;
INSERT INTO got (post_id, score)
SELECT p.post_id,
       ((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)
        + 2 * (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id AND c.deleted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM hidden_content h WHERE h.target_type = 'comment' AND h.target_id = c.comment_id))
        + 3 * (SELECT COUNT(*) FROM post_watches w WHERE w.post_id = p.post_id) + 1)
       / POW(TIMESTAMPDIFF(MINUTE, p.created_at, UTC_TIMESTAMP()) / 60 + 2, 1.5) AS hot_score
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
ORDER BY hot_score DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('hotIds: HKUST viewer order (the 30-minute-old 600014 is second)', '600012,600014,600011,600006,600004,600002,600003');

-- Offset pages do not overlap: with a page size of 2, page 2 is OFFSET 2 (the app uses 20).
SET @my_uni = 1;
INSERT INTO got (post_id, score)
SELECT p.post_id,
       ((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)
        + 2 * (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id AND c.deleted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM hidden_content h WHERE h.target_type = 'comment' AND h.target_id = c.comment_id))
        + 3 * (SELECT COUNT(*) FROM post_watches w WHERE w.post_id = p.post_id) + 1)
       / POW(TIMESTAMPDIFF(MINUTE, p.created_at, UTC_TIMESTAMP()) / 60 + 2, 1.5) AS hot_score
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
ORDER BY hot_score DESC, p.post_id DESC LIMIT 2 OFFSET 2;
CALL t_got('hotIds: OFFSET 2 LIMIT 2 gives the third and fourth posts', '600011,600006');

-- Rolled back: a post older than 7 days leaves Hot (it stays in All).
START TRANSACTION;
UPDATE posts SET created_at = created_at - INTERVAL 2 DAY WHERE post_id = 600001;   -- now 8 days old
INSERT INTO got (post_id, score)
SELECT p.post_id,
       ((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)
        + 2 * (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id AND c.deleted_at IS NULL
                 AND NOT EXISTS (SELECT 1 FROM hidden_content h WHERE h.target_type = 'comment' AND h.target_id = c.comment_id))
        + 3 * (SELECT COUNT(*) FROM post_watches w WHERE w.post_id = p.post_id) + 1)
       / POW(TIMESTAMPDIFF(MINUTE, p.created_at, UTC_TIMESTAMP()) / 60 + 2, 1.5) AS hot_score
FROM v_live_posts p
WHERE (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
ORDER BY hot_score DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_eq('hotIds: an 8-day-old post is not ranked', (SELECT COUNT(*) FROM got WHERE post_id = 600001), '0');
DELETE FROM got;
ROLLBACK;

-- =====================================================================================
-- DS-3 Announcement banner (top of the All tab)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- currentAnnouncements(): what the banner shows now, in sort order (DS-3)
-- Each one links to link_url when it is set (an internal path; the CHECK guarantees it).
-- -------------------------------------------------------------------------------------
SELECT a.announcement_id, a.title, a.subtitle, a.image_path, a.link_url
FROM announcements a
WHERE a.starts_at <= UTC_TIMESTAMP() AND a.ends_at > UTC_TIMESTAMP()
ORDER BY a.sort_order, a.announcement_id;
CALL t_eq('currentAnnouncements: only announcement 1 is current (2 has expired)',
  (SELECT GROUP_CONCAT(CONCAT(announcement_id, ' ', IFNULL(link_url, '-')) ORDER BY sort_order, announcement_id) FROM announcements
   WHERE starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()), '1 /events/1');

-- =====================================================================================
-- DS-4 Search
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- (core) cards.findVisible(id, me) decides the #id jump: q matching ^#?\d{6,7}$ redirects (303)
-- to /posts/:id only when the post is live and visible to me; otherwise q is searched as text.
-- The same rule on v_live_posts, to show the seed's answers:
-- -------------------------------------------------------------------------------------
SET @id = 600012, @my_uni = 1;
SELECT p.post_id FROM v_live_posts p
WHERE p.post_id = @id AND (p.visibility = 'all' OR p.author_university_id = @my_uni);
CALL t_eq('#id jump: #600012 is visible to HKU, #600008 is not, deleted #600009 and hidden #600010 are not',
  (SELECT GROUP_CONCAT(p.post_id) FROM v_live_posts p
    WHERE p.post_id IN (600012, 600008, 600009, 600010) AND (p.visibility = 'all' OR p.author_university_id = 1)), '600012');
CALL t_eq('#id jump: #600008 is visible to a CUHK viewer',
  (SELECT COUNT(*) FROM v_live_posts p WHERE p.post_id = 600008 AND (p.visibility = 'all' OR p.author_university_id = 2)), '1');

-- -------------------------------------------------------------------------------------
-- searchIds(expr, myUniversityId, topicId, offset), sort = relevance (DS-4, BR-5, D17)
-- expr is built in JavaScript by toBooleanQuery(q) (DEV_GUIDE §5, DS-4): every character that is
-- not a letter or digit (this includes the operators + - < > ( ) ~ * " @) becomes a space, words
-- shorter than 2 characters are dropped, and each word becomes +"word" (every word must appear;
-- the ngram parser matches Chinese without spaces). topicId NULL = every topic.
-- MATCH works through the merged view v_live_posts and uses ft_posts_body (EXPLAIN type fulltext).
-- -------------------------------------------------------------------------------------
SET @expr = '+"library"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance
FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE)
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('searchIds: "library" for an HKU viewer finds 600001', '600001');

SET @expr = '+"library"', @my_uni = 2, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: "library" for a CUHK viewer finds their own 600008, never the HKU-only 600001', '600008');

SET @expr = '+"library"', @my_uni = 3, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: "library" for an HKUST viewer finds nothing', '');

SET @expr = '+"叉烧"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: Chinese "叉烧" finds 600002', '600002');

SET @expr = '+"main"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: "main" finds 600001 (stopwords are off, D17)', '600001');

SET @expr = '+"Joy" +"Hing"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: "Joy Hing" finds no post (it is only in comments; only posts are searched)', '');

SET @expr = '+"curry" +"noodles"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: two words that both appear ("curry noodles") find 600013', '600013');

SET @expr = '+"curry" +"library"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: every word must appear ("curry library" is in no single post)', '');

SET @expr = '+"600008"', @my_uni = 1, @topic = NULL;   -- "#600008" typed by an HKU viewer: not visible, so searched as text
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: "#600008" for an HKU viewer is an ordinary search with no result', '');

SET @expr = '+"mistake"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: the deleted post 600009 is never found ("mistake")', '');

SET @expr = '+"followers"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: the hidden post 600010 is never found ("followers")', '');

-- Why toBooleanQuery splits words at punctuation: a phrase with an apostrophe never matches
-- under the ngram parser, even when the post contains exactly that text (600011: "Dragon's Back").
CALL t_eq('search: the phrase "Dragon''s" finds nothing, although 600011 contains it',
  (SELECT COUNT(*) FROM v_live_posts p WHERE MATCH(p.body) AGAINST ('+"Dragon''s"' IN BOOLEAN MODE)), '0');
CALL t_eq('search: split at punctuation, "Dragon''s Back" becomes +"Dragon" +"Back" (the "s" is dropped) and finds 600011',
  (SELECT GROUP_CONCAT(p.post_id) FROM v_live_posts p WHERE MATCH(p.body) AGAINST ('+"Dragon" +"Back"' IN BOOLEAN MODE)), '600011');
CALL t_eq('search: parts of words match too ("night" also finds "midnight" in 600001)',
  (SELECT GROUP_CONCAT(p.post_id ORDER BY p.post_id) FROM v_live_posts p WHERE MATCH(p.body) AGAINST ('+"night"' IN BOOLEAN MODE)), '600001,600006');

-- relevance and newest differ: "book" is in "textbook" (600005) and "Book a ticket" (600006)
SET @expr = '+"book"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds (relevance): "book" ranks the shorter post 600005 first', '600005,600006');

SET @expr = '+"book"', @my_uni = 1, @topic = 6;        -- trade
INSERT INTO got (post_id, score)
SELECT p.post_id, MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AS relevance FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE) AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY relevance DESC, p.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('searchIds: the topic filter (Trade) keeps 600005 only', '600005');

-- -------------------------------------------------------------------------------------
-- searchIds(..., sort = newest): same filter, newest first. queries.js picks one of the two
-- ORDER BY clauses from a whitelist (relevance | newest); never from user text.
-- -------------------------------------------------------------------------------------
SET @expr = '+"book"', @my_uni = 1, @topic = NULL;
INSERT INTO got (post_id)
SELECT p.post_id
FROM v_live_posts p
WHERE MATCH(p.body) AGAINST (@expr IN BOOLEAN MODE)
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
  AND (@topic IS NULL OR p.topic_id = @topic)
ORDER BY p.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('searchIds (newest): "book" lists 600006 first', '600006,600005');

-- -------------------------------------------------------------------------------------
-- orgPostIds(myUniversityId): "From organizations" on the empty search page (DS-4)
-- The 10 newest live posts I can see whose author is an organization and that show the name.
-- Anonymous organization posts stay out: listing them here would reveal who wrote them (BR-6).
-- -------------------------------------------------------------------------------------
SET @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id
FROM v_live_posts p
JOIN users u ON u.user_id = p.author_id
WHERE u.role = 'organization'
  AND p.is_anonymous = 0
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
ORDER BY p.post_id DESC
LIMIT 10;
CALL t_got('orgPostIds: the hiking club and the film society, newest first', '600011,600006');

-- Rolled back: an anonymous club post never shows; an HKU-only club post shows to HKU only.
START TRANSACTION;
INSERT INTO posts (post_id, author_id, topic_id, body, is_anonymous, visibility, avatar_code)
VALUES (600901, 7, 1, 'Anonymous note from a club account', 1, 'all', 'film'),
       (600902, 7, 1, 'Members only: committee meeting on Monday', 0, 'university', 'film');
SET @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p JOIN users u ON u.user_id = p.author_id
WHERE u.role = 'organization' AND p.is_anonymous = 0 AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY p.post_id DESC LIMIT 10;
CALL t_got('orgPostIds: HKU sees the new named HKU-only post, not the anonymous one', '600902,600011,600006');
SET @my_uni = 2;
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p JOIN users u ON u.user_id = p.author_id
WHERE u.role = 'organization' AND p.is_anonymous = 0 AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY p.post_id DESC LIMIT 10;
CALL t_got('orgPostIds: CUHK sees neither new post', '600011,600006');
ROLLBACK;

-- =====================================================================================
-- DS-5 My lists
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- myPostIds(me, before): my live posts, anonymous ones included (only I see this page),
-- newest first, keyset (DS-5, BR-8). My own posts are always visible to me (same university).
-- -------------------------------------------------------------------------------------
SET @me = 2, @before = 4294967295;
INSERT INTO got (post_id)
SELECT p.post_id
FROM v_live_posts p
WHERE p.author_id = @me
  AND p.post_id < @before
ORDER BY p.post_id DESC
LIMIT 21;
CALL t_got('myPostIds: Mandy has 600013, 600005, 600001 (600009 is deleted)', '600013,600005,600001');

SET @me = 2, @before = 600005;
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p WHERE p.author_id = @me AND p.post_id < @before ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('myPostIds: keyset page after 600005', '600001');

SET @me = 5, @before = 4294967295;
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p WHERE p.author_id = @me AND p.post_id < @before ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('myPostIds: Jason does not see his hidden spam post 600010', '600014,600004');

SET @me = 6, @before = 4294967295;
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p WHERE p.author_id = @me AND p.post_id < @before ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('myPostIds: Newbie gets the empty state', '');

-- -------------------------------------------------------------------------------------
-- myWatchingIds(me, myUniversityId, offset): posts I watch, latest watch first (DS-5, D14)
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id
FROM post_watches w
JOIN v_live_posts p ON p.post_id = w.post_id
WHERE w.user_id = @me
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
ORDER BY w.created_at DESC, w.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('myWatchingIds: Mandy watched 600012 (150 min ago) after 600004 (3 days ago)', '600012,600004');

SET @me = 6, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id
WHERE w.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY w.created_at DESC, w.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myWatchingIds: Newbie gets the empty state', '');

-- -------------------------------------------------------------------------------------
-- myLikedIds(me, myUniversityId, offset): posts I liked, latest like first (DS-5)
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id
FROM post_likes l
JOIN v_live_posts p ON p.post_id = l.post_id
WHERE l.user_id = @me
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
ORDER BY l.created_at DESC, l.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('myLikedIds: Mandy''s five likes, latest first', '600012,600006,600004,600003,600002');

SET @me = 3, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM post_likes l JOIN v_live_posts p ON p.post_id = l.post_id
WHERE l.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY l.created_at DESC, l.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myLikedIds: Kelvin''s four likes, latest first', '600006,600004,600003,600001');

SET @me = 6, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM post_likes l JOIN v_live_posts p ON p.post_id = l.post_id
WHERE l.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY l.created_at DESC, l.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myLikedIds: Newbie gets the empty state', '');

-- -------------------------------------------------------------------------------------
-- myHistoryIds(me, myUniversityId, offset): posts I opened, last visit first (DS-5, CT-6)
-- "Clear history" is a form on this page that POSTs to content's /me/history/clear, which sets
-- cleared_at on my rows (view counts stay, BR-10); my next visit to a post sets it back to NULL.
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id
FROM post_views v
JOIN v_live_posts p ON p.post_id = v.post_id
WHERE v.user_id = @me
  AND v.cleared_at IS NULL                                           -- "Clear history" sets cleared_at (CT-6)
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
ORDER BY v.last_viewed_at DESC, v.post_id DESC
LIMIT 21 OFFSET 0;
CALL t_got('myHistoryIds: Mandy, last visit first (20 min, 1 day, 46 h, 4 days ago)', '600012,600004,600006,600002');

SET @me = 6, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM post_views v JOIN v_live_posts p ON p.post_id = v.post_id
WHERE v.user_id = @me AND v.cleared_at IS NULL AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY v.last_viewed_at DESC, v.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myHistoryIds: Newbie gets the empty state', '');

-- Rolled back: content's "Clear history" empties the list; a later visit brings that post back.
START TRANSACTION;
UPDATE post_views SET cleared_at = UTC_TIMESTAMP() WHERE user_id = 2 AND cleared_at IS NULL;   -- content: clearHistory
SET @me = 2, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM post_views v JOIN v_live_posts p ON p.post_id = v.post_id
WHERE v.user_id = @me AND v.cleared_at IS NULL AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY v.last_viewed_at DESC, v.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myHistoryIds: after "Clear history" Mandy''s list is empty', '');
UPDATE post_views SET last_viewed_at = UTC_TIMESTAMP(), view_count = view_count + 1, cleared_at = NULL
 WHERE user_id = 2 AND post_id = 600004;                                                      -- content: recordView
INSERT INTO got (post_id)
SELECT p.post_id FROM post_views v JOIN v_live_posts p ON p.post_id = v.post_id
WHERE v.user_id = @me AND v.cleared_at IS NULL AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY v.last_viewed_at DESC, v.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myHistoryIds: visiting 600004 again lists it again', '600004');
CALL t_eq('myHistoryIds: clearing kept the view counts (600012 still counts Mandy''s 4 visits)',
  (SELECT SUM(view_count) FROM post_views WHERE post_id = 600012), '11');
ROLLBACK;

-- Rolled back: history, likes and watches of a post that was later hidden disappear from the lists.
START TRANSACTION;
INSERT INTO post_views (user_id, post_id) VALUES (2, 600010);
INSERT INTO post_likes (user_id, post_id) VALUES (2, 600010);
SET @me = 2, @my_uni = 1;
INSERT INTO got (post_id)
SELECT p.post_id FROM post_views v JOIN v_live_posts p ON p.post_id = v.post_id
WHERE v.user_id = @me AND v.cleared_at IS NULL AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY v.last_viewed_at DESC, v.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myHistoryIds: a visit to the hidden 600010 is not listed', '600012,600004,600006,600002');
INSERT INTO got (post_id)
SELECT p.post_id FROM post_likes l JOIN v_live_posts p ON p.post_id = l.post_id
WHERE l.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
ORDER BY l.created_at DESC, l.post_id DESC LIMIT 21 OFFSET 0;
CALL t_got('myLikedIds: a like on the hidden 600010 is not listed', '600012,600006,600004,600003,600002');
ROLLBACK;

-- =====================================================================================
-- DS-6 A user's public page
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- userByHandle(handle): the header of /u/:handle (DS-6). No row = 404.
-- The route lower-cases the handle and answers 404 without a query unless it matches
-- ^[a-z0-9]{9}$. user_id is for the next query only and is never printed. status hides
-- the Message button on a banned user's page (messages answers 404 for a banned handle).
-- -------------------------------------------------------------------------------------
SET @handle = 'filmsoc00';
SELECT u.user_id, u.handle, u.role, u.status, u.avatar_code, u.bio, un.code AS university_code,
       o.display_name, o.description, o.logo_path
FROM users u
JOIN universities un      ON un.university_id = u.university_id
LEFT JOIN organizations o ON o.user_id = u.user_id
WHERE u.handle = @handle;
CALL t_eq('userByHandle: an organization shows its display name and description',
  (SELECT CONCAT(o.display_name, ' / ', o.description, ' / ', un.code) FROM users u
     JOIN universities un ON un.university_id = u.university_id LEFT JOIN organizations o ON o.user_id = u.user_id
    WHERE u.handle = 'filmsoc00'), 'HKU Film Society / Weekly screenings and director talks. / HKU');
CALL t_eq('userByHandle: a student shows handle, university and bio, no organization name',
  (SELECT CONCAT(u.handle, ' / ', un.code, ' / ', u.bio, ' / ', IFNULL(o.display_name, '-')) FROM users u
     JOIN universities un ON un.university_id = u.university_id LEFT JOIN organizations o ON o.user_id = u.user_id
    WHERE u.handle = 'mandy0hku'), 'mandy0hku / HKU / Year 3, FinTech / -');
CALL t_eq('userByHandle: an unknown handle gives no row (404)',
  (SELECT COUNT(*) FROM users WHERE handle = 'nobody000'), '0');
START TRANSACTION;
UPDATE users SET status = 'banned' WHERE handle = 'jason0ust';   -- no banned user in the seed
CALL t_eq('userByHandle: a banned user still has a page, with status banned (no Message button)',
  (SELECT CONCAT(u.handle, ' / ', u.status) FROM users u
     JOIN universities un ON un.university_id = u.university_id LEFT JOIN organizations o ON o.user_id = u.user_id
    WHERE u.handle = 'jason0ust'), 'jason0ust / banned');
ROLLBACK;

-- -------------------------------------------------------------------------------------
-- userPostIds(userId, myUniversityId, before): that user's live posts that show the handle
-- and that I can see, newest first, keyset (DS-6, BR-5, BR-6). NEVER anonymous posts.
-- -------------------------------------------------------------------------------------
SET @user = 2, @my_uni = 1, @before = 4294967295;    -- /u/mandy0hku seen by an HKU viewer
INSERT INTO got (post_id)
SELECT p.post_id
FROM v_live_posts p
WHERE p.author_id = @user
  AND p.is_anonymous = 0                                             -- BR-6
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni)    -- ${VISIBLE}
  AND p.post_id < @before
ORDER BY p.post_id DESC
LIMIT 21;
CALL t_got('userPostIds: /u/mandy0hku for HKU lists 600013 only (600001, 600005 are anonymous)', '600013');

SET @user = 2, @my_uni = 2, @before = 4294967295;    -- the same page seen by Wing (CUHK)
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE p.author_id = @user AND p.is_anonymous = 0 AND (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('userPostIds: /u/mandy0hku for CUHK lists nothing (600013 is HKU-only)', '');

SET @user = 3, @my_uni = 1, @before = 4294967295;    -- /u/kelvin0hk: Kelvin is always anonymous
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE p.author_id = @user AND p.is_anonymous = 0 AND (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('userPostIds: /u/kelvin0hk lists nothing, not even for an HKU viewer', '');

SET @user = 5, @my_uni = 3, @before = 4294967295;    -- /u/jason0ust seen by Jason himself
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE p.author_id = @user AND p.is_anonymous = 0 AND (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('userPostIds: Jason''s own page lists 600004 only (600014 anonymous, 600010 hidden)', '600004');

SET @user = 7, @my_uni = 2, @before = 4294967295;    -- /u/filmsoc00 seen by Wing
INSERT INTO got (post_id)
SELECT p.post_id FROM v_live_posts p
WHERE p.author_id = @user AND p.is_anonymous = 0 AND (p.visibility = 'all' OR p.author_university_id = @my_uni) AND p.post_id < @before
ORDER BY p.post_id DESC LIMIT 21;
CALL t_got('userPostIds: /u/filmsoc00 lists 600006', '600006');

-- =====================================================================================
-- DS-7 Admin: announcements (requireRole('admin') on every route)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- listAnnouncements(): every announcement with its state, grouped current, scheduled,
-- expired, then by sort order (DS-7). The page prints one group per state.
-- -------------------------------------------------------------------------------------
SELECT a.announcement_id, a.title, a.subtitle, a.image_path, a.link_url, a.starts_at, a.ends_at, a.sort_order,
       CASE WHEN a.starts_at > UTC_TIMESTAMP() THEN 'scheduled'
            WHEN a.ends_at  <= UTC_TIMESTAMP() THEN 'expired'
            ELSE 'current' END AS state
FROM announcements a
ORDER BY FIELD(state, 'current', 'scheduled', 'expired'), a.sort_order, a.announcement_id;
CALL t_eq('listAnnouncements: 1 is current, 2 has expired',
  (SELECT GROUP_CONCAT(CONCAT(announcement_id, ':', state) ORDER BY FIELD(state, 'current', 'scheduled', 'expired'), sort_order, announcement_id)
   FROM (SELECT announcement_id, sort_order, CASE WHEN starts_at > UTC_TIMESTAMP() THEN 'scheduled' WHEN ends_at <= UTC_TIMESTAMP() THEN 'expired'
                ELSE 'current' END AS state FROM announcements) x), '1:current,2:expired');

-- -------------------------------------------------------------------------------------
-- createAnnouncement(fields, adminId) (DS-7)
-- Times come from <input type="datetime-local"> ("2026-10-20T18:00"), read as Hong Kong time
-- (UTC+8, no daylight saving) and stored as UTC with CONVERT_TZ. The route validates first
-- (DEV_GUIDE §5, DS-7); the CHECKs are the last line of defence:
--   ck_announcement_window (ends after starts) and ck_announcement_link (internal path): 3819.
-- @image is req.files[0].publicPath from uploads.images({ field: 'image', max: 1 }), or NULL.
-- -------------------------------------------------------------------------------------
CALL t_eq('time: datetime-local 2026-12-01T09:30 (HKT) is stored as 2026-12-01 01:30:00 (UTC)',
  CONVERT_TZ('2026-12-01T09:30', '+08:00', '+00:00'), '2026-12-01 01:30:00');

SET @title = 'Exam week quiet hours', @subtitle = 'Main Library open until 2am', @image = '/uploads/2026/10/quiet.jpg',
    @link = '/feed?tab=academics', @sort = 0, @me = 1,
    @starts_local = DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP() - INTERVAL 1 HOUR, '+00:00', '+08:00'), '%Y-%m-%dT%H:%i'),
    @ends_local   = DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP() + INTERVAL 2 DAY,  '+00:00', '+08:00'), '%Y-%m-%dT%H:%i');
INSERT INTO announcements (title, subtitle, image_path, link_url, starts_at, ends_at, sort_order, created_by)
VALUES (@title, @subtitle, @image, @link,
        CONVERT_TZ(@starts_local, '+08:00', '+00:00'), CONVERT_TZ(@ends_local, '+08:00', '+00:00'),
        @sort, @me);
SET @current_id = LAST_INSERT_ID();
CALL t_eq('createAnnouncement: the new one (sort 0) comes before announcement 1 on the banner',
  (SELECT GROUP_CONCAT(announcement_id ORDER BY sort_order, announcement_id) FROM announcements
    WHERE starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()), CONCAT(@current_id, ',1'));

SET @title = 'Hiking season', @subtitle = '', @image = NULL, @link = NULL, @sort = 1,
    @starts_local = DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP() + INTERVAL 30 DAY, '+00:00', '+08:00'), '%Y-%m-%dT%H:%i'),
    @ends_local   = DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP() + INTERVAL 37 DAY, '+00:00', '+08:00'), '%Y-%m-%dT%H:%i');
INSERT INTO announcements (title, subtitle, image_path, link_url, starts_at, ends_at, sort_order, created_by)
VALUES (@title, @subtitle, @image, @link,
        CONVERT_TZ(@starts_local, '+08:00', '+00:00'), CONVERT_TZ(@ends_local, '+08:00', '+00:00'), @sort, @me);
SET @scheduled_id = LAST_INSERT_ID();
CALL t_eq('createAnnouncement: a future one is scheduled and not on the banner',
  (SELECT COUNT(*) FROM announcements WHERE announcement_id = @scheduled_id
      AND starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()), '0');
CALL t_eq('listAnnouncements: current, scheduled, expired groups in order',
  (SELECT GROUP_CONCAT(CONCAT(announcement_id, ':', state) ORDER BY FIELD(state, 'current', 'scheduled', 'expired'), sort_order, announcement_id)
   FROM (SELECT announcement_id, sort_order, CASE WHEN starts_at > UTC_TIMESTAMP() THEN 'scheduled' WHEN ends_at <= UTC_TIMESTAMP() THEN 'expired'
                ELSE 'current' END AS state FROM announcements) x),
  CONCAT(@current_id, ':current,1:current,', @scheduled_id, ':scheduled,2:expired'));

CALL t_err('createAnnouncement: an outside link is refused',
  'INSERT INTO announcements (title, link_url, starts_at, ends_at, created_by) VALUES (''x'', ''https://evil.example'', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)', 3819);
CALL t_err('createAnnouncement: a javascript: link is refused',
  'INSERT INTO announcements (title, link_url, starts_at, ends_at, created_by) VALUES (''x'', ''javascript:alert(1)'', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)', 3819);
CALL t_err('createAnnouncement: a protocol-relative link (//) is refused',
  'INSERT INTO announcements (title, link_url, starts_at, ends_at, created_by) VALUES (''x'', ''//evil.example'', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)', 3819);
CALL t_err('createAnnouncement: ends before starts is refused',
  'INSERT INTO announcements (title, starts_at, ends_at, created_by) VALUES (''x'', UTC_TIMESTAMP(), UTC_TIMESTAMP() - INTERVAL 1 HOUR, 1)', 3819);
CALL t_err('createAnnouncement: a title over 60 characters is refused (strict mode)',
  CONCAT('INSERT INTO announcements (title, starts_at, ends_at, created_by) VALUES (''', REPEAT('t', 61), ''', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)'), 1406);
CALL t_err('createAnnouncement: an impossible date (30 Feb) is refused (strict mode: incorrect datetime)',
  'INSERT INTO announcements (title, starts_at, ends_at, created_by) VALUES (''x'', CONVERT_TZ(''2027-02-30T10:00'', ''+08:00'', ''+00:00''), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)', 1292);
-- Browsers read "/\evil.example" as "//evil.example", so the CHECK also refuses a backslash
-- after the first slash. The route's own test (^/(?![/\\])\S*$) refuses it first; see DS-7.
CALL t_err('createAnnouncement: a backslash link (/\\evil.example) is refused',
  'INSERT INTO announcements (title, link_url, starts_at, ends_at, created_by) VALUES (''x'', ''/\\\\evil.example'', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)', 3819);
START TRANSACTION;
INSERT INTO announcements (title, link_url, starts_at, ends_at, created_by) VALUES
  ('x', '/events/1', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1),
  ('y', '/feed?tab=hot', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1);
CALL t_eq('createAnnouncement: internal links such as /events/1 and /feed?tab=hot are accepted', ROW_COUNT(), '2');
ROLLBACK;

-- -------------------------------------------------------------------------------------
-- getAnnouncement(id): one row for the edit form, with the times as HKT datetime-local
-- strings for the inputs (DS-7). No row = 404.
-- -------------------------------------------------------------------------------------
SET @id = @scheduled_id;
SELECT a.announcement_id, a.title, a.subtitle, a.image_path, a.link_url, a.sort_order,
       DATE_FORMAT(CONVERT_TZ(a.starts_at, '+00:00', '+08:00'), '%Y-%m-%dT%H:%i') AS starts_local,
       DATE_FORMAT(CONVERT_TZ(a.ends_at,   '+00:00', '+08:00'), '%Y-%m-%dT%H:%i') AS ends_local
FROM announcements a
WHERE a.announcement_id = @id;
CALL t_eq('getAnnouncement: the HKT times typed into the form come back unchanged',
  (SELECT DATE_FORMAT(CONVERT_TZ(starts_at, '+00:00', '+08:00'), '%Y-%m-%dT%H:%i') FROM announcements WHERE announcement_id = @scheduled_id),
  @starts_local);

-- -------------------------------------------------------------------------------------
-- updateAnnouncement(id, fields) (DS-7). The route calls getAnnouncement first (404 if
-- missing), so it never relies on the UPDATE's row count. A new upload replaces the image;
-- the "Remove image" switch clears it; otherwise the image stays.
-- -------------------------------------------------------------------------------------
SET @id = @current_id, @title = 'Exam week: quiet hours', @subtitle = 'Main Library open until 2am',
    @new_image = NULL, @remove_image = 0, @link = '/search?q=library', @sort = 3,
    @starts_local = DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP() - INTERVAL 1 HOUR, '+00:00', '+08:00'), '%Y-%m-%dT%H:%i'),
    @ends_local   = DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP() + INTERVAL 3 DAY,  '+00:00', '+08:00'), '%Y-%m-%dT%H:%i');
UPDATE announcements
   SET title      = @title,
       subtitle   = @subtitle,
       image_path = IF(@remove_image, NULL, COALESCE(@new_image, image_path)),
       link_url   = @link,
       starts_at  = CONVERT_TZ(@starts_local, '+08:00', '+00:00'),
       ends_at    = CONVERT_TZ(@ends_local,   '+08:00', '+00:00'),
       sort_order = @sort
 WHERE announcement_id = @id;
CALL t_eq('updateAnnouncement: new title, link and sort order; the image is kept',
  (SELECT CONCAT(title, ' | ', link_url, ' | ', sort_order, ' | ', image_path) FROM announcements WHERE announcement_id = @current_id),
  'Exam week: quiet hours | /search?q=library | 3 | /uploads/2026/10/quiet.jpg');
CALL t_eq('updateAnnouncement: sort 3 now comes after announcement 1 on the banner',
  (SELECT GROUP_CONCAT(announcement_id ORDER BY sort_order, announcement_id) FROM announcements
    WHERE starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()), CONCAT('1,', @current_id));
SET @new_image = NULL, @remove_image = 1;                     -- "Remove image" switched on
UPDATE announcements SET image_path = IF(@remove_image, NULL, COALESCE(@new_image, image_path)) WHERE announcement_id = @current_id;
CALL t_eq('updateAnnouncement: "Remove image" clears it', (SELECT IFNULL(image_path, 'NULL') FROM announcements WHERE announcement_id = @current_id), 'NULL');
CALL t_err('updateAnnouncement: ends before starts is refused',
  CONCAT('UPDATE announcements SET ends_at = starts_at - INTERVAL 1 MINUTE WHERE announcement_id = ', @current_id), 3819);
CALL t_err('updateAnnouncement: an outside link is refused',
  CONCAT('UPDATE announcements SET link_url = ''http://evil.example'' WHERE announcement_id = ', @current_id), 3819);

-- -------------------------------------------------------------------------------------
-- deleteAnnouncement(id) (DS-7). 0 rows: it was already gone, answer 404.
-- -------------------------------------------------------------------------------------
SET @id = @current_id;
DELETE FROM announcements WHERE announcement_id = @id;
CALL t_eq('deleteAnnouncement: one row deleted', ROW_COUNT(), '1');
DELETE FROM announcements WHERE announcement_id = @id;
CALL t_eq('deleteAnnouncement: deleting again changes nothing (404)', ROW_COUNT(), '0');
DELETE FROM announcements WHERE announcement_id = @scheduled_id;
CALL t_eq('deleteAnnouncement: the banner is back to announcement 1 only',
  (SELECT GROUP_CONCAT(announcement_id ORDER BY sort_order, announcement_id) FROM announcements
    WHERE starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()), '1');

-- =====================================================================================
-- Privacy sweep: no discover list ever holds a deleted or hidden post (BR-8, BR-9)
-- =====================================================================================
CALL t_eq('privacy: 600009 (deleted) and 600010 (hidden) are absent from v_live_posts, the source of every list',
  (SELECT COUNT(*) FROM v_live_posts WHERE post_id IN (600009, 600010)), '0');
DROP PROCEDURE IF EXISTS t_got;
