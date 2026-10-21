# Discover: user guide

The Feed and Search tabs are how you find posts. The feed shows everything you are allowed to see, newest first, with tabs for hot posts, your university and each topic. Search finds posts by their words, in English or Chinese. Your own lists (posts, watching, liked, history) and other people's public pages are here too.

Screenshots go in `docs/modules/discover/img/` when the pages are built; the placeholders below name the file each one should have.

**On a computer or phone:** Campus Notes is a responsive website. When logged in, use the left sidebar on desktop or the bottom tabs on tablets and phones. The same destinations and actions are available at every width. Feeds and search can show cards in more columns on a wider screen; topic tabs remain scrollable when needed. These instructions use “tap” for either clicking or tapping. See [the responsive layout guide](../../architecture/RESPONSIVE.md) for viewport details.

## 1. The feed

Select **Feed** in the sidebar or compact tab bar. The strip at the top has these tabs:

| Tab | Shows |
|---|---|
| 👀 | Posts you watch (the star), the most recently active first: a new comment moves a post to the top. |
| 🔥 | This week's hot posts (see §2). |
| **All** | Every post you can see, newest first. This is where the feed opens. |
| **HKU** (your university) | Posts written by people from your university. |
| **Share, Random, Feelings, Academics, Careers, Trade, Food** | Posts in that topic, newest first. |

Each card shows the post's number (such as #600012), its topic, the time, the author's university, and the numbers of likes, watches and comments. A post shows a name only when its author chose "Show my handle"; when an organization's post shows its name, that is the organization's name rather than its handle. Tap a card to open the post.

The feed shows 20 posts at a time. Tap **Load more** at the bottom for the next 20.

**Why you do not see some posts:** a post marked "My university" is shown only to students of the author's university. A student at CUHK never sees an HKU-only post, in any tab, in search or on a user page. Deleted posts and posts hidden by a moderator disappear everywhere.

*(screenshot to add: `img/feed.png`)*

## 2. Hot posts

The 🔥 tab ranks the posts of the last 7 days. Every like counts 1 point, every comment 2 and every watch 3, and a post's points are divided by its age, so a lively post from this morning beats a slightly livelier one from last week. A brand-new post gets a short moment near the top even before anyone reacts, so new posts get a chance to be seen. When two posts score the same, the newer one comes first. Deleted and hidden comments do not count.

*(screenshot to add: `img/feed-hot.png`)*

## 3. Announcements

On the **All** tab, current announcements from the Campus Notes team appear above the posts, for example "Film night this Friday". Tap one to open what it links to, such as an event where you can book a ticket. Announcements appear and disappear by themselves at the times the team set.

## 4. Searching

1. Tap **Search** in the tab bar.
2. Type one or more words and tap **Search**. You see the posts that contain **all** the words.
3. To change the order, pick **Relevance** (best match first) or **Newest**. To look in one topic only, pick it from the topic list. With JavaScript enabled the page updates as soon as you pick; otherwise press **Search**.

Tips:
- Chinese works without spaces: "叉烧" finds posts about char siu.
- Capital letters do not matter, and parts of words match: "night" also finds "midnight".
- Each word needs at least 2 characters. Punctuation is ignored, so "Dragon's Back" looks for "Dragon" and "Back".
- Only posts are searched, not comments.
- **Jump to a post:** type its number, such as `#600012` or `600012`, and the post opens directly. If you cannot see that post, the number is searched as ordinary text instead.

Before you type anything, the Search page shows a **Campus events** card (tap it to see events and book tickets) and **From organizations**: the latest posts from campus societies and offices.

*(screenshot to add: `img/search-empty.png`, `img/search-results.png`)*

## 5. Your lists

Open **Me** and pick one of these:

| List | Shows |
|---|---|
| **My posts** | Every post you wrote that is still up, newest first, including your anonymous ones. Only you see this list; others still see your anonymous posts without a name. |
| **Watching** | Posts you watch (the star), the one you starred last first. |
| **Liked** | Posts you liked (the heart), the latest first. |
| **History** | Posts you opened, the latest visit first. |

**Clear history:** at the top of History, tap **Clear history** and confirm. Your list is emptied (the posts keep their view counts). Opening a post again puts it back in your history.

If a post is deleted, hidden by a moderator, or no longer visible to you, it drops out of these lists by itself.

*(screenshot to add: `img/me-history.png`)*

## 6. User pages

Tap a name on a post that shows one to open that person's or organization's page. It shows their avatar, handle, university and bio (an organization shows its name and description), and the posts where they chose to show their handle. **Anonymous posts are never listed on anyone's page**, including yours, so nobody can link an anonymous post to you.

Tap **Message** to write to them privately. On your own page there is no Message button, and a note reminds you that only posts that show your handle appear there. A banned user's page has no Message button either.

*(screenshot to add: `img/user-page.png`)*

## 7. For admins: announcements

Admins manage announcements from **Me → Announcements**.

- The page lists announcements under **Current** (showing now), **Scheduled** (will start later) and **Expired**.
- **New announcement:** fill in the title (up to 60 characters), an optional subtitle (up to 120), an optional image, an optional link, the start and end times (Hong Kong time) and the sort order (lower numbers come first), then tap **Save**.
- The link must be a page inside Campus Notes and start with `/`, for example `/events/1` or `/feed?tab=academics`. Links to other websites are refused.
- **Edit:** tap **Edit** next to an announcement. You can change any field, upload a new image or switch on **Remove image**.
- **Delete:** on the edit page, tap **Delete** and confirm. It disappears from the feed at once.

*(screenshot to add: `img/admin-announcements.png`)*

## 8. Messages you may see

| Message | Why |
|---|---|
| Type at least 2 characters | Your search had no word of 2 or more letters or digits. |
| No posts contain all of these words. | No post you can see has every word. Try fewer words. |
| No posts yet. Be the first to write one. | The feed is empty (a new campus). |
| Tap the star on a post to watch it. | Your 👀 tab is empty. |
| Nothing is hot this week yet. | No post was written in the last 7 days. |
| You have not posted yet. / Posts you like (the heart) appear here. / Posts you open appear here. | That list of yours is empty. |
| No public posts yet. | This person has no posts that show their handle (or none you can see). |
| History cleared | You tapped Clear history. |
| This page does not exist or you cannot see it | The handle or announcement does not exist. |
| Use a link inside Campus Notes that starts with /, such as /events/1 | (Admins) The announcement link points outside the site. |
| The end must be after the start | (Admins) The announcement's end time is not after its start. |

## 9. Try it with the demo accounts

All demo accounts use the password `campus123` (in development, the login page lets you pick one).

1. Log in as **mandy0hku** (HKU). The All tab starts with #600013 and #600012, under the "Film night this Friday" banner. Tap 🔥: #600012 ("Midterm tomorrow...") is on top.
2. Still as Mandy, tap **Search**, type `library`: you find #600001. Type `叉烧`: you find #600002. Type `#600012`: the post opens.
3. Log in as **wing0cuhk** (CUHK). The feed has 7 posts and no HKU-only ones; the university tab says "CUHK". Searching `library` finds the CUHK-only #600008 instead of Mandy's HKU-only #600001.
4. As Wing, open the user page `/u/mandy0hku`: no posts are listed, because Mandy's only named post is for HKU students.
5. Log in as **newbie0hk**: Me → My posts, Watching, Liked and History are all empty.
6. Log in as **admin0000** → Me → Announcements → add one that starts now and links to `/events/1`, then open the feed: it appears above the posts.
