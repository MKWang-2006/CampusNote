const { q, tx, isDuplicate } = require('../../core/db');
const { VISIBLE } = require('../../core/cards');

// MS-2, BR-13/14: only my unread notifications and the other member's unread messages.
async function countUnread(userId) {
  return q.one(
    `SELECT
       (SELECT COUNT(*) FROM notifications n
         WHERE n.recipient_id = ? AND n.read_at IS NULL) AS notifications,
       (SELECT COUNT(*) FROM conversations c
          JOIN messages m ON m.conversation_id = c.conversation_id
          LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = ?
         WHERE ? IN (c.starter_id, c.recipient_id) AND m.sender_id <> ?
           AND m.message_id > COALESCE(r.last_read_message_id, 0)) AS messages`,
    [userId, userId, userId, userId],
  );
}

// MS-1, BR-5/8/9/13: visibility and aliases come from the shared views; never select handles.
async function listNotifications(userId, universityId, before = Number.MAX_SAFE_INTEGER) {
  return q(
    `SELECT n.notification_id, n.type, n.post_id, n.comment_id, n.created_at,
            n.read_at IS NULL AS is_unread, p.post_id IS NOT NULL AS post_available,
            pp.alias_no AS actor_alias_no, ci.body AS comment_body,
            ci.is_deleted AS comment_deleted, ci.is_hidden AS comment_hidden
       FROM notifications n
       LEFT JOIN v_live_posts p ON p.post_id = n.post_id AND ${VISIBLE}
       LEFT JOIN post_participants pp ON pp.post_id = n.post_id AND pp.user_id = n.actor_id
                                    AND n.type <> 'like_on_post'
       LEFT JOIN v_comment_items ci ON ci.comment_id = n.comment_id
      WHERE n.recipient_id = ? AND n.notification_id < ?
      ORDER BY n.notification_id DESC LIMIT 31`,
    [universityId, userId, before],
  );
}

// MS-1, BR-13: the loaded snapshot bounds the update; newer arrivals remain unread.
async function markNotificationsRead(userId, upToId) {
  const result = await q(
    `UPDATE notifications SET read_at = UTC_TIMESTAMP()
      WHERE recipient_id = ? AND read_at IS NULL AND notification_id <= ?`,
    [userId, upToId],
  );
  return result.affectedRows;
}

// MS-3, BR-14: greatest-per-group, read pointers, and names restricted to the conversation context.
async function listConversations(userId) {
  return q(
    `SELECT c.conversation_id, c.post_id, pp.alias_no AS other_alias_no,
            IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL) AS other_public_name,
            IF(c.post_id IS NULL, u.avatar_code, NULL) AS other_avatar_code,
            m.body AS last_body, m.created_at AS last_at, m.sender_id = ? AS last_is_mine,
            (SELECT COUNT(*) FROM messages x WHERE x.conversation_id = c.conversation_id
              AND x.sender_id <> ? AND x.message_id > COALESCE(r.last_read_message_id, 0)) AS unread
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.conversation_id
                      AND m.message_id = (SELECT MAX(x.message_id) FROM messages x
                                           WHERE x.conversation_id = c.conversation_id)
       JOIN users u ON u.user_id = IF(c.starter_id = ?, c.recipient_id, c.starter_id)
       LEFT JOIN organizations o ON o.user_id = u.user_id
       LEFT JOIN post_participants pp ON pp.post_id = c.post_id AND pp.user_id = u.user_id
       LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = ?
      WHERE ? IN (c.starter_id, c.recipient_id) ORDER BY m.message_id DESC`,
    [userId, userId, userId, userId, userId],
  );
}

// MS-4, BR-14: the participant id is for resolving a recipient, never for rendering.
async function participantByAlias(postId, aliasNo) {
  const row = await q.one(
    'SELECT user_id FROM post_participants WHERE post_id = ? AND alias_no = ?',
    [postId, aliasNo],
  );
  return row?.user_id ?? null;
}

// MS-4, BR-14: a missing per-post alias means Visitor.
async function aliasOn(postId, userId) {
  const row = await q.one(
    'SELECT alias_no FROM post_participants WHERE post_id = ? AND user_id = ?',
    [postId, userId],
  );
  return row?.alias_no ?? null;
}

// MS-4, BR-14: only an active, explicitly addressed public handle can start this context.
async function userByHandle(handle) {
  return q.one(
    `SELECT u.user_id, u.handle, o.display_name, u.avatar_code FROM users u
       LEFT JOIN organizations o ON o.user_id = u.user_id
      WHERE u.handle = ? AND u.status = 'active'`,
    [handle],
  );
}

// MS-4, BR-14: the generated unique key treats both directions as the same pair per context.
const conversationLookup = `SELECT conversation_id FROM conversations
  WHERE user_lo = LEAST(?, ?) AND user_hi = GREATEST(?, ?) AND context_key = IFNULL(?, 0)`;

