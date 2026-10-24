# CP1 Feed validation — 23 Oct 2026

Scope: DS-1's All, university and seven topic tabs, keyset paging, empty states and shared post cards. Refs [Michael-wzl/CampusNote#2](https://github.com/Michael-wzl/CampusNote/issues/2). This delivery does not complete DS-1 or the whole CP1: Watching/Hot and the My posts/public user pages remain pending.

## HTTP and database checks

Node 24.19.0 and portable Oracle MySQL 8.4.13 on IPv4 loopback port 13378, with separate development, test and SQL scratch databases. No system database service or project dependency was changed.

- `npm test -- modules/discover`: **9 pass, 0 fail, 0 TODO**. Covers DS-T01's CP1 tab subset, DS-T02–DS-T05, and the built-tab portions of DS-T19/DS-T26.
- Exact seed order for all three universities and seven topics; anonymous authors remain unnamed; hidden/deleted posts stay absent. Newbie/Admin are included.
- 25-post pagination for All/university/topic filters; correct next cursor and no repeated cards; exactly 20 results have no next link. Invalid, repeated and out-of-range parameters fall back safely.
- Filter-specific empty states, the empty All page's compose link, and escaped stored text are asserted.
- Full application suite on Windows: **168 cases, 161 pass, 1 fail, 6 existing TODOs**. The sole failure is `test/core/reset.test.js`: it compares a slash-delimited trigger path against Windows `path.join` output. The same test fails on an untouched archive of baseline `995b84d`; no shared test or reset code was changed. The six TODOs still await the remaining Discover/Messages integration.
- SQL suite: **456 PASS**, ending `ALL SQL CHECKS PASSED`, including alias and booking races.
- Whole-tree ESLint passes. Prettier passes both with `--end-of-line auto` in the Windows checkout and with default settings on a separate LF source snapshot containing the Feed changes. The Windows checkout has CRLF in existing files, while the default check expects LF. No shared files were reformatted. The PR's standard Linux CI must confirm the committed tree.

## Browser checks

`modules/discover/tests/browser-checks.js` accepts an existing Playwright browser and `{ baseURL, screenshotDir }`; it adds no application dependency. Run it against a fresh development seed with the existing development login shortcuts enabled.

Chromium 151 on Windows: **160 page layout checks pass**, including the usability follow-up below (five personas × four viewport widths × JavaScript on/off × four Feed states). Viewports: 390×844, 768×1024, 1440×900 and 320×720. Personas: Mandy, Wing, Jason, Newbie and Admin.

Checks include document overflow, 44 px Feed tab targets, active tab, desktop versus compact navigation, topic empty state, real topic-link navigation with JavaScript disabled, visible keyboard focus and absence of page script errors. Browser checks do not change seed data.

- [Phone](img/feed-390.png)
- [Tablet](img/feed-768.png)
- [Desktop](img/feed-1440.png)

Screenshots were visually inspected. This is desktop Chromium with viewport emulation, not physical phone, Safari or Firefox evidence.

A separate no-JavaScript workflow published a maximum-length 750-character unbroken post through the real Content form. Feed wrapping passed at 320, 390, 720, 768 and 1440 CSS px.

## Usability review follow-up

A real phone-width topic click exposed an off-screen selected filter: after choosing Food, the new page reset the horizontal tab strip to the left. Food's bounds were x=630.6–694.2 in a 390 px viewport. A module-only deferred script now scrolls that strip just enough to reveal the selection, without moving keyboard focus or vertical page position. A visible list heading identifies the current filter even without JavaScript. The 160-case browser check now asserts selected-filter visibility and the no-focus/no-page-scroll behavior. Updated screenshots reflect this change.

Native Chromium **200% page zoom passes** for All, university, Food and the Food empty state. The test selected 200% in Chrome Settings → Appearance → Page zoom inside a dedicated temporary profile. At a fixed 1440 px outer window, the CSS viewport changed from 1418 px / DPR 1 to 709 px / DPR 2. All four pages had document width equal to 709 px, usable compact navigation and no horizontal overflow. This is browser page zoom, not a substituted narrow viewport or CSS transform. The profile's zoom was reset afterwards.

Six real phone-width Load more → post → Back workflows pass: All, university and Food, each with JavaScript on and off. With 25 disposable anonymous HKU posts, each first page showed 20 cards; second pages showed 15, 12 and 7 respectively, with no repeated cards or further Load more link. Tab and cursor survived navigation and Back. CUHK/HKUST university feeds excluded those HKU fixtures, and the empty-All Write a post link reached the real compose page. Fixtures existed only in the separate development database.

## Pending module acceptance

Watching, Hot, announcements, search, personal lists and user pages are outside this Feed PR. Full DS-T01 and DS-T19/DS-T26 across all future Discover pages are not claimed as passed. No TODOs in another owner's tests were removed. No load-test benchmark is claimed in this delivery.
