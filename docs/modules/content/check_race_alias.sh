#!/usr/bin/env bash
# Content module: aliases stay unique and gap-free when many people comment at once.
# 30 new users comment on post 600003 at the same moment, then one user comments 5 times
# at once. Each client runs the same statements as the addComment block of queries.sql.
# Run by db/tests/run_all.sh (npm run check:sql) on a fresh seeded database.
set -uo pipefail
M="${MYSQL:-mysql -uroot} --default-character-set=utf8mb4"
DB="${DB:-cn_check}"
N=30
$M "$DB" -e "
  SET SESSION cte_max_recursion_depth = 1000;
  INSERT INTO users (user_id, email, university_id, handle, password_hash)
  WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < $N)
  SELECT 1000 + i, CONCAT('race', i, '@connect.hku.hk'), 1, CONCAT('race', LPAD(i, 5, '0')), 'x' FROM n;"

comment_tx() {  # user_id, with_lock(1/0)
  local lock=""; [ "$2" = 1 ] && lock="SELECT post_id FROM posts WHERE post_id = 600003 FOR UPDATE;"
  $M "$DB" -e "
    SET time_zone = '+00:00';
    START TRANSACTION;
    $lock
    SELECT alias_no INTO @alias FROM post_participants WHERE post_id = 600003 AND user_id = $1;
    INSERT INTO post_participants (post_id, user_id, alias_no)
      SELECT 600003, $1, COALESCE(MAX(alias_no), 0) + 1 FROM post_participants
      WHERE post_id = 600003 AND @alias IS NULL
      HAVING @alias IS NULL;
    DO SLEEP(0.05);
    INSERT INTO comments (post_id, author_id, body) VALUES (600003, $1, 'race comment');
    COMMIT;" 2>&1
}

# --- 1. with the row lock (the design): every comment succeeds, aliases 1..30
for i in $(seq 1 $N); do comment_tx $((1000 + i)) 1 > "/tmp/cn_alias_$i.out" & done
wait
errors=$(cat /tmp/cn_alias_*.out | grep -c ERROR || true)
res=$($M --skip-column-names "$DB" -e "
  SELECT CONCAT(COUNT(*), '/', MIN(alias_no), '/', MAX(alias_no), '/', COUNT(DISTINCT alias_no))
  FROM post_participants WHERE post_id = 600003 AND user_id > 1000")
comments=$($M --skip-column-names "$DB" -e "SELECT COUNT(*) FROM comments WHERE post_id = 600003")
[ "$errors" = 0 ] && [ "$res" = "$N/1/$N/$N" ] && [ "$comments" = "$N" ] \
  && echo "PASS  alias race: $N simultaneous first comments got aliases 1..$N, no errors" \
  || echo "FAIL  alias race: errors=$errors participants(count/min/max/distinct)=$res comments=$comments"

# --- 2. the same user five times at once: still one alias
for i in 1 2 3 4 5; do comment_tx 1001 1 > "/tmp/cn_alias_same_$i.out" & done
wait
res=$($M --skip-column-names "$DB" -e "SELECT CONCAT(COUNT(*), '/', (SELECT COUNT(*) FROM comments WHERE author_id = 1001)) FROM post_participants WHERE post_id = 600003 AND user_id = 1001")
[ "$res" = "1/6" ] && echo "PASS  alias race: one user commenting 5 times at once keeps one alias" \
  || echo "FAIL  alias race: same user participants/comments = $res"

# --- 3. for the slide: the same race WITHOUT the lock fails (informational, not a check)
$M "$DB" -e "DELETE FROM comments WHERE post_id = 600003; DELETE FROM post_participants WHERE post_id = 600003 AND user_id > 1000;"
for i in $(seq 1 $N); do comment_tx $((1000 + i)) 0 > "/tmp/cn_alias_nolock_$i.out" & done
wait
nolock_err=$(cat /tmp/cn_alias_nolock_*.out | grep -c "ERROR" || true)
echo "INFO  without FOR UPDATE: $nolock_err of $N transactions failed (duplicate alias or deadlock)"
cat /tmp/cn_alias_nolock_*.out | grep ERROR | sed 's/ at line [0-9]*//' | sort | uniq -c | sed 's/^/INFO    /'
rm -f /tmp/cn_alias_*.out
