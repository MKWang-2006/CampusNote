-- =====================================================================================
-- Contract checks: the rules every module relies on. Run by run_all.sh on a fresh
-- database (schema -> triggers -> seed -> helpers). Owner: backbone.
-- If one of these fails after a schema change, the change broke a promise to a module.
-- =====================================================================================
SET time_zone = '+00:00';

-- ---------------------------------------------------------------- seed shape
CALL t_eq('seed: 14 posts, 12 live (one deleted, one hidden)',
  (SELECT CONCAT((SELECT COUNT(*) FROM posts), '/', (SELECT COUNT(*) FROM v_live_posts), '/', (SELECT COUNT(*) FROM v_post_cards))), '14/12/12');
CALL t_eq('seed: post ids start at 600001 and the next id is 600015',
  (SELECT CONCAT(MIN(post_id), '/', (SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts')) FROM posts), '600001/600015');

-- ---------------------------------------------------------------- v_post_cards
CALL t_eq('cards: counts on the hot post 600012 (likes/watches/live comments/views)',
  (SELECT CONCAT(like_count, '/', watch_count, '/', comment_count, '/', view_count) FROM v_post_cards WHERE post_id = 600012), '3/1/4/11');
CALL t_eq('cards: a hidden comment is not counted (600012 has 5 comments, 1 hidden)',
  (SELECT comment_count FROM v_post_cards WHERE post_id = 600012), '4');
CALL t_eq('cards: a deleted comment is not counted (600002 has 4 comments, 1 deleted)',
  (SELECT comment_count FROM v_post_cards WHERE post_id = 600002), '3');
CALL t_eq('cards: anonymous post has no author_handle',
  (SELECT IFNULL(author_handle, 'NULL') FROM v_post_cards WHERE post_id = 600012), 'NULL');
CALL t_eq('cards: named post shows the handle',
  (SELECT CONCAT(author_handle, '/', author_name, '/', author_is_org) FROM v_post_cards WHERE post_id = 600004), 'jason0ust/jason0ust/0');
CALL t_eq('cards: an organization post shows its display name',
  (SELECT CONCAT(author_name, '/', author_is_org) FROM v_post_cards WHERE post_id = 600006), 'HKU Film Society/1');
CALL t_eq('cards: an anonymous post hides name and role',
  (SELECT CONCAT(IFNULL(author_name, 'NULL'), '/', author_is_org) FROM v_post_cards WHERE post_id = 600002), 'NULL/0');
CALL t_eq('cards: cover is image 1 and image_count counts all',
  (SELECT CONCAT(cover_path, ' x', image_count) FROM v_post_cards WHERE post_id = 600005), '/static/seed/textbook-1.svg x2');
CALL t_eq('cards: deleted post 600009 and hidden post 600010 are gone',
  (SELECT COUNT(*) FROM v_post_cards WHERE post_id IN (600009, 600010)), '0');

-- ---------------------------------------------------------------- visibility predicate
-- (c.visibility = 'all' OR c.author_university_id = :viewer_university)
CALL t_eq('visibility: HKU viewer sees 10 live posts',
  (SELECT COUNT(*) FROM v_post_cards c WHERE c.visibility = 'all' OR c.author_university_id = 1), '10');
CALL t_eq('visibility: CUHK viewer sees 7 (no HKU-only or HKUST-only posts)',
  (SELECT GROUP_CONCAT(post_id ORDER BY post_id) FROM v_post_cards c WHERE c.visibility = 'all' OR c.author_university_id = 2),
  '600002,600003,600004,600006,600008,600011,600012');
CALL t_eq('visibility: HKUST viewer sees 7',
  (SELECT COUNT(*) FROM v_post_cards c WHERE c.visibility = 'all' OR c.author_university_id = 3), '7');

-- ---------------------------------------------------------------- v_comment_items
CALL t_eq('comments: aliases follow first-comment order on 600012 (host is 0)',
  (SELECT GROUP_CONCAT(alias_no ORDER BY comment_id) FROM v_comment_items WHERE post_id = 600012), '1,2,3,0,1');
CALL t_eq('comments: reply shows the alias it answers',
  (SELECT reply_to_alias_no FROM v_comment_items WHERE comment_id = 14), '0');
CALL t_eq('comments: hidden comment keeps its place but loses its text',
  (SELECT CONCAT(IFNULL(body, 'NULL'), '/', is_hidden, '/', is_deleted) FROM v_comment_items WHERE comment_id = 12), 'NULL/1/0');
CALL t_eq('comments: deleted comment keeps its place but loses its text',
  (SELECT CONCAT(IFNULL(body, 'NULL'), '/', is_hidden, '/', is_deleted) FROM v_comment_items WHERE comment_id = 6), 'NULL/0/1');

-- ---------------------------------------------------------------- constraints
CALL t_err('check: handle must be 9 lowercase letters or digits',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''x@hku.hk'', 1, ''ABCDEFGHI'', ''h'')', 3819);
CALL t_err('check: e-mail must be stored in lower case',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''X@hku.hk'', 1, ''abcdefghi'', ''h'')', 3819);
CALL t_err('unique: one account per e-mail',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''mandy@connect.hku.hk'', 1, ''abcdefghi'', ''h'')', 1062);
CALL t_err('check: domain must be lower case',
  'INSERT INTO university_domains VALUES (''HKU.EDU'', 1)', 3819);
CALL t_err('check: post body cannot be blank',
  'INSERT INTO posts (author_id, topic_id, body, avatar_code) VALUES (2, 2, ''   '', ''cat'')', 3819);
CALL t_err('check: post body is at most 750 characters',
  CONCAT('INSERT INTO posts (author_id, topic_id, body, avatar_code) VALUES (2, 2, ''', REPEAT('a', 751), ''', ''cat'')'), 1406);
CALL t_err('check: at most 6 images per post',
  'INSERT INTO post_images VALUES (600001, 7, ''/x.jpg'')', 3819);
CALL t_err('fk: a user cannot comment before joining the post (no alias yet)',
  'INSERT INTO comments (post_id, author_id, body) VALUES (600003, 6, ''hi'')', 1452);
CALL t_err('fk: a reply must answer a comment on the SAME post',
  'INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (600002, 2, 1, ''hi'')', 1452);
CALL t_err('unique: one alias number per post',
  'INSERT INTO post_participants (post_id, user_id, alias_no) VALUES (600012, 6, 1)', 1062);
CALL t_err('pk: one like per user per post',
  'INSERT INTO post_likes (user_id, post_id) VALUES (2, 600012)', 1062);
CALL t_err('check: announcement links must be internal paths',
  'INSERT INTO announcements (title, link_url, starts_at, ends_at, created_by) VALUES (''x'', ''https://evil.example'', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)', 3819);
CALL t_err('check: announcement links cannot start with //',
  'INSERT INTO announcements (title, link_url, starts_at, ends_at, created_by) VALUES (''x'', ''//evil.example'', UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 1 DAY, 1)', 3819);
CALL t_err('check: a conversation needs two different people',
  'INSERT INTO conversations (starter_id, recipient_id) VALUES (2, 2)', 3819);
CALL t_err('unique: one conversation per pair per post, whoever starts it',
  'INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (2, 3, 600005)', 1062);
CALL t_err('unique: one handle-to-handle conversation per pair',
  'INSERT INTO conversations (starter_id, recipient_id) VALUES (5, 4)', 1062);
CALL t_err('check: a report is resolved with both a time and a resolution',
  'UPDATE reports SET resolved_at = UTC_TIMESTAMP() WHERE report_id = 3', 3819);
CALL t_err('unique: one report per user per target',
  'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (2, ''post'', 600010, ''spam'')', 1062);
CALL t_err('check: tickets_left can never exceed capacity',
  'UPDATE events SET tickets_left = 51 WHERE event_id = 1', 3819);
CALL t_err('check: tickets_left can never go below zero (UNSIGNED)',
  'UPDATE events SET tickets_left = tickets_left - 1 WHERE event_id = 2', 1690);
CALL t_err('check: release must be before the start',
  'UPDATE events SET release_at = starts_at + INTERVAL 1 HOUR WHERE event_id = 1', 3819);
CALL t_err('pk: one ticket per user per event',
  'INSERT INTO tickets (event_id, user_id, ticket_code) VALUES (1, 2, ''ZZZZZZZZ'')', 1062);

-- ---------------------------------------------------------------- triggers (messages module)
CALL t_eq('triggers: the seed produced 31 notifications (19 comment, 12 like)',
  (SELECT CONCAT(COUNT(*), '/', SUM(type <> 'like_on_post'), '/', SUM(type = 'like_on_post')) FROM notifications), '31/19/12');
CALL t_eq('triggers: no notification is ever sent to the actor',
  (SELECT COUNT(*) FROM notifications WHERE recipient_id = actor_id), '0');
CALL t_eq('triggers: Kelvin switched like notifications off, so none for him',
  (SELECT COUNT(*) FROM notifications WHERE recipient_id = 3 AND type = 'like_on_post'), '0');
CALL t_eq('triggers: a reply to the post author notifies them once, as a reply',
  (SELECT GROUP_CONCAT(type) FROM notifications WHERE comment_id = 14), 'reply_to_comment');
CALL t_eq('triggers: a watcher is told about new comments on a watched post',
  (SELECT GROUP_CONCAT(CONCAT(recipient_id, ':', type) ORDER BY recipient_id) FROM notifications WHERE comment_id = 11),
  '2:comment_on_watched,3:comment_on_post');
-- new like by Newbie on Mandy's post 600001 -> one notification; unlike + like again -> still one
INSERT INTO post_likes (user_id, post_id) VALUES (6, 600001);
DELETE FROM post_likes WHERE user_id = 6 AND post_id = 600001;
INSERT INTO post_likes (user_id, post_id) VALUES (6, 600001);
CALL t_eq('triggers: like, unlike, like again notifies the author only once',
  (SELECT COUNT(*) FROM notifications WHERE actor_id = 6 AND post_id = 600001 AND type = 'like_on_post'), '1');
CALL t_err('trigger: only members can write in a conversation (Newbie into 1)',
  'INSERT INTO messages (conversation_id, sender_id, body) VALUES (1, 6, ''hi'')', 1644);
INSERT INTO messages (conversation_id, sender_id, body) VALUES (1, 2, 'See you Friday!');
CALL t_eq('trigger: a member can write in their conversation',
  (SELECT COUNT(*) FROM messages WHERE conversation_id = 1), '4');

-- ---------------------------------------------------------------- full-text search (ngram)
CALL t_eq('search: "main" is found (proves stopwords are off for the ngram index)',
  (SELECT GROUP_CONCAT(post_id ORDER BY post_id) FROM posts WHERE MATCH(body) AGAINST ('+"main"' IN BOOLEAN MODE)), '600001');
CALL t_eq('search: Chinese words are found ("叉烧")',
  (SELECT GROUP_CONCAT(post_id) FROM posts WHERE MATCH(body) AGAINST ('+"叉烧"' IN BOOLEAN MODE)), '600002');
CALL t_eq('search: several words must all appear ("library" and "jacket")',
  (SELECT GROUP_CONCAT(post_id) FROM posts WHERE MATCH(body) AGAINST ('+"library" +"jacket"' IN BOOLEAN MODE)), '600001');
CALL t_eq('search: a misspelling finds nothing ("libary")',
  (SELECT COUNT(*) FROM posts WHERE MATCH(body) AGAINST ('+"libary"' IN BOOLEAN MODE)), '0');

-- ---------------------------------------------------------------- time zone
INSERT INTO outbox (to_email, subject, body_text) VALUES ('tz@hku.hk', 'tz', 'tz');
CALL t_eq('time: DEFAULT CURRENT_TIMESTAMP is UTC when the session time zone is +00:00',
  (SELECT ABS(TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())) <= 5 FROM outbox WHERE to_email = 'tz@hku.hk'), '1');
