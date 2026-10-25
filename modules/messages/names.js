const ui = require('../../core/ui');

const aliasName = (aliasNo) => (aliasNo == null ? 'Visitor' : ui.alias(aliasNo));

// BR-14: the same person has an independent identity in each conversation context.
function otherName(row) {
  if (row.post_id != null) return aliasName(row.other_alias_no);
  return row.other_public_name;
}

function notificationText(row) {
  if (!row.post_available) return 'This post is no longer available';
  const post = ui.postNo(row.post_id);
  if (row.type === 'like_on_post') return `Your post ${post} got a like`;
  const actor = aliasName(row.actor_alias_no);
  const excerpt =
    row.comment_body != null
      ? `“${ui.excerpt(row.comment_body, 60)}”`
      : row.comment_hidden
        ? '[hidden by a moderator]'
        : '[deleted]';
  if (row.type === 'reply_to_comment')
    return `${actor} replied to your comment on ${post}: ${excerpt}`;
  if (row.type === 'comment_on_watched')
    return `${actor} commented on ${post}, which you watch: ${excerpt}`;
  return `${actor} commented on your post ${post}: ${excerpt}`;
}

module.exports = { aliasName, otherName, notificationText };
