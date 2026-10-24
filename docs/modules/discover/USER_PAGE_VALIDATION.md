# Public user pages validation — 23 Oct 2026

Original standalone scope: DS-6's read-only `/u/:handle` page, including its specified Message link and own-page note. Refs [feature #17](https://github.com/Michael-wzl/CampusNote/issues/17) and [Discover #2](https://github.com/Michael-wzl/CampusNote/issues/2). The feature began at main `995b84d`, independently of Feed PR #14 and My posts PR #16. This record retains its original counts; see [combined CP1 validation](CP1_INTEGRATION_VALIDATION.md) for all three pages together.

## Implementation and SQL

`userByHandle(handle)` uses the guide's reference join to read only the needed public user/university/organization fields plus internal lookup id and status. The id is used only by the next query and ownership check; email is not selected, and neither internal id nor status is printed. Upper-case handles are lower-cased; malformed or unknown handles return 404.

`userPostIds(userId, myUniversityId, before)` uses placeholders and filters `v_live_posts` by author, `is_anonymous = 0`, shared `VISIBLE`, and `post_id < ?`, then orders descending and fetches up to 21 ids. Only the first 20 go to shared `byIds`; the extra row determines Load more. Thus even the author's own public page cannot reveal anonymous posts. The shared view excludes hidden/deleted posts.

The view reuses the shared cards, avatar, empty state, shell and layout helpers. Own/banned profiles omit Message; a banned profile still exists. The public-profile URL, shared navigation and other modules' code stay intact. All changed files belong to Discover; application code writes no tables and adds no dependency, CSS or JavaScript.

## HTTP/database checks

Node 24.19.0 and portable Oracle MySQL 8.4.13, with separate public-page development/test databases on loopback port 13378.

- `npm test -- modules/discover`: **9 pass, 0 fail, 0 TODO**.
- DS-T20/21/22: student fields, cross-university filtering, own-page anonymity/note, organization logo/name/handle/description, fallback avatar, normalized/unknown/malformed handles and banned profiles.
- Pagination: 25 named visible posts show 20 then 5 without repeats; newer anonymous, university-invisible and other-author posts do not consume slots. Exactly 20 has no next link; malformed/repeated/out-of-range cursors return page one; past-end pages use the same empty text.
- Stored bio, organization name/description and post HTML are escaped. Hidden/deleted posts are excluded even after a fixture changes them to named posts. Multiple viewers and all relevant seed profiles are covered.
- Full Windows suite: **168 cases, 161 pass, 1 fail, 6 existing TODOs**. The sole failure is the previously reproduced baseline POSIX-path assertion in `test/core/reset.test.js`; no shared file was modified. The expanded shared privacy/route contracts run against the new profile smoke paths. Existing integration TODOs remain disclosed.
- Whole-tree ESLint and Prettier (`--end-of-line auto` for the existing Windows checkout) pass. Standard Linux CI runs lint, the full application suite and SQL checks; its final result is recorded on the PR.

## Browser checks

The reusable `modules/discover/tests/user-page-browser.js` takes an existing Playwright browser and `{ baseURL, screenshotDir }` against fresh development seed data. It adds no application dependency or fixture writes.

**160 layout checks pass** in Chromium 151: Mandy, Wing, Jason, Newbie and Admin, four widths (390×844, 768×1024, 1440×900, 320×720), JavaScript on/off, four profile targets (Mandy, Film Society, Kelvin, Newbie). Checks cover images, no horizontal document overflow, correct navigation, Message/own-note rules, exact empty state and 44 px targets. Each context also checks the viewer's own profile, visible keyboard focus and actual Content author → profile, profile → post → Back, Back-to-Feed and Message-link navigation. No page script errors occurred.

Native **200% page zoom passes** for populated own, organization and empty profiles, including card → post → Back and Back-to-Feed navigation. Chrome Settings → Appearance supplied the zoom in a dedicated temporary profile; the viewport changed from 1418 CSS px / DPR 1 to 709 CSS px / DPR 2 at the same window size, with no horizontal overflow and working compact navigation. Zoom was reset afterwards.

A real JavaScript-off workflow publishes an anonymous post and confirms it is absent from the author's public page, then publishes a named post and confirms it appears. The Content author link returns to that profile; deleting both posts returns the list to empty. The shared Content page is scrolled to reach its delete action. Maximum-length unbroken student bio (160 characters), organization name (60) and description (500) fit at 320/390/768/1440 px, including the no-logo avatar fallback. A banned-profile browser check retains named posts and omits Message. Two actual Load more → post → Back workflows (JavaScript on/off) show 20 then 5 named posts with no duplicates and preserve the profile cursor.

Seed screenshots: [own phone](img/user-own-390.png), [own tablet](img/user-own-768.png), [own desktop](img/user-own-1440.png), [organization phone](img/user-org-390.png), [organization tablet](img/user-org-768.png), [organization desktop](img/user-org-1440.png), [empty phone](img/user-empty-390.png), [empty tablet](img/user-empty-768.png), [empty desktop](img/user-empty-1440.png). This is desktop Chromium evidence; physical devices and Safari/Firefox were not checked.
