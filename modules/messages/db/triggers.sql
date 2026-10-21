-- =====================================================================================
-- Messages module: database triggers. Applied by npm run db:reset after the schema, before the seed.
-- Owner: messages. Tested on MySQL 8.0.46 (npm run check:sql: db/tests/contract_checks.sql).
--
-- Why triggers: comments and likes are written by the content module, but notifications
-- belong to messages. A trigger lets messages react to those inserts without the content
-- module calling messages code, so neither owner has to wait for or edit the other.
-- The triggers only READ other modules' tables and only WRITE notifications.
--
-- Uses DELIMITER, like the mysql command-line client; db/reset.js understands it too.
-- =====================================================================================

DROP TRIGGER IF EXISTS trg_comment_notify;
DROP TRIGGER IF EXISTS trg_like_notify;
DROP TRIGGER IF EXISTS trg_message_sender_is_member;

DELIMITER $$

-- A new comment notifies, at most once each and never the commenter themself:
--   1. the author of the comment being replied to   (reply_to_comment)
--   2. the post's author                             (comment_on_post)
--   3. everyone watching the post                    (comment_on_watched)
-- Each recipient can switch comment notifications off (users.notify_comments).
CREATE TRIGGER trg_comment_notify
AFTER INSERT ON comments
FOR EACH ROW
BEGIN
  DECLARE v_post_author  INT UNSIGNED;
  DECLARE v_reply_author INT UNSIGNED DEFAULT 0;   -- 0 = not a reply (no user has id 0)

  SELECT author_id INTO v_post_author FROM posts WHERE post_id = NEW.post_id;

  IF NEW.reply_to_comment_id IS NOT NULL THEN
    SELECT author_id INTO v_reply_author FROM comments WHERE comment_id = NEW.reply_to_comment_id;
    IF v_reply_author <> NEW.author_id THEN
      INSERT INTO notifications (recipient_id, type, post_id, comment_id, actor_id, created_at)
      SELECT u.user_id, 'reply_to_comment', NEW.post_id, NEW.comment_id, NEW.author_id, NEW.created_at
      FROM users u
      WHERE u.user_id = v_reply_author AND u.notify_comments;
    END IF;
  END IF;

  IF v_post_author <> NEW.author_id AND v_post_author <> v_reply_author THEN
    INSERT INTO notifications (recipient_id, type, post_id, comment_id, actor_id, created_at)
    SELECT u.user_id, 'comment_on_post', NEW.post_id, NEW.comment_id, NEW.author_id, NEW.created_at
    FROM users u
    WHERE u.user_id = v_post_author AND u.notify_comments;
  END IF;

  INSERT INTO notifications (recipient_id, type, post_id, comment_id, actor_id, created_at)
  SELECT w.user_id, 'comment_on_watched', NEW.post_id, NEW.comment_id, NEW.author_id, NEW.created_at
  FROM post_watches w
  JOIN users u ON u.user_id = w.user_id
  WHERE w.post_id = NEW.post_id
    AND u.notify_comments
    AND w.user_id NOT IN (NEW.author_id, v_post_author, v_reply_author);
END$$

-- A like notifies the post's author once per liker (un-liking and liking again does not repeat it).
CREATE TRIGGER trg_like_notify
AFTER INSERT ON post_likes
FOR EACH ROW
BEGIN
  INSERT INTO notifications (recipient_id, type, post_id, comment_id, actor_id, created_at)
  SELECT p.author_id, 'like_on_post', NEW.post_id, NULL, NEW.user_id, NEW.created_at
  FROM posts p
  JOIN users u ON u.user_id = p.author_id
  WHERE p.post_id = NEW.post_id
    AND p.author_id <> NEW.user_id
    AND u.notify_likes
    AND NOT EXISTS (SELECT 1 FROM notifications n
                    WHERE n.recipient_id = p.author_id AND n.type = 'like_on_post'
                      AND n.post_id = NEW.post_id AND n.actor_id = NEW.user_id);
END$$

-- Only the two members of a conversation can write in it, whatever the app code does.
CREATE TRIGGER trg_message_sender_is_member
BEFORE INSERT ON messages
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM conversations c
                 WHERE c.conversation_id = NEW.conversation_id
                   AND NEW.sender_id IN (c.starter_id, c.recipient_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sender is not a member of this conversation';
  END IF;
END$$

DELIMITER ;
