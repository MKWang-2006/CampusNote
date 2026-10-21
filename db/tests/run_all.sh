#!/usr/bin/env bash
# Runs every SQL check in the repository against a throwaway database (npm run check:sql).
#   bash db/tests/run_all.sh                      (uses: mysql -uroot)
#   MYSQL="mysql -uroot -psecret" bash db/tests/run_all.sh
#   ONLY=modules/events DB=cn_events bash db/tests/run_all.sh   (one module, own database)
# Each check file gets a fresh database, built in the same order as npm run db:reset:
# schema -> modules' db/*.sql (triggers) -> core seed -> modules' db/seed.sql -> test helpers.
# Check files: db/tests/contract_checks.sql, every docs/modules/*/queries.sql, then the
# concurrency and plan scripts db/tests/check_*.sh and docs/modules/*/check_*.sh.
# Prints PASS/FAIL lines; exits 1 if anything failed.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MYSQL="${MYSQL:-mysql -uroot}"
DB="${DB:-cn_check}"
M="$MYSQL --default-character-set=utf8mb4"
ONLY="${ONLY:-}"     # e.g. ONLY=modules/content runs only the files whose path contains it
fail=0

fresh_db() {
  $M -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;" || exit 2
  $M "$DB" < "$ROOT/db/schema.sql" || exit 2
  local t
  for t in "$ROOT"/modules/*/db/*.sql; do
    [ -f "$t" ] && [ "$(basename "$t")" != seed.sql ] && { $M "$DB" < "$t" || exit 2; }
  done
  $M "$DB" < "$ROOT/db/seed/core.sql" > /dev/null || exit 2   # the seed ends with ANALYZE TABLE, which prints a table
  for t in "$ROOT"/modules/*/db/seed.sql; do [ -f "$t" ] && { $M "$DB" < "$t" || exit 2; }; done
  $M "$DB" < "$HERE/helpers.sql" || exit 2
}

run_file() {
  local f="$1"
  [ -n "$ONLY" ] && [[ "$f" != *"$ONLY"* ]] && return
  fresh_db
  echo "== ${f#$ROOT/}"
  local out
  out="$($M --skip-column-names "$DB" < "$f" 2>&1)"
  local rc=$?
  echo "$out" | grep -E '^(PASS|FAIL|ERROR)' || true
  if [ $rc -ne 0 ] || echo "$out" | grep -qE '^(FAIL|ERROR)'; then fail=1; fi
}

run_file "$HERE/contract_checks.sql"
for f in "$ROOT"/docs/modules/*/queries.sql; do [ -f "$f" ] && run_file "$f"; done
for f in "$HERE"/check_*.sh "$ROOT"/docs/modules/*/check_*.sh; do
  [ -f "$f" ] || continue
  [ -n "$ONLY" ] && [[ "$f" != *"$ONLY"* ]] && continue
  fresh_db
  echo "== ${f#$ROOT/}"
  out="$(MYSQL="$MYSQL" DB="$DB" bash "$f" 2>&1)"; rc=$?
  echo "$out" | grep -E '^(PASS|FAIL|ERROR|INFO)' || true
  if [ $rc -ne 0 ] || echo "$out" | grep -qE '^(FAIL|ERROR)'; then fail=1; fi
done

echo
if [ $fail -eq 0 ]; then echo "ALL SQL CHECKS PASSED"; else echo "SOME SQL CHECKS FAILED"; fi
exit $fail
