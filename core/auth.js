// Who is asking (ARCHITECTURE.md §6.2): loadUser sets req.me, the login wall keeps visitors out,
// requireRole guards admin and organizer pages. login() and logout() are for the identity module.
const { q } = require('./db');
const { forbidden, unauthorized } = require('./errors');

async function loadUser(req, res, next) {
  req.me = null;
  const userId = req.session && req.session.userId;
  if (userId) {
    const u = await q.one(
      `SELECT u.user_id, u.handle, u.email, u.university_id, un.code AS university_code, u.role,
              u.avatar_code, u.default_anonymous, u.default_visibility, u.notify_comments,
              u.notify_likes, u.status
       FROM users u JOIN universities un ON un.university_id = u.university_id
       WHERE u.user_id = ?`,
      [userId],
    );
    if (!u || u.status === 'banned') {
      // BR-3: a banned user is logged out on their next request (a fresh, empty session)
      await new Promise((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve())),
      );
    } else {
      req.me = {
        userId: u.user_id,
        handle: u.handle,
        email: u.email,
        universityId: u.university_id,
        universityCode: u.university_code,
        role: u.role,
        isAdmin: u.role === 'admin',
        isOrg: u.role === 'organization',
        avatarCode: u.avatar_code,
        defaultAnonymous: Boolean(u.default_anonymous),
        defaultVisibility: u.default_visibility,
        notifyComments: Boolean(u.notify_comments),
        notifyLikes: Boolean(u.notify_likes),
      };
    }
  }
  res.locals.me = req.me;
  next();
}

// BR-4: everything except the public paths needs a logged-in user.
function loginWall(isPublic) {
  return (req, res, next) => {
    if (req.me || isPublic(req.path)) return next();
    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.redirect(303, '/auth/login?next=' + encodeURIComponent(req.originalUrl));
    }
    next(unauthorized());
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.me) return next(unauthorized());
    if (!roles.includes(req.me.role)) return next(forbidden());
    next();
  };
}

// A new session id first (no session fixation), then the user id.
function login(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

function logout(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  }).then(() => {
    req.me = null;
  });
}

module.exports = { loadUser, loginWall, requireRole, login, logout };
