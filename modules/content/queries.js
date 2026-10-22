const { q } = require('../../core/db');
const { VISIBLE } = require('../../core/cards');

// CT-8: preserve upload order.
const listImages = (postId) =>
  q('SELECT position, file_path FROM post_images WHERE post_id = ? ORDER BY position', [postId]);

// BR-7: the viewer's alias belongs to this post; NULL is a new participant.
const viewerState = (postId, userId) =>
  q.one(
    `SELECT
  EXISTS (SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?) AS liked_by_me,
  EXISTS (SELECT 1 FROM post_watches WHERE user_id = ? AND post_id = ?) AS watched_by_me,
  (SELECT alias_no FROM post_participants WHERE post_id = ? AND user_id = ?) AS my_alias`,
    [userId, postId, userId, postId, postId, userId],
  );

// BR-7/8/9: the view masks hidden text but retains every comment anchor.
const listThread = (postId, userId) =>
  q(
    `SELECT comment_id, alias_no, reply_to_comment_id, reply_to_alias_no,
  body, created_at, is_deleted, is_hidden, author_id = ? AS is_mine
  FROM v_comment_items WHERE post_id = ? ORDER BY comment_id`,
    [userId, postId],
  );

// CT-7/BR-5: paginate my non-deleted comments only on live, visible posts.
const listMyComments = (userId, universityId, before) =>
  q(
    `SELECT ci.comment_id, ci.post_id, ci.alias_no,
  ci.body, ci.is_hidden, ci.created_at, p.body AS post_body
  FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
  WHERE ci.author_id = ? AND ci.is_deleted = 0 AND ${VISIBLE} AND ci.comment_id < ?
  ORDER BY ci.comment_id DESC LIMIT 20`,
    [userId, universityId, before],
  );

module.exports = { listImages, viewerState, listThread, listMyComments };
