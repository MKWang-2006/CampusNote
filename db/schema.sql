-- =====================================================================================
-- Campus Notes: database schema v1 (MySQL 8.0.19 or later; tested on 8.0.46)
-- Owner: backbone (coordinator). Changes only by pull request labelled `contract-change`.
--
-- Ownership rule: every table has exactly ONE writer module (named in its header).
-- Other modules may READ any table but never INSERT/UPDATE/DELETE it. Cross-module
-- side effects go through database triggers owned by the module that needs them
-- (see modules/messages/db/triggers.sql), never through another module's code.
--
-- Conventions: snake_case; InnoDB; utf8mb4; UTC times in DATETIME; surrogate keys are
-- UNSIGNED AUTO_INCREMENT; link tables use composite primary keys; soft delete with
-- deleted_at for user content; display rules (anonymity, hiding) live in the views at
-- the end of this file so every module applies them the same way.
--
-- Two session settings matter (core/db.js sets them on every connection; db/reset.js too):
--   time_zone = '+00:00'            DEFAULT CURRENT_TIMESTAMP and NOW() then give UTC.
--   innodb_ft_enable_stopword = OFF read when the FULLTEXT index is CREATED. With the default
--                                   (ON) the ngram parser drops every 2-letter token that
--                                   contains a stopword such as 'a', 'i' or 'in', so English
--                                   words like "main" can never be found. Never TRUNCATE posts:
--                                   TRUNCATE re-creates the index with the session's setting.
-- =====================================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET SESSION innodb_ft_enable_stopword = OFF;

