// Every SQL statement of the identity module. docs/modules/identity/queries.sql has each block with
// its checks; @variables there are the ? placeholders here, in the same order.
// Writer of users, organizations and email_codes; reads university_domains, universities and,
// for the Me hub, v_live_posts, post_watches, comments and post_views.
const { q, tx, isDuplicate } = require('../../core/db');
const { VISIBLE } = require('../../core/cards');
const { newHandle } = require('./secrets');

// The consume step of a code, shared by registerUser and resetPassword. It repeats the route's
// checks (unused, fewer than 5 tries, not expired) in the same statement, so two tabs submitting
// the same code at once use it only once.
const CONSUME_CODE = `UPDATE email_codes
     SET consumed_at = UTC_TIMESTAMP()
   WHERE code_id = ? AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP()`;

// ID-1: which university an e-mail domain proves, or null.
async function universityForDomain(domain) {
  // BR-1: exact match on the utf8mb4_bin primary key: no case or accent folding, no subdomains
  return q.one(
    `SELECT d.university_id, u.code AS university_code
     FROM university_domains d
     JOIN universities u ON u.university_id = d.university_id
     WHERE d.domain = ?`,
    [domain],
  );
}

// ID-1, ID-2, ID-3: the account behind a normalised e-mail, or null.
async function findUserByEmail(email) {
  // BR-1, BR-3: one account per e-mail; the caller has lower-cased it and allows ASCII only
  return q.one('SELECT user_id, password_hash, status FROM users WHERE email = ?', [email]);
}

// ID-1, ID-3: true if a code for this e-mail and purpose was made in the last 60 seconds.
async function codeRequestedRecently(email, purpose) {
  // BR-2: one code a minute per e-mail and purpose (index ix_codes_lookup)
  const row = await q.one(
    `SELECT EXISTS (SELECT 1 FROM email_codes
                    WHERE email = ? AND purpose = ?
                      AND created_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND) AS too_soon`,
    [email, purpose],
  );
  return Boolean(row && Number(row.too_soon));
}

// ID-1, ID-3: stores a new code's hash, valid for 10 minutes; returns its code_id.
async function createCode(email, purpose, codeHash) {
  // BR-2: only the SHA-256 hash is stored; valid for 10 minutes; older codes are left alone
  const res = await q(
    `INSERT INTO email_codes (email, purpose, code_hash, expires_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL 10 MINUTE)`,
    [email, purpose, codeHash],
  );
  return res.insertId;
}

// ID-1, ID-3: the newest code for the e-mail and purpose, used or not, or null.
async function latestCode(email, purpose) {
  // BR-2: only the newest code counts; no filter on consumed_at, so an older code never revives
  const row = await q.one(
    `SELECT code_id, code_hash, attempts,
            consumed_at IS NOT NULL       AS consumed,
            expires_at <= UTC_TIMESTAMP() AS expired
     FROM email_codes
     WHERE email = ? AND purpose = ?
     ORDER BY code_id DESC
     LIMIT 1`,
    [email, purpose],
  );
  if (!row) return null;
  return {
    code_id: row.code_id,
    code_hash: row.code_hash,
    attempts: Number(row.attempts),
    consumed: Number(row.consumed),
    expired: Number(row.expired),
  };
}

// ID-1, ID-3: counts a wrong guess.
async function addWrongTry(codeId) {
  // BR-2: 5 wrong tries use a code up
  await q('UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = ?', [codeId]);
}

