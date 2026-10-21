-- =====================================================================================
-- Events module: reference SQL (tested). Each block becomes one function in
-- modules/events/queries.js; @variables become ? placeholders in the same order.
-- Run: ONLY=modules/events DB=cn_events bash db/tests/run_all.sh  (fresh seeded database; CALL t_eq / t_err are checks)
-- Writer of: events, tickets. Reads: users, organizations.
-- =====================================================================================
SET time_zone = '+00:00';

-- -------------------------------------------------------------------------------------
-- listEvents(me): upcoming events I can see, soonest first, with a status (EV-1, BR-16)
-- -------------------------------------------------------------------------------------
SET @me = 2, @my_uni = 1;                        -- Mandy, HKU
SELECT e.event_id, e.title, e.venue, e.starts_at, e.ends_at, e.release_at,
       e.capacity, e.tickets_left, e.cover_path, e.audience,
       COALESCE(o.display_name, ou.handle) AS organizer_name,
       CASE WHEN e.cancelled_at IS NOT NULL       THEN 'cancelled'
            WHEN e.ends_at    <= UTC_TIMESTAMP()  THEN 'ended'
            WHEN e.starts_at  <= UTC_TIMESTAMP()  THEN 'in_progress'   -- booking closes at the start
            WHEN e.release_at >  UTC_TIMESTAMP()  THEN 'upcoming'      -- show a countdown
            WHEN e.tickets_left = 0               THEN 'sold_out'
            ELSE 'on_sale' END AS status,
       EXISTS (SELECT 1 FROM tickets t WHERE t.event_id = e.event_id AND t.user_id = @me) AS booked_by_me
FROM events e
JOIN users ou             ON ou.user_id = e.organizer_id
LEFT JOIN organizations o ON o.user_id = e.organizer_id
WHERE e.ends_at > UTC_TIMESTAMP()
  AND (e.audience = 'all' OR ou.university_id = @my_uni)          -- BR-16: audience
ORDER BY e.starts_at, e.event_id;

CALL t_eq('listEvents: Mandy (HKU) sees events 1, 2, 3 with their statuses',
  (SELECT GROUP_CONCAT(CONCAT(e.event_id, ':',
          CASE WHEN e.cancelled_at IS NOT NULL THEN 'cancelled' WHEN e.ends_at <= UTC_TIMESTAMP() THEN 'ended'
               WHEN e.starts_at <= UTC_TIMESTAMP() THEN 'in_progress' WHEN e.release_at > UTC_TIMESTAMP() THEN 'upcoming'
               WHEN e.tickets_left = 0 THEN 'sold_out' ELSE 'on_sale' END) ORDER BY e.starts_at SEPARATOR ' ')
   FROM events e JOIN users ou ON ou.user_id = e.organizer_id
   WHERE e.ends_at > UTC_TIMESTAMP() AND (e.audience = 'all' OR ou.university_id = 1)),
  '1:on_sale 2:sold_out 3:upcoming');
CALL t_eq('listEvents: Wing (CUHK) does not see the HKU-only event 3',
  (SELECT GROUP_CONCAT(e.event_id ORDER BY e.starts_at) FROM events e JOIN users ou ON ou.user_id = e.organizer_id
   WHERE e.ends_at > UTC_TIMESTAMP() AND (e.audience = 'all' OR ou.university_id = 2)), '1,2');

-- -------------------------------------------------------------------------------------
-- getEvent(eventId, me): one event with my ticket, or nothing if I may not see it (EV-2)
-- The organizer always sees their own event, whatever its audience.
-- -------------------------------------------------------------------------------------
SET @event = 1, @me = 2, @my_uni = 1;
SELECT e.*, COALESCE(o.display_name, ou.handle) AS organizer_name, ou.handle AS organizer_handle,
       e.capacity - e.tickets_left AS sold,
       t.ticket_code AS my_ticket_code, t.booked_at AS my_booked_at, t.checked_in_at AS my_checked_in_at
FROM events e
JOIN users ou             ON ou.user_id = e.organizer_id
LEFT JOIN organizations o ON o.user_id = e.organizer_id
LEFT JOIN tickets t       ON t.event_id = e.event_id AND t.user_id = @me
WHERE e.event_id = @event
  AND (e.audience = 'all' OR ou.university_id = @my_uni OR e.organizer_id = @me);

CALL t_eq('getEvent: Mandy sees her ticket code on event 1',
  (SELECT t.ticket_code FROM events e LEFT JOIN tickets t ON t.event_id = e.event_id AND t.user_id = 2 WHERE e.event_id = 1), 'FN7Q2K9A');
