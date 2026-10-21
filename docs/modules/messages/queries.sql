-- =====================================================================================
-- Messages module: reference SQL (tested). Each block becomes one function in
-- modules/messages/queries.js; @variables become ? placeholders in the same order.
-- Run: ONLY=modules/messages DB=cn_messages bash db/tests/run_all.sh  (fresh seeded database; CALL t_eq / t_err are checks)
-- Writer of: notifications (only through modules/messages/db/triggers.sql), conversations, messages,
-- conversation_reads, blocks (MS-8), reports, hidden_content. Reads: v_live_posts, v_comment_items,
-- post_participants (aliases), posts and comments (admin queue only), users, organizations.
--
-- Conventions in this file:
--   * A page query is captured as  CREATE TEMPORARY TABLE res AS <the query>  so the checks
--     test the exact statement queries.js runs. Drop that first line when you copy a query.
--   * (p.visibility = 'all' OR p.author_university_id = @my_uni) is core/cards.js VISIBLE.
--   * The SQL never selects a handle, an avatar or a user id that a template could print for
--     anonymous content: people on a post are an alias number (ui.alias) or NULL ("Visitor").
--     The one exception is the admin queue (MS-7), where BR-15 asks for the author's handle.
-- Order: the read-only page queries first (they pin the seed facts the tests use), then the
-- writes, which change the seed state for the blocks after them.
-- =====================================================================================
SET time_zone = '+00:00';

-- -------------------------------------------------------------------------------------
-- countUnread(me): the Messages tab badge, in ONE query (MS-2, MS-3)
-- notifications = my unread notifications; messages = messages in my conversations, sent by
-- the other person, newer than my read pointer (no pointer yet = 0, so all of them count).
-- The manifest's locals(req) returns { badges: { messages: notifications + messages } };
-- the Messages home reuses `notifications` for the count on its Notifications row.
-- -------------------------------------------------------------------------------------
SET @me = 2;                                      -- Mandy
SELECT
  (SELECT COUNT(*) FROM notifications n
    WHERE n.recipient_id = @me AND n.read_at IS NULL) AS notifications,
  (SELECT COUNT(*)
     FROM conversations c
     JOIN messages m ON m.conversation_id = c.conversation_id
     LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = @me
    WHERE (c.starter_id = @me OR c.recipient_id = @me)
      AND m.sender_id <> @me
      AND m.message_id > COALESCE(r.last_read_message_id, 0)) AS messages;

-- The same query for every persona at once, to pin the badge numbers the tests use.
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT u.user_id, u.handle,
  (SELECT COUNT(*) FROM notifications n
    WHERE n.recipient_id = u.user_id AND n.read_at IS NULL) AS notifications,
  (SELECT COUNT(*)
     FROM conversations c
     JOIN messages m ON m.conversation_id = c.conversation_id
     LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = u.user_id
    WHERE (c.starter_id = u.user_id OR c.recipient_id = u.user_id)
      AND m.sender_id <> u.user_id
      AND m.message_id > COALESCE(r.last_read_message_id, 0)) AS messages
FROM users u;
CALL t_eq('countUnread: seed badges (handle notifications+messages)',
  (SELECT GROUP_CONCAT(CONCAT(handle, ' ', notifications, '+', messages) ORDER BY user_id SEPARATOR ', ') FROM res),
  'admin0000 0+0, mandy0hku 3+1, kelvin0hk 4+0, wing0cuhk 0+0, jason0ust 0+1, newbie0hk 0+0, filmsoc00 0+0, hikeclub0 2+0');

-- -------------------------------------------------------------------------------------
-- listNotifications(me, myUniversityId, before): my notifications, newest first, 30 per
-- page, keyset ?before=<notification_id> (MS-1, BR-5, BR-8, BR-9, BR-13)
-- Fetch 31: if 31 rows come back, show 30 and a "Load more" link with before = the 30th id.
-- First page: before = Number.MAX_SAFE_INTEGER.
--   post_available  0 when the post was deleted, hidden or is not visible to me: the row then
--                   says "This post is no longer available" and has no link.
--   actor_alias_no  the actor's alias on that post (0 = Host). Never fetched for likes: a liker
--                   may never have commented, and naming them would break anonymity (BR-13).
--   comment_body    NULL when the comment was deleted ("[deleted]") or hidden
--                   ("[hidden by a moderator]"); otherwise shown with ui.excerpt(body, 60).
-- The actor's user id and handle are never selected.
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1, @before = 9007199254740991;   -- Mandy (HKU), first page
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT n.notification_id, n.type, n.post_id, n.comment_id, n.created_at,
       n.read_at IS NULL           AS is_unread,
       p.post_id IS NOT NULL       AS post_available,
       pp.alias_no                 AS actor_alias_no,
       ci.body                     AS comment_body,
       ci.is_deleted               AS comment_deleted,
       ci.is_hidden                AS comment_hidden
FROM notifications n
LEFT JOIN v_live_posts p        ON p.post_id = n.post_id
                               AND (p.visibility = 'all' OR p.author_university_id = @my_uni)   -- BR-5
LEFT JOIN post_participants pp  ON pp.post_id = n.post_id AND pp.user_id = n.actor_id
                               AND n.type <> 'like_on_post'                                    -- BR-13
LEFT JOIN v_comment_items ci    ON ci.comment_id = n.comment_id                                -- BR-8, BR-9
WHERE n.recipient_id = @me
  AND n.notification_id < @before
ORDER BY n.notification_id DESC
LIMIT 31;

CALL t_eq('listNotifications: Mandy has 7 notifications, newest id first',
  (SELECT GROUP_CONCAT(notification_id ORDER BY notification_id DESC) FROM res), '30,29,27,17,14,2,1');
CALL t_eq('listNotifications: the 3 newest (all from the last day) are unread (highlighted)',
  (SELECT GROUP_CONCAT(is_unread ORDER BY notification_id DESC) FROM res), '1,1,1,0,0,0,0');
CALL t_eq('listNotifications: type and actor alias of each row (NULL alias for the like)',
  (SELECT GROUP_CONCAT(CONCAT(type, ':', IFNULL(actor_alias_no, '-')) ORDER BY notification_id DESC SEPARATOR ' ') FROM res),
  'reply_to_comment:0 comment_on_watched:3 comment_on_watched:2 comment_on_watched:0 comment_on_watched:1 like_on_post:- comment_on_post:1');
CALL t_eq('listNotifications: #30 is "Host replied to your comment on #600012" with its text',
  (SELECT CONCAT(type, '/', post_id, '/', comment_id, '/', actor_alias_no, '/', comment_body) FROM res WHERE notification_id = 30),
  'reply_to_comment/600012/13/0/Thanks, doing the 2024 paper now.');
CALL t_eq('listNotifications: #29 is Carol (Jason) on the watched post, but comment 12 is hidden',
  (SELECT CONCAT(actor_alias_no, '/', IFNULL(comment_body, 'NULL'), '/', comment_deleted, '/', comment_hidden) FROM res WHERE notification_id = 29),
  '3/NULL/0/1');
CALL t_eq('listNotifications: #27 is Bob (Wing) on the watched post 600012',
  (SELECT CONCAT(type, '/', actor_alias_no, '/', comment_body) FROM res WHERE notification_id = 27),
  'comment_on_watched/2/加油！You got this.');
CALL t_eq('listNotifications: #1 is "Alice commented on your post #600001"',
  (SELECT CONCAT(type, '/', post_id, '/', actor_alias_no, '/', comment_body) FROM res WHERE notification_id = 1),
  'comment_on_post/600001/1/Thanks! Is 4/F quiet too?');
CALL t_eq('listNotifications: #2 is "Your post #600001 got a like": no comment, no alias',
  (SELECT CONCAT(type, '/', post_id, '/', IFNULL(comment_id, 'NULL'), '/', IFNULL(actor_alias_no, 'NULL'), '/', post_available) FROM res WHERE notification_id = 2),
  'like_on_post/600001/NULL/NULL/1');
CALL t_eq('listNotifications: every post is still live and visible to Mandy',
  (SELECT MIN(post_available) FROM res), '1');
CALL t_eq('listNotifications: keyset page 2 (before=27) starts at 17',
  (SELECT GROUP_CONCAT(notification_id ORDER BY notification_id DESC) FROM notifications
    WHERE recipient_id = 2 AND notification_id < 27), '17,14,2,1');
