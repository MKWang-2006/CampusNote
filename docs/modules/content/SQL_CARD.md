# Content SQL demonstration card

## One-slide summary

1. Lock the post row, validate the reply, reuse or allocate the alias, insert the comment, commit.
2. `FOR UPDATE` serializes first comments on one post. The identity is kept forever; the composite primary key and unique alias constraint are the final safeguards.
3. Real HTTP race: 20 students, 20 successful requests, aliases 1–20. Reference SQL race: 30 unique aliases with the lock; 28 failures without it in this run.
4. Composite foreign keys enforce both “a commenter belongs to this post” and “a reply answers a comment on this post.” Invalid inserts fail with MySQL error 1452.

The sections below contain the SQL and reproduction notes for the presenter.

## Why a first comment needs a transaction

A comment must have a participant row on the same post. A new participant must receive a unique, stable name, while the author already owns Host (alias 0). A failed comment must not consume a name. `createPost` similarly commits the post, images in positions 1–6, and Host together.

In `modules/content/queries.js`, `addComment` uses the shared `tx()` helper:

```sql
START TRANSACTION;
SELECT post_id, deleted_at FROM posts WHERE post_id = ? FOR UPDATE;
-- Check that the post is still live and an optional reply is a visible comment on this post.
SELECT alias_no FROM post_participants WHERE post_id = ? AND user_id = ?;
-- Only for a new participant:
INSERT INTO post_participants (post_id, user_id, alias_no)
SELECT ?, ?, COALESCE(MAX(alias_no), 0) + 1
FROM post_participants WHERE post_id = ?;
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body)
VALUES (?, ?, ?, ?);
COMMIT;
```

The post row is the serialization point. Two users commenting on the same post cannot allocate the next name simultaneously. Acquire this lock **before snapshot reads** so a waiting transaction sees the committed participant rows after acquiring the lock. Existing participants skip allocation; deleting comments never deletes participant rows. The lock applies to one post, not the whole comments table.

`addComment` also locks a reply target with `FOR SHARE` and checks its current deletion flag. Invalid, hidden, deleted and cross-post targets return an error without writing a participant. Exceptions roll back the transaction automatically. Notification triggers run on the comment insert; Content does not insert notifications itself.

## Database constraints behind the behavior

- `PRIMARY KEY (post_id, user_id)`: one identity per user per post.
- `UNIQUE (post_id, alias_no)`: no two users share a name on one post.
- `FOREIGN KEY (post_id, author_id) REFERENCES post_participants`: no comment without a participant.
- `FOREIGN KEY (reply_to_comment_id, post_id) REFERENCES comments(comment_id, post_id)`: a reply cannot point to another post.
- `PRIMARY KEY (post_id, position)` and `CHECK (position BETWEEN 1 AND 6)`: ordered images with no duplicate position.

Foreign keys cannot tell whether an otherwise existing comment is hidden or soft-deleted. The application therefore checks the shared view in addition to relying on the constraints.

On a **fresh disposable seed**, these two independent inserts each fail with error **1452** (also covered by `db/tests/contract_checks.sql`):

```sql
-- Newbie (user 6) has not joined post 600003, so has no participant identity.
INSERT INTO comments (post_id, author_id, body)
VALUES (600003, 6, 'No participant');

-- Mandy belongs to 600002, but comment 1 belongs to 600001.
INSERT INTO comments (post_id, author_id, reply_to_comment_id, body)
VALUES (600002, 2, 1, 'Wrong post');
```

## Observed test results (21 October 2026)

| Check | Actual outcome |
|---|---|
| HTTP: 20 new users comment on the same post at once | All 20 received 303; aliases were exactly 0–20 including Host; 20 comments |
| HTTP: the same participant submits five concurrent comments | All five received 303; no additional participant row |
| Reference SQL: 30 concurrent new users with row lock | Aliases 1–30, no errors |
| Reference SQL: same participant five times | One identity, six comments including its first comment |
| Comparison SQL without row lock | 28 of 30 transactions failed in this run; exact failure count is timing-dependent |
| Forced error after the post and first image insert | No post/image/participant rows committed; uploaded file removed; HTTP 500 |
| Full repository SQL suite | 456 PASS checks; `ALL SQL CHECKS PASSED` |

The HTTP test executes the implementation; the reference SQL race demonstrates the database idea independently. The no-lock comparison is not a production implementation and is expected to fail.

## Reproduce safely

Use dedicated development and test databases, as described in the repository README. The SQL runner **rebuilds** its `DB` target. Do not point it at a shared database.

```sh
npm test -- modules/content
# Set MYSQL to your development mysql client/connection; choose a disposable DB name.
ONLY=modules/content DB=campusnote_content_sql npm run check:sql
DB=campusnote_content_sql npm run check:sql
```

Inspect the resulting participant rows before a subsequent reset:

```sql
SELECT post_id, alias_no, COUNT(*) AS owners
FROM post_participants
GROUP BY post_id, alias_no
HAVING COUNT(*) <> 1;

SELECT post_id, MIN(alias_no) AS first_alias, MAX(alias_no) AS last_alias,
       COUNT(*) AS participants
FROM post_participants
GROUP BY post_id;
```

The first query must return no rows. For a fresh post with 20 commenters, the second shows first_alias 0, last_alias 20, participants 21.

## Other useful SQL decisions

Likes and watches use explicit insert/delete state and composite keys, so retries cannot toggle the action back. `ON DUPLICATE KEY UPDATE` preserves foreign-key errors, unlike `INSERT IGNORE`.

History uses one row per viewer/post. Visiting increments `view_count`, refreshes `last_viewed_at`, and clears `cleared_at`. Clearing history only sets `cleared_at`; the shared post view continues summing all visits. Counts remain derived from the shared views rather than duplicated counters maintained by Content.
