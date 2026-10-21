-- =====================================================================================
-- Identity module: reference SQL (tested). Each block becomes one function in
-- modules/identity/queries.js; @variables become ? placeholders in the same order.
-- Run: ONLY=modules/identity DB=cn_identity bash db/tests/run_all.sh
--      (fresh seeded database; CALL t_eq / t_err are checks)
-- Writer of: users, organizations, email_codes. Reads: university_domains, universities,
-- and for the Me hub v_live_posts, post_watches, comments, post_views.
--
-- Code hashes: Node stores crypto.createHash('sha256').update(code).digest('hex') and passes
-- the hex string as a parameter. SHA2(code, 256) below gives the same value (first check);
-- it is used here only so the checks can make hashes. Codes never reach the database in clear.
--
-- Row counts (ARCHITECTURE §6.1): ROW_COUNT() in these checks counts CHANGED rows, while
-- mysql2's affectedRows counts MATCHED rows. Every UPDATE whose 0-row result the app acts on
-- has a WHERE that only matches rows it will change, so the two agree.
-- =====================================================================================
SET time_zone = '+00:00';

CALL t_eq('sha256: MySQL SHA2(''123456'', 256) equals Node''s crypto sha256 hex digest',
  SHA2('123456', 256), '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');

-- -------------------------------------------------------------------------------------
-- universityForDomain(domain): which university an e-mail domain proves (ID-1, BR-1)
-- The app normalises first: email = input.trim().toLowerCase(), checks the format
-- (ASCII only, one @), and takes domain = email.slice(email.lastIndexOf('@') + 1).
-- Exact match only: no subdomains (x@cs.hku.hk is refused). The column is declared
-- COLLATE utf8mb4_bin, so a plain = compares byte for byte (no case or accent folding) and
-- still uses the primary key. No row -> "Use your HKU, CUHK or HKUST e-mail address."
-- -------------------------------------------------------------------------------------
SET @email = 'sam@connect.hku.hk';
SET @domain = SUBSTRING_INDEX(@email, '@', -1);          -- same as the Node line above
SELECT d.university_id, u.code AS university_code
FROM university_domains d
JOIN universities u ON u.university_id = d.university_id
WHERE d.domain = @domain;

CALL t_eq('universityForDomain: the domain is everything after the last @',
  SUBSTRING_INDEX('sam@connect.hku.hk', '@', -1), 'connect.hku.hk');
CALL t_eq('universityForDomain: every seeded domain gives its university',
  (SELECT GROUP_CONCAT(CONCAT(x.domain, '=', IFNULL(u.code, 'refused')) ORDER BY x.n SEPARATOR ' ')
   FROM (SELECT 1 AS n, 'hku.hk' AS domain UNION ALL SELECT 2, 'connect.hku.hk'
         UNION ALL SELECT 3, 'cuhk.edu.hk' UNION ALL SELECT 4, 'link.cuhk.edu.hk'
         UNION ALL SELECT 5, 'ust.hk' UNION ALL SELECT 6, 'connect.ust.hk') x
   LEFT JOIN university_domains d ON d.domain = x.domain
   LEFT JOIN universities u ON u.university_id = d.university_id),
  'hku.hk=HKU connect.hku.hk=HKU cuhk.edu.hk=CUHK link.cuhk.edu.hk=CUHK ust.hk=HKUST connect.ust.hk=HKUST');
CALL t_eq('universityForDomain: subdomains, other sites, look-alikes and un-normalised input are refused',
  (SELECT GROUP_CONCAT(CONCAT(x.domain, '=', IFNULL(u.code, 'refused')) ORDER BY x.n SEPARATOR ' ')
   FROM (SELECT 1 AS n, 'cs.hku.hk' AS domain UNION ALL SELECT 2, 'gmail.com'
         UNION ALL SELECT 3, 'hku.hk.evil.com' UNION ALL SELECT 4, 'hkü.hk'
         UNION ALL SELECT 5, 'HKU.HK') x
   LEFT JOIN university_domains d ON d.domain = x.domain
   LEFT JOIN universities u ON u.university_id = d.university_id),
  'cs.hku.hk=refused gmail.com=refused hku.hk.evil.com=refused hkü.hk=refused HKU.HK=refused');
CALL t_eq('universityForDomain: the column itself is binary (utf8mb4_bin), so a plain = is exact',
  (SELECT COLLATION(domain) FROM university_domains WHERE domain = 'hku.hk'), 'utf8mb4_bin');
CALL t_eq('universityForDomain: without any COLLATE in the query, hkü.hk and HKU.HK match nothing',
  (SELECT COUNT(*) FROM university_domains WHERE domain IN ('hkü.hk', 'HKU.HK')), '0');

