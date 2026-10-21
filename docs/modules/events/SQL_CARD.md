# Ticket booking: concurrency showcase

**Claim:** concurrent buyers cannot oversell an event or book a second ticket for the same person.

Inside one transaction:

```sql
-- BR-16: claim inventory only while booking is open and tickets remain.
UPDATE events e SET tickets_left = tickets_left - 1
WHERE event_id = ? AND tickets_left > 0
  AND cancelled_at IS NULL
  AND release_at <= UTC_TIMESTAMP() AND starts_at > UTC_TIMESTAMP()
  AND (audience = 'all' OR
       (SELECT university_id FROM users WHERE user_id = e.organizer_id) = ?);
-- Only continue when one row was claimed; otherwise explain the refusal.
INSERT INTO tickets (event_id, user_id, ticket_code) VALUES (?, ?, ?);
```

1. The UPDATE takes the event row lock. Waiting buyers recheck its conditions after the preceding transaction commits.
2. The ticket's `(event_id, user_id)` primary key stops duplicate bookings. An INSERT failure rolls back the inventory decrement; a rare ticket-code collision retries once.
3. `UNSIGNED` and `CHECK (tickets_left <= capacity)` enforce inventory bounds. Cancellation locks the event before deleting a ticket and only restores inventory after a real deletion.

**Measured 21 October 2026:** three consecutive HTTP runs, each with 200 buyers competing for 50 tickets:

```text
booked 50, sold out 150, errors 0, tickets_left 0, tickets 50, oversold: no
```

The independent consistency query must return no rows:

```sql
-- BR-16: counter and ticket records must agree for every event.
SELECT event_id FROM events e
WHERE capacity - tickets_left <>
  (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.event_id);
```

`tickets_left` is a deliberately stored derived attribute: the guarded counter decrement provides one row that serializes buyers. Its cost is maintaining the invariant on booking, cancellation and capacity edits. Capacity edits assign `tickets_left = new_capacity - (capacity - tickets_left)` **before** assigning `capacity`, so sold tickets stay constant and MySQL does not evaluate a negative unsigned intermediate value.

See [VALIDATION.md](VALIDATION.md) for environment and evidence boundaries. The reference SQL suite also contains a separate 120-buyer race.
