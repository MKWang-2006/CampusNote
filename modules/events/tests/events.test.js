const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');
const { resetDb, agentAs, make, q } = require('../../../test/helpers');
const config = require('../../../core/config');
const queries = require('../queries');
const { formatHkt } = require('../forms');

before(resetDb);
// Each acceptance case is independent, including mutations to seeded events.
beforeEach(resetDb);

const ids = (page, selector) =>
  page
    .$(selector)
    .map((_, el) => Number(page.$(el).attr('data-event-id')))
    .get();
const fields = () => ({
  title: 'Campus workshop',
  description: 'Bring your questions.',
  venue: 'Lecture hall',
  starts_at: formatHkt(Date.now() + 5 * 86400e3),
  ends_at: formatHkt(Date.now() + 5 * 86400e3 + 3600e3),
  release_at: formatHkt(Date.now() - 3600e3),
  capacity: '20',
  audience: 'all',
});
const seededFields = async (id, changes = {}) => {
  const event = await q.one('SELECT * FROM events WHERE event_id = ?', [id]);
  return {
    ...event,
    ...Object.fromEntries(
      ['starts_at', 'ends_at', 'release_at'].map((key) => [key, formatHkt(event[key])]),
    ),
    ...changes,
  };
};

test('EV-T01: upcoming events appear in order with status and without ended events', async () => {
  const page = await (await agentAs('mandy0hku')).page('/events');
  assert.equal(page.status, 200);
  assert.deepEqual(ids(page, '.event-card'), [1, 2, 3]);
  for (const text of ['On sale', 'Sold out', 'Opens in', 'Booked'])
    assert.match(page.text, new RegExp(text));
});

test('EV-T02/T03: university audience filters lists and conceals inaccessible events', async () => {
  const wing = await agentAs('wing0cuhk');
  assert.deepEqual(ids(await wing.page('/events'), '.event-card'), [1, 2]);
  assert.equal((await wing.page('/events/3')).status, 404);
  assert.equal((await wing.json('/events/3/book', {})).status, 404);
});

test('EV-T04: upcoming event has a countdown; ticket holder sees code and cancellation', async () => {
  const mandy = await agentAs('mandy0hku');
  const upcoming = await mandy.page('/events/3');
  assert.equal(upcoming.$('[data-countdown]').length, 1);
  assert.equal(upcoming.$('form[action$="/book"]').length, 0);
  const ticket = await mandy.page('/events/1');
  assert.match(ticket.text, /FN7Q2K9A/);
  assert.match(ticket.text, /Cancel booking/);
});

