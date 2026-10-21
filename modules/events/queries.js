// BR-16: events is the sole writer of events and tickets. SQL lives in this file.
const crypto = require('crypto');
const { q, tx, isDuplicate } = require('../../core/db');

const STATUS = `CASE WHEN e.cancelled_at IS NOT NULL THEN 'cancelled'
  WHEN e.ends_at <= UTC_TIMESTAMP() THEN 'ended'
  WHEN e.starts_at <= UTC_TIMESTAMP() THEN 'in_progress'
  WHEN e.release_at > UTC_TIMESTAMP() THEN 'upcoming'
  WHEN e.tickets_left = 0 THEN 'sold_out' ELSE 'on_sale' END`;
const DETAILS = `e.*, COALESCE(o.display_name, ou.handle) AS organizer_name,
  ou.handle AS organizer_handle, un.code AS university_code,
  e.capacity - e.tickets_left AS sold, ${STATUS} AS status,
  e.starts_at > UTC_TIMESTAMP() AS before_start`;
const ORGANIZER = `JOIN users ou ON ou.user_id = e.organizer_id
  JOIN universities un ON un.university_id = ou.university_id
  LEFT JOIN organizations o ON o.user_id = e.organizer_id`;

// EV-1, BR-16: list visible upcoming events; organizers also see their own events.
async function listEvents(userId, universityId) {
  return q(
    `SELECT ${DETAILS}, EXISTS (SELECT 1 FROM tickets t
      WHERE t.event_id = e.event_id AND t.user_id = ?) AS booked_by_me
    FROM events e ${ORGANIZER} WHERE e.ends_at > UTC_TIMESTAMP()
      AND (e.audience = 'all' OR ou.university_id = ? OR e.organizer_id = ?)
    ORDER BY e.starts_at, e.event_id`,
    [userId, universityId, userId],
  );
}

// EV-6: statistics include ended/cancelled events and verify the inventory invariant.
async function listMyEvents(organizerId) {
  return q(
    `SELECT ${DETAILS},
      (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.event_id) AS tickets_rows,
      (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.event_id
        AND t.checked_in_at IS NOT NULL) AS checked_in,
      e.capacity - e.tickets_left = (SELECT COUNT(*) FROM tickets t
        WHERE t.event_id = e.event_id) AS counter_ok
    FROM events e ${ORGANIZER} WHERE e.organizer_id = ?
    ORDER BY e.starts_at DESC, e.event_id DESC`,
    [organizerId],
  );
}

// EV-2, BR-16: hidden events return no row, including before mutations.
async function getEvent(eventId, userId, universityId) {
  return q.one(
    `SELECT ${DETAILS}, t.ticket_code AS my_ticket_code,
      t.booked_at AS my_booked_at, t.checked_in_at AS my_checked_in_at
    FROM events e ${ORGANIZER}
    LEFT JOIN tickets t ON t.event_id = e.event_id AND t.user_id = ?
    WHERE e.event_id = ?
      AND (e.audience = 'all' OR ou.university_id = ? OR e.organizer_id = ?)`,
    [userId, eventId, universityId, userId],
  );
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ticketCode = () =>
  Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

async function bookTicket(eventId, userId, universityId) {
  // EV-3: retry one random code collision; every duplicate rolls back the decrement.
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = ticketCode();
    try {
      return await tx(async (t) => {
        // BR-16: this UPDATE locks the event and rechecks available capacity after waiting.
        const claimed = await t.q(
          `UPDATE events e SET e.tickets_left = e.tickets_left - 1
          WHERE e.event_id = ? AND e.tickets_left > 0 AND e.cancelled_at IS NULL
            AND e.release_at <= UTC_TIMESTAMP() AND e.starts_at > UTC_TIMESTAMP()
            AND (e.audience = 'all' OR
              (SELECT u.university_id FROM users u WHERE u.user_id = e.organizer_id) = ?)`,
          [eventId, universityId],
        );
        if (!claimed.affectedRows) return { ok: false };
        // BR-16: the composite primary key guarantees at most one ticket per attendee.
        await t.q('INSERT INTO tickets (event_id, user_id, ticket_code) VALUES (?, ?, ?)', [
          eventId,
          userId,
          code,
        ]);
        // EV-3: return the inventory from the same transaction as this booking.
        const event = await t.q.one('SELECT tickets_left FROM events WHERE event_id = ?', [
          eventId,
        ]);
        return { ok: true, code, ticketsLeft: event.tickets_left };
      });
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      // EV-3: distinguish a duplicate booking from a globally unique random code collision.
      const mine = await q.one(
        'SELECT ticket_code FROM tickets WHERE event_id = ? AND user_id = ?',
        [eventId, userId],
      );
      if (mine) return { ok: false, reason: 'already_booked' };
      if (attempt === 1) throw err;
    }
  }
}

async function cancelBooking(eventId, userId) {
  return tx(async (t) => {
    // EV-4, BR-16: lock the event first, in the same order as booking.
    const event = await t.q.one(
      `SELECT cancelled_at, starts_at > UTC_TIMESTAMP() AS before_start
      FROM events WHERE event_id = ? FOR UPDATE`,
      [eventId],
    );
    if (!event) return { ok: false, reason: 'missing' };
    if (event.cancelled_at) return { ok: false, reason: 'cancelled' };
    if (!event.before_start) return { ok: false, reason: 'closed' };
    // EV-4: checked-in tickets cannot be returned; repeated cancellations are harmless.
    const removed = await t.q(
      'DELETE FROM tickets WHERE event_id = ? AND user_id = ? AND checked_in_at IS NULL',
      [eventId, userId],
    );
    if (!removed.affectedRows) return { ok: false, reason: 'no_ticket' };
    // BR-16: restore inventory only when a ticket was actually deleted.
    await t.q('UPDATE events SET tickets_left = tickets_left + 1 WHERE event_id = ?', [eventId]);
    return { ok: true, reason: null };
  });
}

