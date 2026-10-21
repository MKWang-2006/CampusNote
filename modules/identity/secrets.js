// Small helpers of the identity module that are not SQL (DEV_GUIDE §2): one-time codes, handles,
// e-mail normalisation and the login redirect. Codes and passwords never leave this module in clear.
const crypto = require('crypto');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// BR-2: a 6-digit code, 000000 to 999999, from a cryptographic random source.
function newCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// BR-2: only this SHA-256 hex digest is stored (email_codes.code_hash), never the code.
function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// Compares two hex digests in constant time.
function sameHash(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// BR-3: 9 random characters from a to z and 0 to 9 (36^9, about 10^14 handles).
function newHandle() {
  let handle = '';
  for (let i = 0; i < 9; i++) handle += ALPHABET[crypto.randomInt(36)];
  return handle;
}

// BR-1: e-mails are compared and stored trimmed and lower-cased.
function normaliseEmail(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

// Only internal paths: one leading slash, not followed by / or \ (both mean "another host" to browsers).
function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : '/feed';
}

module.exports = { newCode, hashCode, sameHash, newHandle, normaliseEmail, safeNext };