async function findConversation(userId, otherId, postId) {
  const row = await q.one(conversationLookup, [userId, otherId, userId, otherId, postId]);
  return row?.conversation_id ?? null;
}

// MS-5, BR-14: GREATEST prevents a stale tab or an overlapping send moving a read pointer back.
const readPointer = `INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
  VALUES (?, ?, ?) AS new ON DUPLICATE KEY UPDATE
  last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id)`;

async function markConversationRead(conversationId, userId, messageId) {
  await q(readPointer, [conversationId, userId, messageId]);
}

// BR-14: respect existing conversation blocks even though the MS-8 controls are outside this delivery.
async function isBlocked(t, conversationId, userId) {
  return t.q.one(
    `SELECT EXISTS (SELECT 1 FROM blocks WHERE conversation_id = ? AND blocker_id = ?
                    FOR SHARE) AS blocked_by_me,
            EXISTS (SELECT 1 FROM blocks WHERE conversation_id = ? AND blocker_id <> ?
                    FOR SHARE) AS blocked_by_other`,
    [conversationId, userId, conversationId, userId],
  );
}

async function startConversation(userId, otherId, postId, body) {
  return tx(async (t) => {
    let id;
    try {
      // MS-4, BR-14: create the conversation and its first message in the same transaction.
      id = (
        await t.q(
          'INSERT INTO conversations (starter_id, recipient_id, post_id) VALUES (?, ?, ?)',
          [userId, otherId, postId],
        )
      ).insertId;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      const existing = await t.q.one(conversationLookup + ' FOR SHARE', [
        userId,
        otherId,
        userId,
        otherId,
        postId,
      ]);
      id = existing.conversation_id;
      const blocked = await isBlocked(t, id, userId);
      if (blocked.blocked_by_me || blocked.blocked_by_other) return { blocked };
    }
    // MS-4, BR-14/18: the membership trigger also guards this insert.
    const message = await t.q(
      'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
      [id, userId, body],
    );
    await t.q(readPointer, [id, userId, message.insertId]);
    return { id };
  });
}

// MS-5, BR-5/14: return no row to non-members; never select a public identity for a post context.
async function getConversation(conversationId, userId, universityId) {
  return q.one(
    `SELECT c.conversation_id, c.post_id, pp.alias_no AS other_alias_no,
            IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL) AS other_public_name,
            IF(c.post_id IS NULL, u.handle, NULL) AS other_handle,
            mine.alias_no AS my_alias_no, p.post_id IS NOT NULL AS post_available,
            EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = c.conversation_id
                     AND b.blocker_id = ?) AS blocked_by_me,
            EXISTS (SELECT 1 FROM blocks b WHERE b.conversation_id = c.conversation_id
                     AND b.blocker_id <> ?) AS blocked_by_other
       FROM conversations c
       JOIN users u ON u.user_id = IF(c.starter_id = ?, c.recipient_id, c.starter_id)
       LEFT JOIN organizations o ON o.user_id = u.user_id
       LEFT JOIN post_participants pp ON pp.post_id = c.post_id AND pp.user_id = u.user_id
       LEFT JOIN post_participants mine ON mine.post_id = c.post_id AND mine.user_id = ?
       LEFT JOIN v_live_posts p ON p.post_id = c.post_id AND ${VISIBLE}
      WHERE c.conversation_id = ? AND ? IN (c.starter_id, c.recipient_id)`,
    [userId, userId, userId, userId, universityId, conversationId, userId],
  );
}

// MS-5, BR-14: after the route's membership check, show the latest 100 in chronological order.
async function listMessages(conversationId, userId) {
  return q(
    `SELECT message_id, is_mine, body, created_at FROM
       (SELECT message_id, sender_id = ? AS is_mine, body, created_at FROM messages
         WHERE conversation_id = ? ORDER BY message_id DESC LIMIT 100) last100
      ORDER BY message_id`,
    [userId, conversationId],
  );
}

async function sendMessage(conversationId, userId, body) {
  return tx(async (t) => {
    const blocked = await isBlocked(t, conversationId, userId);
    if (blocked.blocked_by_me || blocked.blocked_by_other) return { blocked };
    // MS-5, BR-14/18: sending and advancing my read pointer succeed or roll back together.
    const result = await t.q(
      'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
      [conversationId, userId, body],
    );
    await t.q(readPointer, [conversationId, userId, result.insertId]);
    return { id: result.insertId };
  });
}

// MS-6, BR-5/8/9/15: only a live comment on a visible post can be reported.
async function commentForReport(commentId, universityId) {
  return q.one(
    `SELECT ci.comment_id, ci.post_id, ci.author_id, ci.alias_no, ci.body
       FROM v_comment_items ci JOIN v_live_posts p ON p.post_id = ci.post_id
      WHERE ci.comment_id = ? AND ci.body IS NOT NULL AND ${VISIBLE}`,
    [commentId, universityId],
  );
}