test('EV-T05/T06: booking creates one ticket and a repeated booking preserves inventory', async () => {
  const newbie = await agentAs('newbie0hk');
  const booked = await newbie.form('/events/1/book');
  assert.equal(booked.status, 303);
  assert.equal(booked.headers.location, '/events/1');
  const row = await q.one('SELECT tickets_left FROM events WHERE event_id = 1');
  assert.equal(row.tickets_left, 47);
  const page = await newbie.page('/events/1');
  assert.match(page.$('.ticket-code').text(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  const duplicate = await newbie.json('/events/1/book');
  assert.equal(duplicate.body.reason, 'already_booked');
  await newbie.form('/events/1/book');
  assert.match((await newbie.page('/events/1')).text, /You already have a ticket/);
  assert.equal(
    (await q.one('SELECT tickets_left FROM events WHERE event_id = 1')).tickets_left,
    47,
  );
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM tickets WHERE event_id = 1 AND user_id = 6')).n,
    1,
  );
});

test('EV-T07/T08: sold-out and not-yet-released bookings return stable reason codes', async () => {
  const newbie = await agentAs('newbie0hk');
  assert.equal((await newbie.json('/events/2/book')).body.reason, 'sold_out');
  assert.equal((await newbie.json('/events/3/book')).body.reason, 'not_open');
  await newbie.form('/events/3/book');
  assert.match((await newbie.page('/events/3')).text, /Tickets go on sale at/);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM tickets WHERE user_id = 6')).n, 0);
});

test('EV-T09: CSRF-less booking is forbidden', async () => {
  const newbie = await agentAs('newbie0hk');
  assert.equal((await newbie.raw.post('/events/1/book')).status, 403);
});

test('EV-T10: 30 simultaneous HTTP buyers never exceed 10 tickets', async () => {
  const eventId = await queries.createEvent(7, {
    title: 'Race',
    description: 'Ten tickets',
    venue: 'Hall',
    starts_at: new Date(Date.now() + 86400e3),
    ends_at: new Date(Date.now() + 90000e3),
    release_at: new Date(Date.now() - 1000),
    capacity: 10,
    audience: 'all',
    cover_path: null,
  });
  const buyers = [];
  for (let i = 0; i < 30; i++) buyers.push(await agentAs((await make.user()).handle));
  // Fetch CSRF before the simultaneous start rather than measuring login/token overhead.
  await Promise.all(buyers.map((buyer) => buyer.page(`/events/${eventId}`)));
  const replies = await Promise.all(buyers.map((buyer) => buyer.json(`/events/${eventId}/book`)));
  assert.ok(replies.every((reply) => reply.status === 200));
  assert.equal(replies.filter((reply) => reply.body.ok).length, 10);
  assert.equal(replies.filter((reply) => reply.body.reason === 'sold_out').length, 20);
  assert.equal(
    (await q.one('SELECT tickets_left FROM events WHERE event_id = ?', [eventId])).tickets_left,
    0,
  );
  assert.equal(
    (await q.one('SELECT COUNT(*) AS n FROM tickets WHERE event_id = ?', [eventId])).n,
    10,
  );
});

test('EV-T11: cancellation restores exactly one ticket and refuses after the start', async () => {
  const mandy = await agentAs('mandy0hku');
  assert.equal((await mandy.json('/events/1/cancel-booking')).body.ok, true);
  assert.equal(
    (await q.one('SELECT tickets_left FROM events WHERE event_id = 1')).tickets_left,
    49,
  );
  assert.equal((await mandy.json('/events/1/cancel-booking')).body.ok, false);
  assert.equal(
    (await q.one('SELECT tickets_left FROM events WHERE event_id = 1')).tickets_left,
    49,
  );
  await q(
    'UPDATE events SET release_at = UTC_TIMESTAMP() - INTERVAL 2 HOUR, starts_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE event_id = 1',
  );
  assert.equal(
    (await (await agentAs('kelvin0hk')).json('/events/1/cancel-booking')).body.reason,
    'closed',
  );
});

test('EV-T12/T19: tickets show upcoming before past; newcomer sees an empty state', async () => {
  const page = await (await agentAs('wing0cuhk')).page('/me/tickets');
  assert.deepEqual(ids(page, '.ticket-card'), [2, 4]);
  assert.match(page.text, /Checked in/);
  assert.match((await (await agentAs('newbie0hk')).page('/me/tickets')).text, /No tickets yet/);
});

test('EV-T13: organizations create events; students cannot open or submit creation', async () => {
  const org = await agentAs('filmsoc00');
  const response = await org.form('/events/new', { ...fields(), audience: 'university' });
  assert.equal(response.status, 303);
  assert.match(response.headers.location, /^\/events\/\d+$/);
  const event = await q.one('SELECT * FROM events WHERE title = ?', ['Campus workshop']);
  assert.equal(event.capacity, 20);
  assert.equal(event.tickets_left, 20);
  const mandy = await agentAs('mandy0hku');
  assert.match((await mandy.page('/events')).text, /Campus workshop/);
  assert.equal((await mandy.page('/events/new')).status, 403);
  assert.equal((await mandy.form('/events/new', fields())).status, 403);
});

test('EV-T14: invalid release re-renders field error and retains the draft', async () => {
  const data = fields();
  data.release_at = data.ends_at;
  const response = await (await agentAs('filmsoc00')).form('/events/new', data);
  assert.equal(response.status, 400);
  assert.match(response.$('#f-release_at-error').text(), /before the start/);
  assert.equal(response.$('#f-title').val(), data.title);
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM events')).n, 4);
});

test('EV-T15: editing cannot reduce capacity below sold and raising it preserves sold', async () => {
  const org = await agentAs('filmsoc00');
  const invalid = await org.form('/events/1/edit', await seededFields(1, { capacity: '1' }));
  assert.equal(invalid.status, 400);
  assert.match(invalid.$('#f-capacity-error').text(), /2 tickets are already booked/);
  assert.equal((await q.one('SELECT capacity FROM events WHERE event_id = 1')).capacity, 50);
  assert.equal(
    (await org.form('/events/1/edit', await seededFields(1, { capacity: '10' }))).status,
    303,
  );
  assert.equal((await q.one('SELECT tickets_left FROM events WHERE event_id = 1')).tickets_left, 8);
  assert.equal(
    (await org.form('/events/1/edit', await seededFields(1, { capacity: '60' }))).status,
    303,
  );
  const row = await q.one('SELECT capacity, tickets_left FROM events WHERE event_id = 1');
  assert.deepEqual([row.capacity, row.tickets_left], [60, 58]);
  assert.equal((await (await agentAs('hikeclub0')).page('/events/1/edit')).status, 404);
});

test('EV-T16: organizer cancellation keeps ticket records and refuses booking', async () => {
  const org = await agentAs('filmsoc00');
  assert.equal((await org.form('/events/1/cancel')).status, 303);
  const newbie = await agentAs('newbie0hk');
  assert.match((await newbie.page('/events/1')).text, /Cancelled/);
  assert.equal((await newbie.json('/events/1/book')).body.reason, 'cancelled');
  assert.equal((await q.one('SELECT COUNT(*) AS n FROM tickets WHERE event_id = 1')).n, 2);
  assert.equal(
    (await (await agentAs('mandy0hku')).json('/events/1/cancel-booking')).body.reason,
    'cancelled',
  );
});

test('EV-T17/T18: attendee access is scoped; check-in succeeds exactly once', async () => {
  const club = await agentAs('hikeclub0');
  const attendees = await club.page('/events/2/attendees');
  assert.equal(attendees.status, 200);
  assert.equal(attendees.$('tbody tr').length, 2);
  const other = await agentAs('filmsoc00');
  assert.equal((await other.page('/events/2/attendees')).status, 404);
  assert.equal((await other.json('/events/2/check-in', { code: 'DB9H4R7W' })).status, 404);
  assert.match(
    (await club.json('/events/2/check-in', { code: 'db9h4r7w' })).body.message,
    /Checked in: jason0ust/,
  );
  assert.match(
    (await club.json('/events/2/check-in', { code: 'DB9H4R7W' })).body.message,
    /Already checked in at/,
  );
  assert.equal((await club.json('/events/2/check-in', { code: 'ZZZZZZZZ' })).body.ok, false);
});

test('organization dashboard includes past events; admins manage attendees but not others events', async () => {
  const club = await agentAs('hikeclub0');
  assert.deepEqual(ids(await club.page('/events?mine=1'), '.event-card'), [2, 4]);
  const admin = await agentAs('admin0000');
  assert.equal((await admin.page('/events/2/attendees')).status, 200);
  assert.equal((await admin.page('/events/2/edit')).status, 404);
  assert.equal((await admin.form('/events/2/cancel')).status, 404);
  const detail = await admin.page('/events/2');
  assert.equal(detail.$('a[href="/events/2/edit"]').length, 0);
  assert.equal(detail.$('a[href="/events/2/attendees"]').length, 1);
});

test('closed events return closed; invalid IDs and unauthorized mutations stay private', async () => {
  await q(
    'UPDATE events SET release_at = UTC_TIMESTAMP() - INTERVAL 2 HOUR, starts_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE event_id = 1',
  );
  const newbie = await agentAs('newbie0hk');
  assert.equal((await newbie.json('/events/1/book')).body.reason, 'closed');
  assert.equal((await newbie.page('/events/not-an-id')).status, 404);
  assert.equal((await newbie.form('/events/1/cancel')).status, 404);
});

test('concurrent duplicate bookings roll back the losing decrement', async () => {
  const replies = await Promise.all([queries.bookTicket(1, 6, 1), queries.bookTicket(1, 6, 1)]);
  assert.equal(replies.filter((reply) => reply.ok).length, 1);
  assert.equal(replies.find((reply) => !reply.ok).reason, 'already_booked');
  assert.equal(
    (await q.one('SELECT tickets_left FROM events WHERE event_id = 1')).tickets_left,
    47,
  );
});

test('a random ticket-code collision retries once without consuming extra inventory', async () => {
  const original = crypto.randomInt;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let i = 0;
  crypto.randomInt = () => alphabet.indexOf('FN7Q2K9AAAAAAAAA'[i++]);
  try {
    const result = await queries.bookTicket(1, 6, 1);
    assert.equal(result.ok, true);
    assert.equal(result.code, 'AAAAAAAA');
  } finally {
    crypto.randomInt = original;
  }
  assert.equal(
    (await q.one('SELECT tickets_left FROM events WHERE event_id = 1')).tickets_left,
    47,
  );
});

test('multipart upload is saved only on success and removed on validation failure', async () => {
  const org = await agentAs('filmsoc00');
  const form = await org.page('/events/new');
  const action = form.$('form').attr('action');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  const upload = async (values) => {
    let request = org.raw.post(action);
    for (const [key, value] of Object.entries(values)) request = request.field(key, value);
    return request.attach('cover', png, { filename: 'cover.png', contentType: 'image/png' });
  };
  const saved = await upload(fields());
  assert.equal(saved.status, 303);
  const event = await q.one('SELECT cover_path FROM events WHERE title = ?', ['Campus workshop']);
  const disk = (publicPath) => path.join(config.uploadDir, publicPath.slice('/uploads/'.length));
  assert.ok(fs.existsSync(disk(event.cover_path)));
  const dir = path.dirname(disk(event.cover_path));
  const count = fs.readdirSync(dir).length;
  const invalid = await upload({ ...fields(), title: '' });
  assert.equal(invalid.status, 400);
  assert.equal(fs.readdirSync(dir).length, count);
  fs.rmSync(disk(event.cover_path));
});

test('event text is escaped and never interpreted as markup', async () => {
  await q('UPDATE events SET title = ?, description = ? WHERE event_id = 1', [
    '<script>title</script>',
    '<img src=x onerror=alert(1)>',
  ]);
  const page = await (await agentAs('newbie0hk')).page('/events/1');
  assert.match(page.$('.event-detail').text(), /<script>title<\/script>/);
  assert.equal(page.$('.event-detail script, .event-detail img[onerror]').length, 0);
});

test('unsupported request bodies return validation feedback rather than crashing', async () => {
  const org = await agentAs('filmsoc00');
  await org.page('/events/new');
  const create = await org.raw
    .post('/events/new')
    .set('X-CSRF-Token', org.token)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('invalid'));
  assert.equal(create.status, 400);
  assert.match(create.text, /Title cannot be blank/);
  const checkIn = await org.raw
    .post('/events/1/check-in')
    .set('X-CSRF-Token', org.token)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('invalid'));
  assert.equal(checkIn.status, 303);
  assert.match((await org.page('/events/1/attendees')).text, /No ticket with that code/);
});
