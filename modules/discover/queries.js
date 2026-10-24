// Every SQL statement of the discover module (docs/modules/discover/queries.sql has them with checks).
const { q } = require('../../core/db');
const { VISIBLE } = require('../../core/cards');

// DS-1, BR-5, BR-11: the All tab, every live post I can see, newest first; 21 ids, so the route
// knows whether there is a next page. Deleted and hidden posts are already gone in v_live_posts.
async function feedAllIds(myUniversityId, before) {
  const rows = await q(
    `SELECT p.post_id FROM v_live_posts p
     WHERE ${VISIBLE} AND p.post_id < ?
     ORDER BY p.post_id DESC LIMIT 21`,
    [myUniversityId, before ?? 4294967295],
  );
  return rows.map((r) => r.post_id);
}

// DS-1, BR-5, BR-11: my university's live posts, including both audience settings.
async function feedUniIds(myUniversityId, before) {
  const rows = await q(
    `SELECT p.post_id FROM v_live_posts p
     WHERE ${VISIBLE} AND p.author_university_id = ? AND p.post_id < ?
     ORDER BY p.post_id DESC LIMIT 21`,
    [myUniversityId, myUniversityId, before ?? 4294967295],
  );
  return rows.map((r) => r.post_id);
}

// DS-1, BR-5, BR-8, BR-9: topic filtering never bypasses visibility or the live-post view.
async function feedTopicIds(myUniversityId, topicId, before) {
  const rows = await q(
    `SELECT p.post_id FROM v_live_posts p
     WHERE ${VISIBLE} AND p.topic_id = ? AND p.post_id < ?
     ORDER BY p.post_id DESC LIMIT 21`,
    [myUniversityId, topicId, before ?? 4294967295],
  );
  return rows.map((r) => r.post_id);
}

// DS-5, BR-6/8/9: only my live posts, including anonymous ones; ownership implies same university.
async function myPostIds(userId, before) {
  const rows = await q(
    `SELECT p.post_id FROM v_live_posts p
     WHERE p.author_id = ? AND p.post_id < ?
     ORDER BY p.post_id DESC LIMIT 21`,
    [userId, before ?? 4294967295],
  );
  return rows.map((r) => r.post_id);
}

module.exports = { feedAllIds, feedUniIds, feedTopicIds, myPostIds };
