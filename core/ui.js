// Template helpers (UI_KIT.md §4). Available in every template as `ui`, and in route code with
// require('../../core/ui'). Times are stored in UTC and shown in Hong Kong time (UTC+8, no DST).
const fs = require('fs');
const path = require('path');

const ALIASES = [
  'Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Kevin',
  'Lily', 'Mallory', 'Nina', 'Oscar', 'Peggy', 'Quinn', 'Rupert', 'Sybil', 'Trent', 'Ursula',
  'Victor', 'Walter', 'Xavier', 'Yvonne', 'Zoe',
]; // prettier-ignore
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HKT_OFFSET_MS = 8 * 3600 * 1000;

// Avatar codes are the file names in public/img/avatars/.
const avatars = fs
  .readdirSync(path.join(__dirname, '..', 'public', 'img', 'avatars'))
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.slice(0, -4))
  .sort();

// Icon names are the <symbol> ids in public/img/icons.svg, one cached file for every page.
const icons = [
  ...fs
    .readFileSync(path.join(__dirname, '..', 'public', 'img', 'icons.svg'), 'utf8')
    .matchAll(/<symbol id="([a-z-]+)"/g),
].map((m) => m[1]);

// <%- ui.icon('star') %>: a 22 px line icon in the current text colour. CSS may resize it and
// change its stroke-width, which the symbol inherits from this outer <svg>.
function icon(name) {
  if (!icons.includes(name)) throw new Error(`ui.icon: no icon named "${name}"`);
  return (
    `<svg class="icon icon-${name}" width="22" height="22" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ` +
    `focusable="false"><use href="/static/img/icons.svg#${name}"></use></svg>`
  );
}

// BR-7: 0 is Host, 1 Alice ... 26 Zoe, 27 "Alice 2", and so on.
function alias(n) {
  if (n === null || n === undefined) return 'Visitor';
  if (Number(n) === 0) return 'Host';
  const i = Number(n) - 1;
  const round = Math.floor(i / ALIASES.length) + 1;
  return round > 1 ? `${ALIASES[i % ALIASES.length]} ${round}` : ALIASES[i % ALIASES.length];
}

const pad = (n) => String(n).padStart(2, '0');

function toDate(d) {
  return d instanceof Date ? d : new Date(d);
}

// '16 Oct 22:19', or '16 Oct 2026 22:19' with withYear
function hkt(date, withYear = false) {
  if (!date) return '';
  const d = new Date(toDate(date).getTime() + HKT_OFFSET_MS);
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const year = withYear ? ` ${d.getUTCFullYear()}` : '';
  return `${day}${year} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// '16 Oct 2026': the day only, in HKT ("Member since", event dates)
function date(value) {
  return value ? hkt(value, true).replace(/ \d{2}:\d{2}$/, '') : '';
}

// BR-17: 'just now', '5 min ago', '3 h ago' within a day; then the date ('16 Oct 22:19'),
// with the year when it is not this year.
function timeAgo(date, now = new Date()) {
  if (!date) return '';
  const d = toDate(date);
  const s = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const sameYear =
    new Date(d.getTime() + HKT_OFFSET_MS).getUTCFullYear() ===
    new Date(now.getTime() + HKT_OFFSET_MS).getUTCFullYear();
  return hkt(d, !sameYear);
}

const avatarUrl = (code) => `/static/img/avatars/${avatars.includes(code) ? code : 'cat'}.svg`;

const postNo = (id) => `#${id}`;

function excerpt(text, n = 80) {
  const s = String(text ?? '');
  return [...s].length > n ? [...s].slice(0, n).join('').trimEnd() + '…' : s;
}

const plural = (n, word, many = `${word}s`) => `${n} ${Number(n) === 1 ? word : many}`;

// For kit.js countdowns: data-countdown="2026-10-17T10:00:00.000Z" (print with <%- %>)
const countdownAttr = (date) => `data-countdown="${toDate(date).toISOString()}"`;

module.exports = {
  ALIASES,
  avatars,
  icons,
  icon,
  alias,
  hkt,
  date,
  timeAgo,
  avatarUrl,
  postNo,
  excerpt,
  plural,
  countdownAttr,
};
