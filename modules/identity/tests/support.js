// Small helpers shared by the identity tests (not a test file itself: it does not end in .test.js).
const crypto = require('crypto');
const { q } = require('../../../test/helpers');

// The code in the newest mail to an address, read the way a user would (DEV_GUIDE §7).
async function lastCode(email) {
  const m = await q.one(
    'SELECT body_text FROM outbox WHERE to_email = ? ORDER BY mail_id DESC LIMIT 1',
    [email],
  );
  return m ? m.body_text.match(/\b(\d{6})\b/)[1] : null;
}

// Any 6-digit code other than the given one.
const otherCode = (code) => String((Number(code) + 1) % 1000000).padStart(6, '0');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// "Let a minute pass" (DEV_GUIDE §7).
const letAMinutePass = (email) =>
  q('UPDATE email_codes SET created_at = created_at - INTERVAL 61 SECOND WHERE email = ?', [email]);

// The texts of the field errors and alerts on a page.
const problems = (page) =>
  page
    .$('.error, .alert')
    .map((i, el) => page.$(el).text().replace(/\s+/g, ' ').trim())
    .get();

// The one-time flash on the page a 303 leads to.
async function flashAfter(agent, res) {
  const page = await agent.page(res.headers.location);
  return page.$('.flash').text().trim();
}

// The session cookie a response sets, or null.
function sidOf(res) {
  const cookie = [].concat(res.headers['set-cookie'] || []).find((c) => c.startsWith('cn.sid='));
  return cookie ? cookie.split(';')[0] : null;
}

const count = async (sql, params = []) => Number((await q.one(sql, params)).n);

// Reads a user's password hash, so a test that changes it can put it back.
const hashOf = async (handle) =>
  (await q.one('SELECT password_hash FROM users WHERE handle = ?', [handle])).password_hash;
const restoreHash = (handle, hash) =>
  q('UPDATE users SET password_hash = ? WHERE handle = ?', [hash, handle]);

// The Me page's four counts and links.
function meStats(page) {
  return page
    .$('.stat-row a')
    .map((i, a) => ({
      label: page.$(a).find('.stat-label').text().trim(),
      value: Number(page.$(a).find('.stat-value').text().trim()),
      href: page.$(a).attr('href'),
    }))
    .get();
}

// The Me menu's labels, top to bottom, and the link of each label.
const menuLabels = (page) =>
  page
    .$('.menu-row .menu-label')
    .map((i, el) => page.$(el).text().trim())
    .get();
function menuLinks(page) {
  const links = {};
  page.$('.menu-row a').each((i, a) => {
    links[page.$(a).find('.menu-label').text().trim()] = page.$(a).attr('href');
  });
  return links;
}

module.exports = {
  lastCode,
  otherCode,
  sha256,
  letAMinutePass,
  problems,
  flashAfter,
  sidOf,
  count,
  hashOf,
  restoreHash,
  meStats,
  menuLabels,
  menuLinks,
};
