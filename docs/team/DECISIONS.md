# Decision register

Every decision that shapes more than one module is recorded here, with the options, the recommendation and why. **Status** is one of:

- *Asked*: waiting for Michael's final call. Work continues on the recommended option meanwhile.
- *Default*: decided by the design. Michael or the team can override it at kickoff.
- *Decided*: final. Changing it later needs a `contract-change` issue.

When a decision changes, edit its row, add a line to the change log at the bottom, and tell the owners of the affected modules in the weekly status issue.

## Decided by Michael (17 Oct 2026)

Michael chose option A, the recommendation, for all five on 17 Oct 2026. The other options stay here to show what was weighed.

### D1. Tech stack

| | Option | Consequence |
|---|---|---|
| **A (chosen)** | **Node.js + Express 5, server-rendered EJS pages, mysql2 with raw SQL, no ORM** | One language. Every page is a route plus a template, so there is no API layer to agree on and no client state to integrate. It matches the course's own web tutorial (Node, Express, mysql2, port 3000) on 26 Oct. |
| B | Python + Flask + Jinja + PyMySQL | Equally simple, but it departs from the tutorial and the earlier Campus Notes proposal. Only worth it if most members know Flask better than Express. |
| C | React single-page app + JSON API | It looks most "modern", but it doubles the work: every feature needs an API contract, client state and two sets of tests. Integration becomes the hardest week. This is wrong for a 3-week database course project. |

**Why A:** the marks are for the database (E-R diagram, SQL for key functions), not the front end. Server rendering removes the biggest integration risk, the API contract between front and back end. Raw SQL keeps every query visible for the presentation and the 18 Nov SQL injection lecture.

### D2. Who builds the backbone

The backbone is everything shared: the app skeleton, database runner, sessions, CSRF, layout and UI kit, upload handling, dev tools, test helpers, CI, and the seed data. Sign-up and login are part of it, because every module needs a logged-in user from day one.

| | Option | Consequence |
|---|---|---|
| **A (chosen)** | **Claude builds a runnable backbone (with sign-up and login) before kickoff; Michael reviews it, owns it and merges it** | Everyone starts on 22 Oct with a working app, real login, seed data and green CI. Aggregation becomes reviewing small PRs as they arrive, not a merge marathon in November. Michael spends about 4 to 6 hours reading and running it before kickoff. |
| B | Michael writes the backbone himself in week 1 | Same structure, but members cannot start real work until about 25 Oct, and Michael carries the most work during A2 and the midterm. |
| C | No backbone: each member builds a full slice, and the coordinator merges at the end | It looks like the least coordination, but it is the most: four different layouts, four login checks and four ways to query posts, all merged in the final week. This is the failure mode Michael wants to avoid. |

### D3. Event ticketing (the extension the group proposed to the teaching team)

| | Option | Consequence |
|---|---|---|
| **A (chosen)** | **Include it as a full module, owned by Michael** | It gives the strongest SQL story in the presentation (a transaction plus concurrency control, proven by a 120-buyer race) and a memorable video moment. It touches the other modules through only a few links (the Me menu, the Search page's events card, announcements, and the organizer's user page), so it adds almost no coordination. |
| B | Stretch goal: build only if the core is done by 1 Nov | Safer, but the demo then lacks its most technical moment, and Michael's own module becomes the backbone alone. |
| C | Drop it | It removes about 10 points of work, and the four-way split then becomes three feature modules plus the coordinator. |

### D4. Universities

| | Option | Consequence |
|---|---|---|
| **A (chosen)** | **HKU, CUHK and HKUST, as Triple Uni does** | The "visible to my university only / to all universities" toggle the group promised in its email then means something, and the E-R diagram gains a university entity with a multivalued attribute (e-mail domains). Demo personas from three universities show visibility working. |
| B | HKU only | Simpler, but the visibility setting has nothing left to choose between, and one of the promised features disappears. |

### D5. Interface language

| | Option | Consequence |
|---|---|---|
| **A (chosen)** | **English interface; posts can be in any language** | The markers and the video audience read every screen. Chinese posts still work, and search handles Chinese (ngram full-text index). Topic names are stored in both languages for later. |
| B | Chinese interface, like the reference app | Closest to Triple Uni, but every label in the video needs translating on the slides. |
| C | Bilingual (switch in Settings) | Every page needs two strings. It adds about 1 point per module for little marking value. |

## Defaults (decided by the design, can be overridden at kickoff)