-- -------------------------------------------------------------------------------------
-- findUserByEmail(email): the account behind an e-mail, for register (already taken?),
-- login and forgot (ID-1, ID-2, ID-3, BR-1, BR-3)
-- Register: a row -> "This e-mail is already registered. Log in or reset your password."
-- Login: no row, or bcrypt.compare fails -> "Wrong e-mail or password." (same text for both);
--        status 'banned' (checked AFTER the password) -> "This account is suspended."
-- Forgot: a row -> send a code; no row -> send nothing; the page answers the same either way.
-- users.email keeps the default collation (utf8mb4_0900_ai_ci): the lookup ignores case and
-- accents, so 'mándy@...' would find Mandy. That is why every form normalises (trim, lower
-- case) and accepts ASCII-only addresses before calling this; the CHECK keeps stored e-mails
-- lower case and the UNIQUE key (also accent-insensitive) refuses look-alike duplicates.
-- -------------------------------------------------------------------------------------
SET @email = 'mandy@connect.hku.hk';
SELECT user_id, password_hash, status FROM users WHERE email = @email;

CALL t_eq('findUserByEmail: Mandy is found, active, with a bcrypt hash',
  (SELECT CONCAT(user_id, '/', status, '/', LEFT(password_hash, 4)) FROM users WHERE email = 'mandy@connect.hku.hk'), '2/active/$2a$');
CALL t_eq('findUserByEmail: an unknown e-mail gives no row',
  (SELECT COUNT(*) FROM users WHERE email = 'sam@connect.hku.hk'), '0');
CALL t_eq('findUserByEmail: WHY the app normalises and allows ASCII only: upper case and accents still find Mandy',
  (SELECT COUNT(*) FROM users WHERE email IN ('MANDY@connect.hku.hk', 'mándy@connect.hku.hk')), '1');

-- -------------------------------------------------------------------------------------
-- codeRequestedRecently(email, purpose): the 60-second throttle (ID-1, ID-3, BR-2)
-- 1 -> register/resend: "Please wait a minute before asking for another code."
--      forgot: send nothing, answer as usual (the throttle must not reveal the account).
-- Uses ix_codes_lookup (email, purpose, created_at).
-- -------------------------------------------------------------------------------------
SET @email = 'sam@connect.hku.hk', @purpose = 'register';
SELECT EXISTS (SELECT 1 FROM email_codes
               WHERE email = @email AND purpose = @purpose
                 AND created_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND) AS too_soon;

CALL t_eq('codeRequestedRecently: no code yet, so Sam may ask for one',
  (SELECT EXISTS (SELECT 1 FROM email_codes WHERE email = 'sam@connect.hku.hk' AND purpose = 'register'
                  AND created_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND)), '0');