// ID-1: consumes the code and creates the account in one transaction.
// -> { ok: false } when the code was used meanwhile, else { ok: true, userId, handle }.
// Throws the duplicate-key error when the e-mail was registered meanwhile (tx rolls back, so the
// code stays unused).
async function registerUser(codeId, email, universityId, passwordHash, avatarCode) {
  return tx(async (t) => {
    // BR-2: the code works once, only while unused, under 5 tries and not expired
    const used = await t.q(CONSUME_CODE, [codeId]);
    if (used.affectedRows === 0) return { ok: false };
    for (let i = 0; i < 5; i++) {
      const handle = newHandle();
      try {
        // BR-1, BR-3: lower-case unique e-mail, random 9-character handle, bcrypt hash; every
        // other column takes the schema default (student, anonymous, university, notifications on)
        const res = await t.q(
          `INSERT INTO users (email, university_id, handle, password_hash, avatar_code)
           VALUES (?, ?, ?, ?, ?)`,
          [email, universityId, handle, passwordHash, avatarCode],
        );
        return { ok: true, userId: res.insertId, handle };
      } catch (err) {
        // a taken handle fails only this statement: try another; a taken e-mail leaves tx()
        if (!isDuplicate(err) || !/users\.handle/.test(err.sqlMessage || '')) throw err;
      }
    }
    throw new Error('No free handle after 5 tries');
  });
}

// ID-1, ID-2, ID-3: after a successful login.
async function touchLogin(userId) {
  // BR-3: remember the last login (UTC)
  await q('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE user_id = ?', [userId]);
}

