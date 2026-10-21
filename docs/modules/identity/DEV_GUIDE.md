# Identity module: developer guide

| | |
|---|---|
| **Owner** | Michael (coordinator). Built by Claude together with the backbone before kickoff (decision D2); Michael reviews it, owns it and maintains it. |
| **Folder** | `modules/identity/`, `docs/modules/identity/` |
| **Features** | ID-1 to ID-8 (`PRODUCT_SPEC.md` §4) |
| **Read first** | `ARCHITECTURE.md` §1, §4, §5, §6, §9; `PRODUCT_SPEC.md` BR-1 to BR-4, BR-10 and BR-18; [responsive layout](../../architecture/RESPONSIVE.md); this guide |
| **Tested SQL** | `queries.sql` (this folder) |

You can build this module without knowing the rest of the app. Everything you need from other modules is listed in §3. Because identity ships with the backbone, this guide is mainly the specification and the test list for that build, and the reference for whoever maintains it afterwards.

## 1. The module in one paragraph

Identity decides who may use Campus Notes and who they are once inside. A student joins with a university e-mail address: the domain decides the university, a 6-digit code proves the address, and the new account gets a random 9-character handle that never changes. Members log in and out, reset a forgotten password by code, and manage their account from the **Me** tab: a hub with their avatar, handle, university and four counts, a profile (avatar and bio), and settings that other modules read (default anonymity and visibility for new posts, comment and like notifications). Identity also serves the four public pages (About, Contact, Terms, Privacy) and, if time allows, an admin user list for banning users and creating organization accounts. It has little SQL to show off; its job is to be correct and secure, because every other module trusts `req.me`.

## 2. What you own