-- -------------------------------------------------------------------------------------
-- createCode(email, purpose, codeHash): store a new code, valid for 10 minutes (ID-1, ID-3, BR-2)
-- Node: code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); store only its hash;
-- then mailer.send({ to: email, subject: 'Your Campus Notes code', text }).
-- Older codes are not touched: latestCode() below only ever looks at the newest one.
-- -------------------------------------------------------------------------------------
SET @email = 'sam@connect.hku.hk', @purpose = 'register', @code_hash = SHA2('482913', 256);
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES (@email, @purpose, @code_hash, UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @sam_code1 = LAST_INSERT_ID();

CALL t_eq('createCode: only the 64-character hash is stored, never the code',
  (SELECT CONCAT(CHAR_LENGTH(code_hash), '/', code_hash = SHA2('482913', 256), '/', code_hash <> '482913')
   FROM email_codes WHERE code_id = @sam_code1), '64/1/1');
CALL t_eq('createCode: the code is valid for exactly 10 minutes, with no tries used',
  (SELECT CONCAT(TIMESTAMPDIFF(SECOND, created_at, expires_at), '/', attempts, '/', IFNULL(consumed_at, 'open'))
   FROM email_codes WHERE code_id = @sam_code1), '600/0/open');
CALL t_eq('codeRequestedRecently: right after a code, Sam must wait',
  (SELECT EXISTS (SELECT 1 FROM email_codes WHERE email = 'sam@connect.hku.hk' AND purpose = 'register'
                  AND created_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND)), '1');
CALL t_eq('codeRequestedRecently: the throttle is per purpose (a reset code may still be asked for)',
  (SELECT EXISTS (SELECT 1 FROM email_codes WHERE email = 'sam@connect.hku.hk' AND purpose = 'reset'
                  AND created_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND)), '0');

-- test only: pretend 61 seconds have passed, then Sam presses "Send a new code" (POST /auth/resend)
UPDATE email_codes SET created_at = created_at - INTERVAL 61 SECOND WHERE code_id = @sam_code1;
CALL t_eq('codeRequestedRecently: after 60 seconds a new code may be sent',
  (SELECT EXISTS (SELECT 1 FROM email_codes WHERE email = 'sam@connect.hku.hk' AND purpose = 'register'
                  AND created_at > UTC_TIMESTAMP() - INTERVAL 60 SECOND)), '0');
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('sam@connect.hku.hk', 'register', SHA2('739204', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @sam_code2 = LAST_INSERT_ID();

-- -------------------------------------------------------------------------------------
-- latestCode(email, purpose): the one code that counts (ID-1, ID-3, BR-2)
-- Only the NEWEST code for (email, purpose) counts, and only while it is unused. The query
-- deliberately does not filter on consumed_at: if the newest code was used, an older code
-- must not come back to life. The app then decides, in this order:
--   no row, or consumed = 1  -> "This code is no longer valid. Request a new one."
--   expired = 1              -> "This code has expired. Request a new one."
--   attempts >= 5            -> "Too many wrong tries. Request a new code."
--   hash differs             -> addWrongTry(); "Wrong code. N tries left." (N = 5 - attempts after)
--   hash matches             -> registerUser() or resetPassword()
-- Compare hashes with crypto.timingSafeEqual on the two hex buffers.
-- -------------------------------------------------------------------------------------
SET @email = 'sam@connect.hku.hk', @purpose = 'register';
SELECT code_id, code_hash, attempts,
       consumed_at IS NOT NULL       AS consumed,
       expires_at <= UTC_TIMESTAMP() AS expired
FROM email_codes
WHERE email = @email AND purpose = @purpose
ORDER BY code_id DESC
LIMIT 1;

CALL t_eq('latestCode: after a resend, only the newest code counts',
  (SELECT code_id = @sam_code2 FROM email_codes WHERE email = 'sam@connect.hku.hk' AND purpose = 'register'
   ORDER BY code_id DESC LIMIT 1), '1');
CALL t_eq('latestCode: the first code (482913) no longer matches, so typing it is a wrong try',
  (SELECT code_hash = SHA2('482913', 256) FROM email_codes WHERE email = 'sam@connect.hku.hk' AND purpose = 'register'
   ORDER BY code_id DESC LIMIT 1), '0');
CALL t_eq('latestCode: a register code is not a reset code',
  (SELECT COUNT(*) FROM email_codes WHERE email = 'sam@connect.hku.hk' AND purpose = 'reset'), '0');

-- -------------------------------------------------------------------------------------
-- addWrongTry(codeId): count a wrong guess (ID-1, ID-3, BR-2)
-- -------------------------------------------------------------------------------------
SET @code_id = @sam_code2;
UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = @code_id;
CALL t_eq('addWrongTry: one wrong try leaves 4 ("Wrong code. 4 tries left.")',
  (SELECT 5 - attempts FROM email_codes WHERE code_id = @sam_code2), '4');

-- Five wrong tries use a code up, even for the right code (separate address, fresh code).
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('lock@connect.hku.hk', 'register', SHA2('111111', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @lock_code = LAST_INSERT_ID();
UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = @lock_code;
UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = @lock_code;
UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = @lock_code;
UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = @lock_code;
UPDATE email_codes SET attempts = attempts + 1 WHERE code_id = @lock_code;
CALL t_eq('addWrongTry: after 5 wrong tries the code is locked (attempts >= 5)',
  (SELECT attempts >= 5 FROM email_codes WHERE code_id = @lock_code), '1');
UPDATE email_codes SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @lock_code AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_eq('consumeCode: a locked code cannot be used, even with the right digits', ROW_COUNT(), '0');

-- Expiry: test only, move expires_at into the past.
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('late@link.cuhk.edu.hk', 'register', SHA2('222222', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @late_code = LAST_INSERT_ID();
UPDATE email_codes SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE code_id = @late_code;
CALL t_eq('latestCode: a code past expires_at reports expired = 1',
  (SELECT expires_at <= UTC_TIMESTAMP() FROM email_codes WHERE code_id = @late_code), '1');
UPDATE email_codes SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @late_code AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_eq('consumeCode: an expired code cannot be used', ROW_COUNT(), '0');

-- -------------------------------------------------------------------------------------
-- registerUser(codeId, email, universityId, passwordHash, avatarCode): consume the code and
-- create the account in one transaction (ID-1, BR-1, BR-2, BR-3)
-- In queries.js (bcrypt.hash(password, 10) is computed BEFORE the transaction):
--   tx(async t => {
--     const c = await t.q(<consume UPDATE>, [codeId]);
--     if (c.affectedRows === 0) return { ok: false, reason: 'code_used' };   // a parallel request won
--     for (let i = 0; i < 5; i++) {
--       try {
--         const r = await t.q(<INSERT>, [email, universityId, newHandle(), passwordHash, avatarCode]);
--         return { ok: true, userId: r.insertId };
--       } catch (err) {
--         if (!isDuplicate(err) || !/users\.handle/.test(err.sqlMessage)) throw err;  // e-mail taken -> ROLLBACK
--       }                                                                           // handle taken -> try another
--     }
--     throw new Error('No free handle after 5 tries');
--   })
-- A duplicate key fails only that statement, not the transaction, so the retry happens inside
-- the same transaction. A duplicate e-mail (someone registered it since the code was sent)
-- throws; tx() rolls back, so the code stays unused; the route shows
-- "This e-mail is already registered."
-- The re-checks in the consume UPDATE (attempts, expiry) repeat the app's checks atomically.
-- -------------------------------------------------------------------------------------
SET @code_id = @sam_code2, @email = 'sam@connect.hku.hk', @university = 1, @handle = 'k3m9x2p7a',
    @password_hash = '$2a$10$BQXplPmPWQ5gXkjIbT1MmOYLVK74US3DzjohpkazjNKPPp.RXNx5C', @avatar = 'koala';
START TRANSACTION;
UPDATE email_codes
   SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @code_id AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_eq('registerUser: the right code is consumed (1 row)', ROW_COUNT(), '1');
INSERT INTO users (email, university_id, handle, password_hash, avatar_code)
VALUES (@email, @university, @handle, @password_hash, @avatar);
SET @sam = LAST_INSERT_ID();
COMMIT;

CALL t_eq('registerUser: Sam is an HKU student with handle k3m9x2p7a',
  (SELECT CONCAT(u.handle, '/', un.code, '/', u.avatar_code) FROM users u JOIN universities un USING (university_id) WHERE u.user_id = @sam),
  'k3m9x2p7a/HKU/koala');
CALL t_eq('registerUser: the schema defaults apply (role, anonymous, visibility, notifications, status, bio)',
  (SELECT CONCAT(role, '/', default_anonymous, '/', default_visibility, '/', notify_comments, '/', notify_likes, '/', status, '/', CHAR_LENGTH(bio))
   FROM users WHERE user_id = @sam), 'student/1/university/1/1/active/0');
UPDATE email_codes SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @sam_code2 AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_eq('consumeCode: a code works once; the second use changes 0 rows', ROW_COUNT(), '0');
CALL t_eq('latestCode: the used code now reports consumed = 1 ("no longer valid")',
  (SELECT CONCAT(code_id = @sam_code2, '/', consumed_at IS NOT NULL) FROM email_codes
   WHERE email = 'sam@connect.hku.hk' AND purpose = 'register' ORDER BY code_id DESC LIMIT 1), '1/1');

-- A handle collision is retried with a new handle inside the same transaction.
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('ivy@link.cuhk.edu.hk', 'register', SHA2('333333', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @ivy_code = LAST_INSERT_ID();
START TRANSACTION;
UPDATE email_codes SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @ivy_code AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_err('registerUser: a handle that already exists is a duplicate key (users.handle)',
  'INSERT INTO users (email, university_id, handle, password_hash, avatar_code) VALUES (''ivy@link.cuhk.edu.hk'', 2, ''mandy0hku'', ''h'', ''owl'')', 1062);
INSERT INTO users (email, university_id, handle, password_hash, avatar_code)
VALUES ('ivy@link.cuhk.edu.hk', 2, 'q8w2e4r6t', '$2a$10$BQXplPmPWQ5gXkjIbT1MmOYLVK74US3DzjohpkazjNKPPp.RXNx5C', 'owl');
COMMIT;
CALL t_eq('registerUser: the retry succeeds in the same transaction and the code is used',
  (SELECT CONCAT(u.handle, '/', un.code, '/', (SELECT consumed_at IS NOT NULL FROM email_codes WHERE code_id = @ivy_code))
   FROM users u JOIN universities un USING (university_id) WHERE u.email = 'ivy@link.cuhk.edu.hk'), 'q8w2e4r6t/CUHK/1');

-- The race: the e-mail was registered (another tab) after the code was sent.
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('twin@connect.hku.hk', 'register', SHA2('444444', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @twin_code = LAST_INSERT_ID();
INSERT INTO users (email, university_id, handle, password_hash) VALUES ('twin@connect.hku.hk', 1, 'twin00hku', 'h');
START TRANSACTION;
UPDATE email_codes SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @twin_code AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_err('registerUser: an e-mail registered meanwhile is a duplicate key (users.email)',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''twin@connect.hku.hk'', 1, ''z9z9z9z9z'', ''h'')', 1062);
ROLLBACK;
CALL t_eq('registerUser: after the ROLLBACK the code is still unused and no second account exists',
  (SELECT CONCAT(IFNULL(consumed_at, 'open'), '/', (SELECT COUNT(*) FROM users WHERE email = 'twin@connect.hku.hk'))
   FROM email_codes WHERE code_id = @twin_code), 'open/1');

-- The database refuses what the app must never send.
CALL t_err('users: one account per e-mail (1062)',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''mandy@connect.hku.hk'', 1, ''abcdefghi'', ''h'')', 1062);
CALL t_err('users: an upper-case e-mail is refused by the CHECK (3819), even if it is a duplicate',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''Mandy@connect.hku.hk'', 1, ''abcdefghi'', ''h'')', 3819);
CALL t_err('users: an upper-case handle is refused by the CHECK (3819)',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''new1@hku.hk'', 1, ''K3M9X2P7B'', ''h'')', 3819);
CALL t_err('users: a handle must have exactly 9 characters (3819)',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''new2@hku.hk'', 1, ''abc12345'', ''h'')', 3819);
CALL t_err('users: the university must exist (1452)',
  'INSERT INTO users (email, university_id, handle, password_hash) VALUES (''new3@hku.hk'', 9, ''abc123456'', ''h'')', 1452);

-- -------------------------------------------------------------------------------------
-- touchLogin(userId): after a successful login (ID-2, BR-3)
-- The route has already: findUserByEmail -> bcrypt.compare -> status check -> login(req, id).
-- -------------------------------------------------------------------------------------
SET @user_id = 6;                                -- Newbie has never logged in
UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE user_id = @user_id;
CALL t_eq('touchLogin: last_login_at is set to now (UTC)',
  (SELECT ABS(TIMESTAMPDIFF(SECOND, last_login_at, UTC_TIMESTAMP())) <= 5 FROM users WHERE user_id = 6), '1');

-- -------------------------------------------------------------------------------------
-- resetPassword(codeId, email, passwordHash): forgot password, step 2 (ID-3, BR-2, BR-3)
-- Step 1 (POST /auth/forgot) uses findUserByEmail, codeRequestedRecently and createCode with
-- purpose 'reset', and always answers "If an account exists for that e-mail, we sent a code."
-- Step 2 checks the code with latestCode/addWrongTry exactly as for registration, then:
--   tx: consume (0 rows -> "This code is no longer valid. Request a new one.");
--       UPDATE the hash; SELECT user_id, status -> login(req, id) unless banned.
-- -------------------------------------------------------------------------------------
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('mandy@connect.hku.hk', 'reset', SHA2('555111', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @mandy_reset = LAST_INSERT_ID();
CALL t_eq('resetPassword: Mandy has no register code, so the reset code is the only one that counts',
  (SELECT GROUP_CONCAT(purpose) FROM email_codes WHERE email = 'mandy@connect.hku.hk'), 'reset');

SET @code_id = @mandy_reset, @email = 'mandy@connect.hku.hk',
    @password_hash = '$2a$10$abcdefghijklmnopqrstuuJ8Sx1M0h3S0bS6Zc2xg1C5y5mOcm7Wm';   -- placeholder: the app passes bcrypt.hash(password, 10)
START TRANSACTION;
UPDATE email_codes SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @code_id AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_eq('resetPassword: the reset code is consumed', ROW_COUNT(), '1');
UPDATE users SET password_hash = @password_hash WHERE email = @email;
SELECT user_id, status FROM users WHERE email = @email;
COMMIT;
CALL t_eq('resetPassword: Mandy''s password hash is replaced',
  (SELECT password_hash = '$2a$10$abcdefghijklmnopqrstuuJ8Sx1M0h3S0bS6Zc2xg1C5y5mOcm7Wm' FROM users WHERE user_id = 2), '1');

-- Only the newest code counts, even after it was used: an older unused code stays dead.
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('kelvin@connect.hku.hk', 'reset', SHA2('666001', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @kelvin_old = LAST_INSERT_ID();
UPDATE email_codes SET created_at = created_at - INTERVAL 61 SECOND WHERE code_id = @kelvin_old;   -- test only
INSERT INTO email_codes (email, purpose, code_hash, expires_at)
VALUES ('kelvin@connect.hku.hk', 'reset', SHA2('666002', 256), UTC_TIMESTAMP() + INTERVAL 10 MINUTE);
SET @kelvin_new = LAST_INSERT_ID();
UPDATE email_codes SET consumed_at = UTC_TIMESTAMP()
 WHERE code_id = @kelvin_new AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP();
CALL t_eq('latestCode: after the newest code is used, the older unused one is NOT returned',
  (SELECT CONCAT(code_id = @kelvin_new, '/', consumed_at IS NOT NULL) FROM email_codes
   WHERE email = 'kelvin@connect.hku.hk' AND purpose = 'reset' ORDER BY code_id DESC LIMIT 1), '1/1');

-- -------------------------------------------------------------------------------------
-- meStats(userId, myUniversityId): the four counts on the Me hub, in one query (ID-4, BR-10)
-- Each count counts exactly the rows of the list it links to, so the number and the list agree:
--   posts    my live posts (v_live_posts: not deleted, not hidden), anonymous ones included
--            = discover's /me/posts (myPostIds)
--   watching posts I watch that are live and visible to me      = discover's /me/watching
--   comments my comments I have not deleted, on live posts visible to me (hidden comments
--            stay: the list shows them as "[hidden by a moderator]") = content's /me/comments
--   history  my post_views rows not cleared (cleared_at IS NULL), on live posts visible to me
--            = discover's /me/history
-- The visibility test is the VISIBLE fragment from core/cards (alias p). comments c is used
-- instead of v_comment_items: same rows (every comment has its post_participants row, by FK).
-- Counts are computed, never stored (derived attributes /post_count, /comment_count).
-- Parameters in order: me, me, myUniversityId, me, myUniversityId, me, myUniversityId.
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1;                        -- Mandy, HKU
SELECT
  (SELECT COUNT(*) FROM v_live_posts p
    WHERE p.author_id = @me)                                                              AS posts,
  (SELECT COUNT(*) FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id
    WHERE w.user_id = @me AND (p.visibility = 'all' OR p.author_university_id = @my_uni))  AS watching,
  (SELECT COUNT(*) FROM comments c JOIN v_live_posts p ON p.post_id = c.post_id
    WHERE c.author_id = @me AND c.deleted_at IS NULL
      AND (p.visibility = 'all' OR p.author_university_id = @my_uni))                     AS comments,
  (SELECT COUNT(*) FROM post_views v JOIN v_live_posts p ON p.post_id = v.post_id
    WHERE v.user_id = @me AND v.cleared_at IS NULL
      AND (p.visibility = 'all' OR p.author_university_id = @my_uni))                     AS history;

-- Test scaffolding (not app code): the same query as a function returning 'posts/watching/
-- comments/history', so every check below runs exactly the block above.
DROP FUNCTION IF EXISTS t_me_stats;
DELIMITER $$
CREATE FUNCTION t_me_stats(p_me INT UNSIGNED, p_uni TINYINT UNSIGNED) RETURNS VARCHAR(50) READS SQL DATA
BEGIN
  RETURN (SELECT CONCAT_WS('/',
    (SELECT COUNT(*) FROM v_live_posts p
      WHERE p.author_id = p_me),
    (SELECT COUNT(*) FROM post_watches w JOIN v_live_posts p ON p.post_id = w.post_id
      WHERE w.user_id = p_me AND (p.visibility = 'all' OR p.author_university_id = p_uni)),
    (SELECT COUNT(*) FROM comments c JOIN v_live_posts p ON p.post_id = c.post_id
      WHERE c.author_id = p_me AND c.deleted_at IS NULL
        AND (p.visibility = 'all' OR p.author_university_id = p_uni)),
    (SELECT COUNT(*) FROM post_views v JOIN v_live_posts p ON p.post_id = v.post_id
      WHERE v.user_id = p_me AND v.cleared_at IS NULL
        AND (p.visibility = 'all' OR p.author_university_id = p_uni))));
END$$
DELIMITER ;

CALL t_eq('meStats: Mandy has 3 live posts (600009 is deleted), watches 2, 4 comments, 4 in history',
  t_me_stats(2, 1), '3/2/4/4');
CALL t_eq('meStats: Newbie has nothing yet', t_me_stats(6, 1), '0/0/0/0');
CALL t_eq('meStats: Jason''s hidden post 600010 is not counted; his hidden comment 12 is (the list shows it)',
  t_me_stats(5, 3), '2/0/3/2');
CALL t_eq('meStats: Wing''s deleted comment 6 is not counted', t_me_stats(4, 2), '2/1/3/3');
CALL t_eq('meStats: Kelvin has 3 posts, watches 2, 3 comments, 3 in history', t_me_stats(3, 1), '3/2/3/3');
CALL t_eq('meStats: filmsoc00 has its one post; admin0000 has nothing',
  CONCAT(t_me_stats(7, 1), ' ', t_me_stats(1, 1)), '1/0/0/0 0/0/0/0');

-- Rolled back: the counts follow the lists (content's Clear history sets cleared_at; a view of
-- a hidden post and a comment on a deleted post are not listed, so they are not counted).
START TRANSACTION;
UPDATE post_views SET cleared_at = UTC_TIMESTAMP() WHERE user_id = 2 AND post_id = 600002;
INSERT INTO post_views (user_id, post_id) VALUES (2, 600010);
UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE post_id = 600001;
CALL t_eq('meStats: a cleared view, a view of a hidden post and a deleted post are left out (Mandy)',
  t_me_stats(2, 1), '2/2/3/3');
ROLLBACK;
CALL t_eq('meStats: after the ROLLBACK Mandy is back to 3/2/4/4', t_me_stats(2, 1), '3/2/4/4');

-- -------------------------------------------------------------------------------------
-- getProfile(userId): the Profile page, and the account checked by an admin action (ID-5, ID-8)
-- The e-mail is shown only to its owner (Profile) and to admins (/admin/users).
-- display_name and description are NULL for anyone who is not an organization.
-- POST /admin/users/:id also uses it: no row -> 404; the handle goes into the flash.
-- -------------------------------------------------------------------------------------
SET @me = 2;
SELECT u.user_id, u.handle, u.email, u.role, u.status, u.avatar_code, u.bio, u.created_at, u.last_login_at,
       un.code AS university_code, un.name_en AS university_name,
       o.display_name, o.description
FROM users u
JOIN universities un      ON un.university_id = u.university_id
LEFT JOIN organizations o ON o.user_id = u.user_id
WHERE u.user_id = @me;

CALL t_eq('getProfile: Mandy (student) has no organization fields',
  (SELECT CONCAT(u.handle, '/', u.email, '/', un.name_en, '/', u.bio, '/', IFNULL(o.display_name, '-'))
   FROM users u JOIN universities un ON un.university_id = u.university_id LEFT JOIN organizations o ON o.user_id = u.user_id
   WHERE u.user_id = 2), 'mandy0hku/mandy@connect.hku.hk/The University of Hong Kong/Year 3, FinTech/-');
CALL t_eq('getProfile: filmsoc00 shows its display name and description',
  (SELECT CONCAT(o.display_name, '/', o.description) FROM users u LEFT JOIN organizations o ON o.user_id = u.user_id
   WHERE u.user_id = 7), 'HKU Film Society/Weekly screenings and director talks.');

-- -------------------------------------------------------------------------------------
-- updateProfile(userId, avatarCode, bio): avatar and bio (ID-5, BR-18)
-- The route checks avatarCode with oneOf(..., ui.avatars) (the database has no list of
-- avatars) and the bio: trimmed, may be empty, at most 160 characters.
-- -------------------------------------------------------------------------------------
SET @me = 2, @avatar = 'fox', @bio = 'Year 3, FinTech. Film society member.';
UPDATE users SET avatar_code = @avatar, bio = @bio WHERE user_id = @me;
CALL t_eq('updateProfile: Mandy''s avatar and bio are saved',
  (SELECT CONCAT(avatar_code, '/', bio) FROM users WHERE user_id = 2), 'fox/Year 3, FinTech. Film society member.');
UPDATE users SET bio = REPEAT('图', 160) WHERE user_id = 2;
CALL t_eq('updateProfile: 160 characters fit, also in Chinese', (SELECT CHAR_LENGTH(bio) FROM users WHERE user_id = 2), '160');
CALL t_err('updateProfile: 161 characters are refused (1406)',
  CONCAT('UPDATE users SET bio = ''', REPEAT('a', 161), ''' WHERE user_id = 2'), 1406);
UPDATE users SET bio = '' WHERE user_id = 2;
CALL t_eq('updateProfile: an empty bio is allowed', (SELECT CHAR_LENGTH(bio) FROM users WHERE user_id = 2), '0');

-- -------------------------------------------------------------------------------------
-- updateSettings(userId, defaultAnonymous, defaultVisibility, notifyComments, notifyLikes) (ID-6)
-- Each toggle submits 1 or 0 (bool()); "Share new posts with all universities by default"
-- on -> 'all', off -> 'university'. Readers (WORK_DIVISION §4 row 12): content pre-fills
-- compose from req.me.defaultAnonymous / defaultVisibility; the messages triggers read
-- notify_comments / notify_likes when a comment or like is inserted.
-- -------------------------------------------------------------------------------------
SET @me = 2, @anon = 0, @visibility = 'all', @notify_comments = 0, @notify_likes = 1;
UPDATE users
   SET default_anonymous = @anon, default_visibility = @visibility,
       notify_comments = @notify_comments, notify_likes = @notify_likes
 WHERE user_id = @me;
CALL t_eq('updateSettings: Mandy now posts with her handle, to all universities, without comment notifications',
  (SELECT CONCAT(default_anonymous, '/', default_visibility, '/', notify_comments, '/', notify_likes) FROM users WHERE user_id = 2),
  '0/all/0/1');
-- An unknown visibility ('everyone') fails with error 1265 in strict mode. It is not checked
-- here: 1265 has SQLSTATE 01000, which t_err's SQLEXCEPTION handler cannot catch, so the
-- mysql client would stop. The route only ever passes 'all' or 'university'.

-- Contract check (WORK_DIVISION §4 row 12): the messages trigger reads notify_comments.
-- Kelvin (already Alice on 600001) comments on Mandy's post: no notification while it is off.
INSERT INTO comments (post_id, author_id, body) VALUES (600001, 3, 'Is it open on Sunday too?');
CALL t_eq('contract: with notify_comments off, Mandy gets no notification for a comment on her post',
  (SELECT COUNT(*) FROM notifications WHERE comment_id = LAST_INSERT_ID() AND recipient_id = 2), '0');
UPDATE users SET notify_comments = 1 WHERE user_id = 2;
INSERT INTO comments (post_id, author_id, body) VALUES (600001, 3, 'Thanks again!');
CALL t_eq('contract: switched back on, the next comment notifies her',
  (SELECT GROUP_CONCAT(type) FROM notifications WHERE comment_id = LAST_INSERT_ID() AND recipient_id = 2), 'comment_on_post');

-- -------------------------------------------------------------------------------------
-- passwordHash(userId) and setPassword(userId, passwordHash): change password (ID-6, BR-3)
-- The route: bcrypt.compare(current, hash) false -> "Your current password is wrong.";
-- new password < 8 characters or confirm differs -> error; else setPassword(bcrypt.hash(new, 10)).
-- -------------------------------------------------------------------------------------
SET @me = 3;
SELECT password_hash FROM users WHERE user_id = @me;
SET @password_hash = '$2a$10$zyxwvutsrqponmlkjihgfeQ3m1kC1yW0bH8d1n5kq2pX7rT9uV0aa';   -- placeholder bcrypt hash
UPDATE users SET password_hash = @password_hash WHERE user_id = @me;
CALL t_eq('setPassword: Kelvin''s hash is replaced',
  (SELECT password_hash = '$2a$10$zyxwvutsrqponmlkjihgfeQ3m1kC1yW0bH8d1n5kq2pX7rT9uV0aa' FROM users WHERE user_id = 3), '1');

-- -------------------------------------------------------------------------------------
-- searchUsers(term): admin user list (ID-8). Admin only (requireRole('admin') on the route).
-- Handle prefix or any part of the e-mail; an empty term lists the first 50 accounts, oldest first.
-- Escape LIKE wildcards in Node first: term.replace(/[\\%_]/g, '\\$&'). The term is passed twice.
-- -------------------------------------------------------------------------------------
SET @term = 'cuhk';
SELECT u.user_id, u.handle, u.email, un.code AS university_code, u.role, u.status, u.created_at, u.last_login_at
FROM users u
JOIN universities un ON un.university_id = u.university_id
WHERE u.handle LIKE CONCAT(@term, '%') OR u.email LIKE CONCAT('%', @term, '%')
ORDER BY u.user_id
LIMIT 50;

CALL t_eq('searchUsers: "cuhk" finds the two CUHK seed accounts and Ivy by e-mail',
  (SELECT GROUP_CONCAT(u.handle ORDER BY u.user_id) FROM users u
   WHERE u.handle LIKE CONCAT('cuhk', '%') OR u.email LIKE CONCAT('%', 'cuhk', '%')), 'wing0cuhk,hikeclub0,q8w2e4r6t');
CALL t_eq('searchUsers: "mandy" finds Mandy by handle and e-mail, once',
  (SELECT GROUP_CONCAT(u.handle) FROM users u
   WHERE u.handle LIKE CONCAT('mandy', '%') OR u.email LIKE CONCAT('%', 'mandy', '%')), 'mandy0hku');
CALL t_eq('searchUsers: an unescaped "_" would match every account',
  (SELECT COUNT(*) = (SELECT COUNT(*) FROM users) FROM users u
   WHERE u.handle LIKE CONCAT('_', '%') OR u.email LIKE CONCAT('%', '_', '%')), '1');
CALL t_eq('searchUsers: the escaped underscore matches only a real underscore (none here)',
  (SELECT COUNT(*) FROM users u
   WHERE u.handle LIKE CONCAT('\\_', '%') OR u.email LIKE CONCAT('%', '\\_', '%')), '0');

-- -------------------------------------------------------------------------------------
-- banUser(userId, adminId) and unbanUser(userId) (ID-8, BR-3)
-- 0 rows from banUser: the admin chose themself ("You cannot ban yourself.", also checked in
-- the route) or the user was already banned. The backbone's loadUser logs a banned user out
-- on their next request; login then answers "This account is suspended."
-- -------------------------------------------------------------------------------------
SET @user = 5, @admin = 1;                       -- the admin bans Jason
UPDATE users SET status = 'banned' WHERE user_id = @user AND user_id <> @admin AND status = 'active';
CALL t_eq('banUser: Jason is banned', ROW_COUNT(), '1');
CALL t_eq('findUserByEmail: login now sees status banned',
  (SELECT status FROM users WHERE email = 'jason@connect.ust.hk'), 'banned');
UPDATE users SET status = 'banned' WHERE user_id = 1 AND user_id <> 1 AND status = 'active';
CALL t_eq('banUser: an admin cannot ban themself (0 rows)', ROW_COUNT(), '0');
SET @user = 5;
UPDATE users SET status = 'active' WHERE user_id = @user AND status = 'banned';
CALL t_eq('unbanUser: Jason is active again', (SELECT status FROM users WHERE user_id = 5), 'active');

-- -------------------------------------------------------------------------------------
-- makeOrganization(userId, displayName): turn a student into an organization (ID-8)
-- One transaction, so role and organizations row always go together (ISA):
--   tx(async t => {
--     const r = await t.q(<UPDATE>, [userId]);
--     if (r.affectedRows === 0) return false;   // not a student: "Only a student account can become an organization."
--     await t.q(<INSERT>, [userId, displayName]);
--     return true;
--   })
-- The description stays '' (read-only in v1). Posts that show the handle now show the
-- display name instead (v_post_cards uses COALESCE(o.display_name, au.handle)).
-- -------------------------------------------------------------------------------------
SET @user = 6, @display_name = 'HKU Chess Club';
START TRANSACTION;
UPDATE users SET role = 'organization' WHERE user_id = @user AND role = 'student';
CALL t_eq('makeOrganization: Newbie the student becomes an organization (1 row)', ROW_COUNT(), '1');
INSERT INTO organizations (user_id, display_name) VALUES (@user, @display_name);
COMMIT;
CALL t_eq('makeOrganization: role and display name are saved together',
  (SELECT CONCAT(u.role, '/', o.display_name, '/', CHAR_LENGTH(o.description)) FROM users u JOIN organizations o USING (user_id) WHERE u.user_id = 6),
  'organization/HKU Chess Club/0');
START TRANSACTION;
UPDATE users SET role = 'organization' WHERE user_id = 6 AND role = 'student';
CALL t_eq('makeOrganization: a second time changes 0 rows, so the app rolls back', ROW_COUNT(), '0');
ROLLBACK;
UPDATE users SET role = 'organization' WHERE user_id = 1 AND role = 'student';
CALL t_eq('makeOrganization: an admin cannot be turned into an organization', ROW_COUNT(), '0');
CALL t_err('makeOrganization: a display name over 60 characters is refused (1406)',
  CONCAT('INSERT INTO organizations (user_id, display_name) VALUES (5, ''', REPEAT('x', 61), ''')'), 1406);
CALL t_eq('invariant: every organizations row belongs to a user with role organization',
  (SELECT COUNT(*) FROM organizations o JOIN users u ON u.user_id = o.user_id WHERE u.role <> 'organization'), '0');
