-- =====================================================================================
-- Campus Notes: core seed. Owner: backbone.
-- Loaded by `npm run db:reset` AFTER schema.sql and every module's db/*.sql, so the
-- messages triggers turn the seeded comments and likes into notifications.
--
-- The seed is the one place allowed to write every table: it is a test fixture, not a
-- module. Every module can build and test its pages against this data from day one,
-- without waiting for the module that normally creates it.
--
-- All demo accounts use the password  campus123  (bcrypt hash below).
-- Times are relative to the moment of loading, so the feed always looks fresh.
-- Persona names (Mandy, Kelvin, ...) are for developers only; the app shows handles.
-- =====================================================================================
SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET @now = UTC_TIMESTAMP();
SET @pw  = '$2a$10$BQXplPmPWQ5gXkjIbT1MmOYLVK74US3DzjohpkazjNKPPp.RXNx5C';  -- campus123

-- ---------------------------------------------------------------- reference data
INSERT INTO universities (university_id, code, name_en, name_zh) VALUES
  (1, 'HKU',   'The University of Hong Kong',                     '香港大学'),
  (2, 'CUHK',  'The Chinese University of Hong Kong',             '香港中文大学'),
  (3, 'HKUST', 'The Hong Kong University of Science and Technology', '香港科技大学');

INSERT INTO university_domains (domain, university_id) VALUES
  ('hku.hk', 1), ('connect.hku.hk', 1),
  ('cuhk.edu.hk', 2), ('link.cuhk.edu.hk', 2),
  ('ust.hk', 3), ('connect.ust.hk', 3);

INSERT INTO topics (topic_id, code, name_en, name_zh, sort_order) VALUES
  (1, 'share',     'Share',     '分享', 1),
  (2, 'random',    'Random',    '随写', 2),
  (3, 'feelings',  'Feelings',  '情感', 3),
  (4, 'academics', 'Academics', '学业', 4),
  (5, 'careers',   'Careers',   '求职', 5),
  (6, 'trade',     'Trade',     '交易', 6),
  (7, 'food',      'Food',      '美食', 7);

-- ---------------------------------------------------------------- personas
-- id handle     persona            university  role          notes
--  1 admin0000  Admin              HKU         admin         moderates reports, posts announcements
--  2 mandy0hku  Mandy              HKU         student       active poster; has unread DMs and notifications
--  3 kelvin0hk  Kelvin             HKU         student       comments, watches; author of the hot post
--  4 wing0cuhk  Wing               CUHK        student       sees HKU posts only when shared with all universities
--  5 jason0ust  Jason              HKUST       student       posts with his handle shown
--  6 newbie0hk  Newbie             HKU         student       brand new: every list is empty (empty states)
--  7 filmsoc00  HKU Film Society   HKU         organization  runs events
--  8 hikeclub0  CUHK Hiking Club   CUHK        organization  runs events (one sold out, one past)
INSERT INTO users (user_id, email, university_id, handle, password_hash, role, avatar_code, bio,
                   default_anonymous, default_visibility, notify_comments, notify_likes, created_at, last_login_at) VALUES
  (1, 'admin@hku.hk',               1, 'admin0000', @pw, 'admin',        'owl',     'Campus Notes moderator', 1, 'university', 1, 1, @now - INTERVAL 30 DAY, @now - INTERVAL 1 HOUR),
  (2, 'mandy@connect.hku.hk',       1, 'mandy0hku', @pw, 'student',      'cat',     'Year 3, FinTech',        1, 'university', 1, 1, @now - INTERVAL 20 DAY, @now - INTERVAL 2 HOUR),
  (3, 'kelvin@connect.hku.hk',      1, 'kelvin0hk', @pw, 'student',      'fox',     '',                       1, 'all',        1, 0, @now - INTERVAL 19 DAY, @now - INTERVAL 3 HOUR),
  (4, 'wing@link.cuhk.edu.hk',      2, 'wing0cuhk', @pw, 'student',      'panda',   'CUHK Year 1',            1, 'all',        1, 1, @now - INTERVAL 15 DAY, @now - INTERVAL 5 HOUR),
  (5, 'jason@connect.ust.hk',       3, 'jason0ust', @pw, 'student',      'penguin', 'HKUST, looking for internships', 0, 'all', 1, 1, @now - INTERVAL 12 DAY, @now - INTERVAL 1 DAY),
  (6, 'newbie@connect.hku.hk',      1, 'newbie0hk', @pw, 'student',      'rabbit',  '',                       1, 'university', 1, 1, @now - INTERVAL 1 HOUR, NULL),
  (7, 'filmsoc@hku.hk',             1, 'filmsoc00', @pw, 'organization', 'film',    '',                       0, 'all',        1, 1, @now - INTERVAL 60 DAY, @now - INTERVAL 1 DAY),
  (8, 'hikeclub@cuhk.edu.hk',       2, 'hikeclub0', @pw, 'organization', 'mountain','',                       0, 'all',        1, 1, @now - INTERVAL 60 DAY, @now - INTERVAL 2 DAY);

