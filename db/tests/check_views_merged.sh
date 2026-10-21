#!/usr/bin/env bash
# RULE 3 in schema.sql: v_live_posts and v_comment_items must be MERGED into each query
# (MySQL inlines them), so a page reads 20 rows by index instead of building the view first.
# A view stops being mergeable if someone adds GROUP BY, DISTINCT, UNION, LIMIT or a
# subquery in its select list. v_post_cards is materialised on purpose and must only be
# read by post_id; this checks that such a read touches only the requested rows.
set -uo pipefail
M="${MYSQL:-mysql -uroot} --default-character-set=utf8mb4"
DB="${DB:-cn_check}"
check_merged() {  # name, query
  local plan; plan="$($M "$DB" -e "EXPLAIN $2")"
  if echo "$plan" | grep -q "DERIVED"; then echo "FAIL  $1 (materialised)"; echo "$plan"; else echo "PASS  $1"; fi
}
check_merged "views: feed page step 1 (v_live_posts) is merged" \
  "SELECT p.post_id FROM v_live_posts p WHERE (p.visibility = 'all' OR p.author_university_id = 1) AND p.post_id < 600013 ORDER BY p.post_id DESC LIMIT 20"
check_merged "views: comment thread (v_comment_items) is merged" \
  "SELECT * FROM v_comment_items WHERE post_id = 600012 ORDER BY comment_id"
plan="$($M "$DB" -e "EXPLAIN SELECT * FROM v_post_cards WHERE post_id IN (600001, 600012)")"
if echo "$plan" | grep "DERIVED" | head -1 | grep -qE "range|const|eq_ref"; then
  echo "PASS  views: v_post_cards read by id pushes the id filter down (reads only those posts)"
else
  echo "FAIL  views: v_post_cards read by id scans posts"; echo "$plan"
fi