CALL t_eq('listNotifications: ids follow time in the seed too (no id is older than a smaller id)',
  (SELECT COUNT(*) FROM notifications a JOIN notifications b ON b.notification_id > a.notification_id
    WHERE b.created_at < a.created_at), '0');
CALL t_eq('listNotifications: Newbie has none (empty state)',
  (SELECT COUNT(*) FROM notifications WHERE recipient_id = 6), '0');

-- A deleted post makes its rows "no longer available" (checked inside a transaction that is
-- rolled back: deleting a post is the content module's job, not ours).
START TRANSACTION;
UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = 600001;   -- fixture
CALL t_eq('listNotifications: after 600001 is deleted, rows 2 and 1 are not available',
  (SELECT GROUP_CONCAT(n.notification_id ORDER BY n.notification_id DESC)
     FROM notifications n
     LEFT JOIN v_live_posts p ON p.post_id = n.post_id AND (p.visibility = 'all' OR p.author_university_id = 1)
    WHERE n.recipient_id = 2 AND p.post_id IS NULL), '2,1');
ROLLBACK;

-- -------------------------------------------------------------------------------------
-- markNotificationsRead(me, upToId): run AFTER listNotifications, with upToId = the newest
-- notification_id shown, so one that arrives while the page renders stays unread (MS-1)
-- -------------------------------------------------------------------------------------
-- While Mandy's page renders, Newbie replies to her comment 10 on 600012 (what the content
-- module does: a first comment gets the next alias, 4 = Dave, then the comment row).
INSERT INTO post_participants (post_id, user_id, alias_no) VALUES (600012, 6, 4);              -- fixture
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body)
VALUES (600012, 6, 10, 'Past papers are useless, stop spamming advice.');                       -- fixture
SET @c_newbie = LAST_INSERT_ID();                -- comment 15
CALL t_eq('trigger: the reply notifies Mandy once (as a reply, not also as a watcher) and Kelvin as the author',
  (SELECT GROUP_CONCAT(CONCAT(notification_id, ':', recipient_id, ':', type) ORDER BY notification_id)
     FROM notifications WHERE comment_id = @c_newbie), '32:2:reply_to_comment,33:3:comment_on_post');

SET @me = 2, @up_to = 30;                        -- the newest id Mandy's page showed
UPDATE notifications
   SET read_at = UTC_TIMESTAMP()
 WHERE recipient_id = @me AND read_at IS NULL AND notification_id <= @up_to;
CALL t_eq('markNotificationsRead: the 3 unread rows Mandy saw are now read', ROW_COUNT(), '3');
CALL t_eq('markNotificationsRead: #32 arrived during rendering and stays unread',
  (SELECT GROUP_CONCAT(notification_id) FROM notifications WHERE recipient_id = 2 AND read_at IS NULL), '32');
CALL t_eq('markNotificationsRead: Kelvin''s notifications are untouched (4 seed + #33 unread)',
  (SELECT COUNT(*) FROM notifications WHERE recipient_id = 3 AND read_at IS NULL), '5');

-- -------------------------------------------------------------------------------------
-- Triggers seen from this module (modules/messages/db/triggers.sql; the core checks are in contract_checks.sql)
-- -------------------------------------------------------------------------------------
-- A like by Newbie on Jason's 600004 notifies Jason once; unlike and like again does not repeat it.
INSERT INTO post_likes (user_id, post_id) VALUES (6, 600004);                                   -- fixture
DELETE FROM post_likes WHERE user_id = 6 AND post_id = 600004;
INSERT INTO post_likes (user_id, post_id) VALUES (6, 600004);
CALL t_eq('trigger: like, unlike, like again gives Jason exactly one like notification from Newbie',
  (SELECT COUNT(*) FROM notifications WHERE recipient_id = 5 AND actor_id = 6 AND type = 'like_on_post'), '1');
-- Kelvin turned like notifications off (users.notify_likes = 0).
INSERT INTO post_likes (user_id, post_id) VALUES (6, 600012);                                   -- fixture
CALL t_eq('trigger: a like on Kelvin''s 600012 makes no notification (likes switched off)',
  (SELECT COUNT(*) FROM notifications WHERE post_id = 600012 AND actor_id = 6 AND type = 'like_on_post'), '0');
CALL t_eq('trigger: Jason''s badge is now 1 notification + 1 message',
  (SELECT CONCAT((SELECT COUNT(*) FROM notifications WHERE recipient_id = 5 AND read_at IS NULL), '+',
                 (SELECT COUNT(*) FROM messages m JOIN conversations c USING (conversation_id)
                   LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = 5
                   WHERE 5 IN (c.starter_id, c.recipient_id) AND m.sender_id <> 5
                     AND m.message_id > COALESCE(r.last_read_message_id, 0)))), '1+1');

-- -------------------------------------------------------------------------------------
-- listConversations(me): Messages home, newest conversation first (MS-3, BR-14)
-- Greatest-per-group: the join keeps only each conversation's newest message
-- (m.message_id = the MAX for that conversation). Unread = the other person's messages
-- after my read pointer (LEFT JOIN: no pointer yet means 0, so everything is unread).
-- Display name (BR-14): with a post, other_alias_no -> ui.alias(n), or "Visitor" when NULL
-- (they never commented there), plus "· #600005"; without a post, other_public_name (the
-- organization's display name or the handle) and other_avatar_code. For a post conversation
-- the handle and the avatar are NULL on purpose: either would tie the alias to a person.
-- -------------------------------------------------------------------------------------
SET @me = 2;                                      -- Mandy
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT c.conversation_id, c.post_id,
       pp.alias_no                                                  AS other_alias_no,
       IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL) AS other_public_name,
       IF(c.post_id IS NULL, u.avatar_code, NULL)                   AS other_avatar_code,
       m.body                                                       AS last_body,
       m.created_at                                                 AS last_at,
       m.sender_id = @me                                            AS last_is_mine,
       (SELECT COUNT(*) FROM messages x
         WHERE x.conversation_id = c.conversation_id
           AND x.sender_id <> @me
           AND x.message_id > COALESCE(r.last_read_message_id, 0))  AS unread
FROM conversations c
JOIN messages m                 ON m.conversation_id = c.conversation_id
                               AND m.message_id = (SELECT MAX(x.message_id) FROM messages x
                                                    WHERE x.conversation_id = c.conversation_id)
JOIN users u                    ON u.user_id = IF(c.starter_id = @me, c.recipient_id, c.starter_id)  -- the other person
LEFT JOIN organizations o       ON o.user_id = u.user_id
LEFT JOIN post_participants pp  ON pp.post_id = c.post_id AND pp.user_id = u.user_id                 -- BR-14 alias
LEFT JOIN conversation_reads r  ON r.conversation_id = c.conversation_id AND r.user_id = @me
WHERE (c.starter_id = @me OR c.recipient_id = @me)
ORDER BY m.message_id DESC;

CALL t_eq('listConversations: Mandy has conversation 1 with "Visitor" on #600005, 1 unread',
  (SELECT CONCAT(conversation_id, '/', post_id, '/', IFNULL(other_alias_no, 'Visitor'), '/', IFNULL(other_public_name, 'NULL'), '/', unread) FROM res),
  '1/600005/Visitor/NULL/1');
CALL t_eq('listConversations: the last message is Kelvin''s, 4 hours ago',
  (SELECT CONCAT(last_body, '/', last_is_mine, '/', TIMESTAMPDIFF(HOUR, last_at, UTC_TIMESTAMP())) FROM res),
  'Deal. Friday 2pm at the entrance?/0/4');

-- Kelvin sees Mandy as "Host" (alias 0 on her own post); Jason and Wing see handles.
SET @me = 3;
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT c.conversation_id, c.post_id, pp.alias_no AS other_alias_no,
       IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL) AS other_public_name,
       (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.conversation_id AND x.sender_id <> @me
           AND x.message_id > COALESCE(r.last_read_message_id, 0)) AS unread
FROM conversations c
JOIN messages m ON m.conversation_id = c.conversation_id
               AND m.message_id = (SELECT MAX(x.message_id) FROM messages x WHERE x.conversation_id = c.conversation_id)
JOIN users u ON u.user_id = IF(c.starter_id = @me, c.recipient_id, c.starter_id)
LEFT JOIN organizations o ON o.user_id = u.user_id
LEFT JOIN post_participants pp ON pp.post_id = c.post_id AND pp.user_id = u.user_id
LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = @me
WHERE (c.starter_id = @me OR c.recipient_id = @me)
ORDER BY m.message_id DESC;
CALL t_eq('listConversations: Kelvin sees Mandy as Host (alias 0) on #600005, nothing unread',
  (SELECT CONCAT(conversation_id, '/', post_id, '/', other_alias_no, '/', unread) FROM res), '1/600005/0/0');