INSERT INTO organizations (user_id, display_name, description, logo_path) VALUES
  (7, 'HKU Film Society', 'Weekly screenings and director talks.', '/static/seed/org-filmsoc.svg'),
  (8, 'CUHK Hiking Club', 'Weekend hikes for all levels.',        '/static/seed/org-hikeclub.svg');

-- ---------------------------------------------------------------- posts (ids start at 600001)
-- visibility 'university' = only the author's university can see it; 'all' = all three.
INSERT INTO posts (post_id, author_id, topic_id, body, is_anonymous, visibility, avatar_code, created_at, deleted_at) VALUES
  (600001, 2, 4, 'Main Library 3/F quiet zone is open until midnight in revision weeks. Bring a jacket, the aircon is strong.', 1, 'university', 'koala',   @now - INTERVAL 6 DAY, NULL),
  (600002, 3, 7, 'Best char siu rice near campus? 求推荐学校附近的叉烧饭', 1, 'all', 'tiger', @now - INTERVAL 5 DAY, NULL),
  (600003, 4, 3, '第一次离家住宿舍，有点想家。Anyone else feeling homesick in their first term?', 1, 'all', 'whale', @now - INTERVAL 4 DAY, NULL),
  (600004, 5, 5, 'Summer internship at a bank: the online assessment had a numerical test, a situational test and a video interview. Happy to share tips.', 0, 'all', 'penguin', @now - INTERVAL 3 DAY, NULL),
  (600005, 2, 6, 'Selling my used COMP3278 textbook, good condition, HKD 80. DM me.', 1, 'university', 'koala', @now - INTERVAL 2 DAY, NULL),
  (600006, 7, 1, 'Film night this Friday: free screening with snacks. Book a ticket in Events, seats are limited!', 0, 'all', 'film', @now - INTERVAL 47 HOUR, NULL),
  (600007, 3, 2, 'Who else heard the fire alarm in Haking Wong at 3am?', 1, 'university', 'tiger', @now - INTERVAL 26 HOUR, NULL),
  (600008, 4, 4, 'CUHK only: is the UL library open on Sunday during reading week?', 1, 'university', 'whale', @now - INTERVAL 20 HOUR, NULL),
  (600009, 2, 2, 'Posted this by mistake, deleting.', 1, 'all', 'koala', @now - INTERVAL 18 HOUR, @now - INTERVAL 17 HOUR),
  (600010, 5, 2, 'Buy 1000 followers for HKD 10!!! visit my link', 1, 'all', 'penguin', @now - INTERVAL 16 HOUR, NULL),
  (600011, 8, 1, 'Dragon''s Back sunrise hike this Sunday, 30 spots. Beginners welcome.', 0, 'all', 'mountain', @now - INTERVAL 12 HOUR, NULL),
  (600012, 3, 3, 'Midterm tomorrow and I have read nothing. 救命 😭', 1, 'all', 'tiger', @now - INTERVAL 3 HOUR, NULL),
  (600013, 2, 7, 'The canteen has a new menu: the curry fish ball noodles are worth it.', 0, 'university', 'cat', @now - INTERVAL 1 HOUR, NULL),
  (600014, 5, 4, 'HKUST only: anyone selling a used TI-84 calculator?', 1, 'university', 'penguin', @now - INTERVAL 30 MINUTE, NULL);