-- -------------------------------------------------------------------------------------
-- Reference data. Writer: backbone seed only.
-- -------------------------------------------------------------------------------------
CREATE TABLE universities (
  university_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  code          VARCHAR(10)  NOT NULL UNIQUE,          -- 'HKU', 'CUHK', 'HKUST'
  name_en       VARCHAR(100) NOT NULL,
  name_zh       VARCHAR(50)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Multivalued attribute of university: every e-mail domain that proves membership.
CREATE TABLE university_domains (
  domain        VARCHAR(100) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,   -- 'connect.hku.hk', ...; _bin: exact match
  university_id TINYINT UNSIGNED NOT NULL,
  CONSTRAINT fk_domain_university FOREIGN KEY (university_id) REFERENCES universities (university_id),
  CONSTRAINT ck_domain_lower CHECK (domain = LOWER(domain) COLLATE utf8mb4_bin)   -- _bin: case-sensitive compare
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE topics (
  topic_id      TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,           -- 'share', 'random', 'feelings', ...
  name_en       VARCHAR(30) NOT NULL,
  name_zh       VARCHAR(10) NOT NULL,
  sort_order    TINYINT UNSIGNED NOT NULL              -- order of the feed tabs and compose chips
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------------------------
-- Backbone infrastructure. Writer: backbone (core/).
-- -------------------------------------------------------------------------------------
-- Same layout as express-mysql-session's default table, declared here so it is visible.
CREATE TABLE sessions (
  session_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT COLLATE utf8mb4_bin
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every e-mail the app "sends". The demo shows it at /dev/mailbox instead of using SMTP.
CREATE TABLE outbox (
  mail_id    INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  to_email   VARCHAR(254) NOT NULL,
  subject    VARCHAR(150) NOT NULL,
  body_text  TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_outbox_to (to_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------------------------
-- Identity (module: identity). Writer: identity.
-- -------------------------------------------------------------------------------------
CREATE TABLE users (
  user_id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email              VARCHAR(254) NOT NULL UNIQUE,
  university_id      TINYINT UNSIGNED NOT NULL,        -- derived from the e-mail domain at sign-up
  handle             CHAR(9) NOT NULL UNIQUE,          -- public ID, e.g. 'udp7x0c7w'
  password_hash      VARCHAR(100) NOT NULL,            -- bcrypt
  role               ENUM('student','organization','admin') NOT NULL DEFAULT 'student',
  avatar_code        VARCHAR(20) NOT NULL DEFAULT 'cat',
  bio                VARCHAR(160) NOT NULL DEFAULT '',
  default_anonymous  BOOLEAN NOT NULL DEFAULT TRUE,    -- pre-fills the compose form
  default_visibility ENUM('university','all') NOT NULL DEFAULT 'university',
  notify_comments    BOOLEAN NOT NULL DEFAULT TRUE,    -- read by the notification triggers
  notify_likes       BOOLEAN NOT NULL DEFAULT TRUE,
  status             ENUM('active','banned') NOT NULL DEFAULT 'active',
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at      DATETIME NULL,
  CONSTRAINT fk_user_university FOREIGN KEY (university_id) REFERENCES universities (university_id),
  CONSTRAINT ck_user_email_lower CHECK (email = LOWER(email) COLLATE utf8mb4_bin),  -- store normalised; UNIQUE ignores case anyway
  CONSTRAINT ck_user_handle CHECK (REGEXP_LIKE(handle, '^[a-z0-9]{9}$', 'c'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ISA: an organization (society, office) is a user with a public name. Created by an admin (seed).
CREATE TABLE organizations (
  user_id      INT UNSIGNED NOT NULL PRIMARY KEY,
  display_name VARCHAR(60) NOT NULL,
  description  VARCHAR(500) NOT NULL DEFAULT '',
  logo_path    VARCHAR(255) NULL,
  CONSTRAINT fk_org_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One-time codes for sign-up and password reset. Only a hash of the code is stored.
CREATE TABLE email_codes (
  code_id     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(254) NOT NULL,
  purpose     ENUM('register','reset') NOT NULL,
  code_hash   CHAR(64) NOT NULL,                       -- SHA-256 hex of the 6-digit code
  expires_at  DATETIME NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_codes_lookup (email, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------------------------
-- Content (module: content). Writer: content.
-- -------------------------------------------------------------------------------------
CREATE TABLE posts (
  post_id      INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  author_id    INT UNSIGNED NOT NULL,
  topic_id     TINYINT UNSIGNED NOT NULL,
  body         VARCHAR(750) NOT NULL,                  -- 750 characters, as in the reference app
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,          -- FALSE: the author's handle is shown
  visibility   ENUM('university','all') NOT NULL DEFAULT 'university',  -- 'all': every university
  avatar_code  VARCHAR(20) NOT NULL,                   -- random avatar drawn for this post
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,                          -- soft delete by the author
  CONSTRAINT fk_post_author FOREIGN KEY (author_id) REFERENCES users (user_id),
  CONSTRAINT fk_post_topic  FOREIGN KEY (topic_id)  REFERENCES topics (topic_id),
  CONSTRAINT ck_post_body   CHECK (CHAR_LENGTH(TRIM(body)) >= 1),
  INDEX ix_posts_author (author_id, created_at),
  INDEX ix_posts_topic (topic_id, post_id),
  INDEX ix_posts_created (created_at),
  FULLTEXT INDEX ft_posts_body (body) WITH PARSER ngram   -- keyword search, Chinese and English
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=600001;

-- Weak entity of post: identified by (post, position). Posts cannot be edited, so no re-ordering.
CREATE TABLE post_images (
  post_id   INT UNSIGNED NOT NULL,
  position  TINYINT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  PRIMARY KEY (post_id, position),
  CONSTRAINT fk_image_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE,
  CONSTRAINT ck_image_position CHECK (position BETWEEN 1 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-post anonymous identity: alias 0 is the author ("Host"), then 1, 2, ... in order of first comment.
CREATE TABLE post_participants (
  post_id   INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  alias_no  SMALLINT UNSIGNED NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  UNIQUE KEY uq_participant_alias (post_id, alias_no),
  CONSTRAINT fk_participant_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE,
  CONSTRAINT fk_participant_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE comments (
  comment_id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id             INT UNSIGNED NOT NULL,
  author_id           INT UNSIGNED NOT NULL,
  reply_to_comment_id INT UNSIGNED NULL,               -- recursive: the comment being answered
  body                VARCHAR(500) NOT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL,
  UNIQUE KEY uq_comment_post (comment_id, post_id),    -- target of the same-post reply rule below
  CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES posts (post_id),
  -- every commenter must already have an alias on that post
  CONSTRAINT fk_comment_participant FOREIGN KEY (post_id, author_id)
    REFERENCES post_participants (post_id, user_id),
  -- a reply must answer a comment on the SAME post (not checked when reply_to_comment_id IS NULL)
  CONSTRAINT fk_comment_reply_same_post FOREIGN KEY (reply_to_comment_id, post_id)
    REFERENCES comments (comment_id, post_id),
  CONSTRAINT ck_comment_body CHECK (CHAR_LENGTH(TRIM(body)) >= 1),
  INDEX ix_comments_post (post_id, comment_id),
  INDEX ix_comments_author (author_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE post_likes (
  user_id    INT UNSIGNED NOT NULL,
  post_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id),
  INDEX ix_likes_post (post_id),
  CONSTRAINT fk_like_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_like_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "Watch" (the reference app's star): saves the post to My watching and subscribes to its comments.
CREATE TABLE post_watches (
  user_id    INT UNSIGNED NOT NULL,
  post_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id),
  INDEX ix_watches_post (post_id),
  CONSTRAINT fk_watch_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_watch_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Browsing history: one row per (user, post), refreshed on every visit. "Clear history" sets
-- cleared_at instead of deleting, so the post's view count (BR-10) does not drop; the History
-- list and the Me page's "Viewed" count show only rows with cleared_at IS NULL, and the next
-- visit sets cleared_at back to NULL.
CREATE TABLE post_views (
  user_id         INT UNSIGNED NOT NULL,
  post_id         INT UNSIGNED NOT NULL,
  first_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_viewed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  view_count      INT UNSIGNED NOT NULL DEFAULT 1,
  cleared_at      DATETIME NULL,
  PRIMARY KEY (user_id, post_id),
  INDEX ix_views_history (user_id, last_viewed_at),
  INDEX ix_views_post (post_id),
  CONSTRAINT fk_view_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_view_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------------------------
-- Discover (module: discover). Writer: discover.
-- -------------------------------------------------------------------------------------
CREATE TABLE announcements (
  announcement_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(60) NOT NULL,
  subtitle        VARCHAR(120) NOT NULL DEFAULT '',
  image_path      VARCHAR(255) NULL,
  link_url        VARCHAR(255) NULL,                   -- internal path such as /events/3
  starts_at       DATETIME NOT NULL,
  ends_at         DATETIME NOT NULL,
  sort_order      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_by      INT UNSIGNED NOT NULL,
  CONSTRAINT fk_announcement_admin FOREIGN KEY (created_by) REFERENCES users (user_id),
  CONSTRAINT ck_announcement_window CHECK (ends_at > starts_at),
  -- internal links only: blocks javascript: URLs and redirects to other sites
  CONSTRAINT ck_announcement_link CHECK (link_url IS NULL OR REGEXP_LIKE(link_url, '^/[^/\\\\]'))   -- internal path; not //x or /\x
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------------------------
-- Messages and safety (module: messages). Writer: messages (notifications via its triggers).
-- -------------------------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recipient_id    INT UNSIGNED NOT NULL,
  type            ENUM('comment_on_post','reply_to_comment','comment_on_watched','like_on_post') NOT NULL,
  post_id         INT UNSIGNED NOT NULL,
  comment_id      INT UNSIGNED NULL,
  actor_id        INT UNSIGNED NOT NULL,               -- never shown; used to show the actor's alias
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME NULL,
  INDEX ix_notifications_inbox (recipient_id, notification_id),
  INDEX ix_notifications_unread (recipient_id, read_at),
  CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES users (user_id),
  CONSTRAINT fk_notification_post      FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_comment   FOREIGN KEY (comment_id) REFERENCES comments (comment_id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_actor     FOREIGN KEY (actor_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A private conversation between two users. Started from a post (post_id set): both sides stay
-- anonymous and appear under their alias on that post ("Host", "Alice", or "Visitor").
-- Started from a public handle (post_id NULL): handles are shown.
-- At most one conversation per pair of users per post, whoever started it (generated columns).
CREATE TABLE conversations (
  conversation_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  starter_id      INT UNSIGNED NOT NULL,
  recipient_id    INT UNSIGNED NOT NULL,
  post_id         INT UNSIGNED NULL,
  user_lo         INT UNSIGNED AS (LEAST(starter_id, recipient_id)) STORED,
  user_hi         INT UNSIGNED AS (GREATEST(starter_id, recipient_id)) STORED,
  context_key     INT UNSIGNED AS (IFNULL(post_id, 0)) STORED,  -- lets UNIQUE treat "no post" as one value
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conversation_pair (user_lo, user_hi, context_key),
  INDEX ix_conversation_starter (starter_id),
  INDEX ix_conversation_recipient (recipient_id),
  CONSTRAINT fk_conversation_starter   FOREIGN KEY (starter_id) REFERENCES users (user_id),
  CONSTRAINT fk_conversation_recipient FOREIGN KEY (recipient_id) REFERENCES users (user_id),
  CONSTRAINT fk_conversation_post      FOREIGN KEY (post_id) REFERENCES posts (post_id),
  CONSTRAINT ck_conversation_two_people CHECK (starter_id <> recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE messages (
  message_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id       INT UNSIGNED NOT NULL,               -- must be one of the two members (trigger)
  body            VARCHAR(1000) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_messages_conversation (conversation_id, message_id),
  CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (conversation_id) ON DELETE CASCADE,
  CONSTRAINT fk_message_sender FOREIGN KEY (sender_id) REFERENCES users (user_id),
  CONSTRAINT ck_message_body CHECK (CHAR_LENGTH(TRIM(body)) >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE conversation_reads (
  conversation_id      INT UNSIGNED NOT NULL,
  user_id              INT UNSIGNED NOT NULL,
  last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_read_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (conversation_id) ON DELETE CASCADE,
  CONSTRAINT fk_read_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A report targets a post or a comment (polymorphic: target_type + target_id, so no foreign key).
-- MS-8 (Could): "Block" inside one conversation. While a row exists, nobody can send in that
-- conversation; the app checks this inside the send transaction. A block is per conversation, not
-- per person: a per-person block would let either side test handles against an anonymous alias.
CREATE TABLE blocks (
  conversation_id INT UNSIGNED NOT NULL,
  blocker_id      INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, blocker_id),
  CONSTRAINT fk_block_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (conversation_id) ON DELETE CASCADE,
  CONSTRAINT fk_block_user FOREIGN KEY (blocker_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reports (
  report_id   INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT UNSIGNED NOT NULL,
  target_type ENUM('post','comment') NOT NULL,
  target_id   INT UNSIGNED NOT NULL,
  reason      ENUM('spam','harassment','privacy','other') NOT NULL,
  details     VARCHAR(300) NOT NULL DEFAULT '',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  resolved_by INT UNSIGNED NULL,
  resolution  ENUM('hidden','dismissed') NULL,
  UNIQUE KEY uq_report_once (reporter_id, target_type, target_id),
  INDEX ix_reports_queue (resolved_at, created_at),
  CONSTRAINT fk_report_reporter FOREIGN KEY (reporter_id) REFERENCES users (user_id),
  CONSTRAINT fk_report_admin    FOREIGN KEY (resolved_by) REFERENCES users (user_id),
  CONSTRAINT ck_report_resolution CHECK ((resolved_at IS NULL) = (resolution IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A row here hides that post or comment everywhere (the views below filter it out). Restore = delete the row.
CREATE TABLE hidden_content (
  target_type ENUM('post','comment') NOT NULL,
  target_id   INT UNSIGNED NOT NULL,
  hidden_by   INT UNSIGNED NOT NULL,
  reason      VARCHAR(200) NOT NULL DEFAULT '',
  hidden_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (target_type, target_id),
  CONSTRAINT fk_hidden_admin FOREIGN KEY (hidden_by) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------------------------
-- Events and tickets (module: events). Writer: events.
-- -------------------------------------------------------------------------------------
CREATE TABLE events (
  event_id     INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organizer_id INT UNSIGNED NOT NULL,                  -- an organization or admin user
  title        VARCHAR(80) NOT NULL,
  description  VARCHAR(2000) NOT NULL,
  venue        VARCHAR(120) NOT NULL,
  starts_at    DATETIME NOT NULL,
  ends_at      DATETIME NOT NULL,
  release_at   DATETIME NOT NULL,                      -- tickets can be taken from this moment
  capacity     SMALLINT UNSIGNED NOT NULL,
  tickets_left SMALLINT UNSIGNED NOT NULL,             -- derived counter, kept by the booking transaction
  audience     ENUM('university','all') NOT NULL DEFAULT 'all',  -- 'university': organizer's university only
  cover_path   VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  CONSTRAINT fk_event_organizer FOREIGN KEY (organizer_id) REFERENCES users (user_id),
  CONSTRAINT ck_event_capacity CHECK (capacity > 0 AND tickets_left <= capacity),
  CONSTRAINT ck_event_times CHECK (ends_at > starts_at AND release_at < starts_at),
  INDEX ix_events_start (starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- M:N between user and event with attributes. The primary key makes a second ticket impossible.
CREATE TABLE tickets (
  event_id      INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  ticket_code   CHAR(8) NOT NULL UNIQUE,
  booked_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  checked_in_at DATETIME NULL,
  PRIMARY KEY (event_id, user_id),
  INDEX ix_tickets_user (user_id),
  CONSTRAINT fk_ticket_event FOREIGN KEY (event_id) REFERENCES events (event_id),
  CONSTRAINT fk_ticket_user  FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================================
-- Shared read models (views). Every module lists posts and comments through these, so
-- deletion, hiding and anonymity are applied in exactly one place.
--
-- RULE 1: author_id is for filtering only ("my posts", "is this mine?"). Templates must never
-- print it; the public name of an anonymous author is NULL in author_handle.
-- RULE 2: visibility for a viewer from university :u is the predicate
--     (p.visibility = 'all' OR p.author_university_id = :u)
-- RULE 3 (performance): v_live_posts is MERGED into your query, so filter, sort and LIMIT on
-- it. v_post_cards is MATERIALISED by MySQL (it has subqueries in its select list), so only
-- ever read it by post_id: "WHERE post_id = ?" or "WHERE post_id IN (?)". Lists therefore
-- take two steps: (1) page through v_live_posts to get up to 20 ids, (2) load those cards
-- with core/cards.js byIds(). Measured with 20,000 posts: 3 ms instead of 400 to 760 ms per page.
-- =====================================================================================

-- Live = not deleted by its author and not hidden by a moderator.
CREATE VIEW v_live_posts AS
SELECT p.*, au.university_id AS author_university_id
FROM posts p
JOIN users au ON au.user_id = p.author_id
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM hidden_content h
                  WHERE h.target_type = 'post' AND h.target_id = p.post_id);

-- Everything a post card or a post page header shows. Read by post_id only (RULE 3).
CREATE VIEW v_post_cards AS
SELECT p.post_id,
       p.author_id,
       p.author_university_id,
       un.code                               AS author_university_code,
       p.topic_id, t.code AS topic_code, t.name_en AS topic_name_en, t.name_zh AS topic_name_zh,
       p.body, p.is_anonymous, p.visibility, p.avatar_code, p.created_at,
       IF(p.is_anonymous, NULL, au.handle)   AS author_handle,         -- NULL when anonymous
       IF(p.is_anonymous, NULL, COALESCE(o.display_name, au.handle)) AS author_name,  -- org name or handle
       IF(p.is_anonymous, 0, au.role = 'organization') AS author_is_org,
       (SELECT i.file_path FROM post_images i WHERE i.post_id = p.post_id AND i.position = 1) AS cover_path,
       (SELECT COUNT(*) FROM post_images i  WHERE i.post_id = p.post_id) AS image_count,
       (SELECT COUNT(*) FROM post_likes l   WHERE l.post_id = p.post_id) AS like_count,
       (SELECT COUNT(*) FROM post_watches w WHERE w.post_id = p.post_id) AS watch_count,
       (SELECT COUNT(*) FROM comments c
         WHERE c.post_id = p.post_id AND c.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM hidden_content h
                           WHERE h.target_type = 'comment' AND h.target_id = c.comment_id)) AS comment_count,
       (SELECT COALESCE(SUM(v.view_count), 0) FROM post_views v WHERE v.post_id = p.post_id) AS view_count,
       (SELECT MAX(c.created_at) FROM comments c
         WHERE c.post_id = p.post_id AND c.deleted_at IS NULL) AS last_comment_at
FROM v_live_posts p
JOIN users au              ON au.user_id = p.author_id
LEFT JOIN organizations o  ON o.user_id = p.author_id
JOIN universities un       ON un.university_id = p.author_university_id
JOIN topics t              ON t.topic_id = p.topic_id;

-- Comments with their per-post alias. Deleted or hidden comments keep their place in the thread
-- but lose their text (body is NULL); the page shows "[deleted]" or "[hidden by a moderator]". Merged view:
-- filter it by post_id or author_id.
CREATE VIEW v_comment_items AS
SELECT c.comment_id, c.post_id, c.author_id, pp.alias_no,
       c.reply_to_comment_id, rp.alias_no AS reply_to_alias_no,
       IF(c.deleted_at IS NULL AND h.target_id IS NULL, c.body, NULL) AS body,
       c.created_at,
       (c.deleted_at IS NOT NULL) AS is_deleted,
       (h.target_id IS NOT NULL)  AS is_hidden
FROM comments c
JOIN post_participants pp      ON pp.post_id = c.post_id AND pp.user_id = c.author_id
LEFT JOIN comments r           ON r.comment_id = c.reply_to_comment_id
LEFT JOIN post_participants rp ON rp.post_id = r.post_id AND rp.user_id = r.author_id
LEFT JOIN hidden_content h     ON h.target_type = 'comment' AND h.target_id = c.comment_id;
