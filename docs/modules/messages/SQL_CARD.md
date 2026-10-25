# Messages SQL card — MKWang-2006

Delivery baseline: main `f9e8f68`, synchronized 25 Oct 2026. The existing triggers and schema are retained; the application SQL and transactions below are Messages implementation work. Discover's public-profile Message entry now exercises the public context through the agreed URL, without importing Discover code.

## 1. Notification trigger: `trg_comment_notify`

The existing trigger remains in `modules/messages/db/triggers.sql`. It runs after Content inserts a comment, and only writes the Messages-owned `notifications` table.

Three talking points:

1. **One writer per table:** Content creates comments without importing Messages code; the trigger creates notifications within the same database operation.
2. **Exactly once per recipient:** notify the replied-to author, then the post author unless already considered, then watchers excluding those people and the commenter. Each recipient's `notify_comments` preference is respected.
3. **Concrete example:** seed comment 14 replies to Kelvin on Kelvin's own post 600012. Kelvin is both the replied-to author and post author, so he gets one reply notification. The complete seed produces 31 notifications: 19 comments/replies and 12 likes.

The application reads these notifications using shared visibility and comment views. It marks only notification IDs up to the loaded snapshot as read, leaving newer arrivals unread.

## 2. Conversation list: latest message plus unread count

The implementation is `listConversations` in the module's `queries.js`.

```sql
SELECT c.conversation_id, c.post_id, pp.alias_no AS other_alias_no,
       IF(c.post_id IS NULL, COALESCE(o.display_name, u.handle), NULL) AS other_public_name,
       m.body AS last_body,
       (SELECT COUNT(*) FROM messages x
         WHERE x.conversation_id = c.conversation_id
           AND x.sender_id <> ?
           AND x.message_id > COALESCE(r.last_read_message_id, 0)) AS unread
FROM conversations c
JOIN messages m ON m.conversation_id = c.conversation_id
               AND m.message_id = (SELECT MAX(x.message_id) FROM messages x
                                   WHERE x.conversation_id = c.conversation_id)
JOIN users u ON u.user_id = IF(c.starter_id = ?, c.recipient_id, c.starter_id)
LEFT JOIN organizations o ON o.user_id = u.user_id
LEFT JOIN post_participants pp ON pp.post_id = c.post_id AND pp.user_id = u.user_id
LEFT JOIN conversation_reads r ON r.conversation_id = c.conversation_id AND r.user_id = ?
WHERE ? IN (c.starter_id, c.recipient_id)
ORDER BY m.message_id DESC;
```

All four parameters above are the current user's ID. This is a presentation excerpt of the production query; its preview also returns the last timestamp, avatar for public contexts and whether the message is mine.

Three talking points:

1. **Greatest per group:** the correlated `MAX(message_id)` selects the latest message for each conversation.
2. **Unread pointers:** count only messages from the other person after my read pointer. `LEFT JOIN` plus `COALESCE(..., 0)` handles a user opening a conversation for the first time.
3. **Anonymity in the query:** public names are returned only when `post_id IS NULL`. Post conversations use a per-post alias, or Visitor; they never return a public handle or avatar for the other participant.

Fresh seed result for Mandy:

| Conversation | Display name | Last message | Unread |
| --- | --- | --- | --- |
| 1 | Visitor · #600005 | Deal. Friday 2pm at the entrance? | 1 |

Jason has no read row in conversation 2 and correctly has one unread message. The home badge adds unread notifications to unread messages: Mandy starts at `3 + 1 = 4`.

## 3. A stale tab cannot move the pointer backwards

```sql
INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
VALUES (?, ?, ?) AS new
ON DUPLICATE KEY UPDATE
  last_read_message_id = GREATEST(conversation_reads.last_read_message_id, new.last_read_message_id);
```

Creating a conversation and its first message is one transaction. Sending a message and moving my pointer is another transaction. Failed inserts roll back all related writes; concurrent first sends reuse the generated unique pair/context key.