ALTER TABLE posts AUTO_INCREMENT = 600015;

INSERT INTO post_images (post_id, position, file_path) VALUES
  (600001, 1, '/static/seed/library.svg'),
  (600005, 1, '/static/seed/textbook-1.svg'), (600005, 2, '/static/seed/textbook-2.svg'),
  (600006, 1, '/static/seed/film-night.svg'),
  (600011, 1, '/static/seed/dragons-back.svg');

-- Every author is alias 0 ("Host") on their own post. The content module inserts this row
-- in the same transaction as the post.
INSERT INTO post_participants (post_id, user_id, alias_no, joined_at)
SELECT post_id, author_id, 0, created_at FROM posts;

-- ---------------------------------------------------------------- watches, likes, views
-- Interactions respect visibility: nobody touches a post their university cannot see.
INSERT INTO post_watches (user_id, post_id, created_at) VALUES
  (3, 600001, @now - INTERVAL 6 DAY + INTERVAL 1 HOUR),   -- Kelvin watches the library post
  (2, 600004, @now - INTERVAL 3 DAY + INTERVAL 1 HOUR),
  (4, 600004, @now - INTERVAL 3 DAY + INTERVAL 2 HOUR),
  (3, 600006, @now - INTERVAL 46 HOUR),
  (2, 600012, @now - INTERVAL 150 MINUTE);

-- Comments: alias numbers follow the order of each user's FIRST comment on the post.
-- Inserted in time order so comment_id order is time order.
INSERT INTO post_participants (post_id, user_id, alias_no, joined_at) VALUES
  (600001, 3, 1, @now - INTERVAL 6 DAY + INTERVAL 2 HOUR),
  (600002, 2, 1, @now - INTERVAL 5 DAY + INTERVAL 1 HOUR),
  (600002, 5, 2, @now - INTERVAL 5 DAY + INTERVAL 3 HOUR),
  (600002, 4, 3, @now - INTERVAL 4 DAY),
  (600004, 4, 1, @now - INTERVAL 3 DAY + INTERVAL 2 HOUR),
  (600006, 3, 1, @now - INTERVAL 40 HOUR),
  (600012, 2, 1, @now - INTERVAL 160 MINUTE),
  (600012, 4, 2, @now - INTERVAL 140 MINUTE),
  (600012, 5, 3, @now - INTERVAL 120 MINUTE);