| ID | Decision | Why | Affects |
|---|---|---|---|
| D6 | **Four feature modules, one per member**: content, discover, messages, events. Identity is built with the backbone. | Each member owns one folder, a set of tables and a set of URLs; nobody edits anyone else's files. See `WORK_DIVISION.md`. | everyone |
| D7 | **Michael is the coordinator** and owns the backbone, identity and events. | He is the most experienced member and the one who will aggregate. Owning the shared code means he reviews every change to it. | everyone |
| D8 | **Three unclaimed roles: Member 1 — Content; Member 2 — Discover; Member 3 — Messages.** Every teammate chooses their own role. | Background information informed the split; it does not assign work to people. Claim one role using `START_HERE.md`. | team |
| D9 | **Every table has exactly one writer module**; others only read. Cross-module side effects use database triggers owned by the module that needs them. | This removes the main source of integration bugs: two modules updating the same row with different rules. | everyone |
| D10 | **Display rules live in shared views** (`v_live_posts`, `v_post_cards`, `v_comment_items`). | Deletion, hiding and anonymity are applied in one place, so no page can leak an anonymous author by accident. | content, discover, messages |
| D11 | **Posts cannot be edited**, only deleted (soft delete). | Same as the reference app. It removes image re-ordering, which fails on MySQL under `UNIQUE (post, position)` unless done carefully, because MySQL checks the unique key row by row, so swapping two positions in one `UPDATE` collides halfway through. | content |
| D12 | **Anonymous by default, with per-post aliases**: the author is "Host", and commenters are Alice, Bob, ... in order of their first comment on that post. | It matches the reference app, and the alias assignment is a good concurrency showcase (row lock). | content, messages |
| D13 | **One topic per post** (Share, Random, Feelings, Academics, Careers, Trade, Food). The "tags" in the group's email are these topics. | It matches the reference app's required topic chips. Free-form hashtags would add a table and a moderation problem for little demo value. | content, discover |
| D14 | **"Watch" (the star) is the saved-posts feature**: it saves the post to My watching and subscribes to its comments. Likes are separate and feed the hot ranking. | The group's email promised both likes and saved posts; the reference app's star does both saving and following. | content, discover, messages |
| D15 | **E-mail codes go to a dev mailbox page** (`/dev/mailbox`) by default; real SMTP is used only when `SMTP_URL` is set. | Markers and teammates can run the app without mail credentials, and the video can still show a real code arriving. | identity |
| D16 | **Times are stored in UTC and shown in Hong Kong time.** Every connection runs `SET time_zone = '+00:00'`. | Members' laptops may be set to different time zones. Without this, `DEFAULT CURRENT_TIMESTAMP` would store local time. | everyone |
| D17 | **Full-text search uses MySQL's ngram parser with stopwords off.** | It searches Chinese and English. With stopwords on, English words containing "a", "i" or "in" become unsearchable (tested: "main" returned nothing). | discover |
| D18 | **Lists load in two steps**: page through `v_live_posts` for 20 ids, then load the cards by id. | Measured with 20,000 posts: 3 ms per page instead of 400 to 760 ms. MySQL cannot merge a view that has subqueries in its select list. | discover, content |
| D19 | **Public GitHub repository: Michael-wzl/CampusNote**, as requested by Michael on 21 Oct. | The team can clone one shared project. Local credentials, course materials, conversation history and original-app reference screenshots are excluded. Protect `main` with CI and code-owner reviews. | everyone |
| D20 | **One synchronous meeting** (kickoff, Thu 22 Oct). Everything else is asynchronous on GitHub: issues, PRs and a Sunday status comment. | This is the least-communication requirement. The docs answer the questions a meeting normally would. | everyone |
| D21 | **Node 22 LTS or later, MySQL 8.0.19 or later** (8.4 LTS recommended). CI uses MySQL 8.4. | The schema uses CHECK constraints (8.0.16) and REGEXP_LIKE; messages uses `INSERT ... AS new ON DUPLICATE KEY UPDATE` (8.0.19). Tested on 8.0.46. | everyone |
| D22 | **Desktop-first responsive website**, approved by Michael on 21 Oct. Desktop has a sidebar and wider content; phones keep one column and bottom tabs. | One shared server-rendered app adapts by CSS viewport width. Modules reuse the layout and pass 390 / 768 / 1440 px browser checks; see [RESPONSIVE.md](../architecture/RESPONSIVE.md). | everyone |

## Change log

| Date | Change |
|---|---|
| 2026-10-16 | Register created with the design pack. D1 to D5 asked; D6 to D21 set as defaults. |
| 2026-10-17 | Michael decided D1 to D5: option A for each. |

### 21 Oct 2026 handoff update

- D8 replaced: all three teammate roles are self-selected and initially unclaimed.
- The public repository is [Michael-wzl/CampusNote](https://github.com/Michael-wzl/CampusNote); it contains the app and design documentation, with original-app reference screenshots kept local.
- D22 replaces the fixed phone-width layout with a desktop-first responsive website.
- Codex now maintains the local workspace. The earlier Claude decisions remain project history.

### Role claims, 21 Oct 2026

Catherine135 self-selected Content (issue #1); hX1-dev self-selected Discover (issue #2). Messages remains unclaimed. The coordinator records role claims and invites accounts; no name-only PR is required. D8 describes the original unclaimed role options, not the current availability.