CALL t_eq('getEvent: Wing (CUHK) gets no row for HKU-only event 3 (the page answers 404)',
  (SELECT COUNT(*) FROM events e JOIN users ou ON ou.user_id = e.organizer_id
   WHERE e.event_id = 3 AND (e.audience = 'all' OR ou.university_id = 2 OR e.organizer_id = 4)), '0');

-- -------------------------------------------------------------------------------------
-- bookTicket(eventId, me, myUniversityId, ticketCode): the booking transaction (EV-3, BR-16)
-- In queries.js:
--   tx(async t => {
--     const r = await t.q(<UPDATE>, [eventId, myUniversityId]);
--     if (r.affectedRows === 0) return { ok: false };      // caller re-reads the event to say why
--     await t.q(<INSERT>, [eventId, me, code]);             // ER_DUP_ENTRY: throw -> ROLLBACK -> "already booked"
--     return { ok: true, code };
--   })
-- The UPDATE locks the event row: simultaneous bookings queue here, and each re-checks
-- tickets_left > 0 after the previous one commits. The ticket's primary key stops a second
-- ticket. The race is tested in check_race_booking.sh (120 buyers, 50 tickets).
-- -------------------------------------------------------------------------------------
SET @event = 1, @me = 6, @my_uni = 1;            -- Newbie books Film night
START TRANSACTION;
UPDATE events e
   SET e.tickets_left = e.tickets_left - 1
 WHERE e.event_id = @event
   AND e.tickets_left > 0
   AND e.cancelled_at IS NULL
   AND e.release_at <= UTC_TIMESTAMP()
   AND e.starts_at  >  UTC_TIMESTAMP()
   AND (e.audience = 'all'
        OR (SELECT o.university_id FROM users o WHERE o.user_id = e.organizer_id) = @my_uni);
CALL t_eq('bookTicket: the UPDATE claims one ticket', ROW_COUNT(), '1');
INSERT INTO tickets (event_id, user_id, ticket_code) VALUES (@event, @me, 'NEWB0001');
COMMIT;
CALL t_eq('bookTicket: tickets_left 48 -> 47 and Newbie holds a ticket',
  (SELECT CONCAT(tickets_left, '/', (SELECT COUNT(*) FROM tickets WHERE event_id = 1 AND user_id = 6)) FROM events WHERE event_id = 1), '47/1');

-- booking again: the UPDATE succeeds, the INSERT hits the primary key, the app rolls back
START TRANSACTION;
UPDATE events e SET e.tickets_left = e.tickets_left - 1
 WHERE e.event_id = 1 AND e.tickets_left > 0 AND e.cancelled_at IS NULL
   AND e.release_at <= UTC_TIMESTAMP() AND e.starts_at > UTC_TIMESTAMP();
CALL t_err('bookTicket twice: the second ticket is a duplicate key',
  'INSERT INTO tickets (event_id, user_id, ticket_code) VALUES (1, 6, ''NEWB0002'')', 1062);
ROLLBACK;
CALL t_eq('bookTicket twice: ROLLBACK returns the claimed ticket (still 47)',
  (SELECT tickets_left FROM events WHERE event_id = 1), '47');

-- refused bookings change no row
UPDATE events e SET e.tickets_left = e.tickets_left - 1
 WHERE e.event_id = 2 AND e.tickets_left > 0 AND e.cancelled_at IS NULL
   AND e.release_at <= UTC_TIMESTAMP() AND e.starts_at > UTC_TIMESTAMP();
CALL t_eq('bookTicket: a sold-out event changes no row', ROW_COUNT(), '0');
UPDATE events e SET e.tickets_left = e.tickets_left - 1
 WHERE e.event_id = 3 AND e.tickets_left > 0 AND e.cancelled_at IS NULL
   AND e.release_at <= UTC_TIMESTAMP() AND e.starts_at > UTC_TIMESTAMP();
CALL t_eq('bookTicket: an event before its release time changes no row', ROW_COUNT(), '0');
UPDATE events SET release_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE event_id = 3;   -- release event 3 now
UPDATE events e SET e.tickets_left = e.tickets_left - 1
 WHERE e.event_id = 3 AND e.tickets_left > 0 AND e.cancelled_at IS NULL
   AND e.release_at <= UTC_TIMESTAMP() AND e.starts_at > UTC_TIMESTAMP()
   AND (e.audience = 'all' OR (SELECT o.university_id FROM users o WHERE o.user_id = e.organizer_id) = 2);