// MS-6, BR-15/18: the unique key enforces one report per person and target.
async function fileReport(userId, targetType, targetId, reason, details) {
  const result = await q(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?)',
    [userId, targetType, targetId, reason, details],
  );
  return result.insertId;
}

// MS-7, BR-15: admins alone may see raw text and author handles, including author-deleted text.
async function listOpenReports() {
  return q(
    `SELECT g.*, COALESCE(p.post_id, c.post_id) AS post_id,
            COALESCE(p.body, c.body) AS content_body,
            COALESCE(p.deleted_at, c.deleted_at) IS NOT NULL AS deleted_by_author,
            au.handle AS author_handle
       FROM (SELECT target_type, target_id, MIN(report_id) AS report_id, COUNT(*) AS report_count,
                    GROUP_CONCAT(DISTINCT reason ORDER BY reason SEPARATOR ', ') AS reasons,
                    GROUP_CONCAT(NULLIF(details, '') ORDER BY report_id SEPARATOR ' | ') AS details,
                    MIN(created_at) AS first_reported_at
               FROM reports WHERE resolved_at IS NULL GROUP BY target_type, target_id) g
       LEFT JOIN posts p ON g.target_type = 'post' AND p.post_id = g.target_id
       LEFT JOIN comments c ON g.target_type = 'comment' AND c.comment_id = g.target_id
       LEFT JOIN users au ON au.user_id = COALESCE(p.author_id, c.author_id)
      ORDER BY g.first_reported_at, g.report_id`,
  );
}

async function resolveTarget(reportId, adminId, resolution) {
  return tx(async (t) => {
    // MS-7, BR-15: the report's immutable target determines the whole action.
    const report = await t.q.one(
      `SELECT target_type, target_id,
              CONCAT(UPPER(LEFT(reason, 1)), SUBSTRING(reason, 2), ' (report ', report_id, ')') AS hide_reason
         FROM reports WHERE report_id = ?`,
      [reportId],
    );
    if (!report) return null;
    // MS-7, BR-15: lock reports in one order to serialize competing decisions on the same target.
    await t.q(
      'SELECT report_id FROM reports WHERE target_type = ? AND target_id = ? ORDER BY report_id FOR UPDATE',
      [report.target_type, report.target_id],
    );
    if (resolution === 'hidden') {
      // MS-7, BR-9: shared views hide the target; repeated hides preserve the first audit entry.
      await t.q(
        `INSERT INTO hidden_content (target_type, target_id, hidden_by, reason) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE hidden_at = hidden_at`,
        [report.target_type, report.target_id, adminId, report.hide_reason],
      );
    }
    // MS-7, BR-15/17: resolve every open report on the target in the same transaction.
    const result = await t.q(
      `UPDATE reports SET resolved_at = UTC_TIMESTAMP(), resolved_by = ?, resolution = ?
        WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL`,
      [adminId, resolution, report.target_type, report.target_id],
    );
    return { ...report, resolved: result.affectedRows };
  });
}

const hideTarget = (reportId, adminId) => resolveTarget(reportId, adminId, 'hidden');
const dismissTarget = (reportId, adminId) => resolveTarget(reportId, adminId, 'dismissed');

// MS-7, BR-9/15: the admin audit list is the only other place author handles are returned.
async function listHidden() {
  return q(
    `SELECT h.target_type, h.target_id, h.reason, h.hidden_at, ah.handle AS hidden_by_handle,
            COALESCE(p.post_id, c.post_id) AS post_id, COALESCE(p.body, c.body) AS content_body,
            au.handle AS author_handle
       FROM hidden_content h JOIN users ah ON ah.user_id = h.hidden_by
       LEFT JOIN posts p ON h.target_type = 'post' AND p.post_id = h.target_id
       LEFT JOIN comments c ON h.target_type = 'comment' AND c.comment_id = h.target_id
       LEFT JOIN users au ON au.user_id = COALESCE(p.author_id, c.author_id)
      ORDER BY h.hidden_at DESC, h.target_type, h.target_id`,
  );
}

// MS-7, BR-9/15: restore visibility while preserving resolved reports as an audit trail.
async function restoreHidden(targetType, targetId) {
  const result = await q('DELETE FROM hidden_content WHERE target_type = ? AND target_id = ?', [
    targetType,
    targetId,
  ]);
  return result.affectedRows;
}

module.exports = {
  countUnread,
  listNotifications,
  markNotificationsRead,
  listConversations,
  participantByAlias,
  aliasOn,
  userByHandle,
  findConversation,
  startConversation,
  getConversation,
  listMessages,
  markConversationRead,
  sendMessage,
  commentForReport,
  fileReport,
  listOpenReports,
  hideTarget,
  dismissTarget,
  listHidden,
  restoreHidden,
};