SET @me = 5;
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT c.conversation_id, c.post_id, pp.alias_no AS other_alias_no,
       IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL) AS other_public_name,
       IF(c.post_id IS NULL, u.avatar_code, NULL) AS other_avatar_code,
       m.sender_id = @me AS last_is_mine,
       (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.conversation_id AND x.sender_id <> @me
           AND x.message_id > COALESCE(r.last_read_message_id, 0)) AS unread
FROM conversations c
JOIN messages m ON m.conversation_id = c.conversation_id
               AND m.message_id = (SELECT MAX(x.message_id) FROM messages x WHERE x.conversation_id = c.conversation_id)
JOIN users u ON u.user_id = IF(c.starter_id = @me, c.recipient_id, c.starter_id)
LEFT JOIN organizations o ON o.user_id = u.user_id
LEFT JOIN post_participants pp ON pp.post_id = c.post_id AND pp.user_id = u.user_id
LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = @me
WHERE (c.starter_id = @me OR c.recipient_id = @me)
ORDER BY m.message_id DESC;
CALL t_eq('listConversations: Jason sees wing0cuhk (no post), his own last message, 1 unread (no read row yet)',
  (SELECT CONCAT(conversation_id, '/', IFNULL(post_id, 'none'), '/', other_public_name, '/', other_avatar_code, '/', last_is_mine, '/', unread) FROM res),
  '2/none/wing0cuhk/panda/1/1');
CALL t_eq('listConversations: Newbie has no conversation (empty state)',
  (SELECT COUNT(*) FROM conversations WHERE 6 IN (starter_id, recipient_id)), '0');

-- -------------------------------------------------------------------------------------
-- getConversation(conversationId, me, myUniversityId): the conversation header, or no row
-- when I am not one of the two members, which the page answers with 404 (MS-5, BR-14, BR-5)
-- post_available: link to the post only when it is still live and visible to me.
-- my_alias_no: shown as "You appear as Visitor" so people know they stay anonymous.
-- blocked_by_me, blocked_by_other (MS-8): when either is 1 the page shows a notice instead of
-- the send box. They read only this conversation's block rows (blocks are per conversation),
-- so they say nothing about the same people anywhere else. The other person's user id is
-- used inside the query and never returned.
-- -------------------------------------------------------------------------------------
SET @conv = 1, @me = 2, @my_uni = 1;              -- Mandy opens conversation 1
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT c.conversation_id, c.post_id,
       pp.alias_no                                                  AS other_alias_no,
       IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL) AS other_public_name,
       IF(c.post_id IS NULL, u.handle, NULL)                        AS other_handle,    -- for the /u/:handle link
       mine.alias_no                                                AS my_alias_no,
       p.post_id IS NOT NULL                                        AS post_available,
       EXISTS (SELECT 1 FROM blocks b
                WHERE b.conversation_id = c.conversation_id AND b.blocker_id = @me)  AS blocked_by_me,     -- MS-8
       EXISTS (SELECT 1 FROM blocks b
                WHERE b.conversation_id = c.conversation_id AND b.blocker_id <> @me) AS blocked_by_other
FROM conversations c
JOIN users u                     ON u.user_id = IF(c.starter_id = @me, c.recipient_id, c.starter_id)
LEFT JOIN organizations o        ON o.user_id = u.user_id
LEFT JOIN post_participants pp   ON pp.post_id = c.post_id AND pp.user_id = u.user_id
LEFT JOIN post_participants mine ON mine.post_id = c.post_id AND mine.user_id = @me
LEFT JOIN v_live_posts p         ON p.post_id = c.post_id
                                AND (p.visibility = 'all' OR p.author_university_id = @my_uni)
WHERE c.conversation_id = @conv
  AND (c.starter_id = @me OR c.recipient_id = @me);                -- BR-14: members only
CALL t_eq('getConversation: Mandy talks to "Visitor" and appears as Host; the post link is shown; no block',
  (SELECT CONCAT(IFNULL(other_alias_no, 'Visitor'), '/', IFNULL(other_handle, 'no handle'), '/', my_alias_no, '/', post_available, '/', blocked_by_me, blocked_by_other) FROM res),
  'Visitor/no handle/0/1/00');
CALL t_eq('getConversation: Newbie is not a member of conversation 1: no row (404)',
  (SELECT COUNT(*) FROM conversations c WHERE c.conversation_id = 1 AND (c.starter_id = 6 OR c.recipient_id = 6)), '0');
CALL t_eq('getConversation: Wing in conversation 2 sees jason0ust and links to /u/jason0ust',
  (SELECT CONCAT(IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL), '/', IFNULL(c.post_id, 'none'))
     FROM conversations c JOIN users u ON u.user_id = IF(c.starter_id = 4, c.recipient_id, c.starter_id)
     LEFT JOIN organizations o ON o.user_id = u.user_id
    WHERE c.conversation_id = 2 AND (c.starter_id = 4 OR c.recipient_id = 4)), 'jason0ust/none');

-- -------------------------------------------------------------------------------------
-- listMessages(conversationId, me): the last 100 messages, oldest first (MS-5)
-- Only called after getConversation found a row. is_mine aligns the bubble right;
-- sender_id itself is not returned.
-- -------------------------------------------------------------------------------------
SET @conv = 1, @me = 2;
DROP TEMPORARY TABLE IF EXISTS res;
-- (a derived table loses the column defaults, so res is declared first and filled by INSERT)
CREATE TEMPORARY TABLE res (message_id BIGINT UNSIGNED, is_mine INT, body VARCHAR(1000), created_at DATETIME NULL);
INSERT INTO res
SELECT message_id, is_mine, body, created_at
FROM (SELECT m.message_id, m.sender_id = @me AS is_mine, m.body, m.created_at
        FROM messages m
       WHERE m.conversation_id = @conv
       ORDER BY m.message_id DESC
       LIMIT 100) last100
ORDER BY message_id;
CALL t_eq('listMessages: conversation 1 as Mandy: 3 messages, the middle one is hers',
  (SELECT GROUP_CONCAT(CONCAT(message_id, ':', is_mine) ORDER BY message_id) FROM res), '1:0,2:1,3:0');

-- -------------------------------------------------------------------------------------
-- markConversationRead(conversationId, me, messageId): move my read pointer to the newest
-- message shown (MS-5). Row alias syntax (MySQL 8.0.19+; VALUES() is deprecated). GREATEST
-- means an older page (a second tab) can never move the pointer backwards.
-- -------------------------------------------------------------------------------------
SET @conv = 1, @me = 2, @last_shown = 3;
INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
VALUES (@conv, @me, @last_shown) AS new
ON DUPLICATE KEY UPDATE
  last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id);
CALL t_eq('markConversationRead: Mandy''s pointer 2 -> 3',
  (SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = 1 AND user_id = 2), '3');
INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
VALUES (1, 2, 1) AS new
ON DUPLICATE KEY UPDATE
  last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id);
CALL t_eq('markConversationRead: an older value never moves the pointer back',
  (SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = 1 AND user_id = 2), '3');
-- Jason has no pointer in conversation 2 yet: the same statement inserts one.
INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
VALUES (2, 5, 5) AS new
ON DUPLICATE KEY UPDATE
  last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id);
CALL t_eq('markConversationRead: Jason opens conversation 2: his first pointer is created at 5',
  (SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = 2 AND user_id = 5), '5');
CALL t_eq('markConversationRead: Mandy''s unread messages drop 1 -> 0 (her badge is now 1 + 0)',
  (SELECT CONCAT((SELECT COUNT(*) FROM notifications WHERE recipient_id = 2 AND read_at IS NULL), '+',
                 (SELECT COUNT(*) FROM messages m JOIN conversations c USING (conversation_id)
                   LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = 2
                   WHERE 2 IN (c.starter_id, c.recipient_id) AND m.sender_id <> 2
                     AND m.message_id > COALESCE(r.last_read_message_id, 0)))), '1+0');

