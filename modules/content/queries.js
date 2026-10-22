const { q, tx } = require('../../core/db');
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

// CT-1/BR-7/18: publish text, ordered images and Host atomically.
async function createPost(
  authorId,
  { topicId, body, isAnonymous, visibility, avatarCode, imagePaths },
) {
  return tx(async (t) => {
    const r = await t.q(
      `INSERT INTO posts (author_id, topic_id, body, is_anonymous, visibility, avatar_code)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [authorId, topicId, body, isAnonymous, visibility, avatarCode],
    );
    for (const [i, filePath] of imagePaths.entries()) {
      // CT-8: position fixes image order for the life of the post.
      await t.q('INSERT INTO post_images (post_id, position, file_path) VALUES (?, ?, ?)', [
        r.insertId,
        i + 1,
        filePath,
      ]);
    }
    // BR-7: the author is Host before any comment can arrive.
    await t.q('INSERT INTO post_participants (post_id, user_id, alias_no) VALUES (?, ?, 0)', [
      r.insertId,
      authorId,
    ]);
    return r.insertId;
  });
}

async function addComment(postId, userId, body, replyTo) {
  return tx(async (t) => {
    // BR-7/8: acquire the serialization lock BEFORE any snapshot read; a deletion waits too.
    const post = await t.q.one(
      'SELECT post_id, deleted_at FROM posts WHERE post_id = ? FOR UPDATE',
      [postId],
    );
    if (!post || post.deleted_at) return { ok: false, reason: 'not_found' };
    // BR-9: reject a post hidden after the route's first visibility check.
    if (!(await t.q.one('SELECT post_id FROM v_live_posts WHERE post_id = ?', [postId])))
      return { ok: false, reason: 'not_found' };
    if (replyTo !== null) {
      // BR-8: serialize against deletion of the reply target before checking its displayed state.
      const target = await t.q.one(
        'SELECT comment_id, deleted_at FROM comments WHERE comment_id = ? AND post_id = ? FOR SHARE',
        [replyTo, postId],
      );
      if (!target || target.deleted_at) return { ok: false, reason: 'bad_reply' };
      // CT-3: same post and still visible, not merely an existing foreign key.
      const reply = await t.q.one(
        'SELECT comment_id FROM v_comment_items WHERE comment_id = ? AND post_id = ? AND body IS NOT NULL',
        [replyTo, postId],
      );
      if (!reply) return { ok: false, reason: 'bad_reply' };
    }
    // BR-7: reuse the stable alias, including Host=0 and participants whose comments were deleted.
    const mine = await t.q.one(
      'SELECT alias_no FROM post_participants WHERE post_id = ? AND user_id = ?',
      [postId, userId],
    );
    if (!mine) {
      // BR-7: the locked post serializes MAX+1 for all first commenters.
      await t.q(
        `INSERT INTO post_participants (post_id, user_id, alias_no)
        SELECT ?, ?, COALESCE(MAX(alias_no), 0) + 1 FROM post_participants WHERE post_id = ?`,
        [postId, userId, postId],
      );
    }
    // CT-3/BR-13: existing Messages triggers create notifications from this one insert.
    const r = await t.q(
      'INSERT INTO comments (post_id, author_id, reply_to_comment_id, body) VALUES (?, ?, ?, ?)',
      [postId, userId, replyTo, body],
    );
    return { ok: true, commentId: r.insertId };
  });
}

// BR-8: only the author may delete; preserve all relations and aliases.
async function deletePost(postId, userId) {
  return (
    await q(
      'UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = ? AND author_id = ? AND deleted_at IS NULL',
      [postId, userId],
    )
  ).affectedRows;
}
async function deleteComment(commentId, userId) {
  return tx(async (t) => {
    // BR-8: the ownership predicate also prevents repeated deletion.
    const r = await t.q(
      'UPDATE comments SET deleted_at = UTC_TIMESTAMP() WHERE comment_id = ? AND author_id = ? AND deleted_at IS NULL',
      [commentId, userId],
    );
    if (!r.affectedRows) return null;
    // CT-3: only reveal the post id after successful ownership-checked deletion.
    return (await t.q.one('SELECT post_id FROM comments WHERE comment_id = ?', [commentId]))
      .post_id;
  });
}

// CT-4: explicit desired state is idempotent without swallowing foreign-key errors.
const setLike = (userId, postId, on) =>
  on
    ? q(
        'INSERT INTO post_likes (user_id, post_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = created_at',
        [userId, postId],
      )
    : q('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
// CT-5: watching is a separate saved subscription, with the same idempotent contract.
const setWatch = (userId, postId, on) =>
  on
    ? q(
        'INSERT INTO post_watches (user_id, post_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = created_at',
        [userId, postId],
      )
    : q('DELETE FROM post_watches WHERE user_id = ? AND post_id = ?', [userId, postId]);
// BR-10/D18: authoritative counts, by one post id only.
const postCounts = (postId) =>
  q.one('SELECT like_count, watch_count FROM v_post_cards WHERE post_id = ?', [postId]);
// CT-6: each successful GET increments visits and restores cleared history.
const recordView = (userId, postId) =>
  q(
    `INSERT INTO post_views (user_id, post_id) VALUES (?, ?)
  ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = UTC_TIMESTAMP(), cleared_at = NULL`,
    [userId, postId],
  );
// BR-10: clearing personal history never removes cumulative post visits.
const clearHistory = (userId) =>
  q('UPDATE post_views SET cleared_at = UTC_TIMESTAMP() WHERE user_id = ? AND cleared_at IS NULL', [
    userId,
  ]);

module.exports = {
  listImages,
  viewerState,
  listThread,
  listMyComments,
  createPost,
  addComment,
  deletePost,
  deleteComment,
  setLike,
  setWatch,
  postCounts,
  recordView,
  clearHistory,
};
