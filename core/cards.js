// Posts as cards (ARCHITECTURE.md §6.5, decision D18). Lists page through the merged view
// v_live_posts for at most 20 ids, then load those cards from v_post_cards by id.
const { q } = require('./db');

// BR-5: the visibility predicate for a viewer. Its one parameter is the viewer's university id.
// Use it on v_live_posts with the alias p.
const VISIBLE = "(p.visibility = 'all' OR p.author_university_id = ?)";

// v_post_cards rows in the order of ids (missing ids, such as a post deleted meanwhile, are skipped).
async function byIds(ids) {
  if (!ids || ids.length === 0) return [];
  const rows = await q('SELECT * FROM v_post_cards WHERE post_id IN (?)', [ids]);
  const byId = new Map(rows.map((r) => [r.post_id, r]));
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}

// The card of one post if `me` may see it: live (not deleted, not hidden) and visible to their
// university. null otherwise, which routes turn into a 404 (BR-5).
async function findVisible(postId, me) {
  const id = Number(postId);
  if (!Number.isSafeInteger(id) || id <= 0 || !me) return null;
  const card = await q.one('SELECT * FROM v_post_cards WHERE post_id = ?', [id]);
  if (!card) return null;
  return card.visibility === 'all' || card.author_university_id === me.universityId ? card : null;
}

module.exports = { VISIBLE, byIds, findVisible };