CALL t_eq('bookTicket: a CUHK student cannot book an HKU-only event', ROW_COUNT(), '0');

-- -------------------------------------------------------------------------------------
-- cancelBooking(eventId, me): give the ticket back before the event starts (EV-4)
-- Lock the event row FIRST, in the same order as booking, so the two never deadlock.
-- In queries.js: lock; if the event started or was cancelled -> refuse; DELETE; if 1 row -> UPDATE.
-- -------------------------------------------------------------------------------------
SET @event = 1, @me = 6;
START TRANSACTION;
SELECT starts_at > UTC_TIMESTAMP() AND cancelled_at IS NULL AS can_cancel
  FROM events WHERE event_id = @event FOR UPDATE;
DELETE FROM tickets WHERE event_id = @event AND user_id = @me AND checked_in_at IS NULL;
CALL t_eq('cancelBooking: one ticket deleted', ROW_COUNT(), '1');
UPDATE events SET tickets_left = tickets_left + 1 WHERE event_id = @event;
COMMIT;
CALL t_eq('cancelBooking: tickets_left back to 48', (SELECT tickets_left FROM events WHERE event_id = 1), '48');

-- -------------------------------------------------------------------------------------
-- myTickets(me): my tickets, upcoming first, then past (EV-5)
-- -------------------------------------------------------------------------------------
SET @me = 4;                                     -- Wing: one upcoming (sold-out hike), one past
SELECT e.event_id, e.title, e.venue, e.starts_at, e.ends_at, e.cancelled_at,
       t.ticket_code, t.booked_at, t.checked_in_at,
       COALESCE(o.display_name, ou.handle) AS organizer_name,
       e.ends_at <= UTC_TIMESTAMP() AS is_past
FROM tickets t
JOIN events e             ON e.event_id = t.event_id
JOIN users ou             ON ou.user_id = e.organizer_id
LEFT JOIN organizations o ON o.user_id = e.organizer_id
WHERE t.user_id = @me
ORDER BY is_past, IF(e.ends_at <= UTC_TIMESTAMP(), NULL, e.starts_at), e.starts_at DESC;
CALL t_eq('myTickets: Wing has the upcoming hike first, then the past one',
  (SELECT GROUP_CONCAT(t.event_id ORDER BY e.ends_at <= UTC_TIMESTAMP(), e.starts_at) FROM tickets t JOIN events e USING (event_id) WHERE t.user_id = 4), '2,4');

-- -------------------------------------------------------------------------------------
-- createEvent(organizerId, fields): organizations and admins only (checked in the route) (EV-6)
-- tickets_left starts equal to capacity; the CHECKs reject impossible times.
-- -------------------------------------------------------------------------------------
INSERT INTO events (organizer_id, title, description, venue, starts_at, ends_at, release_at, capacity, tickets_left, audience)
VALUES (7, 'Short film workshop', 'Bring a phone.', 'Run Run Shaw Tower', UTC_TIMESTAMP() + INTERVAL 5 DAY,
        UTC_TIMESTAMP() + INTERVAL 5 DAY + INTERVAL 2 HOUR, UTC_TIMESTAMP() + INTERVAL 1 DAY, 20, 20, 'university');
SET @new_event = LAST_INSERT_ID();
CALL t_eq('createEvent: new event starts with every ticket left', (SELECT CONCAT(capacity, '/', tickets_left) FROM events WHERE event_id = @new_event), '20/20');
CALL t_err('createEvent: release after the start is refused',
  'INSERT INTO events (organizer_id, title, description, venue, starts_at, ends_at, release_at, capacity, tickets_left) VALUES (7, ''x'', ''x'', ''x'', UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 2 DAY, UTC_TIMESTAMP() + INTERVAL 3 DAY, 10, 10)', 3819);
CALL t_err('createEvent: capacity 0 is refused',
  'INSERT INTO events (organizer_id, title, description, venue, starts_at, ends_at, release_at, capacity, tickets_left) VALUES (7, ''x'', ''x'', ''x'', UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 2 DAY, UTC_TIMESTAMP(), 0, 0)', 3819);

