# CP1 My posts validation — 23 Oct 2026

Original standalone scope: DS-5's read-only `/me/posts` page. Refs [feature #15](https://github.com/Michael-wzl/CampusNote/issues/15) and [Discover #2](https://github.com/Michael-wzl/CampusNote/issues/2). The feature began at main `995b84d`, independently of Feed PR #14. This record retains its original counts; see [combined CP1 validation](CP1_INTEGRATION_VALIDATION.md) for integration with Feed and public user pages. The other three personal lists remain pending.

## Implementation and SQL

The existing URL, title, Me navigation and back link are preserved. The new `discover/my-list` view uses the shared post-list/cards and empty partials, with no new CSS, JavaScript, dependency or schema change. Application changes stay inside Discover and write no tables.

`myPostIds(userId, before)` follows the guide's tested reference query: filter `v_live_posts` by the authenticated user's author id, use `post_id < ?`, order descending and fetch at most 21 ids. The first 20 go to shared `byIds`; the extra id determines whether to show Load more. Both parameters use placeholders. Ownership implies the same author/viewer university, as documented in `queries.sql`; anonymous posts are included without changing shared anonymity rules. The shared live view excludes deleted/hidden posts.

## HTTP and database evidence

Node 24.19.0, Oracle MySQL 8.4.13; dedicated development and test databases on IPv4 loopback port 13378. No system service or project dependency was installed.

- `npm test -- modules/discover`: **8 pass, 0 fail, 0 TODO**.
- Exact seed lists for all eight personas, including CUHK/HKUST students, organizations, Admin and Newbie; Mandy gets 600013/600005/600001, Jason gets 600014/600004.
- Anonymous own posts remain unnamed on cards. Deleted/hidden posts stay absent, including after actual Content deletion and a test-only moderation fixture.
- Logged-out requests redirect to login with the return URL; extra author/user/handle parameters cannot select another user's list.
- 25 same-time posts paginate as 20 then 5 without repeats, excluding another author's newer post. Exactly 20 has no Load more. Invalid/repeated/out-of-range cursors return the first page; past-end cursors show the exact guide empty state and compose link.
- Stored HTML is escaped in shared cards; long Chinese text is retained.
- Full Windows suite: **167 cases, 160 pass, 1 fail, 6 existing TODOs**. The only failure is the previously reproduced baseline POSIX-path assertion in `test/core/reset.test.js`; Windows returns backslashes. No shared test was changed. Other integration TODOs remain owned by their existing modules.
- Whole-tree ESLint passes; Prettier passes with `--end-of-line auto` for the existing Windows checkout. GitHub Actions runs the standard Linux lint, full application tests and SQL checks; the final run is recorded on the PR.

## Browser evidence

The reusable `modules/discover/tests/my-posts-browser.js` takes an existing Playwright browser plus `{ baseURL, screenshotDir }` against fresh development seed data. It adds no application dependency or fixture writes.

**80 layout checks pass** in Chromium 151: five personas (Mandy, Wing, Jason, Newbie, Admin), four widths (390×844, 768×1024, 1440×900, 320×720), JavaScript on/off, normal and past-end states. Checks cover document overflow, responsive card columns, active Me navigation, Back, 44 px touch targets, visible keyboard focus and absence of page script errors. Real Me → My posts → post → Back and empty-list → compose links also pass.

Native **200% browser page zoom passes** for Mandy's populated list and Newbie's empty list, including card/Back, compose and Back-to-Me navigation. Chrome Settings → Appearance → Page zoom supplied the zoom in a dedicated temporary profile: a fixed window changed from a 1424 CSS px / DPR 1 viewport to 712 CSS px / DPR 2, with no horizontal overflow and compact navigation. Zoom was reset afterwards.

With JavaScript disabled, a real empty list → compose → publish → My posts → post → delete → empty list workflow passes. The anonymous post contained 750 unbroken Chinese characters; it wrapped without document overflow at 320/390/768/1440 px. Two real Load more → post → Back workflows (JavaScript on and off) show 20 then 5 own fixture posts, retain the cursor, and have no duplicate cards or further page.

Screenshots of seed data were visually inspected: [phone](img/my-posts-390.png), [tablet](img/my-posts-768.png), [desktop](img/my-posts-1440.png), and empty states at [390](img/my-posts-empty-390.png), [768](img/my-posts-empty-768.png), [1440](img/my-posts-empty-1440.png). Browser evidence uses desktop Chromium; physical devices and Safari/Firefox were not checked.
