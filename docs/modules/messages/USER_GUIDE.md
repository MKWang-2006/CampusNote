# Messages: user guide

The **Messages** tab is your inbox. It tells you when people react to your posts and comments, lets you talk privately with another student, and is where you report posts or comments that break the rules. Admins also use it to review reports.

Screenshots go in `docs/modules/messages/img/` when the pages are built; the placeholders below name the file each one should have.

## 1. The Messages tab

The number on the **Messages** tab is everything you have not seen yet: new notifications plus unread private messages. It disappears when you have read everything. Pages refresh when you open them; there is no live push, so open the tab again to check for news.

Tap the tab to see:

- **Notifications** at the top, with the number of new ones.
- **Your conversations** below, the most recent first. Each shows who you are talking to, the last message ("You: ..." if it was yours), when it was sent, and a red number for unread messages.

If you have not talked to anyone yet, you see "No conversations yet."

*(screenshot to add: `img/messages-home.png`)*

## 2. Notifications

Open **Messages → Notifications**. You are told when:

| You see | It means |
|---|---|
| Alice commented on your post #600012: “...” | Someone commented on a post you wrote. |
| Alice replied to your comment on #600012: “...” | Someone answered one of your comments. |
| Alice commented on #600004, which you watch: “...” | Someone commented on a post you saved with the star. |
| Your post #600004 got a like | Someone liked your post. You are not told who. |
| This post is no longer available | The post was deleted by its author or hidden by a moderator. |

- People appear under their **alias on that post** (Host for the post's author, then Alice, Bob, Carol, ...), exactly as in the comment thread. Notifications never reveal who someone is.
- You are told about each comment once, even if it is a reply to you on a post you also watch, and never about your own comments.
- Liking, unliking and liking again only tells the author once.
- New notifications are highlighted. Opening the list marks them all as read.
- Tap a notification to jump to that comment on the post.
- If a comment was deleted or hidden after the notification, it shows "[deleted]" or "[hidden by a moderator]" instead of the text.
- Don't want them? **Me → Settings** has switches for comment notifications and like notifications.

*(screenshot to add: `img/notifications.png`)*

## 3. Private messages

### Starting a conversation

| From | Tap | You talk to | Names shown |
|---|---|---|---|
| A post | **Message the host** | the post's author | You both stay anonymous: they are "Host"; you are your alias on that post, or "Visitor" if you never commented there. |
| A comment | **Message** on that comment | the person who wrote it | Their alias on that post (such as "Alice"); you are your alias there, or "Visitor". |
| A user's page | **Message** | that user | Handles (or the organization's name), on both sides. |

Write your first message and tap **Send**. The page tells you how you will appear ("You will appear as Visitor", or "They will see your handle") before you send anything.

- If you already have a conversation with that person about the same post (or by handle), you go straight back to it: there is only one conversation per pair of people per post, plus one by handle.
- A conversation about a post and a conversation by handle with the same person are separate, so nobody can work out which handle is behind an alias.
- You can only message about posts you can see.

*(screenshot to add: `img/new-message.png`)*

### Talking

Open a conversation from **Messages**. Your messages are on the right, theirs on the left, each with its time. The top shows who you are talking to and, for a conversation about a post, a link to the post and how you appear ("You appear as Host"). Opening a conversation marks it as read. Messages can be up to 1,000 characters. Only the two of you can read or write in it.

*(screenshot to add: `img/conversation.png`)*

### Blocking a conversation

Don't want to hear from someone in a conversation any more? Tap **Block** under the message box, in any conversation (about a post or by handle). From then on **neither of you can send messages in that conversation**: you see "You blocked this conversation. Unblock to reply." with an **Unblock** button, and they see "You can no longer reply in this conversation." Messages already sent stay, and you can still read them.

- Only you can lift your block. If the other person blocked the conversation too, it stays closed until they unblock as well.
- A block covers **that one conversation only**. Your other conversations are not affected, including other conversations with the same person (about another post, or by handle), and they could still start a new one there. This is on purpose: a block that followed a person everywhere would let people test which handle is behind an alias, and anonymity comes first.
- If someone is abusive, block the conversation and report their posts or comments (section 4).