INSERT INTO comments (comment_id, post_id, author_id, reply_to_comment_id, body, created_at, deleted_at) VALUES
  ( 1, 600001, 3, NULL, 'Thanks! Is 4/F quiet too?',                                @now - INTERVAL 6 DAY + INTERVAL 2 HOUR, NULL),
  ( 2, 600001, 2, 1,    '4/F is group study, it gets noisy after 7pm.',             @now - INTERVAL 6 DAY + INTERVAL 3 HOUR, NULL),
  ( 3, 600002, 2, NULL, 'Try the one on Western Street, the honey glaze is great.',   @now - INTERVAL 5 DAY + INTERVAL 1 HOUR, NULL),
  ( 4, 600002, 5, NULL, 'Joy Hing in Wan Chai, worth the trip!',                      @now - INTERVAL 5 DAY + INTERVAL 3 HOUR, NULL),
  ( 5, 600002, 4, 4,    '同意，Joy Hing 一流',                                         @now - INTERVAL 4 DAY, NULL),
  ( 6, 600002, 4, NULL, 'Wrong post, sorry',                                          @now - INTERVAL 4 DAY + INTERVAL 1 MINUTE, @now - INTERVAL 4 DAY + INTERVAL 2 MINUTE),
  ( 7, 600004, 4, NULL, 'Did they ask technical questions in the video part?',        @now - INTERVAL 3 DAY + INTERVAL 2 HOUR, NULL),
  ( 8, 600004, 5, 7,    'Only behavioural ones, about 5 questions, 2 minutes each.',  @now - INTERVAL 3 DAY + INTERVAL 4 HOUR, NULL),
  ( 9, 600006, 3, NULL, 'See you there!',                                             @now - INTERVAL 40 HOUR, NULL),
  (10, 600012, 2, NULL, 'Same here. Past papers are on Moodle, start with those.',    @now - INTERVAL 160 MINUTE, NULL),
  (11, 600012, 4, NULL, '加油！You got this.',                                         @now - INTERVAL 140 MINUTE, NULL),
  (12, 600012, 5, NULL, 'lol just give up and drop the course',                       @now - INTERVAL 120 MINUTE, NULL),
  (13, 600012, 3, 10,   'Thanks, doing the 2024 paper now.',                          @now - INTERVAL 100 MINUTE, NULL),
  (14, 600012, 2, 13,   'Question 3 is the hard one, skip it first.',                 @now - INTERVAL 90 MINUTE, NULL);

INSERT INTO post_likes (user_id, post_id, created_at) VALUES
  (3, 600001, @now - INTERVAL 6 DAY + INTERVAL 2 HOUR),
  (2, 600002, @now - INTERVAL 5 DAY + INTERVAL 1 HOUR), (4, 600002, @now - INTERVAL 4 DAY), (5, 600002, @now - INTERVAL 5 DAY + INTERVAL 3 HOUR),
  (2, 600003, @now - INTERVAL 4 DAY + INTERVAL 1 HOUR), (3, 600003, @now - INTERVAL 4 DAY + INTERVAL 2 HOUR), (5, 600003, @now - INTERVAL 3 DAY),
  (2, 600004, @now - INTERVAL 3 DAY + INTERVAL 1 HOUR), (3, 600004, @now - INTERVAL 2 DAY), (4, 600004, @now - INTERVAL 3 DAY + INTERVAL 2 HOUR),
  (2, 600006, @now - INTERVAL 46 HOUR), (3, 600006, @now - INTERVAL 40 HOUR), (4, 600006, @now - INTERVAL 30 HOUR),
  (4, 600011, @now - INTERVAL 11 HOUR), (5, 600011, @now - INTERVAL 10 HOUR),
  (2, 600012, @now - INTERVAL 150 MINUTE), (4, 600012, @now - INTERVAL 140 MINUTE), (5, 600012, @now - INTERVAL 110 MINUTE);

-- The triggers numbered the notifications in insert order (every comment, then every like).
-- Renumber them in time order, as they are in real use, so "newest first" lists look right.
UPDATE notifications n
  JOIN (SELECT notification_id, ROW_NUMBER() OVER (ORDER BY created_at, notification_id) AS rn
          FROM notifications) o ON o.notification_id = n.notification_id
   SET n.notification_id = o.rn + 1000000;
UPDATE notifications SET notification_id = notification_id - 1000000 ORDER BY notification_id;
ALTER TABLE notifications AUTO_INCREMENT = 1;   -- back to MAX(notification_id) + 1