// ID-3: consumes a reset code and sets the new hash in one transaction.
// -> { ok: false } when the code was used meanwhile, else { ok: true, userId, status }.
async function resetPassword(codeId, email, passwordHash) {
  return tx(async (t) => {
    // BR-2: the same once-only consume as for sign-up
    const used = await t.q(CONSUME_CODE, [codeId]);
    if (used.affectedRows === 0) return { ok: false };
    // BR-3: only a bcrypt hash is stored
    await t.q('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, email]);
    const user = await t.q.one('SELECT user_id, status FROM users WHERE email = ?', [email]);
    if (!user) return { ok: false };
    return { ok: true, userId: user.user_id, status: user.status };
  });
}

// ID-4: the Me hub's four counts in one query; each counts exactly the rows of its list.
async function meStats(userId, universityId) {
  // BR-10: computed, never stored. posts = discover's myPostIds (live, anonymous included);
  // watching = myWatchingIds; comments = content's listMyComments (not deleted; hidden ones
  // still listed); history = myHistoryIds (not cleared). Live = v_live_posts, visible = VISIBLE.
  const row = await q.one(
    `SELECT
       (SELECT COUNT(*) FROM v_live_posts p
         WHERE p.author_id = ?)                                          AS posts,
       (SELECT COUNT(*) FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id
         WHERE w.user_id = ? AND ${VISIBLE})                             AS watching,
       (SELECT COUNT(*) FROM comments c JOIN v_live_posts p ON p.post_id = c.post_id
         WHERE c.author_id = ? AND c.deleted_at IS NULL AND ${VISIBLE})  AS comments,
       (SELECT COUNT(*) FROM post_views v JOIN v_live_posts p ON p.post_id = v.post_id
         WHERE v.user_id = ? AND v.cleared_at IS NULL AND ${VISIBLE})    AS history`,
    [userId, userId, universityId, userId, universityId, userId, universityId],
  );
  return {
    posts: Number(row.posts),
    watching: Number(row.watching),
    comments: Number(row.comments),
    history: Number(row.history),
  };
}

// ID-5, ID-8: the account with its university and, for organizations, display name and
// description (NULL for everyone else), or null.
async function getProfile(userId) {
  // ID-5: the e-mail is shown only to its owner (Profile) and to admins (/admin/users)
  return q.one(
    `SELECT u.user_id, u.handle, u.email, u.role, u.status, u.avatar_code, u.bio, u.created_at,
            u.last_login_at, un.code AS university_code, un.name_en AS university_name,
            o.display_name, o.description
     FROM users u
     JOIN universities un      ON un.university_id = u.university_id
     LEFT JOIN organizations o ON o.user_id = u.user_id
     WHERE u.user_id = ?`,
    [userId],
  );
}

// ID-5: the account's own avatar and bio.
async function updateProfile(userId, avatarCode, bio) {
  // BR-18: bio at most 160 characters, may be empty; the route checked the avatar code
  await q('UPDATE users SET avatar_code = ?, bio = ? WHERE user_id = ?', [avatarCode, bio, userId]);
}

// ID-6: compose defaults and notification switches.
async function updateSettings(
  userId,
  defaultAnonymous,
  defaultVisibility,
  notifyComments,
  notifyLikes,
) {
  // BR-13: the messages triggers read notify_comments and notify_likes; content reads the defaults
  await q(
    `UPDATE users
        SET default_anonymous = ?, default_visibility = ?,
            notify_comments = ?, notify_likes = ?
      WHERE user_id = ?`,
    [
      defaultAnonymous ? 1 : 0,
      defaultVisibility,
      notifyComments ? 1 : 0,
      notifyLikes ? 1 : 0,
      userId,
    ],
  );
}

// ID-6: the current bcrypt hash, or null.
async function passwordHash(userId) {
  // BR-3: compared with bcrypt.compare before a change
  const row = await q.one('SELECT password_hash FROM users WHERE user_id = ?', [userId]);
  return row ? row.password_hash : null;
}

// ID-6: a new bcrypt hash.
async function setPassword(userId, hash) {
  // BR-3: only a bcrypt hash is stored
  await q('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, userId]);
}

// ID-8: up to 50 accounts whose handle starts with the term or whose e-mail contains it.
async function searchUsers(term) {
  // ID-8: LIKE wildcards in the term are escaped, so "_" matches only an underscore
  const t = String(term ?? '').replace(/[\\%_]/g, '\\$&');
  return q(
    `SELECT u.user_id, u.handle, u.email, un.code AS university_code, u.role, u.status,
            u.created_at, u.last_login_at
     FROM users u
     JOIN universities un ON un.university_id = u.university_id
     WHERE u.handle LIKE CONCAT(?, '%') OR u.email LIKE CONCAT('%', ?, '%')
     ORDER BY u.user_id
     LIMIT 50`,
    [t, t],
  );
}

// ID-8: bans an active account other than the admin's own; -> affectedRows (0: nothing changed).
async function banUser(userId, adminId) {
  // BR-3: banned users cannot log in; loadUser logs them out on their next request
  const res = await q(
    `UPDATE users SET status = 'banned'
      WHERE user_id = ? AND user_id <> ? AND status = 'active'`,
    [userId, adminId],
  );
  return res.affectedRows;
}

// ID-8: lifts a ban; -> affectedRows (0: was not banned).
async function unbanUser(userId) {
  // BR-3: the account can log in again
  const res = await q(
    `UPDATE users SET status = 'active' WHERE user_id = ? AND status = 'banned'`,
    [userId],
  );
  return res.affectedRows;
}

// ID-8: turns a student into an organization; -> true, or false if the user is not a student.
async function makeOrganization(userId, displayName) {
  return tx(async (t) => {
    // ISA: the role and the organizations row change together; only a student can become one
    const res = await t.q(
      `UPDATE users SET role = 'organization' WHERE user_id = ? AND role = 'student'`,
      [userId],
    );
    if (res.affectedRows === 0) return false;
    // ISA: the display name shows on named posts and events; the description stays '' in v1
    await t.q('INSERT INTO organizations (user_id, display_name) VALUES (?, ?)', [
      userId,
      displayName,
    ]);
    return true;
  });
}

module.exports = {
  universityForDomain,
  findUserByEmail,
  codeRequestedRecently,
  createCode,
  latestCode,
  addWrongTry,
  registerUser,
  touchLogin,
  resetPassword,
  meStats,
  getProfile,
  updateProfile,
  updateSettings,
  passwordHash,
  setPassword,
  searchUsers,
  banUser,
  unbanUser,
  makeOrganization,
};
