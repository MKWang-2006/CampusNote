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

module.exports = { feedAllIds };