INSERT INTO post_views (user_id, post_id, first_viewed_at, last_viewed_at, view_count) VALUES
  (2, 600002, @now - INTERVAL 5 DAY, @now - INTERVAL 4 DAY, 3),
  (2, 600004, @now - INTERVAL 3 DAY, @now - INTERVAL 1 DAY, 2),
  (2, 600006, @now - INTERVAL 46 HOUR, @now - INTERVAL 46 HOUR, 1),
  (2, 600012, @now - INTERVAL 160 MINUTE, @now - INTERVAL 20 MINUTE, 4),
  (3, 600001, @now - INTERVAL 6 DAY, @now - INTERVAL 6 DAY, 1),
  (3, 600006, @now - INTERVAL 40 HOUR, @now - INTERVAL 40 HOUR, 1),
  (3, 600012, @now - INTERVAL 3 HOUR, @now - INTERVAL 90 MINUTE, 5),
  (4, 600002, @now - INTERVAL 4 DAY, @now - INTERVAL 4 DAY, 1),
  (4, 600004, @now - INTERVAL 3 DAY, @now - INTERVAL 3 DAY, 2),
  (4, 600012, @now - INTERVAL 140 MINUTE, @now - INTERVAL 140 MINUTE, 1),
  (5, 600002, @now - INTERVAL 5 DAY, @now - INTERVAL 5 DAY, 1),
  (5, 600012, @now - INTERVAL 120 MINUTE, @now - INTERVAL 120 MINUTE, 1);

-- ---------------------------------------------------------------- moderation
-- Post 600010 (spam) and comment 12 (rude) were reported and hidden; one report is still open.
INSERT INTO reports (report_id, reporter_id, target_type, target_id, reason, details, created_at, resolved_at, resolved_by, resolution) VALUES
  (1, 2, 'post',    600010, 'spam',       'Selling followers',          @now - INTERVAL 15 HOUR, @now - INTERVAL 14 HOUR, 1, 'hidden'),
  (2, 4, 'comment', 12,     'harassment', 'Telling people to give up',  @now - INTERVAL 110 MINUTE, @now - INTERVAL 100 MINUTE, 1, 'hidden'),
  (3, 2, 'post',    600007, 'other',      'Is this a real alarm or a joke?', @now - INTERVAL 20 HOUR, NULL, NULL, NULL);
INSERT INTO hidden_content (target_type, target_id, hidden_by, reason, hidden_at) VALUES
  ('post',    600010, 1, 'Spam (report 1)',       @now - INTERVAL 14 HOUR),
  ('comment', 12,     1, 'Harassment (report 2)', @now - INTERVAL 100 MINUTE);

-- ---------------------------------------------------------------- notifications
-- Made by the messages triggers from the comments and likes above. Mark the old ones read.
UPDATE notifications SET read_at = created_at + INTERVAL 1 HOUR WHERE created_at < @now - INTERVAL 1 DAY;

-- ---------------------------------------------------------------- direct messages
-- 1: Kelvin asks about Mandy's textbook (from post 600005: Kelvin is "Visitor", Mandy is "Host").
-- 2: Wing writes to Jason by handle (Jason shows his handle on post 600004).
INSERT INTO conversations (conversation_id, starter_id, recipient_id, post_id, created_at) VALUES
  (1, 3, 2, 600005, @now - INTERVAL 40 HOUR),
  (2, 4, 5, NULL,   @now - INTERVAL 2 DAY);
INSERT INTO messages (message_id, conversation_id, sender_id, body, created_at) VALUES
  (1, 1, 3, 'Hi, is the textbook still available?',        @now - INTERVAL 40 HOUR),
  (2, 1, 2, 'Yes! Can we meet at the Main Library?',         @now - INTERVAL 39 HOUR),
  (3, 1, 3, 'Deal. Friday 2pm at the entrance?',             @now - INTERVAL 4 HOUR),
  (4, 2, 4, 'Hi Jason, which bank was the internship with?', @now - INTERVAL 2 DAY),
  (5, 2, 5, 'A big one in Central, I can share my notes.',   @now - INTERVAL 1 DAY);
INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id) VALUES
  (1, 3, 3), (1, 2, 2),     -- Mandy has 1 unread message
  (2, 4, 5);                -- Jason has no read row yet, so Wing's message 4 counts as unread: 1

-- ---------------------------------------------------------------- announcements
INSERT INTO announcements (announcement_id, title, subtitle, image_path, link_url, starts_at, ends_at, sort_order, created_by) VALUES
  (1, 'Film night this Friday', 'Free tickets from HKU Film Society', '/static/seed/film-night.svg', '/events/1', @now - INTERVAL 2 DAY, @now + INTERVAL 3 DAY, 1, 1),
  (2, 'Welcome week',           'Old banner, already expired',         NULL,                  NULL,        @now - INTERVAL 40 DAY, @now - INTERVAL 30 DAY, 2, 1);

-- ---------------------------------------------------------------- events and tickets
-- 1 on sale, 2 sold out, 3 not released yet (countdown), 4 already happened.
INSERT INTO events (event_id, organizer_id, title, description, venue, starts_at, ends_at, release_at, capacity, tickets_left, audience, cover_path, created_at) VALUES
  (1, 7, 'Film night: Wake Up', 'Free screening with snacks. One ticket per person.', 'Main Building LG', @now + INTERVAL 3 DAY, @now + INTERVAL 3 DAY + INTERVAL 3 HOUR, @now - INTERVAL 1 DAY, 50, 48, 'all', '/static/seed/film-night.svg', @now - INTERVAL 2 DAY),
  (2, 8, 'Dragon''s Back sunrise hike', 'Meet at Shau Kei Wan MTR exit A3 at 5:30am.', 'Shau Kei Wan', @now + INTERVAL 4 DAY, @now + INTERVAL 4 DAY + INTERVAL 5 HOUR, @now - INTERVAL 2 DAY, 2, 0, 'all', '/static/seed/dragons-back.svg', @now - INTERVAL 3 DAY),
  (3, 7, 'Director Q&A (HKU members)', 'Talk with the director after the screening.', 'CPD 3.04', @now + INTERVAL 7 DAY, @now + INTERVAL 7 DAY + INTERVAL 2 HOUR, @now + INTERVAL 2 HOUR, 30, 30, 'university', NULL, @now - INTERVAL 1 DAY),
  (4, 8, 'Lion Rock hike', 'Easy afternoon hike.', 'Wong Tai Sin', @now - INTERVAL 10 DAY, @now - INTERVAL 10 DAY + INTERVAL 4 HOUR, @now - INTERVAL 14 DAY, 20, 19, 'all', NULL, @now - INTERVAL 15 DAY);
INSERT INTO tickets (event_id, user_id, ticket_code, booked_at, checked_in_at) VALUES
  (1, 2, 'FN7Q2K9A', @now - INTERVAL 20 HOUR, NULL),
  (1, 3, 'FN3M8X1C', @now - INTERVAL 19 HOUR, NULL),
  (2, 4, 'DB5T6Y2P', @now - INTERVAL 2 DAY + INTERVAL 1 SECOND, NULL),
  (2, 5, 'DB9H4R7W', @now - INTERVAL 2 DAY + INTERVAL 2 SECOND, NULL),
  (4, 4, 'LR2C8V5N', @now - INTERVAL 13 DAY, @now - INTERVAL 10 DAY);

-- ---------------------------------------------------------------- dev mailbox
INSERT INTO outbox (to_email, subject, body_text, created_at) VALUES
  ('newbie@connect.hku.hk', 'Your Campus Notes code', 'Your verification code is 000000. It expires in 10 minutes.', @now - INTERVAL 1 HOUR);

-- ---------------------------------------------------------------- statistics
-- Full-text relevance divides by the table's row-count statistic, which can still read 0 right
-- after a reset; then every match scores the same and "Most relevant" order is lost. Refresh it.
ANALYZE TABLE posts;