Blocking may arrive after the first version of the app.

*(screenshot to add: `img/blocked.png`)*

## 4. Reporting a post or comment

See something that breaks the rules? On the post, tap **Report** (for the post) or **Report** under a comment.

1. Pick a reason: **Spam**, **Harassment**, **Privacy** (it reveals personal information) or **Other**.
2. Optionally add details (up to 300 characters).
3. Tap **Send report**. You see "Thanks. A moderator will review it."

You can report each post or comment once. You cannot report your own. The person you report is not told who reported them.

*(screenshot to add: `img/report.png`)*

## 5. For admins: the report queue

Open **Me → Reports**.

- **Open reports** lists each reported post or comment once, oldest first, with how many people reported it, their reasons and details, the text (even if the author has since deleted it) and the author's handle, so you can spot repeat offenders.
- **Hide** removes the post or comment for everyone and closes every report on it. A hidden post disappears from every list and its page no longer opens; a hidden comment keeps its place in the thread as "[hidden by a moderator]".
- **Dismiss** closes the reports without hiding anything.
- **Hidden content** lists everything currently hidden, with the reason and who hid it. **Restore** brings it back for everyone; its reports stay closed.

*(screenshot to add: `img/admin-reports.png`)*

## 6. Messages you may see

| Message | Why |
|---|---|
| This post is no longer available | (Notifications) The post was deleted or hidden. |
| You cannot message yourself | The post, comment or page you started from is your own. |
| This page does not exist or you cannot see it | The post is not visible to you, it was deleted or hidden, the user does not exist, or the conversation is not yours. |
| Your message cannot be blank / Your message is too long (at most 1000 characters) | Messages need 1 to 1,000 characters. |
| Thanks. A moderator will review it. | Your report was sent. |
| You have already reported this | One report per person per post or comment. |
| You cannot report your own post / You cannot report your own comment | Reports are for other people's content. |
| Pick a reason | A report needs a reason. |
| You blocked this conversation. Unblock to reply. | You blocked this conversation; nobody can send in it until you unblock it. |
| You can no longer reply in this conversation. | The other person blocked this conversation. |
| Blocked. Nobody can send messages here until you unblock it. / Unblocked. | What your block or unblock did. |
| Hidden. 2 reports resolved. / Dismissed. 1 report resolved. / Restored. | (Admins) What your action did. |

## 7. Try it with the demo accounts

All demo accounts use the password `campus123` (in development, the login page lets you pick one).

1. Log in as **mandy0hku**: the Messages tab shows **4** (3 new notifications and 1 unread message). Open **Notifications**: the three newest, at the top, are highlighted: "Host replied to your comment on #600012" and two "which you watch" rows about #600012. Go back: the Notifications count is gone and the tab shows 1.
2. Still as Mandy, open the conversation "Visitor · #600005": a student is asking about her textbook. She cannot see who it is, only "Visitor". Reply "Friday 2pm works."
3. Log in as **kelvin0hk**: the conversation shows "Host · #600005" with Mandy's new reply unread.
4. Log in as **newbie0hk** → Feed → open #600001 → **Message the host** → send a question. Log back in as Mandy: a new conversation "Visitor · #600001" is at the top.
5. Log in as **wing0cuhk** → open #600012 → **Message** on Alice's comment: Wing appears as "Bob", Mandy as "Alice". Try `/messages/new?post=600001` as Wing: the HKU-only post is not found.
6. Log in as **newbie0hk** → open #600007 → **Report** → Spam → **Send report**.
7. Log in as **admin0000** → Me → **Reports**: #600007 has 2 reports and shows its author's handle. Tap **Hide**: the post disappears for everyone. Under **Hidden content**, **Restore** would bring back the spam post #600010; its old report stays closed.
8. Log in as **mandy0hku** → Messages → the conversation "Visitor · #600005" → **Block**: the message box is replaced by "You blocked this conversation. Unblock to reply.", while her conversations from steps 4 and 5 work as before. Log in as **kelvin0hk**: the conversation says "You can no longer reply in this conversation." Back as Mandy, tap **Unblock**.