-- -------------------------------------------------------------------------------------
-- updateEvent(eventId, organizerId, fields): change details and capacity (EV-6)
-- A new capacity below the tickets already sold is refused (0 rows); tickets_left moves
-- by the same amount as capacity, so sold = capacity - tickets_left stays true.
-- MySQL GOTCHA: a single-table UPDATE assigns left to right and later assignments see the
-- NEW values. tickets_left must therefore be assigned BEFORE capacity (tested: the other
-- order silently leaves tickets_left unchanged).
-- -------------------------------------------------------------------------------------
SET @event = 1, @me = 7, @new_capacity = 60;
UPDATE events
   SET title = 'Film night: Wake Up',
       tickets_left = tickets_left + (@new_capacity - capacity),
       capacity = @new_capacity
 WHERE event_id = @event AND organizer_id = @me AND cancelled_at IS NULL
   AND @new_capacity >= capacity - tickets_left;
CALL t_eq('updateEvent: capacity 50 -> 60 gives 10 more tickets (48 -> 58)', (SELECT CONCAT(capacity, '/', tickets_left) FROM events WHERE event_id = 1), '60/58');
SET @new_capacity = 1;                           -- 2 already sold
UPDATE events SET tickets_left = tickets_left + (@new_capacity - capacity), capacity = @new_capacity
 WHERE event_id = 1 AND organizer_id = 7 AND cancelled_at IS NULL AND @new_capacity >= capacity - tickets_left;
CALL t_eq('updateEvent: capacity below tickets sold changes nothing', ROW_COUNT(), '0');
UPDATE events SET title = 'Hijacked' WHERE event_id = 1 AND organizer_id = 8;
CALL t_eq('updateEvent: another organizer changes nothing', ROW_COUNT(), '0');

-- -------------------------------------------------------------------------------------
-- cancelEvent(eventId, organizerId) (EV-6). Tickets stay as a record; the event shows "Cancelled".
-- -------------------------------------------------------------------------------------
UPDATE events SET cancelled_at = UTC_TIMESTAMP() WHERE event_id = @new_event AND organizer_id = 7 AND cancelled_at IS NULL;
CALL t_eq('cancelEvent: the organizer cancels their event', ROW_COUNT(), '1');

-- -------------------------------------------------------------------------------------
-- attendees(eventId, organizerId): who booked, for check-in (EV-6). Organizer or admin only.
-- -------------------------------------------------------------------------------------
SET @event = 2, @me = 8;
SELECT u.user_id, u.handle, un.code AS university_code, t.ticket_code, t.booked_at, t.checked_in_at
FROM tickets t
JOIN events e       ON e.event_id = t.event_id
JOIN users u        ON u.user_id = t.user_id
JOIN universities un ON un.university_id = u.university_id
WHERE t.event_id = @event AND e.organizer_id = @me
ORDER BY t.booked_at;
CALL t_eq('attendees: the hiking club sees its two attendees in booking order',
  (SELECT GROUP_CONCAT(u.handle ORDER BY t.booked_at) FROM tickets t JOIN events e USING (event_id) JOIN users u ON u.user_id = t.user_id
   WHERE t.event_id = 2 AND e.organizer_id = 8), 'wing0cuhk,jason0ust');

-- checkIn(eventId, ticketCode, organizerId): by the code the attendee shows
UPDATE tickets t JOIN events e ON e.event_id = t.event_id
   SET t.checked_in_at = UTC_TIMESTAMP()
 WHERE t.event_id = 2 AND t.ticket_code = 'DB9H4R7W' AND e.organizer_id = 8 AND t.checked_in_at IS NULL;
CALL t_eq('checkIn: the right organizer checks a ticket in once', ROW_COUNT(), '1');

-- -------------------------------------------------------------------------------------
-- organizerStats(organizerId): sold, checked in, and a consistency flag per event (EV-6)
-- -------------------------------------------------------------------------------------
SELECT e.event_id, e.title, e.capacity,
       e.capacity - e.tickets_left AS sold,
       COUNT(t.user_id) AS tickets_rows,
       SUM(t.checked_in_at IS NOT NULL) AS checked_in,
       (e.capacity - e.tickets_left) = COUNT(t.user_id) AS counter_ok
FROM events e
LEFT JOIN tickets t ON t.event_id = e.event_id
WHERE e.organizer_id = 8
GROUP BY e.event_id, e.title, e.capacity, e.tickets_left
ORDER BY e.starts_at DESC;

-- Invariant behind the stored derived attribute (DATA_MODEL §7.1): must hold for every event.
CALL t_eq('invariant: capacity - tickets_left = number of tickets, for every event',
  (SELECT COUNT(*) FROM events e
    WHERE e.capacity - e.tickets_left <> (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.event_id)), '0');
