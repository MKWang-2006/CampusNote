// CSRF protection (BB-2). One random token per session. Every POST, PUT, PATCH and DELETE must
// send it back: as the hidden field `_csrf` (csrfField() in a form), as the X-CSRF-Token header
// (kit.js fetch calls), or, for multipart forms whose body is parsed later by multer, in the
// form's action URL (csrfUrl('/compose') -> '/compose?_csrf=...').
const crypto = require('crypto');
const { forbidden } = require('./errors');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameToken(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  const token = req.session.csrf;
  res.locals.csrfToken = token;
  res.locals.csrfField = () => `<input type="hidden" name="_csrf" value="${token}">`;
  res.locals.csrfUrl = (path) => `${path}${path.includes('?') ? '&' : '?'}_csrf=${token}`;
  if (SAFE.has(req.method)) return next();
  const sent = req.get('x-csrf-token') || (req.body && req.body._csrf) || req.query._csrf;
  if (!sent || !sameToken(sent, token)) {
    return next(
      forbidden('Your session expired or the form is out of date. Go back and try again.'),
    );
  }
  next();
}

module.exports = { csrf };