// EV-5: preserve past and cancelled tickets as records, after upcoming tickets.
async function myTickets(userId) {
  return q(
    `SELECT e.event_id, e.title, e.venue, e.starts_at, e.ends_at, e.cancelled_at,
      t.ticket_code, t.booked_at, t.checked_in_at,
      COALESCE(o.display_name, ou.handle) AS organizer_name,
      e.ends_at <= UTC_TIMESTAMP() AS is_past
    FROM tickets t JOIN events e ON e.event_id = t.event_id ${ORGANIZER}
    WHERE t.user_id = ?
    ORDER BY is_past, IF(e.ends_at <= UTC_TIMESTAMP(), NULL, e.starts_at), e.starts_at DESC`,
    [userId],
  );
}

// EV-6, BR-16: new events start with all of their capacity available.
async function createEvent(organizerId, fields) {
  const result = await q(
    `INSERT INTO events (organizer_id, title, description, venue,
      starts_at, ends_at, release_at, capacity, tickets_left, audience, cover_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organizerId,
      fields.title,
      fields.description,
      fields.venue,
      fields.starts_at,
      fields.ends_at,
      fields.release_at,
      fields.capacity,
      fields.capacity,
      fields.audience,
      fields.cover_path,
    ],
  );
  return result.insertId;
}

// EV-6, BR-16: assign inventory BEFORE capacity; preserve sold tickets under concurrent booking.
async function updateEvent(eventId, organizerId, fields) {
  const result = await q(
    `UPDATE events SET title = ?, description = ?, venue = ?,
      starts_at = ?, ends_at = ?, release_at = ?,
      tickets_left = ? - (capacity - tickets_left), capacity = ?, audience = ?, cover_path = ?
    WHERE event_id = ? AND organizer_id = ? AND cancelled_at IS NULL
      AND ? >= capacity - tickets_left`,
    [
      fields.title,
      fields.description,
      fields.venue,
      fields.starts_at,
      fields.ends_at,
      fields.release_at,
      fields.capacity,
      fields.capacity,
      fields.audience,
      fields.cover_path,
      eventId,
      organizerId,
      fields.capacity,
    ],
  );
  return result.affectedRows;
}

// EV-6: only the organizer cancels; ticket records and the inventory invariant remain intact.
async function cancelEvent(eventId, organizerId) {
  const result = await q(
    'UPDATE events SET cancelled_at = UTC_TIMESTAMP() WHERE event_id = ? AND organizer_id = ? AND cancelled_at IS NULL',
    [eventId, organizerId],
  );
  return result.affectedRows;
}

// EV-6: administrators manage attendees even outside the event audience.
async function attendeeEvent(eventId, organizerId, isAdmin) {
  return q.one(
    `SELECT ${DETAILS} FROM events e ${ORGANIZER}
    WHERE e.event_id = ? AND (e.organizer_id = ? OR ? = 1)`,
    [eventId, organizerId, isAdmin ? 1 : 0],
  );
}

// EV-6: only the organizer or an administrator can read attendee identities.
async function attendees(eventId, organizerId, isAdmin) {
  return q(
    `SELECT u.handle, un.code AS university_code, t.ticket_code, t.booked_at, t.checked_in_at
    FROM tickets t JOIN events e ON e.event_id = t.event_id JOIN users u ON u.user_id = t.user_id
    JOIN universities un ON un.university_id = u.university_id
    WHERE t.event_id = ? AND (e.organizer_id = ? OR ? = 1)
    ORDER BY t.booked_at, t.user_id`,
    [eventId, organizerId, isAdmin ? 1 : 0],
  );
}

async function checkIn(eventId, code, organizerId, isAdmin) {
  return tx(async (t) => {
    // EV-6: serialize on the event like cancellation/booking, while checking authority.
    const event = await t.q.one(
      'SELECT event_id FROM events WHERE event_id = ? AND (organizer_id = ? OR ? = 1) FOR UPDATE',
      [eventId, organizerId, isAdmin ? 1 : 0],
    );
    if (!event) return null;
    // EV-6: repeated check-in reports the original timestamp without changing it.
    const ticket = await t.q.one(
      `SELECT u.handle, t.checked_in_at AS checkedInAt
      FROM tickets t JOIN users u ON u.user_id = t.user_id
      WHERE t.event_id = ? AND t.ticket_code = ? FOR UPDATE`,
      [eventId, code],
    );
    if (!ticket) return null;
    if (ticket.checkedInAt) return { ...ticket, already: true };
    // EV-6, BR-17: store check-in in UTC.
    await t.q(
      'UPDATE tickets SET checked_in_at = UTC_TIMESTAMP() WHERE event_id = ? AND ticket_code = ? AND checked_in_at IS NULL',
      [eventId, code],
    );
    // EV-6: return the stored timestamp for display with ui.hkt.
    const checked = await t.q.one(
      'SELECT checked_in_at AS checkedInAt FROM tickets WHERE event_id = ? AND ticket_code = ?',
      [eventId, code],
    );
    return { ...ticket, ...checked, already: false };
  });
}

module.exports = {
  listEvents,
  listMyEvents,
  getEvent,
  bookTicket,
  cancelBooking,
  myTickets,
  createEvent,
  updateEvent,
  cancelEvent,
  attendeeEvent,
  attendees,
  checkIn,
};
