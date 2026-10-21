#!/usr/bin/env bash
# Events module: the ticket release cannot oversell or double-book.
# 120 users try to book event 5 (50 tickets) at the same moment; then one user fires
# 5 bookings at once. Each client runs the bookTicket transaction from queries.sql,
# and rolls back when the UPDATE changed no row or the INSERT hit a duplicate key, as the app does.
# Run by db/tests/run_all.sh (npm run check:sql) on a fresh seeded database.
set -uo pipefail
M="${MYSQL:-mysql -uroot} --default-character-set=utf8mb4"
DB="${DB:-cn_check}"
N=120; CAP=50
$M "$DB" -e "
  SET time_zone = '+00:00';
  SET SESSION cte_max_recursion_depth = 1000;
  INSERT INTO users (user_id, email, university_id, handle, password_hash)
  WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < $N)
  SELECT 2000 + i, CONCAT('buyer', i, '@connect.hku.hk'), 1 + (i % 3), CONCAT('buyer', LPAD(i, 4, '0')), 'x' FROM n;
  INSERT INTO events (event_id, organizer_id, title, description, venue, starts_at, ends_at, release_at, capacity, tickets_left, audience)
  VALUES (5, 7, 'Race test', 'x', 'x', UTC_TIMESTAMP() + INTERVAL 1 DAY, UTC_TIMESTAMP() + INTERVAL 1 DAY + INTERVAL 1 HOUR,
          UTC_TIMESTAMP() - INTERVAL 1 SECOND, $CAP, $CAP, 'all');"

# The app: tx(async conn => { const r = await conn.query(UPDATE ...); if (r.affectedRows === 0) -> rollback 'sold out';
#                             await conn.query(INSERT ticket ...)  // ER_DUP_ENTRY -> rollback 'already booked' })
# The mysql client stops at the first error and the server rolls the open transaction back,
# which is exactly the app's rollback. The SIGNAL plays the part of "affectedRows === 0".
book_tx() {  # user_id
  $M "$DB" -e "
    SET time_zone = '+00:00';
    START TRANSACTION;
    UPDATE events e
       SET e.tickets_left = e.tickets_left - 1
     WHERE e.event_id = 5
       AND e.tickets_left > 0
       AND e.cancelled_at IS NULL
       AND e.release_at <= UTC_TIMESTAMP()
       AND e.starts_at  >  UTC_TIMESTAMP()
       AND (e.audience = 'all'
            OR (SELECT o.university_id FROM users o WHERE o.user_id = e.organizer_id)
             = (SELECT b.university_id FROM users b WHERE b.user_id = $1));
    SET @changed = ROW_COUNT();
    SELECT IF(@changed = 1, 'ok', 'sold_out') INTO @r;
    INSERT INTO tickets (event_id, user_id, ticket_code)
      SELECT 5, $1, UPPER(LEFT(REPLACE(UUID(), '-', ''), 8)) FROM DUAL WHERE @changed = 1;
    COMMIT;
    SELECT @r;" 2>&1
}

for i in $(seq 1 $N); do book_tx $((2000 + i)) > "/tmp/cn_book_$i.out" & done
wait
ok=$(cat /tmp/cn_book_*.out | grep -c '^ok$' || true)
sold=$(cat /tmp/cn_book_*.out | grep -c '^sold_out$' || true)
res=$($M --skip-column-names "$DB" -e "
  SELECT CONCAT(e.tickets_left, '/', (SELECT COUNT(*) FROM tickets t WHERE t.event_id = 5), '/',
                e.capacity - e.tickets_left = (SELECT COUNT(*) FROM tickets t WHERE t.event_id = 5))
  FROM events e WHERE e.event_id = 5")
[ "$ok" = "$CAP" ] && [ "$sold" = "$((N - CAP))" ] && [ "$res" = "0/$CAP/1" ] \
  && echo "PASS  booking race: $N buyers, $CAP tickets: exactly $CAP booked, $((N - CAP)) told sold out, counter matches tickets" \
  || echo "FAIL  booking race: ok=$ok sold_out=$sold tickets_left/tickets/consistent=$res"

# one user (Newbie, id 6), five clicks at once, on event 1 reset to 10 free tickets
$M "$DB" -e "DELETE FROM tickets WHERE event_id = 1; UPDATE events SET capacity = 10, tickets_left = 10 WHERE event_id = 1;"
for i in 1 2 3 4 5; do
  $M "$DB" -e "
    SET time_zone = '+00:00';
    START TRANSACTION;
    UPDATE events SET tickets_left = tickets_left - 1 WHERE event_id = 1 AND tickets_left > 0
       AND cancelled_at IS NULL AND release_at <= UTC_TIMESTAMP() AND starts_at > UTC_TIMESTAMP();
    INSERT INTO tickets (event_id, user_id, ticket_code) VALUES (1, 6, UPPER(LEFT(REPLACE(UUID(), '-', ''), 8)));
    COMMIT;" > "/tmp/cn_dup_$i.out" 2>&1 &
done
wait
dups=$(cat /tmp/cn_dup_*.out | grep -c "ERROR 1062" || true)
res=$($M --skip-column-names "$DB" -e "SELECT CONCAT((SELECT COUNT(*) FROM tickets WHERE event_id = 1 AND user_id = 6), '/', tickets_left) FROM events WHERE event_id = 1")
[ "$res" = "1/9" ] && [ "$dups" = 4 ] \
  && echo "PASS  double click: 5 simultaneous bookings by one user give 1 ticket; 4 rolled back (1062), counter 9 of 10" \
  || echo "FAIL  double click: tickets/left = $res, duplicate errors = $dups"
rm -f /tmp/cn_book_*.out /tmp/cn_dup_*.out