-- -------------------------------------------------------------------------------------
-- sendMessage(conversationId, me, body): send, then move my own pointer (MS-5, BR-14, BR-18)
-- The route first checks membership with getConversation (404) and the body (1 to 1,000
-- characters, trimmed). The trigger trg_message_sender_is_member is the last line of
-- defence: error 1644 if a non-member's insert ever gets this far (the app answers 404).
-- MS-8: isBlocked (defined in the MS-8 section) runs first, inside the same transaction.
-- While any block row exists for this conversation, BOTH members are refused. Its FOR SHARE
-- locks this conversation's block rows and the gap where a new one would go, so a block made
-- at the same moment either waits until this transaction commits or is seen by it (tested by
-- hand with two clients): a message is never sent after the block it should have obeyed.
-- In queries.js:
--   tx(async t => {
--     const b = await isBlocked(t, conversationId, me);  // FOR SHARE, on this transaction
--     if (b.blocked_by_me || b.blocked_by_other) return { blocked: b };  // nothing written; 403
--     const r = await t.q(<INSERT message>, [conversationId, me, body]);
--     await t.q(<upsert read pointer>, [conversationId, me, r.insertId]);
--     return { id: r.insertId };
--   })
-- -------------------------------------------------------------------------------------
SET @conv = 1, @me = 2, @body = 'Friday 2pm works. See you there!';
START TRANSACTION;
SELECT EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id =  @me FOR SHARE) AS blocked_by_me,
       EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id <> @me FOR SHARE) AS blocked_by_other
  INTO @by_me, @by_other;                         -- (INTO only for the check below)
CALL t_eq('sendMessage: conversation 1 has no block (0/0), so Mandy may send', CONCAT(@by_me, '/', @by_other), '0/0');
INSERT INTO messages (conversation_id, sender_id, body) VALUES (@conv, @me, @body);
SET @msg = LAST_INSERT_ID();
INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
VALUES (@conv, @me, @msg) AS new
ON DUPLICATE KEY UPDATE
  last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id);
COMMIT;
CALL t_eq('sendMessage: message 6 is in conversation 1 and Mandy''s pointer is on it',
  (SELECT CONCAT(m.message_id, '/', r.last_read_message_id) FROM messages m
     JOIN conversation_reads r ON r.conversation_id = m.conversation_id AND r.user_id = 2
    WHERE m.message_id = @msg), '6/6');
CALL t_eq('sendMessage: Kelvin now has 1 unread message (badge 5 notifications + 1)',
  (SELECT COUNT(*) FROM messages m LEFT JOIN conversation_reads r ON r.conversation_id = m.conversation_id AND r.user_id = 3
    WHERE m.conversation_id = 1 AND m.sender_id <> 3 AND m.message_id > COALESCE(r.last_read_message_id, 0)), '1');
CALL t_err('sendMessage: the trigger refuses a non-member (Newbie into conversation 1)',
  'INSERT INTO messages (conversation_id, sender_id, body) VALUES (1, 6, ''hello'')', 1644);
CALL t_err('sendMessage: a blank message is refused by the CHECK (the app says so first)',
  'INSERT INTO messages (conversation_id, sender_id, body) VALUES (1, 2, ''   '')', 3819);