**Tables you write:** `users`, `organizations`, `email_codes`. **Not yours:** `sessions` (the backbone's; you change it only through `login()` and `logout()`) and `outbox` (the backbone's; you send mail only through `mailer.send`). **Tables you read:** `university_domains` and `universities` (sign-up, profile); `v_live_posts`, `post_watches`, `comments` and `post_views` (the Me hub's counts, which must match discover's and content's lists).

**Routes** (from `WORK_DIVISION.md` §3):

| Method | Path | Who | Feature |
|---|---|---|---|
| GET, POST | `/auth/register` | visitors | ID-1 |
| GET, POST | `/auth/verify` | visitors with a pending sign-up | ID-1 |
| POST | `/auth/resend` | visitors with a pending sign-up | ID-1 |
| GET, POST | `/auth/login` | visitors | ID-2 |
| POST | `/auth/logout` | everyone | ID-2 |
| GET, POST | `/auth/forgot` | visitors | ID-3 |
| GET, POST | `/auth/reset` | visitors with a pending reset | ID-3 |
| GET | `/me` | everyone logged in | ID-4 |
| GET, POST | `/me/profile` | everyone logged in | ID-5 |
| GET, POST | `/me/settings` | everyone logged in | ID-6 |
| POST | `/me/password` | everyone logged in | ID-6 |
| GET | `/about`, `/contact`, `/terms`, `/privacy` | everyone, also logged out | ID-7 |
| GET | `/admin/users` | admin | ID-8 |
| POST | `/admin/users/:id` | admin | ID-8 |

A logged-in user who opens any `/auth/*` page except logout is redirected to `/feed`.

**Manifest** (`modules/identity/index.js`):

```js
module.exports = {
  name: 'identity',
  router: require('./routes'),
  publicRoutes: ['/auth/register', '/auth/verify', '/auth/resend', '/auth/login', '/auth/logout',
                 '/auth/forgot', '/auth/reset', '/about', '/contact', '/terms', '/privacy'],
  smoke: ['/me', '/me/profile', '/me/settings', '/about', '/contact', '/terms', '/privacy'],
};
```

Identity is the only module with `publicRoutes`. `/admin/users` is not in `smoke` because the contract tests open smoke pages as every persona, and it answers 403 to everyone but the admin.

Small helpers that are not SQL live in `modules/identity/secrets.js`: `newCode()` (`String(crypto.randomInt(0, 1000000)).padStart(6, '0')`), `hashCode(code)` (`crypto.createHash('sha256').update(code).digest('hex')`), `sameHash(a, b)` (`crypto.timingSafeEqual` on the two hex buffers), `newHandle()` (9 × `ALPHABET[crypto.randomInt(36)]` with `ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'`), `normaliseEmail(s)` and `safeNext(next)`.

## 3. Contracts

**You rely on** the backbone only: `q`, `q.one`, `tx`, `isDuplicate` (`core/db`); `req.me`, `requireRole`, `login(req, userId)` and `logout(req)` (`core/auth`; identity is the only caller); `res.page` and `res.done` (`core/render`); `notFound`, `forbidden`, `badRequest`, `HttpError` (`core/errors`); `text`, `oneOf`, `bool` (`core/validate`); `mailer.send` (`core/mailer`); `ref.university(id)` (`core/ref`); `req.session` (express-session) to carry the e-mail between the steps of sign-up (`req.session.pendingEmail`) and reset (`req.session.resetEmail`); the partials `field`, `toggle`, `menu`, `stat-row`, `avatar`, `confirm-dialog`; the helpers `ui.avatars`, `ui.avatarUrl`, `ui.date`, `ui.timeAgo`; and, in development only, the backbone's `/dev/login-as/:handle` and `/dev/mailbox`, which the login and verify pages link to.

`login(req, userId)` regenerates the session id before storing `userId` (no session fixation) and `logout(req)` destroys the session; both are asynchronous, so always `await` them (`ARCHITECTURE.md` §6.2). ID-T10 checks that the session cookie changes.

**Others rely on you for:**
- **`users` rows that keep their promises:** e-mails stored lower-case and unique (BR-1), handles of 9 characters from a to z and 0 to 9 that never change (BR-3; other modules link `/u/:handle`), and `status = 'banned'` (the backbone's `loadUser` logs a banned user out on their next request).
- **The settings columns** (`WORK_DIVISION.md` §4 row 12): content pre-fills the compose form from `req.me.defaultAnonymous` and `req.me.defaultVisibility`; the messages triggers read `notify_comments` and `notify_likes` when a comment or like is inserted.
- **`organizations.display_name`** (row 13): `v_post_cards` shows it on named posts by an organization, discover's user page shows it, and events show it as the organizer.
- **The pages:** `/auth/login` (the login wall sends logged-out GETs to `/auth/login?next=...`), `/me` (the Me tab), and the Me menu, which is the only way to reach several other modules' pages (row 7):

  | Menu item | Link | Owner |
  |---|---|---|
  | My posts, Watching, History, Liked | `/me/posts`, `/me/watching`, `/me/history`, `/me/likes` | discover |
  | My comments | `/me/comments` | content |
  | My tickets | `/me/tickets` | events |
  | My events, New event (organizations) | `/events?mine=1`, `/events/new` | events |
  | Reports (admins) | `/admin/reports` | messages |
  | Announcements (admins) | `/admin/announcements` | discover |

No other module writes `users`, `organizations` or `email_codes`.

**What you depend on from other modules' lists:** the four Me counts must count the same rows as discover's `myPostIds`, `myWatchingIds`, `myHistoryIds` and content's `listMyComments` (`docs/modules/discover/queries.sql`, `docs/modules/content/queries.sql`). If either owner changes what a list shows, they tell Michael and `meStats` changes in the same pull request; ID-T21 compares each count with the length of its list.

**Seed data for you** (`DATA_MODEL.md` §5): eight personas, all with the password `campus123`:

| Handle | E-mail | Useful for |
|---|---|---|
| `admin0000` | `admin@hku.hk` | admin menu group; ID-8 |
| `mandy0hku` | `mandy@connect.hku.hk` | Me counts 3 / 2 / 4 / 4; bio "Year 3, FinTech" |
| `kelvin0hk` | `kelvin@connect.hku.hk` | like notifications off; shares with all universities by default |
| `wing0cuhk` | `wing@link.cuhk.edu.hk` | a CUHK account; Me counts 2 / 1 / 3 / 3 |
| `jason0ust` | `jason@connect.ust.hk` | posts with his handle by default; the ban test; Me counts 2 / 0 / 3 / 2 (a hidden post is not counted) |
| `newbie0hk` | `newbie@connect.hku.hk` | Me counts 0 / 0 / 0 / 0; never logged in (`last_login_at` NULL) |
| `filmsoc00` | `filmsoc@hku.hk` | organization "HKU Film Society" with a description; Me counts 1 / 0 / 0 / 0 |
| `hikeclub0` | `hikeclub@cuhk.edu.hk` | organization "CUHK Hiking Club" |

`email_codes` starts empty. The `outbox` holds one old mail to Newbie with the code 000000; no `email_codes` row backs it, so it cannot be used.

## 4. Build plan

| By | Tasks |
|---|---|
| Before kickoff, by Wed 21 Oct (Must) | Together with the backbone: `index.js`, `routes.js`, `queries.js`, `secrets.js`; ID-1 sign-up (register, verify, resend), ID-2 login and logout with the development persona list, ID-4 Me hub, ID-6 settings and change password; tests ID-T01 to ID-T15, ID-T17, ID-T21 to ID-T24 and ID-T27 to ID-T29. Merged as part of the first commit on `main`. |
| Before kickoff, by Wed 21 Oct (Should) | ID-3 forgot and reset, ID-5 profile, ID-7 static pages with the text in §5; tests ID-T16, ID-T18 to ID-T20, ID-T25 and ID-T26. |
| CP1, Sun 25 Oct | Nothing new. Every Me menu link answers 200 (the empty module folders' placeholder pages count). Fix what members report. |
| CP2, Sun 1 Nov | Re-run the identity tests on the merged app: the Me counts now link to discover's and content's real lists (ID-T21 checks that each count equals its list), and ID-T28 runs against the messages triggers from `main`. |
| Fri 6 Nov | USER_GUIDE screenshots; `SQL_CARD.md` as an outline only (§9; Michael presents events). |
| Could | ID-8 admin user list, in integration week at the latest; the first thing to cut. |

## 5. Features

### Responsive page layout (every feature)

Keep authentication, profile and settings forms within `form-width`, and About/Terms/Privacy prose within `readable`. The Me hub may place its overview beside its menu on desktop; it stacks on phones. Avatar choices and actions wrap. Admin tables use `table-wrap`, never a fixed page width. Read [RESPONSIVE.md](../../architecture/RESPONSIVE.md) before adding page CSS. Do not create another sidebar/bottom bar or use a fixed 480 px page width. Keep module CSS under `modules/identity/public/` and scope selectors to this module.

### ID-1 Register with a university e-mail: `/auth/register`, `/auth/verify`, `/auth/resend` (Must)

**Step 1, the e-mail** (`GET /auth/register`): top bar "Join Campus Notes", `hideTabs: true`. One `field` named `email` (type `email`, label "University e-mail", hint "HKU, CUHK or HKUST, such as name@connect.hku.hk"), a `btn btn-cta` button "Send code", and a link "Already have an account? Log in".

`POST /auth/register`:

1. Normalise: `email = String(req.body.email ?? '').trim().toLowerCase()`.
2. Format: `/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/` and at most 254 characters, else 400 "Enter a valid e-mail address." ASCII only on purpose: `users.email` keeps the default collation, which ignores case and accents, so `mándy@connect.hku.hk` would find Mandy's account (checked in `queries.sql`).
3. The domain is everything after the last `@`. `universityForDomain(domain)` matches `university_domains.domain` exactly (BR-1): the column is `utf8mb4_bin`, so a plain `=` folds neither case nor accents (`HKU.HK` and `hkü.hk` find nothing), and there are no subdomains, so `x@cs.hku.hk` is refused. No row: 400 "Use your HKU, CUHK or HKUST e-mail address."
4. `findUserByEmail(email)` returns a row: 400 "This e-mail is already registered. Log in or reset your password." ("Log in" links to `/auth/login` and "reset your password" to `/auth/forgot`). The `field` partial escapes its error text, so this message is an `.alert` above the form (pass `taken: true`; the template writes the links), not an error under the field.
5. `codeRequestedRecently(email, 'register')` is 1: 429 "Please wait a minute before asking for another code." (BR-2), also as an `.alert` above the form.
6. `code = newCode()`; `createCode(email, 'register', hashCode(code))` (valid for 10 minutes); then `mailer.send({ to: email, subject: 'Your Campus Notes code', text: 'Your verification code is 482913. It expires in 10 minutes.' })`. The code itself is never stored or logged.
7. `req.session.pendingEmail = email`; `res.done({ to: '/auth/verify', flash: 'We sent a 6-digit code to sam@connect.hku.hk.' })`.

**Step 2, the code and a password** (`GET /auth/verify`): without `pendingEmail` in the session, redirect to `/auth/register`. Top bar "Check your e-mail", `hideTabs: true`. Text "Enter the code we sent to sam@connect.hku.hk. It is valid for 10 minutes." Fields: `code` (label "6-digit code", `inputmode="numeric"`, `autocomplete="one-time-code"`; no counter), `password` (type `password`, `autocomplete="new-password"`, label "Choose a password", hint "At least 8 characters") and `confirm` (the same, label "Type the password again"). A `btn btn-cta` button "Create account". Below it, a small form posting to `/auth/resend` ("Send a new code") and a link "Use a different e-mail" to `/auth/register`. In development, also a link to `/dev/mailbox`.

`POST /auth/verify`:

1. No `pendingEmail`: redirect to `/auth/register`.
2. Validate the form first; none of these counts as a try: the code must match `^\d{6}$` ("Enter the 6-digit code."), the password must have 8 to 72 characters ("Use at least 8 characters." / "Use at most 72 characters."; bcrypt ignores anything after 72 bytes), and `confirm` must equal it ("The passwords do not match."). Errors re-render with status 400 and the e-mail kept.
3. `latestCode(email, 'register')` returns the newest code for that e-mail and purpose, used or not. Then, in this order:

   | Case | Answer (status 400) |
   |---|---|
   | no row, or `consumed = 1` | "This code is no longer valid. Request a new one." |
   | `expired = 1` | "This code has expired. Request a new one." |
   | `attempts >= 5` | "Too many wrong tries. Request a new code." |
   | `!sameHash(hashCode(code), row.code_hash)` | `addWrongTry(code_id)`, then "Wrong code. N tries left." with N = 4 − `attempts` (singular "1 try left"); when N is 0, "Too many wrong tries. Request a new code." |
   | the hash matches | continue |

4. `passwordHash = await bcrypt.hash(password, 10)` **before** the transaction (it takes about 70 ms; never hold row locks during it). `universityId` comes from `universityForDomain` again. `avatarCode = ui.avatars[crypto.randomInt(ui.avatars.length)]`.
5. `registerUser(codeId, email, universityId, passwordHash, avatarCode)` runs one `tx()`: the conditional `UPDATE email_codes SET consumed_at = UTC_TIMESTAMP() WHERE code_id = ? AND consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP()`, then the `INSERT INTO users` with `newHandle()`. The UPDATE re-checks the rules atomically, so two tabs submitting the same code create one account.
   - 0 rows changed: the transaction returns `{ ok: false }`; answer "This code is no longer valid. Request a new one."
   - Duplicate key on `users.handle` (`isDuplicate(err)` and `err.sqlMessage` names `users.handle`): try again with a new handle, up to 5 times, inside the same transaction (a duplicate fails only its statement).
   - Duplicate key on `users.email` (someone registered this address since the code was sent): the error leaves `tx()`, which rolls back, so the code stays unused; answer "This e-mail is already registered." as an `.alert`.
   - Every other column takes the schema default: role `student`, `default_anonymous` 1, `default_visibility` `university`, both notification switches on, status `active`, empty bio.
6. `await login(req, userId)`, `touchLogin(userId)`, then `res.done({ to: '/feed', flash: 'Welcome to Campus Notes. Your handle is k3m9x2p7a.' })`.

**Resend** (`POST /auth/resend`): without `pendingEmail`, redirect to `/auth/register`. Otherwise repeat steps 4 to 6 of `POST /auth/register` for the pending e-mail: already registered, the same 429 throttle message (shown on the verify page), or a new code, a new mail and the flash "We sent a new code to sam@connect.hku.hk." The older code stops working at once, because only the newest counts.

**Rules:** BR-1 (domain, one account per e-mail, lower case), BR-2 (6 digits, 10 minutes, newest only, 5 tries, 60 seconds, hash only), BR-3 (handle, password length, bcrypt).

**SQL:** `universityForDomain`, `findUserByEmail`, `codeRequestedRecently`, `createCode`, `latestCode`, `addWrongTry`, `registerUser`, `touchLogin`.

**Edge cases:** two quick POSTs can both pass the throttle and send two codes; only the newer works, which is harmless. An attacker can make the app mail codes to someone else's university address, at most one a minute per address. Handles have 36^9 (about 10^14) values, so the retry is for correctness, not because collisions are expected.

### ID-2 Log in and log out: `/auth/login`, `/auth/logout` (Must)

**Page** (`GET /auth/login`): top bar "Log in", `hideTabs: true`. Fields `email` (label "University e-mail", `autocomplete="username"`) and `password` (label "Password", `autocomplete="current-password"`), a `btn btn-cta` button "Log in", links "Forgot password?" (`/auth/forgot`) and "New here? Join with your university e-mail" (`/auth/register`). The form's action keeps the query string: `/auth/login?next=<encodeURIComponent(next)>` when `next` is set. A logged-in visitor is redirected to `safeNext(req.query.next)`.

**Development persona list:** only when `config.isDev` (from `core/config`: `NODE_ENV` is `development` or not set, the same test that mounts `/dev/*`), a group "Developer shortcuts" lists the eight seed personas (a constant `DEV_PERSONAS` in `routes.js`: handle, role, university), each linking to `/dev/login-as/<handle>` (the backbone's route). Never rendered in test or production; ID-T17 checks this.

`POST /auth/login`:

1. `email = normaliseEmail(req.body.email)`; `password = String(req.body.password ?? '')`. An address that fails the ID-1 format check answers 400 "Wrong e-mail or password." without a lookup. Every message on this page is an `.alert` above the form, with the e-mail kept.
2. `user = findUserByEmail(email)`. No row: run `bcrypt.compare(password, DUMMY_HASH)` anyway, so both failures take the same time, then 400 "Wrong e-mail or password."
3. `bcrypt.compare(password, user.password_hash)` is false: 400 "Wrong e-mail or password." (the same words, so the page does not reveal which e-mails exist; BR-3).
4. `user.status === 'banned'`: 403 "This account is suspended." It is checked after the password, so only the owner learns it.
5. `await login(req, user.user_id)` (a new session id), `touchLogin(user.user_id)`, `res.done({ to: safeNext(req.query.next) })`.

```js
// Only internal paths: one leading slash, not followed by / or \ (both mean "another host" to browsers).
function safeNext(next) {
  return typeof next === 'string' && /^\/(?![\/\\])/.test(next) ? next : '/feed';
}
```

`safeNext('/posts/600012')` is `/posts/600012`; `//evil.example`, `/\evil.example`, `https://evil.example`, `javascript:alert(1)` and an empty value all give `/feed`.

**Log out** (`POST /auth/logout`): `await logout(req)` (destroys the session), then a 303 redirect to `/auth/login`. There is no GET logout: a link or an image could otherwise log people out. The Me page's "Log out" is a POST form with `csrfField()`.

**SQL:** `findUserByEmail`, `touchLogin`.

### ID-3 Forgot password: `/auth/forgot`, `/auth/reset` (Should)

**Step 1** (`GET /auth/forgot`): top bar "Reset password", `hideTabs: true`, `back: '/auth/login'` (without it the page is a dead end), one `email` field (label "University e-mail"), a `btn btn-cta` button "Send code".

`POST /auth/forgot`:

1. Normalise and check the format ("Enter a valid e-mail address." is fine to show: it reveals nothing). No domain check: the answer must be the same for any address.
2. `user = findUserByEmail(email)`. Only if a row exists **and** `codeRequestedRecently(email, 'reset')` is 0: `createCode(email, 'reset', hashCode(code))` and `mailer.send({ to: email, subject: 'Your Campus Notes code', text: 'Your password reset code is 739204. It expires in 10 minutes. If you did not ask for it, ignore this e-mail.' })`.
3. Always: `req.session.resetEmail = email`; `res.done({ to: '/auth/reset', flash: 'If an account exists for that e-mail, we sent a code.' })`. The throttle is silent here, so it cannot reveal an account either.

**Step 2** (`GET /auth/reset`): without `resetEmail`, redirect to `/auth/forgot`. Top bar "Reset password", `hideTabs: true`, `back: '/auth/forgot'`. The sentence "Enter the 6-digit code from the e-mail we sent to sam@connect.hku.hk and choose a new password. The code is valid for 10 minutes." Fields `code` (as in ID-1), `password` ("New password") and `confirm` ("Type the new password again"), a `btn btn-cta` button "Set new password", and "Send a new code": a small form posting the e-mail (hidden field) to `/auth/forgot`, which repeats step 1.

`POST /auth/reset`: the same form validation and the same code table as ID-1 with purpose `reset`. A register code never works for a reset, nor the reverse. Then `passwordHash = await bcrypt.hash(password, 10)` and `resetPassword(codeId, email, passwordHash)` in one `tx()`: consume the code (0 rows: "This code is no longer valid. Request a new one."), update the hash, read `user_id` and `status`. If banned: `res.done({ to: '/auth/login', flash: 'This account is suspended.' })`. Otherwise `await login(req, userId)`, `touchLogin(userId)`, and `res.done({ to: '/feed', flash: 'Password changed. You are logged in.' })`.

**Rules:** BR-2, BR-3. **SQL:** `findUserByEmail`, `codeRequestedRecently`, `createCode`, `latestCode`, `addWrongTry`, `resetPassword`, `touchLogin`.

**Edge cases:** for an unknown e-mail the reset page answers every code with "This code is no longer valid. Request a new one." Registration necessarily tells people that an e-mail already has an account (ID-1 step 4), so the forgot and login pages only make sure they add no second way to find out. Other sessions of the same user stay logged in after a reset (v1; sessions belong to the backbone).

### ID-4 Me hub: `GET /me` (Must)

Top bar "Me", `tab: 'me'`. From top to bottom, as in screenshots 06 and 07:

1. **Banner:** a decorative image `modules/identity/public/banner.svg`, served at `/m/identity/banner.svg`: our own artwork with the Campus Notes name, never the reference app's.
2. **Identity card:** `avatar` (`req.me.avatarCode`, size `lg`), the handle (`req.me.handle`) and the university code (`req.me.universityCode`) as a chip.
3. **Counts:** `stat-row` with four items from `meStats(req.me.userId, req.me.universityId)`, one query with four scalar subqueries (BR-10: computed, never stored). Each count counts exactly the rows of the list it links to, so the number on the Me page always matches the list:

   | Label | Value | Link (owner) | Counts |
   |---|---|---|---|
   | My posts | `posts` | `/me/posts` (discover) | my live posts (`v_live_posts`: not deleted, not hidden), anonymous ones included |
   | Watching | `watching` | `/me/watching` (discover) | posts I watch that are live and visible to me |
   | Comments | `comments` | `/me/comments` (content) | my comments that I have not deleted, on live posts visible to me; a comment hidden by a moderator still counts, because the list shows it as "[hidden by a moderator]" |
   | Viewed | `history` | `/me/history` (discover) | my `post_views` rows with `cleared_at IS NULL` ("Clear history" sets `cleared_at`), on live posts visible to me |

   "Visible to me" is the `VISIBLE` fragment from `core/cards` (alias `p`), as in the lists. Seed values: `mandy0hku` 3 / 2 / 4 / 4, `kelvin0hk` 3 / 2 / 3 / 3, `wing0cuhk` 2 / 1 / 3 / 3, `jason0ust` 2 / 0 / 3 / 2, `filmsoc00` 1 / 0 / 0 / 0, `newbie0hk` and `admin0000` 0 / 0 / 0 / 0. If content or discover change what their list shows, this query changes with it (§3).

4. **Menu:** the `menu` partial with these groups, in this order (`WORK_DIVISION.md` §4 row 7). Icons are the closest ones in `UI_KIT.md` §7.

   | Group | Items (label → link, icon) | Shown to |
   |---|---|---|
   | 1 | My posts → `/me/posts` (feed); Watching → `/me/watching` (star); My comments → `/me/comments` (comment); History → `/me/history` (clock); Liked → `/me/likes` (heart); My tickets → `/me/tickets` (ticket) | everyone |
   | 2 | Profile → `/me/profile` (me); Settings → `/me/settings` (gear) | everyone |
   | 3 | About → `/about` (info); Contact → `/contact` (messages) | everyone |
   | 4 | Terms → `/terms` (doc); Privacy → `/privacy` (lock) | everyone |
   | 5 | My events → `/events?mine=1` (calendar); New event → `/events/new` (plus) | `req.me.isOrg \|\| req.me.isAdmin` (EV-6 lets both create events, and this menu is the only way in) |
   | 6 | Reports → `/admin/reports` (flag); Announcements → `/admin/announcements` (bell); Users → `/admin/users` (me) | `req.me.isAdmin` |
   | 7 | Log out → POST `/auth/logout` (logout, `danger`) | everyone |

   "Log out" is an ordinary menu row given `form` instead of `href`: `{ form: '/auth/logout', icon: 'logout', label: 'Log out', danger: true }`, which the `menu` partial renders as a POST form with `csrfField()` (`UI_KIT.md` §3).

**SQL:** `meStats`. **Edge cases:** Newbie sees four zeros; the links still work and lead to each list's empty state. An admin sees both group 5 and group 6.

### ID-5 Profile: `/me/profile` (Should)

Top bar "Profile", `tab: null`, `back: '/me'`. From `getProfile(req.me.userId)`:

- Read-only: handle ("Your public id. It never changes."), e-mail (shown only here, to its owner; other people's pages are discover's `/u/:handle`, which never show an e-mail), university name, and "Member since 16 Oct 2026" (`ui.date(created_at)`).
- Organizations also see their display name and description, read-only in v1, with the hint "Ask an admin to change these."
- A form: the avatar as a radio list of every code in `ui.avatars` (each shown with the `avatar` partial, the current one checked), and the bio (`field`, `rows: 3`, `max: 160`, hint "Shown on your public page"). A `btn btn-cta` button "Save".

`POST /me/profile`: `avatar = oneOf(req.body.avatar, ui.avatars, errors, 'avatar', 'Pick an avatar.')`; the bio is trimmed and may be empty (store `''`); when not empty, `text(req.body.bio, { max: 160, label: 'Bio' }, errors, 'bio')`, because `text()` refuses blank input (BR-18). Errors re-render with status 400. Then `updateProfile(userId, avatar, bio)` and `res.done({ to: '/me/profile', flash: 'Profile saved' })`.

The avatar here is the account's own (Me hub, profile, user page). Each post draws its own random avatar when it is published, so changing it does not change old posts.

**SQL:** `getProfile`, `updateProfile`.

### ID-6 Settings and password: `/me/settings`, `/me/password` (Must)

Top bar "Settings", `tab: null`, `back: '/me'`. Two forms on one page. Pass the four switch states under a name such as `prefs`, never `settings`: Express keeps its own options in the `settings` local, and the backbone's `res.page` refuses that name (`ARCHITECTURE.md` §6.3).

**Defaults and notifications** (four `toggle`s, then a `btn btn-cta` button "Save"):

| Toggle (`name`) | Column | On means | Read by |
|---|---|---|---|
| Post anonymously by default (`default_anonymous`) | `default_anonymous` | 1 | content: pre-fills "Show my handle" off on compose (CT-1) |
| Share new posts with all universities by default (`share_all`) | `default_visibility` | `'all'` (off: `'university'`) | content: pre-fills "Visible to all universities" (CT-1) |
| Notify me about comments (`notify_comments`) | `notify_comments` | 1 | messages: `trg_comment_notify` (BR-13) |
| Notify me about likes (`notify_likes`) | `notify_likes` | 1 | messages: `trg_like_notify` (BR-13) |

`POST /me/settings`: `bool()` on each toggle (the partial submits 1 or 0), `updateSettings(...)`, `res.done({ to: '/me/settings', flash: 'Settings saved' })`. The backbone reloads `req.me` on every request, so compose sees the new defaults on the next page. The triggers read the switches when a comment or like is inserted, so switching off stops new notifications only; existing ones stay (`WORK_DIVISION.md` §4 row 12).

**Change password** (fields `current` "Current password", `password` "New password" with the hint "At least 8 characters", `confirm` "Type the new password again"; a plain `btn btn-block` button "Change password", since the page's one main action is Save; posts to `/me/password`): validate all fields, then `bcrypt.compare(current, passwordHash(userId))`. Errors re-render the settings page with status 400: "Your current password is wrong." under `current`; "Use at least 8 characters." or "Use at most 72 characters."; "The passwords do not match." On success `setPassword(userId, await bcrypt.hash(password, 10))` and `res.done({ to: '/me/settings', flash: 'Password changed' })`. The current session stays logged in.

**Rules:** BR-3, BR-13. **SQL:** `updateSettings`, `passwordHash`, `setPassword`.

### ID-7 Static pages: `/about`, `/contact`, `/terms`, `/privacy` (Should)

Public (in `publicRoutes`), one template each (`identity/about`, ...). Logged in: `tab: 'me'`, `back: '/me'`. Logged out: `tab: null`, `back: '/auth/login'`, `hideTabs: true` (the tab bar would only lead to the login wall). Short headings and paragraphs; no SQL. The draft text, to be used as written:

**About**

> Campus Notes is an anonymous notice board for students of HKU, CUHK and HKUST. Only people with a university e-mail address can join, so everyone here is a student or a campus organization. Post a note under a topic, anonymously or with your handle; comment under a per-post alias; like and watch posts; message people privately; and book tickets for campus events.
>
> Campus Notes is a student project for the course COMP3278 (Introduction to Database Management Systems) at the University of Hong Kong, built by a team of four students in autumn 2026. It is inspired by the Triple Uni mini-program but is not affiliated with, endorsed by or connected to Triple Uni, and it is not an official service of any university.

**Contact**

> Found a bug, have an idea or a question about Campus Notes? Contact the project team on GitHub.
>
> To report a post or a comment, use **Report** on it instead so the moderators can review it.

The contact link points to `https://github.com/Michael-wzl/CampusNote/issues`. This replaces the old email placeholder following the public-repository decision D19 (21 Oct); no personal email is published.

**Terms**

> By using Campus Notes you agree to these rules.
>
> 1. **Be kind.** Disagree with ideas, not people.
> 2. **No harassment.** No insults, threats, hate speech or pile-ons.
> 3. **No doxxing.** Never post another person's name, photo, contact details or other personal information without their consent, not even anonymously.
> 4. **No spam.** No advertising, link farming or selling followers or accounts. Selling your own used things under Trade is fine.
> 5. **Nothing illegal,** and nothing you do not have the right to share.
>
> Moderators may hide any post or comment that breaks these rules and may suspend accounts that keep breaking them. Anonymous does not mean unaccountable: moderators can see who wrote a post when they review a report.
>
> Campus Notes is a course project provided as is, without any guarantee.

**Privacy**

> **What we store:** your university e-mail address; your password as a bcrypt hash (nobody can read it); your handle, avatar, bio and settings; the posts, comments and private messages you write and the images you upload; the posts you like and watch; the posts you open, and when (your history, which you can clear); and the reports you file.
>
> **Who sees what:** on an anonymous post, other users see no handle, and on every post commenters appear under an alias such as Host or Alice. Your handle is shown only on posts where you turn on "Show my handle", on your public page, and in private conversations started from your page. Your e-mail address is shown only to you (on your Profile) and to the admins. Admins can see who wrote a post or comment when they deal with a report, so that they can act on abuse.
>
> **E-mail:** we only send you sign-up and password-reset codes.
>
> **Where it runs:** Campus Notes is a course demo that runs locally on the team's own computers. The data is not sold or shared with anyone, the demo database is reset often, and it is deleted after the course.

### ID-8 Admin user list: `GET /admin/users`, `POST /admin/users/:id` (Could)

Both routes use `requireRole('admin')` (403 for everyone else). There is no page per user: the list carries the actions.

- **List** (`GET /admin/users?q=`): top bar "Users", `back: '/me'`. A search box (GET form, label "Handle or e-mail") and up to 50 rows from `searchUsers(term)`. The term matches a handle prefix or any part of the e-mail; escape `\`, `%` and `_` first (`term.replace(/[\\%_]/g, '\\$&')`), or `_` would match everyone. An empty term lists the first 50 accounts.
- **Each row** shows the handle, e-mail, university code, role, a "Banned" chip when banned, member since (`ui.date`) and last login (`ui.timeAgo`, or "never"), then its actions, each a small POST form to `/admin/users/<user_id>` with `csrfField()` and a hidden `q` (the current search, so the redirect returns to the same list):
  - "Ban" (with `data-confirm="Ban wing0cuhk? They are logged out and cannot log in."`) for an active account other than your own, or "Unban" for a banned one. Another admin's account can be banned like any other: admins are trusted equally, and only your own row has no Ban;
  - for a student only, "Make organization" with a `display_name` field (1 to 60 characters, required).
- **Actions** (`POST /admin/users/:id`, body `action`): first `getProfile(id)`; no row: 404.

  | `action` | Does | Answers |
  |---|---|---|
  | `ban` | `id === req.me.userId`: refuse; else `banUser(id, req.me.userId)` | 400 "You cannot ban yourself."; flash "Banned wing0cuhk" (0 rows: "Already banned") |
  | `unban` | `unbanUser(id)` | flash "Unbanned wing0cuhk" |
  | `make_org` | `text(display_name, { max: 60, label: 'Display name' })`, then `makeOrganization(id, name)` in one `tx()` | 400 "Only a student account can become an organization." when it returns false; flash "wing0cuhk is now an organization: HKU Chess Club" |
  | anything else | | 400 |

  Errors re-render the list (same `q`) with status 400 and the message at the top. Each success ends with `res.done({ to: '/admin/users?q=' + encodeURIComponent(q), flash })`.

A banned user is logged out on their next request (the backbone's `loadUser`) and the login page answers "This account is suspended."; their posts and comments stay (moderation works per post, through reports). A new organization gets the events group in its Me menu, and its named posts show the display name. The description stays empty in v1.

**SQL:** `searchUsers`, `getProfile`, `banUser`, `unbanUser`, `makeOrganization`.

## 6. `queries.js`

Each function corresponds to a block in `queries.sql`; `@variables` become `?` in the same order.

| Function | Returns | Used by |
|---|---|---|
| `universityForDomain(domain)` | `{ university_id, university_code }` or null | ID-1 |
| `findUserByEmail(email)` | `{ user_id, password_hash, status }` or null | ID-1, ID-2, ID-3 |
| `codeRequestedRecently(email, purpose)` | `true` if a code was made in the last 60 seconds | ID-1, ID-3 |
| `createCode(email, purpose, codeHash)` | new `code_id` | ID-1, ID-3 |
| `latestCode(email, purpose)` | `{ code_id, code_hash, attempts, consumed, expired }` or null | ID-1, ID-3 |
| `addWrongTry(codeId)` | nothing | ID-1, ID-3 |
| `registerUser(codeId, email, universityId, passwordHash, avatarCode)` | `{ ok, userId, handle }`; throws on a duplicate e-mail | ID-1 |
| `touchLogin(userId)` | nothing | ID-1, ID-2, ID-3 |
| `resetPassword(codeId, email, passwordHash)` | `{ ok, userId, status }` | ID-3 |
| `meStats(userId, universityId)` | `{ posts, watching, comments, history }` | ID-4 |
| `getProfile(userId)` | one row with university and organization fields, or null | ID-5, ID-8 |
| `updateProfile(userId, avatarCode, bio)` | nothing | ID-5 |
| `updateSettings(userId, defaultAnonymous, defaultVisibility, notifyComments, notifyLikes)` | nothing | ID-6 |
| `passwordHash(userId)` | the bcrypt hash | ID-6 |
| `setPassword(userId, passwordHash)` | nothing | ID-6 |
| `searchUsers(term)` | up to 50 rows | ID-8 |
| `banUser(userId, adminId)` | `affectedRows` | ID-8 |
| `unbanUser(userId)` | `affectedRows` | ID-8 |
| `makeOrganization(userId, displayName)` | `true`, or `false` if the user is not a student | ID-8 |

Note on counts (`ARCHITECTURE.md` §6.1): `affectedRows` counts matched rows; every UPDATE whose 0-row result matters here only matches rows it will change, so `affectedRows === 0` means "nothing happened".

## 7. Tests (`modules/identity/tests/`)

Call `before(resetDb)` in each file. Personas are in `DATA_MODEL.md` §5. Use a new address per test (`t01@connect.hku.hk`, ...) so tests never share codes or throttles. Read a code the way a user would, from the mail: `const m = await q.one('SELECT body_text FROM outbox WHERE to_email = ? ORDER BY mail_id DESC LIMIT 1', [email]); const code = m.body_text.match(/\b(\d{6})\b/)[1];` (tests may read and write any table). "Let a minute pass" means `UPDATE email_codes SET created_at = created_at - INTERVAL 61 SECOND WHERE email = ?`.

| ID | Feature | Test |
|---|---|---|
| ID-T01 | ID-1 | `anon()` registers `t01@connect.hku.hk`: 303 to `/auth/verify`; the outbox has one mail to it with subject "Your Campus Notes code"; its `email_codes` row holds the SHA-256 of the mailed code, not the code. Verifying with the code and `secret123` twice: 303 to `/feed`, flash "Welcome to Campus Notes. Your handle is ..."; the new row has `university_id` 1, role `student`, a handle matching `^[a-z0-9]{9}$`, a hash starting `$2`, `default_anonymous` 1 and `default_visibility` `university`; `/me` shows the handle and "HKU". |
| ID-T02 | ID-1 | `x@gmail.com`, `x@cs.hku.hk` and `x@hku.hk.evil.com` get 400 "Use your HKU, CUHK or HKUST e-mail address."; `not-an-email` gets "Enter a valid e-mail address."; no `email_codes` or `outbox` row is created. |
| ID-T03 | ID-1 | `  T03@Link.CUHK.edu.hk ` is accepted: the code row and the mail use `t03@link.cuhk.edu.hk`; after verifying, the account's university is CUHK (2). |
| ID-T04 | ID-1 | A wrong code: 400 "Wrong code. 4 tries left.", `attempts` 1, no account. Then the right code: 303 to `/feed`. |
| ID-T05 | ID-1 | Code `abc`: "Enter the 6-digit code."; password `short`: "Use at least 8 characters."; different confirmation: "The passwords do not match."; each 400, and `attempts` stays 0. |
| ID-T06 | ID-1 | Five wrong codes answer "4 tries left", "3 tries left", "2 tries left", "1 try left", then "Too many wrong tries. Request a new code."; the right code now gets the same message and no account exists. |
| ID-T07 | ID-1 | With `expires_at` moved into the past, the right code answers "This code has expired. Request a new one."; no account. |
| ID-T08 | ID-1 | `POST /auth/resend` right after registering: 429 "Please wait a minute before asking for another code."; still one code and one mail. After a minute: a second code and mail; the first code now answers "Wrong code. 4 tries left." and the second one creates the account. |
| ID-T09 | ID-1 | Registering `mandy@connect.hku.hk` or `MANDY@Connect.hku.hk`: 400 "This e-mail is already registered. Log in or reset your password." Race: request a code for `t09@connect.hku.hk`, then `make.user({ email: 't09@connect.hku.hk' })`, then verify with the right code: 400 "This e-mail is already registered."; the code's `consumed_at` is still NULL. |
| ID-T10 | ID-2 | `anon()` logs in as `mandy@connect.hku.hk` / `campus123`: 303 to `/feed`; the session cookie differs from the one before login; `last_login_at` is within 5 seconds of now; `/me` shows `mandy0hku`. |
| ID-T11 | ID-2 | A wrong password for Mandy and an unknown `nobody@connect.hku.hk` both answer 400 with exactly "Wrong e-mail or password."; `/me` still redirects to the login page. |
| ID-T12 | ID-2 | With Jason's `status` set to `banned` (SQL), the right password answers 403 "This account is suspended." and he is not logged in. |
| ID-T13 | ID-2 | `POST /auth/login?next=%2Fposts%2F600012` redirects to `/posts/600012`; `next` = `//evil.example`, `https://evil.example` and `/\evil.example` each redirect to `/feed`. |
| ID-T14 | ID-2 | `mandy0hku` posts `/auth/logout`: 303 to `/auth/login`; her next `GET /me` redirects to `/auth/login?next=%2Fme`. |
| ID-T15 | BR-4 | Logged out, `GET /feed`, `/me`, `/me/settings`, `/posts/600012` and `/events` each redirect to `/auth/login?next=` followed by the encoded path. A logged-out `POST /me/settings` with a valid CSRF token answers 401. |
| ID-T16 | ID-7 | Logged out, `/about`, `/contact`, `/terms`, `/privacy`, `/auth/login`, `/auth/register` and `/auth/forgot` answer 200 without a tab bar; `/about` contains "COMP3278" and "not affiliated". Logged in as `mandy0hku`, `/about` has a back link to `/me`. |
| ID-T17 | security | `mandy0hku` posting `/me/settings` without a CSRF token gets 403 and her settings are unchanged; a logged-out `POST /auth/login` without a token gets 403. The login page (tests run with `NODE_ENV=test`) contains no `/dev/login-as/` link. |
| ID-T18 | ID-3 | `POST /auth/forgot` with `nobody@connect.hku.hk`, and with `x@gmail.com`: 303 to `/auth/reset`, flash "If an account exists for that e-mail, we sent a code."; no `outbox` and no `email_codes` row. |
| ID-T19 | ID-3 | Forgot for Mandy: one mail; a second request at once gives the same flash and no second mail. Reset with the code and `newpass123` twice: 303 to `/feed`, logged in, flash "Password changed. You are logged in." After logging out, `campus123` fails and `newpass123` works. |
| ID-T20 | ID-3 | On `/auth/reset`, a wrong code answers "Wrong code. 4 tries left."; without a pending reset, `GET /auth/reset` redirects to `/auth/forgot`. |
| ID-T21 | ID-4 | `mandy0hku`'s `/me`: the four counts read 3, 2, 4, 4 and link to `/me/posts`, `/me/watching`, `/me/comments`, `/me/history`, and each equals the number of items on the page it links to (from CP2, when those lists exist); the page shows `mandy0hku` and "HKU"; the menu labels are, in order, My posts, Watching, My comments, History, Liked, My tickets, Profile, Settings, About, Contact, Terms, Privacy; there is no My events, New event, Reports, Announcements or Users; the last row, "Log out", is a POST form to `/auth/logout` carrying a CSRF token. |
| ID-T22 | ID-4 | `filmsoc00`'s `/me`: counts 1, 0, 0, 0; the menu has My events (`/events?mine=1`) and New event (`/events/new`), and no Reports or Users. |
| ID-T23 | ID-4 | `admin0000`'s `/me`: counts 0, 0, 0, 0; the menu has My events (`/events?mine=1`), New event (`/events/new`), Reports (`/admin/reports`), Announcements (`/admin/announcements`) and Users (`/admin/users`). |
| ID-T24 | ID-4 | `newbie0hk`'s `/me`: counts 0, 0, 0, 0 and only the four common groups. After `make.post({ author: 'newbie0hk' })`, the first count is 1. After `mandy0hku` posts "Clear history" (`/me/history/clear`, content's route), her Viewed count is 0. |
| ID-T25 | ID-5 | `mandy0hku`'s `/me/profile` shows `mandy0hku`, `mandy@connect.hku.hk`, "The University of Hong Kong" and "Member since", and no organization section; `filmsoc00`'s shows "HKU Film Society" and "Weekly screenings and director talks." |
| ID-T26 | ID-5 | Mandy saves avatar `fox` and bio "Film lover": flash "Profile saved", the row is updated, and `/me` shows `/static/img/avatars/fox.svg`. A 161-character bio and the avatar `../x` each give 400 with the error under the field, and nothing changes. An empty bio is saved as `''`. |
| ID-T27 | ID-6 | `kelvin0hk`'s settings show "Notify me about likes" off and "Share new posts with all universities by default" on. Mandy saves anonymous off, share on, comments off, likes on: the row reads 0 / `all` / 0 / 1 and the page shows the same states. |
| ID-T28 | ID-6 | Contract with messages: while Mandy's comment notifications are off, `make.comment({ post: 600001, author: 'kelvin0hk' })` creates no notification for her; after she switches them on, the next comment creates one `comment_on_post`. |
| ID-T29 | ID-6 | A wrong current password: 400 "Your current password is wrong." and the hash is unchanged. The right one with `newpass123` twice: flash "Password changed"; a fresh login with `newpass123` works and `campus123` fails. |
| ID-T30 | ID-8 | `admin0000`'s `/admin/users?q=cuhk` lists exactly `wing0cuhk` and `hikeclub0`, each with a Ban form; only `wing0cuhk`'s row (a student) has "Make organization". `mandy0hku` gets 403 on `/admin/users` and on `POST /admin/users/5`; the admin's `POST /admin/users/999` answers 404. |
| ID-T31 | ID-8 | Jason logs in (agent A), then the admin posts `action=ban, q=jason` to `/admin/users/5`: 303 to `/admin/users?q=jason`, `status` is `banned`; agent A's next `GET /me` redirects to the login page; logging in answers "This account is suspended."; after "Unban", he can log in again. |
| ID-T32 | ID-8 | The admin's `POST /admin/users/1` with `action=ban`: 400 "You cannot ban yourself."; status stays `active`. |
| ID-T33 | ID-8 | The admin makes `newbie0hk` an organization named "HKU Chess Club": role `organization` and an `organizations` row; Newbie's `/me` now shows My events. Doing it again: 400 "Only a student account can become an organization."; an empty display name: 400; nothing changes. |

Run them with `npm test -- modules/identity`. The SQL itself is checked by `npm run check:sql` (`queries.sql`, 74 checks).

## 8. Definition of done

- The [responsive acceptance checklist](../../architecture/RESPONSIVE.md#acceptance-checks-for-every-page) passes: no horizontal document overflow, appropriate navigation, readable forms, wrapping long text, visible focus and touch targets at least 44 px high. Add phone and desktop screenshots to the PR.

- ID-T01 to ID-T29 pass (ID-T30 to ID-T33 too if ID-8 is built), and `npm test`, `npm run lint` and `npm run check:sql` are green in CI.
- The full sign-up has been done by hand in a browser with the dev mailbox, with JavaScript on and off.
- Every page checked as `mandy0hku`, `newbie0hk`, `filmsoc00` and `admin0000`, and logged out, at 390, 768 and 1440 CSS pixels, with JavaScript on and off.
- Nothing in the logs contains a code or a password in clear (`grep` the server log after ID-T01), and your tables hold them only as hashes (`email_codes.code_hash`, `users.password_hash`). The one copy of a code is the mail itself: the backbone's `outbox` keeps each mail's text so that `/dev/mailbox` works without a mail server, and keeps only the recipient and subject once `SMTP_URL` is set.
- `USER_GUIDE.md` has screenshots; `SQL_CARD.md` has the outline in §9.

## 9. Presentation (SQL card)

Identity has the least presentable SQL, so in the presentation Michael presents events (`docs/modules/events/DEV_GUIDE.md` §9). `docs/modules/identity/SQL_CARD.md` is still written, as a short outline for the report and for questions:

1. **The multivalued attribute.** `university_domains` is the table for the multivalued attribute {domain} of university (`DATA_MODEL.md` §1). Sign-up is one exact lookup on its primary key, `WHERE d.domain = ?`; talking points: no subdomain matching (`cs.hku.hk` is refused), and why the column is declared `utf8mb4_bin` (MySQL's default collation ignores case and accents and would accept `hkü.hk` as `hku.hk`; `users.email` keeps the default, which is why the forms accept ASCII-only, lower-cased addresses).
2. **The code checks.** Only the newest code counts (`ORDER BY code_id DESC LIMIT 1`), and it is used with a conditional `UPDATE ... WHERE consumed_at IS NULL AND attempts < 5 AND expires_at > UTC_TIMESTAMP()` whose affected-row count decides: the same "check and change in one statement" pattern as the ticket booking, and the same answer to two tabs submitting at once. Only a SHA-256 hash is stored.
3. **The Me hub's four counts** in one query of four scalar subqueries over `v_live_posts`, `post_watches`, `comments` and `post_views`: derived attributes (/post_count, /comment_count) computed on demand, never stored (BR-10); each subquery applies the same view and visibility predicate as the list it links to, so deleted or hidden posts disappear from the counts without any code in identity.

## 10. Prompt for a coding agent

> You are working in the Campus Notes repository on the **identity** module only. Read `AGENTS.md`, `docs/architecture/RESPONSIVE.md`, `docs/architecture/ARCHITECTURE.md` (§1, §4, §5, §6, §9) and `docs/modules/identity/DEV_GUIDE.md`. Implement feature **ID-1** (replace with the feature you want) exactly as specified in §5 of the guide, using the SQL in `docs/modules/identity/queries.sql` (turn `@variables` into `?` placeholders in `modules/identity/queries.js`). Store only SHA-256 hashes of codes and bcrypt hashes of passwords, never log either in clear, and use the exact user-facing messages from the guide. Write the tests listed for that feature in §7 in `modules/identity/tests/`. Change no file outside `modules/identity/` and `docs/modules/identity/`; if the backbone (`core/`) does not behave as §3 says, stop and report it instead of changing it. When done, run `npm test -- modules/identity` and `npm run lint`, check the changed pages at 390, 768 and 1440 px with JavaScript on and off, and summarise what you changed and anything in the guide you could not follow.
