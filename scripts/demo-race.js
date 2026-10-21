// EV-7: destructive development fixture. Resets ONLY the chosen event's tickets/capacity.
// Run against the same development database/server: npm run demo:race -- --event 1 --buyers 200 --tickets 50 --delay 5
const { setTimeout: pause } = require('node:timers/promises');
const config = require('../core/config');
const { q, tx, close } = require('../core/db');
const { int } = require('../core/validate');

function options(args) {
  const out = {
    event: 1,
    buyers: 200,
    tickets: 50,
    delay: 5,
    url: `http://127.0.0.1:${config.port}`,
  };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !(key in out) || args[i + 1] === undefined)
      throw new Error(
        'Options: --event ID --buyers N --tickets N --delay SECONDS --url http://127.0.0.1:3000',
      );
    out[key] =
      key === 'url'
        ? args[i + 1]
        : int(args[i + 1], {
            min: key === 'delay' ? 0 : 1,
            max: key === 'event' ? 4294967295 : key === 'tickets' ? 5000 : 9999,
          });
    if (out[key] === null) throw new Error(`Invalid --${key}`);
  }
  const url = new URL(out.url);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.protocol !== 'http:' ||
    url.username ||
    url.password
  )
    throw new Error('The race requires a local HTTP development server');
  out.url = url.origin;
  return out;
}

async function login(base, handle, eventId) {
  const response = await fetch(`${base}/dev/login-as/${handle}`, { redirect: 'manual' });
  if (response.status !== 303)
    throw new Error(`Development login failed (${response.status}); run NODE_ENV=development`);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('cn.sid='));
  if (!cookie) throw new Error('Development login did not return a session cookie');
  const jar = cookie.split(';')[0];
  const page = await fetch(`${base}/events/${eventId}`, { headers: { Cookie: jar } });
  const html = await page.text();
  const token = /<meta name="csrf-token" content="([^"]+)"/.exec(html);
  if (page.status !== 200 || !token)
    throw new Error(`Cannot open event ${eventId} as ${handle} (${page.status})`);
  return { cookie: jar, token: token[1] };
}

async function main() {
  if (!config.isDev) throw new Error('The race fixture only runs in development');
  const opts = options(process.argv.slice(2));
  // EV-7: verify this is an existing, uncancelled future event before deleting its tickets.
  const event = await q.one(
    `SELECT e.event_id, e.starts_at > UTC_TIMESTAMP() AS before_start,
    e.cancelled_at, u.university_id FROM events e JOIN users u ON u.user_id = e.organizer_id
    WHERE e.event_id = ?`,
    [opts.event],
  );
  if (!event || !event.before_start || event.cancelled_at)
    throw new Error('Choose an existing future event which has not been cancelled');
  // EV-7: racers are HKU fixtures; they must be able to see the chosen audience.
  const audience = await q.one('SELECT audience FROM events WHERE event_id = ?', [opts.event]);
  if (audience.audience !== 'all' && event.university_id !== 1)
    throw new Error('HKU racers cannot attend this university-only event');
  console.log(
    `Development fixture: replacing tickets for event ${opts.event} in ${config.db.database}.`,
  );
  for (let i = 1; i <= opts.buyers; i++) {
    const handle = `racer${String(i).padStart(4, '0')}`;
    // EV-7: reusable nine-character fixtures; public seed password, never a real credential.
    await q(
      `INSERT IGNORE INTO users (email, university_id, handle, password_hash, role)
      VALUES (?, 1, ?, ?, 'student')`,
      [
        `${handle}@connect.hku.hk`,
        handle,
        '$2a$10$BQXplPmPWQ5gXkjIbT1MmOYLVK74US3DzjohpkazjNKPPp.RXNx5C',
      ],
    );
    // EV-7: refuse unsuitable existing accounts instead of changing their university or status.
    const racer = await q.one('SELECT university_id, status FROM users WHERE handle = ?', [handle]);
    if (!racer || racer.university_id !== 1 || racer.status !== 'active')
      throw new Error(`Fixture handle ${handle} is unavailable`);
  }
  const clients = [];
  // Log in before arming release so preparation cannot consume the countdown.
  for (let i = 1; i <= opts.buyers; i++)
    clients.push(await login(opts.url, `racer${String(i).padStart(4, '0')}`, opts.event));
  const release = await tx(async (t) => {
    // EV-7: fixture reset uses the same event-first lock order as the real booking transaction.
    await t.q('SELECT event_id FROM events WHERE event_id = ? FOR UPDATE', [opts.event]);
    // EV-7: only the selected event's tickets are replaced for this repeatable demo.
    await t.q('DELETE FROM tickets WHERE event_id = ?', [opts.event]);
    // EV-7, BR-17: database UTC determines the race's release time.
    await t.q(
      'UPDATE events SET capacity = ?, tickets_left = ?, release_at = TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP()) WHERE event_id = ?',
      [opts.tickets, opts.tickets, opts.delay, opts.event],
    );
    // EV-7: return the database's exact release timestamp for the simultaneous HTTP start.
    return t.q.one('SELECT release_at FROM events WHERE event_id = ?', [opts.event]);
  });
  let left = Math.ceil((release.release_at.getTime() - Date.now()) / 1000);
  while (left > 0) {
    console.log(`Booking opens in ${left}…`);
    await pause(Math.min(1000, Math.max(0, release.release_at.getTime() - Date.now())));
    left = Math.ceil((release.release_at.getTime() - Date.now()) / 1000);
  }
  const replies = await Promise.all(
    clients.map(async (client) => {
      try {
        const response = await fetch(`${opts.url}/events/${opts.event}/book`, {
          method: 'POST',
          headers: {
            Cookie: client.cookie,
            Accept: 'application/json',
            'X-CSRF-Token': client.token,
          },
        });
        if (response.status !== 200) return { error: `HTTP ${response.status}` };
        return await response.json();
      } catch (err) {
        return { error: err.message };
      }
    }),
  );
  const booked = replies.filter((reply) => reply.ok).length;
  const soldOut = replies.filter((reply) => reply.reason === 'sold_out').length;
  const errors = replies.length - booked - soldOut;
  // BR-16: independent SQL evidence proves sold tickets equal both capacity-counter and row count.
  const result = await q.one(
    `SELECT capacity, tickets_left,
    (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.event_id) AS tickets
    FROM events e WHERE event_id = ?`,
    [opts.event],
  );
  const oversold =
    result.tickets > result.capacity || result.capacity - result.tickets_left !== result.tickets;
  console.log(
    `booked ${booked}, sold out ${soldOut}, errors ${errors}, tickets_left ${result.tickets_left}, tickets ${result.tickets}, oversold: ${oversold ? 'YES' : 'no'}`,
  );
  if (errors)
    console.error(
      'Other replies:',
      JSON.stringify(replies.filter((reply) => !reply.ok && reply.reason !== 'sold_out')),
    );
  if (
    oversold ||
    errors ||
    booked !== Math.min(opts.buyers, opts.tickets) ||
    result.tickets !== booked
  )
    process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`Race failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(close);