CALL t_err('sendMessage: more than 1,000 characters is refused (BR-18)',
  CONCAT('INSERT INTO messages (conversation_id, sender_id, body) VALUES (1, 2, ''', REPEAT('x', 1001), ''')'), 1406);

-- -------------------------------------------------------------------------------------
-- Starting a conversation (MS-4): resolving the recipient
-- From a post: core findVisible(postId, me) must return the card (else 404); the recipient
-- is card.author_id, or with &alias=n the participant with that alias (else 404).
-- From a handle: the user must exist and be active (else 404).
-- The route answers 400 "You cannot message yourself" when the recipient is me.
-- -------------------------------------------------------------------------------------
CALL t_eq('findVisible: Wing (CUHK) cannot see Mandy''s HKU-only 600001, so /messages/new?post=600001 is 404',
  (SELECT COUNT(*) FROM v_live_posts p WHERE p.post_id = 600001 AND (p.visibility = 'all' OR p.author_university_id = 2)), '0');
CALL t_eq('findVisible: deleted 600009 and hidden 600010 are 404 for everyone',
  (SELECT COUNT(*) FROM v_live_posts p WHERE p.post_id IN (600009, 600010)), '0');

-- participantByAlias(postId, aliasNo): who is "Alice" on this post (the id is never printed)
SET @post = 600012, @alias = 1;
SELECT pp.user_id FROM post_participants pp WHERE pp.post_id = @post AND pp.alias_no = @alias;
CALL t_eq('participantByAlias: Alice on 600012 is Mandy (user 2)',
  (SELECT pp.user_id FROM post_participants pp WHERE pp.post_id = 600012 AND pp.alias_no = 1), '2');
CALL t_eq('participantByAlias: alias 0 is the author (same as "Message the host")',
  (SELECT pp.user_id FROM post_participants pp WHERE pp.post_id = 600012 AND pp.alias_no = 0), '3');
CALL t_eq('participantByAlias: no alias 9 on 600012: no row (404)',
  (SELECT COUNT(*) FROM post_participants pp WHERE pp.post_id = 600012 AND pp.alias_no = 9), '0');

-- aliasOn(postId, userId): my own alias on the post, for "You will appear as ..." (NULL = Visitor)
SET @post = 600012, @me = 4;
SELECT pp.alias_no FROM post_participants pp WHERE pp.post_id = @post AND pp.user_id = @me;
CALL t_eq('aliasOn: Wing is Alice (1) on 600004 and Bob (2) on 600012',
  (SELECT GROUP_CONCAT(CONCAT(post_id, ':', alias_no) ORDER BY post_id) FROM post_participants WHERE user_id = 4 AND post_id IN (600004, 600012)),
  '600004:1,600012:2');

-- userByHandle(handle): an active user to message from their user page
SET @handle = 'jason0ust';
SELECT u.user_id, u.handle, o.display_name, u.avatar_code
FROM users u
LEFT JOIN organizations o ON o.user_id = u.user_id
WHERE u.handle = @handle AND u.status = 'active';
CALL t_eq('userByHandle: jason0ust is user 5',
  (SELECT u.user_id FROM users u WHERE u.handle = 'jason0ust' AND u.status = 'active'), '5');
CALL t_eq('userByHandle: an organization is shown by its display name',
  (SELECT COALESCE(o.display_name, u.handle) FROM users u LEFT JOIN organizations o ON o.user_id = u.user_id
    WHERE u.handle = 'filmsoc00' AND u.status = 'active'), 'HKU Film Society');
CALL t_eq('userByHandle: an unknown handle gives no row (404)',
  (SELECT COUNT(*) FROM users u WHERE u.handle = 'nobody000' AND u.status = 'active'), '0');
START TRANSACTION;
UPDATE users SET status = 'banned' WHERE user_id = 5;                                           -- fixture
CALL t_eq('userByHandle: a banned user gives no row (404)',
  (SELECT COUNT(*) FROM users u WHERE u.handle = 'jason0ust' AND u.status = 'active'), '0');
ROLLBACK;

-- -------------------------------------------------------------------------------------
-- findConversation(me, otherId, postId): the existing conversation for this pair and this
-- context, whoever started it (MS-4, BR-14). Uses the generated columns and their UNIQUE key.
-- A post conversation and a handle conversation between the same two people are DIFFERENT
-- contexts on purpose: reusing one for the other would tie an alias to a handle.
-- -------------------------------------------------------------------------------------
SET @me = 3, @other = 2, @post = 600005;          -- Kelvin, "Message the host" on 600005 again
SELECT c.conversation_id
FROM conversations c
WHERE c.user_lo = LEAST(@me, @other)
  AND c.user_hi = GREATEST(@me, @other)
  AND c.context_key = IFNULL(@post, 0);
CALL t_eq('findConversation: Kelvin -> Mandy on 600005 finds conversation 1 (redirect 303)',
  (SELECT c.conversation_id FROM conversations c WHERE c.user_lo = LEAST(3, 2) AND c.user_hi = GREATEST(3, 2) AND c.context_key = IFNULL(600005, 0)), '1');
CALL t_eq('findConversation: Jason -> Wing by handle finds conversation 2 (Wing started it)',
  (SELECT c.conversation_id FROM conversations c WHERE c.user_lo = LEAST(5, 4) AND c.user_hi = GREATEST(5, 4) AND c.context_key = IFNULL(NULL, 0)), '2');
CALL t_eq('findConversation: Mandy -> Kelvin by handle is a different context: none',
  (SELECT COUNT(*) FROM conversations c WHERE c.user_lo = LEAST(2, 3) AND c.user_hi = GREATEST(2, 3) AND c.context_key = IFNULL(NULL, 0)), '0');

-- -------------------------------------------------------------------------------------
-- startConversation(me, recipientId, postId, body): the conversation and its first message
-- in one transaction, so there is never an empty conversation (MS-4, BR-14, BR-18)
-- In queries.js:
--   tx(async t => {
--     let id;
--     try { id = (await t.q(<INSERT conversation>, [me, recipientId, postId])).insertId; }
--     catch (err) {
--       if (!isDuplicate(err)) throw err;                 // it exists already (or was created at the same moment)
--       id = (await t.q.one(<SELECT existing>, [me, recipientId, me, recipientId, postId])).conversation_id;
--       const b = await isBlocked(t, id, me);             // MS-8: an existing conversation may be blocked
--       if (b.blocked_by_me || b.blocked_by_other) return { blocked: b };  // nothing written; 403
--     }
--     const m = await t.q(<INSERT message>, [id, me, body]);
--     await t.q(<upsert read pointer>, [id, me, m.insertId]);
--     return { id };
--   })
-- A duplicate key fails only that statement, not the transaction. The other request has
-- committed by then (our INSERT waited on its row), and the SELECT ... FOR SHARE is a locking
-- read, which always sees the latest committed row (tested by hand with two clients: both
-- messages land in one conversation).
-- The block check (MS-8) is needed only on the duplicate path: a conversation this transaction
-- has just created cannot have a block row yet (blocks.conversation_id is a foreign key, and
-- nobody else can see the new row before COMMIT). It is isBlocked with FOR SHARE, for the same
-- reason as in sendMessage, so POST /messages/new can never slip a message into a blocked
-- conversation through the duplicate path.
-- -------------------------------------------------------------------------------------
-- Newbie: "Message the host" on Mandy's 600001 (Newbie never commented there: "Visitor")
SET @me = 6, @to = 2, @post = 600001, @body = 'Hi! Is the 3/F quiet zone open on Sundays too?';
START TRANSACTION;                                -- a new conversation: no block check needed
INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (@me, @to, @post);
SET @conv_new = LAST_INSERT_ID();
INSERT INTO messages (conversation_id, sender_id, body) VALUES (@conv_new, @me, @body);
SET @msg = LAST_INSERT_ID();
INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
VALUES (@conv_new, @me, @msg) AS new
ON DUPLICATE KEY UPDATE
  last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id);
COMMIT;
CALL t_eq('startConversation: conversation 3 with its first message 7; Newbie has read it',
  (SELECT CONCAT(c.conversation_id, '/', m.message_id, '/', r.last_read_message_id)
     FROM conversations c JOIN messages m ON m.conversation_id = c.conversation_id
     JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = 6
    WHERE c.conversation_id = @conv_new), '3/7/7');

-- The same request again (a second tab, or a double click): the INSERT is a duplicate, the
-- transaction goes on with the existing conversation once isBlocked says it is not blocked.
START TRANSACTION;
CALL t_err('startConversation: the same pair and post again is a duplicate key',
  'INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (6, 2, 600001)', 1062);
SET @me = 6, @to = 2, @post = 600001;
SELECT c.conversation_id INTO @conv_found
FROM conversations c
WHERE c.user_lo = LEAST(@me, @to) AND c.user_hi = GREATEST(@me, @to) AND c.context_key = IFNULL(@post, 0)
FOR SHARE;
SELECT EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv_found AND b.blocker_id =  @me FOR SHARE),
       EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv_found AND b.blocker_id <> @me FOR SHARE)
  INTO @by_me, @by_other;
CALL t_eq('startConversation: the existing conversation 3 is not blocked (0/0)', CONCAT(@by_me, '/', @by_other), '0/0');
INSERT INTO messages (conversation_id, sender_id, body) VALUES (@conv_found, @me, 'Sorry, sent twice.');
COMMIT;
CALL t_eq('startConversation: after the duplicate, the message went into conversation 3 (2 messages, 1 conversation)',
  (SELECT CONCAT(@conv_found, '/', (SELECT COUNT(*) FROM messages WHERE conversation_id = 3), '/',
                 (SELECT COUNT(*) FROM conversations WHERE user_lo = 2 AND user_hi = 6))), '3/2/1');
CALL t_err('startConversation: the reverse direction is the same conversation (Mandy -> Newbie on 600001)',
  'INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (2, 6, 600001)', 1062);
CALL t_err('startConversation: messaging yourself is refused by the CHECK (the app says 400 first)',
  'INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (6, 6, 600001)', 3819);

-- Mandy's home now: the new conversation first, Newbie shown as "Visitor" on #600001, 2 unread.
CALL t_eq('startConversation: Mandy''s home lists 3 (Visitor · #600001, 2 unread) before 1',
  (SELECT GROUP_CONCAT(CONCAT(c.conversation_id, ':', IFNULL(pp.alias_no, 'Visitor'), ':', IFNULL(c.post_id, '-'), ':',
          (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.conversation_id AND x.sender_id <> 2
             AND x.message_id > COALESCE(r.last_read_message_id, 0))) ORDER BY m.message_id DESC SEPARATOR ' ')
     FROM conversations c
     JOIN messages m ON m.conversation_id = c.conversation_id
                    AND m.message_id = (SELECT MAX(x.message_id) FROM messages x WHERE x.conversation_id = c.conversation_id)
     LEFT JOIN post_participants pp ON pp.post_id = c.post_id AND pp.user_id = IF(c.starter_id = 2, c.recipient_id, c.starter_id)
     LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = 2
    WHERE 2 IN (c.starter_id, c.recipient_id)), '3:Visitor:600001:2 1:Visitor:600005:0');

-- Wing: "Message" on Alice's comment on 600012 (Alice = Mandy). Each sees the other's alias.
INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (4, 2, 600012);
SET @conv_alias = LAST_INSERT_ID();
INSERT INTO messages (conversation_id, sender_id, body) VALUES (@conv_alias, 4, 'Thanks for the Moodle tip! Which year is easiest?');
CALL t_eq('startConversation: Mandy sees Wing as Bob (2) and Wing sees Mandy as Alice (1) on #600012',
  (SELECT CONCAT(
     (SELECT alias_no FROM post_participants WHERE post_id = 600012 AND user_id = 4), '/',
     (SELECT alias_no FROM post_participants WHERE post_id = 600012 AND user_id = 2))), '2/1');

-- Newbie by handle from Jason's user page: handles on both sides (BR-14).
INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (6, 5, NULL);
SET @conv_handle = LAST_INSERT_ID();
INSERT INTO messages (conversation_id, sender_id, body) VALUES (@conv_handle, 6, 'Hi Jason, could you share the assessment tips?');
CALL t_eq('startConversation: a handle conversation has context 0',
  (SELECT CONCAT(user_lo, '/', user_hi, '/', context_key) FROM conversations WHERE conversation_id = @conv_handle), '5/6/0');
CALL t_err('startConversation: a second handle conversation for the pair is a duplicate',
  'INSERT INTO conversations (starter_id, recipient_id) VALUES (5, 6)', 1062);

-- =====================================================================================
-- MS-8 Block (Could). One row in blocks = blocker_id has blocked conversation_id. A block
-- belongs to ONE conversation (a handle conversation or a post conversation alike), never to
-- a person: while any row exists for a conversation, neither member can send in it, and a
-- POST /messages/new that reaches it through the duplicate path is refused the same way.
-- Only the blocker can lift their own row. Nothing carries over to any other conversation,
-- so a block can never be used to test who is behind an alias (DEV_GUIDE §5 MS-8). The
-- checks run inside the sendMessage and startConversation transactions above (FOR SHARE);
-- the trigger is unchanged. The schema does not check that the blocker is a member of the
-- conversation: block() does, so it is the only way a row is written.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- block(conversationId, me): I block this conversation (MS-8)
-- INSERT ... SELECT writes a row only when I am one of the two members, so a stranger who
-- guesses an id blocks nothing. ON DUPLICATE KEY UPDATE makes a second click a no-op
-- (0 rows) instead of an error. The route checks membership with getConversation first (404).
-- -------------------------------------------------------------------------------------
SET @conv = 1, @me = 2;                           -- Mandy blocks conversation 1 ("Visitor" on #600005)
INSERT INTO blocks (conversation_id, blocker_id)
SELECT c.conversation_id, @me
  FROM conversations c
 WHERE c.conversation_id = @conv
   AND (c.starter_id = @me OR c.recipient_id = @me)              -- members only
ON DUPLICATE KEY UPDATE created_at = blocks.created_at;
CALL t_eq('block: Mandy blocks conversation 1', ROW_COUNT(), '1');
CALL t_eq('block: the only row is conversation 1 blocked by Mandy (2)',
  (SELECT GROUP_CONCAT(CONCAT(conversation_id, ':', blocker_id)) FROM blocks), '1:2');
INSERT INTO blocks (conversation_id, blocker_id)
SELECT c.conversation_id, 2 FROM conversations c
 WHERE c.conversation_id = 1 AND (c.starter_id = 2 OR c.recipient_id = 2)
ON DUPLICATE KEY UPDATE created_at = blocks.created_at;
CALL t_eq('block: blocking again changes nothing and is not an error', ROW_COUNT(), '0');
INSERT INTO blocks (conversation_id, blocker_id)
SELECT c.conversation_id, 6 FROM conversations c
 WHERE c.conversation_id = 1 AND (c.starter_id = 6 OR c.recipient_id = 6)
ON DUPLICATE KEY UPDATE created_at = blocks.created_at;
CALL t_eq('block: a non-member (Newbie) cannot block conversation 1', ROW_COUNT(), '0');
CALL t_err('block: a plain second INSERT of the same row is a duplicate key',
  'INSERT INTO blocks (conversation_id, blocker_id) VALUES (1, 2)', 1062);
CALL t_err('block: an unknown conversation is refused (foreign key)',
  'INSERT INTO blocks (conversation_id, blocker_id) VALUES (999, 2)', 1452);
CALL t_err('block: an unknown user is refused (foreign key)',
  'INSERT INTO blocks (conversation_id, blocker_id) VALUES (1, 999)', 1452);
-- Why block() must be the INSERT ... SELECT: the table alone accepts a non-member's row.
START TRANSACTION;
INSERT INTO blocks (conversation_id, blocker_id) VALUES (1, 6);
CALL t_eq('block: the schema itself does not check membership (never use a plain INSERT)',
  (SELECT COUNT(*) FROM blocks WHERE conversation_id = 1 AND blocker_id = 6), '1');
ROLLBACK;
CALL t_eq('invariant: every block row was made by a member of its conversation',
  (SELECT COUNT(*) FROM blocks b JOIN conversations c ON c.conversation_id = b.conversation_id
    WHERE b.blocker_id NOT IN (c.starter_id, c.recipient_id)), '0');

-- -------------------------------------------------------------------------------------
-- isBlocked(t, conversationId, me): is this conversation blocked, and by whom? (MS-8)
-- Called on the transaction handle t inside sendMessage and startConversation, where its
-- FOR SHARE holds the block rows (and the gap for a new one) until COMMIT.
-- Parameters: conversationId, me, conversationId, me. Pages do not call it: getConversation
-- returns the same two columns for the notice.
-- -------------------------------------------------------------------------------------
SET @conv = 1, @me = 3;                           -- Kelvin, the member who did not block
SELECT EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id =  @me FOR SHARE) AS blocked_by_me,
       EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id <> @me FOR SHARE) AS blocked_by_other
  INTO @by_me, @by_other;                         -- (INTO only for the check below)
CALL t_eq('isBlocked: Kelvin did not block, but conversation 1 is blocked by the other member (0/1)',
  CONCAT(@by_me, '/', @by_other), '0/1');

-- What the conversation page shows (the getConversation columns, for each member):
CALL t_eq('getConversation: in conversation 1 Mandy sees blocked_by_me, Kelvin sees blocked_by_other',
  (SELECT GROUP_CONCAT(CONCAT(me.id, ':',
          EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = c.conversation_id AND b.blocker_id =  me.id),
          EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = c.conversation_id AND b.blocker_id <> me.id))
          ORDER BY me.id)
     FROM conversations c JOIN (SELECT 2 AS id UNION ALL SELECT 3) me ON me.id IN (c.starter_id, c.recipient_id)
    WHERE c.conversation_id = 1), '2:10,3:01');

-- sendMessage in conversation 1 now: the check inside the transaction refuses BOTH members
-- and the transaction writes nothing. The route answers 403 with the notice for that side.
SET @messages_before = (SELECT COUNT(*) FROM messages WHERE conversation_id = 1);
SET @conv = 1, @me = 3;                           -- Kelvin tries to reply
START TRANSACTION;
SELECT EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id =  @me FOR SHARE),
       EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id <> @me FOR SHARE)
  INTO @by_me, @by_other;
COMMIT;                                           -- returned { blocked }: nothing was written
SET @kelvin = CONCAT(@by_me, '/', @by_other);
SET @conv = 1, @me = 2;                           -- Mandy, the blocker, tries to send
START TRANSACTION;
SELECT EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id =  @me FOR SHARE),
       EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv AND b.blocker_id <> @me FOR SHARE)
  INTO @by_me, @by_other;
COMMIT;
CALL t_eq('sendMessage: both are refused (Kelvin 0/1 "can no longer reply", Mandy 1/0 "blocked ... Unblock"), no new message',
  CONCAT(@kelvin, ' ', @by_me, '/', @by_other, ' ', (SELECT COUNT(*) FROM messages WHERE conversation_id = 1) - @messages_before),
  '0/1 1/0 0');

-- Nothing leaks across conversations: every other conversation, Mandy's included, is open,
-- and a handle conversation between the same two people would be a different conversation.
CALL t_eq('block: only conversation 1 is blocked; every other conversation is open',
  (SELECT CONCAT((SELECT GROUP_CONCAT(DISTINCT conversation_id) FROM blocks), '/',
                 (SELECT COUNT(*) FROM conversations c WHERE c.conversation_id <> 1
                     AND EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = c.conversation_id)))), '1/0');
CALL t_eq('block: Mandy can still send in her conversation with Newbie (3): 0/0',
  (SELECT CONCAT(EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = 3 AND b.blocker_id =  2), '/',
                 EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = 3 AND b.blocker_id <> 2))), '0/0');
CALL t_eq('block: Mandy -> kelvin0hk by handle finds no conversation, so it would start a new, unblocked one',
  (SELECT COUNT(*) FROM conversations c WHERE c.user_lo = LEAST(2, 3) AND c.user_hi = GREATEST(2, 3) AND c.context_key = IFNULL(NULL, 0)), '0');

-- Kelvin posts /messages/new?post=600005 again ("Message the host"): the INSERT is a duplicate,
-- the SELECT finds conversation 1, and isBlocked refuses it inside the transaction, so the
-- duplicate path cannot slip a message into the blocked conversation (403, nothing written).
SET @messages_before = (SELECT COUNT(*) FROM messages WHERE conversation_id = 1);
SET @me = 3, @to = 2, @post = 600005;
START TRANSACTION;
CALL t_err('startConversation: Kelvin -> Mandy on 600005 again is a duplicate key',
  'INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (3, 2, 600005)', 1062);
SELECT c.conversation_id INTO @conv_found
FROM conversations c
WHERE c.user_lo = LEAST(@me, @to) AND c.user_hi = GREATEST(@me, @to) AND c.context_key = IFNULL(@post, 0)
FOR SHARE;
SELECT EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv_found AND b.blocker_id =  @me FOR SHARE),
       EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = @conv_found AND b.blocker_id <> @me FOR SHARE)
  INTO @by_me, @by_other;
COMMIT;                                           -- returned { blocked }: nothing was written
CALL t_eq('startConversation: it reaches conversation 1, is refused (0/1) and writes no message',
  CONCAT(@conv_found, '/', @by_me, '/', @by_other, '/', (SELECT COUNT(*) FROM messages WHERE conversation_id = 1) - @messages_before),
  '1/0/1/0');

-- -------------------------------------------------------------------------------------
-- unblock(conversationId, me): I lift MY block (MS-8). Only the blocker's own row can go;
-- 0 rows means I had no block here (the flash is the same). Another member's block stays,
-- and so does the refusal, until they lift it too.
-- -------------------------------------------------------------------------------------
SET @conv = 1, @me = 3;                           -- Kelvin cannot lift Mandy's block
DELETE FROM blocks WHERE conversation_id = @conv AND blocker_id = @me;
CALL t_eq('unblock: the member who did not block cannot lift the block', ROW_COUNT(), '0');
CALL t_eq('unblock: Mandy''s block is still there',
  (SELECT COUNT(*) FROM blocks WHERE conversation_id = 1 AND blocker_id = 2), '1');
-- Kelvin blocks as well: now each member has a row.
INSERT INTO blocks (conversation_id, blocker_id)
SELECT c.conversation_id, 3 FROM conversations c
 WHERE c.conversation_id = 1 AND (c.starter_id = 3 OR c.recipient_id = 3)
ON DUPLICATE KEY UPDATE created_at = blocks.created_at;
CALL t_eq('block: Kelvin blocks conversation 1 too (two rows)',
  (SELECT COUNT(*) FROM blocks WHERE conversation_id = 1), '2');
SET @conv = 1, @me = 2;
DELETE FROM blocks WHERE conversation_id = @conv AND blocker_id = @me;
CALL t_eq('unblock: Mandy lifts her own block', ROW_COUNT(), '1');
CALL t_eq('unblock: Kelvin''s block stays, so both are still refused (Mandy now 0/1, Kelvin 1/0)',
  (SELECT GROUP_CONCAT(CONCAT(me.id, ':',
          EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = 1 AND b.blocker_id =  me.id), '/',
          EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = 1 AND b.blocker_id <> me.id)) ORDER BY me.id)
     FROM (SELECT 2 AS id UNION ALL SELECT 3) me), '2:0/1,3:1/0');
SET @conv = 1, @me = 3;
DELETE FROM blocks WHERE conversation_id = @conv AND blocker_id = @me;
CALL t_eq('unblock: Kelvin lifts his', ROW_COUNT(), '1');
CALL t_eq('unblock: no block is left; conversation 1 can be used again', (SELECT COUNT(*) FROM blocks), '0');

-- -------------------------------------------------------------------------------------
-- Reporting (MS-6, BR-15). A post target is checked with core findVisible(id, me) (404 when
-- null) and card.author_id === me (400 "You cannot report your own post").
-- commentForReport(commentId, myUniversityId): the comment, if it is live (not deleted or
-- hidden) and its post is live and visible to me; author_id only for the "own comment" test.
-- -------------------------------------------------------------------------------------
SET @comment = 11, @my_uni = 1;
SELECT ci.comment_id, ci.post_id, ci.author_id, ci.alias_no, ci.body
FROM v_comment_items ci
JOIN v_live_posts p ON p.post_id = ci.post_id
WHERE ci.comment_id = @comment
  AND ci.body IS NOT NULL                                           -- BR-8, BR-9
  AND (p.visibility = 'all' OR p.author_university_id = @my_uni);  -- BR-5
CALL t_eq('commentForReport: comment 11 is Bob''s on #600012',
  (SELECT CONCAT(ci.post_id, '/', ci.alias_no) FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
    WHERE ci.comment_id = 11 AND ci.body IS NOT NULL AND (p.visibility = 'all' OR p.author_university_id = 1)), '600012/2');
CALL t_eq('commentForReport: hidden comment 12 and deleted comment 6 give no row (404)',
  (SELECT COUNT(*) FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
    WHERE ci.comment_id IN (6, 12) AND ci.body IS NOT NULL AND (p.visibility = 'all' OR p.author_university_id = 1)), '0');
CALL t_eq('commentForReport: Wing (CUHK) cannot report comment 2 on HKU-only 600001 (404)',
  (SELECT COUNT(*) FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
    WHERE ci.comment_id = 2 AND ci.body IS NOT NULL AND (p.visibility = 'all' OR p.author_university_id = 2)), '0');
CALL t_eq('report: Kelvin wrote 600007, so his own report is refused with 400',
  (SELECT author_id = 3 FROM v_live_posts WHERE post_id = 600007), '1');

-- fileReport(me, targetType, targetId, reason, details): one report per person per target.
-- isDuplicate(err) -> flash "You have already reported this" and redirect to the post.
SET @me = 6, @type = 'post', @target = 600007, @reason = 'spam', @details = '';
INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
VALUES (@me, @type, @target, @reason, @details);
CALL t_eq('fileReport: Newbie reports post 600007 (report 4)', LAST_INSERT_ID(), '4');
CALL t_err('fileReport: the same person again is a duplicate',
  'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (6, ''post'', 600007, ''other'')', 1062);
CALL t_err('fileReport: Mandy already reported 600007 (seed report 3)',
  'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (2, ''post'', 600007, ''spam'')', 1062);
-- (An unknown reason is refused by the ENUM in strict mode, error 1265; the route checks it
-- first with oneOf(reason, ['spam', 'harassment', 'privacy', 'other']).)
CALL t_err('fileReport: details are at most 300 characters (BR-18)',
  CONCAT('INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (4, ''post'', 600004, ''other'', ''', REPEAT('d', 301), ''')'), 1406);
-- Mandy reports Newbie's rude reply (comment 15); Newbie reports the friendly comment 11 by mistake.
INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
VALUES (2, 'comment', @c_newbie, 'harassment', 'Rude reply to my advice');
SET @r_rude = LAST_INSERT_ID();                  -- 7: the two refused inserts above used up 5 and 6
                                                 -- (InnoDB never gives auto-increment values back)
INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
VALUES (6, 'comment', 11, 'harassment', '');
SET @r_mistake = LAST_INSERT_ID();               -- 8

-- -------------------------------------------------------------------------------------
-- listOpenReports(): the admin queue, one row per reported post or comment (MS-7, BR-15)
-- report_id: any report on the target (the lowest), used in the hide and dismiss URLs.
-- The content's text is read from the tables, not the views, so admins see it even if it
-- was deleted since; author_handle is shown to admins only (BR-15).
-- -------------------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT g.target_type, g.target_id, g.report_id, g.report_count, g.reasons, g.details, g.first_reported_at,
       COALESCE(p.post_id, c.post_id)                         AS post_id,
       COALESCE(p.body, c.body)                               AS content_body,
       COALESCE(p.deleted_at, c.deleted_at) IS NOT NULL       AS deleted_by_author,
       au.handle                                              AS author_handle   -- admins only (BR-15)
FROM (SELECT r.target_type, r.target_id,
             MIN(r.report_id)                                                   AS report_id,
             COUNT(*)                                                           AS report_count,
             GROUP_CONCAT(DISTINCT r.reason ORDER BY r.reason SEPARATOR ', ')   AS reasons,
             GROUP_CONCAT(NULLIF(r.details, '') ORDER BY r.report_id SEPARATOR ' | ') AS details,
             MIN(r.created_at)                                                  AS first_reported_at
        FROM reports r
       WHERE r.resolved_at IS NULL
       GROUP BY r.target_type, r.target_id) g
LEFT JOIN posts p    ON g.target_type = 'post'    AND p.post_id = g.target_id
LEFT JOIN comments c ON g.target_type = 'comment' AND c.comment_id = g.target_id
LEFT JOIN users au   ON au.user_id = COALESCE(p.author_id, c.author_id)
ORDER BY g.first_reported_at, g.report_id;
CALL t_eq('listOpenReports: three targets, oldest first, with counts and reasons',
  (SELECT GROUP_CONCAT(CONCAT(target_type, ' ', target_id, ' x', report_count, ' (', reasons, ') via ', report_id)
          ORDER BY first_reported_at, report_id SEPARATOR '; ') FROM res),
  'post 600007 x2 (spam, other) via 3; comment 15 x1 (harassment) via 7; comment 11 x1 (harassment) via 8');
CALL t_eq('listOpenReports: admins see the text and the author''s handle (BR-15)',
  (SELECT CONCAT(content_body, ' / ', author_handle, ' / ', details) FROM res WHERE target_type = 'post'),
  'Who else heard the fire alarm in Haking Wong at 3am? / kelvin0hk / Is this a real alarm or a joke?');
CALL t_eq('listOpenReports: a comment row links to its post',
  (SELECT CONCAT(post_id, '/', author_handle, '/', deleted_by_author) FROM res WHERE target_type = 'comment' AND target_id = 11),
  '600012/wing0cuhk/0');

-- -------------------------------------------------------------------------------------
-- hideTarget(reportId, adminId): hide the content and resolve EVERY open report on it,
-- in one transaction (MS-7, BR-9, BR-15)
-- In queries.js: tx(async t => {
--   const r = await t.q.one(<SELECT target>, [reportId]);
--   if (!r) return null;                                // no such report: 404
--   await t.q(<INSERT hidden_content>, [r.target_type, r.target_id, adminId, r.hide_reason]);
--   await t.q(<UPDATE reports>, [adminId, r.target_type, r.target_id]);
--   return r; })
-- ON DUPLICATE KEY UPDATE hidden_at = hidden_at: hiding something already hidden (a second
-- admin, a double click) keeps the first hide and is not an error.
-- -------------------------------------------------------------------------------------
SET @report = 3, @admin = 1;                      -- report 3: Mandy's report on post 600007
START TRANSACTION;
SELECT r.target_type, r.target_id,
       CONCAT(UPPER(LEFT(r.reason, 1)), SUBSTRING(r.reason, 2), ' (report ', r.report_id, ')') AS hide_reason
  INTO @type, @target, @hide_reason
  FROM reports r WHERE r.report_id = @report;
INSERT INTO hidden_content (target_type, target_id, hidden_by, reason)
VALUES (@type, @target, @admin, @hide_reason)
ON DUPLICATE KEY UPDATE hidden_at = hidden_at;
UPDATE reports
   SET resolved_at = UTC_TIMESTAMP(), resolved_by = @admin, resolution = 'hidden'
 WHERE target_type = @type AND target_id = @target AND resolved_at IS NULL;
CALL t_eq('hideTarget: both open reports on 600007 (3 and 4) are resolved', ROW_COUNT(), '2');
COMMIT;
CALL t_eq('hideTarget: the hidden row carries the reason "Other (report 3)"',
  (SELECT CONCAT(target_type, ' ', target_id, ' / ', reason, ' / ', hidden_by) FROM hidden_content WHERE target_type = 'post' AND target_id = 600007),
  'post 600007 / Other (report 3) / 1');
CALL t_eq('hideTarget: reports 3 and 4 say hidden by the admin',
  (SELECT GROUP_CONCAT(CONCAT(report_id, ':', resolution, ':', resolved_by) ORDER BY report_id) FROM reports WHERE target_id = 600007),
  '3:hidden:1,4:hidden:1');
CALL t_eq('hideTarget: 600007 left v_live_posts, so an HKU viewer now sees 9 posts (was 10)',
  (SELECT COUNT(*) FROM v_live_posts p WHERE p.visibility = 'all' OR p.author_university_id = 1), '9');
INSERT INTO hidden_content (target_type, target_id, hidden_by, reason)
VALUES ('post', 600007, 1, 'again') ON DUPLICATE KEY UPDATE hidden_at = hidden_at;
CALL t_eq('hideTarget: hiding it again is a no-op (the first reason stays)',
  (SELECT reason FROM hidden_content WHERE target_type = 'post' AND target_id = 600007), 'Other (report 3)');

-- Hide Newbie's rude comment 15: the thread and Mandy's notification show "[hidden by a moderator]".
SET @report = @r_rude, @admin = 1;
START TRANSACTION;
SELECT r.target_type, r.target_id,
       CONCAT(UPPER(LEFT(r.reason, 1)), SUBSTRING(r.reason, 2), ' (report ', r.report_id, ')')
  INTO @type, @target, @hide_reason
  FROM reports r WHERE r.report_id = @report;
INSERT INTO hidden_content (target_type, target_id, hidden_by, reason)
VALUES (@type, @target, @admin, @hide_reason)
ON DUPLICATE KEY UPDATE hidden_at = hidden_at;
UPDATE reports SET resolved_at = UTC_TIMESTAMP(), resolved_by = @admin, resolution = 'hidden'
 WHERE target_type = @type AND target_id = @target AND resolved_at IS NULL;
COMMIT;
CALL t_eq('hideTarget: comment 15 keeps its place with no text (is_hidden 1)',
  (SELECT CONCAT(IFNULL(body, 'NULL'), '/', is_hidden) FROM v_comment_items WHERE comment_id = 15), 'NULL/1');
CALL t_eq('hideTarget: Mandy''s notification #32 now shows "[hidden by a moderator]"',
  (SELECT CONCAT(n.type, '/', pp.alias_no, '/', IFNULL(ci.body, 'NULL'), '/', ci.is_hidden)
     FROM notifications n
     LEFT JOIN post_participants pp ON pp.post_id = n.post_id AND pp.user_id = n.actor_id AND n.type <> 'like_on_post'
     LEFT JOIN v_comment_items ci ON ci.comment_id = n.comment_id
    WHERE n.notification_id = 32), 'reply_to_comment/4/NULL/1');

-- -------------------------------------------------------------------------------------
-- dismissTarget(reportId, adminId): resolve every open report on the target, hide nothing (MS-7)
-- -------------------------------------------------------------------------------------
SET @report = @r_mistake, @admin = 1;
SELECT r.target_type, r.target_id INTO @type, @target FROM reports r WHERE r.report_id = @report;
UPDATE reports
   SET resolved_at = UTC_TIMESTAMP(), resolved_by = @admin, resolution = 'dismissed'
 WHERE target_type = @type AND target_id = @target AND resolved_at IS NULL;
CALL t_eq('dismissTarget: report 8 on comment 11 is dismissed', ROW_COUNT(), '1');
CALL t_eq('dismissTarget: comment 11 is not hidden and keeps its text',
  (SELECT CONCAT(is_hidden, '/', body) FROM v_comment_items WHERE comment_id = 11), '0/加油！You got this.');
CALL t_eq('dismissTarget: the queue is now empty',
  (SELECT COUNT(*) FROM reports WHERE resolved_at IS NULL), '0');
CALL t_err('dismissTarget: a resolution needs a time too (CHECK)',
  'UPDATE reports SET resolved_at = NULL WHERE target_type = ''comment'' AND target_id = 11', 3819);

-- -------------------------------------------------------------------------------------
-- listHidden(): the "Hidden content" section with Restore buttons (MS-7, BR-9, BR-15)
-- -------------------------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS res;
CREATE TEMPORARY TABLE res AS
SELECT h.target_type, h.target_id, h.reason, h.hidden_at,
       ah.handle                         AS hidden_by_handle,
       COALESCE(p.post_id, c.post_id)    AS post_id,
       COALESCE(p.body, c.body)          AS content_body,
       au.handle                         AS author_handle         -- admins only (BR-15)
FROM hidden_content h
JOIN users ah        ON ah.user_id = h.hidden_by
LEFT JOIN posts p    ON h.target_type = 'post'    AND p.post_id = h.target_id
LEFT JOIN comments c ON h.target_type = 'comment' AND c.comment_id = h.target_id
LEFT JOIN users au   ON au.user_id = COALESCE(p.author_id, c.author_id)
ORDER BY h.hidden_at DESC, h.target_type, h.target_id;
CALL t_eq('listHidden: four hidden items (two from the seed, two just now)',
  (SELECT GROUP_CONCAT(CONCAT(target_type, ' ', target_id, ' by ', author_handle) ORDER BY target_type, target_id SEPARATOR '; ') FROM res),
  'post 600007 by kelvin0hk; post 600010 by jason0ust; comment 12 by jason0ust; comment 15 by newbie0hk');

-- -------------------------------------------------------------------------------------
-- restoreHidden(targetType, targetId): Restore = delete the row (MS-7, BR-9). The reports
-- stay resolved as a record. 0 rows: it was already restored (flash the same message).
-- -------------------------------------------------------------------------------------
SET @type = 'post', @target = 600007;
DELETE FROM hidden_content WHERE target_type = @type AND target_id = @target;
CALL t_eq('restoreHidden: one row deleted', ROW_COUNT(), '1');
CALL t_eq('restoreHidden: 600007 is live again (HKU viewer back to 10 posts)',
  (SELECT COUNT(*) FROM v_live_posts p WHERE p.visibility = 'all' OR p.author_university_id = 1), '10');
CALL t_eq('restoreHidden: its reports stay resolved',
  (SELECT COUNT(*) FROM reports WHERE target_id = 600007 AND resolved_at IS NULL), '0');
DELETE FROM hidden_content WHERE target_type = 'post' AND target_id = 600007;
CALL t_eq('restoreHidden: restoring twice changes nothing', ROW_COUNT(), '0');

-- Final invariants for this module.
CALL t_eq('invariant: no notification was ever sent to its own actor',
  (SELECT COUNT(*) FROM notifications WHERE recipient_id = actor_id), '0');
CALL t_eq('invariant: every conversation has at least one message',
  (SELECT COUNT(*) FROM conversations c WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.conversation_id)), '0');
