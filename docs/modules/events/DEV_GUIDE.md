# Events module: developer guide

**Implementation status, 21 October 2026:** EV-1 to EV-7 are built; 23 module tests pass, and the 200-buyer HTTP race passed three times. See [VALIDATION.md](VALIDATION.md) and [SQL_CARD.md](SQL_CARD.md). The build plan below is the acceptance contract and original milestone plan.

| | |
|---|---|
| **Owner** | Michael (coordinator) |
| **Folder** | `modules/events/`, `scripts/demo-race.js`, `docs/modules/events/` |
| **Features** | EV-1 to EV-7 (`PRODUCT_SPEC.md` §4) |
| **Read first** | `ARCHITECTURE.md` §1, §5, §6, §9; `PRODUCT_SPEC.md` BR-16 and BR-17; [responsive layout](../../architecture/RESPONSIVE.md); this guide |
| **Tested SQL** | `queries.sql` (this folder) and `check_race_booking.sh` |

You can build this module without knowing the rest of the app. Everything you need from other modules is listed in §3.

## 1. The module in one paragraph

Campus organizations (and admins) publish events with a fixed number of free tickets that go on sale at a set release time, such as "Film night, 50 tickets, on sale Thursday 10:00". Students see upcoming events they are allowed to attend, watch a countdown, and book one ticket each. Under any load the event never sells more tickets than its capacity and nobody gets two. Organizers manage their events and check attendees in at the door. This is the project's concurrency showcase, and its race demo is the video's last scene.

## 2. What you own

**Tables you write:** `events`, `tickets`. **Tables you read:** `users` (organizer, audience check, attendee handles), `organizations` (display names), `universities`.

**Routes** (from `WORK_DIVISION.md` §3):

| Method | Path | Who | Feature |
|---|---|---|---|
| GET | `/events` | everyone; `?mine=1` for organizers | EV-1, EV-6 |
| GET | `/events/:id` | everyone who may see it | EV-2 |
| POST | `/events/:id/book` | students, organizations, admins | EV-3 |
| POST | `/events/:id/cancel-booking` | ticket holder | EV-4 |
| GET | `/me/tickets` | everyone | EV-5 |
| GET, POST | `/events/new` | organization, admin | EV-6 |
| GET, POST | `/events/:id/edit` | the event's organizer | EV-6 |
| POST | `/events/:id/cancel` | the event's organizer | EV-6 |
| GET | `/events/:id/attendees` | the event's organizer, admin | EV-6 |
| POST | `/events/:id/check-in` | the event's organizer, admin | EV-6 |


**Manifest** (`modules/events/index.js`):

```js
module.exports = {
  name: 'events',
  router: require('./routes'),
  smoke: ['/events', '/events/1', '/events/2', '/me/tickets'],
};
```

## 3. Contracts

**You rely on** the backbone: `q`, `tx`, `isDuplicate` (`core/db`), `req.me` and `requireRole` (`core/auth`), `res.page` and `res.done` (`core/render`), `notFound`, `forbidden`, `badRequest` (`core/errors`), `uploads.images` for the optional cover, `text`, `int`, `oneOf` (`core/validate`), and the partials `empty`, `field`, `menu`, `confirm-dialog`. Use `ui.hkt`, `ui.timeAgo` and `ui.countdownAttr` for times. From discover you rely on one URL only: the organizer's name on the event page links to its user page `/u/<handle>` (`WORK_DIVISION.md` §4 row 14).

**Others rely on you for:**
- `/events`, `/events/:id`, `/me/tickets`, `/events/new` and `/events?mine=1` existing (linked from the Me menu, the Search page and announcements).
- Nothing else. No other module reads `events` or `tickets`.

**Seed data for you** (`DATA_MODEL.md` §5): event 1 Film night (on sale, 48 of 50 left, Mandy and Kelvin hold tickets); event 2 Dragon's Back (capacity 2, sold out, Wing and Jason); event 3 Director Q&A (HKU only, opens 2 hours after the reset); event 4 Lion Rock (past, Wing checked in). Organizers: `filmsoc00` (events 1, 3) and `hikeclub0` (events 2, 4). Newbie (`newbie0hk`) has no ticket.

## 4. Build plan

| By | Tasks |
|---|---|
| CP1, Sun 25 Oct | `index.js`, `routes.js`, `queries.js` with `listEvents` and `getEvent`; the list and event pages render the seed (read-only); `/me/tickets` lists tickets. |
| CP2, Sun 1 Nov (Must) | EV-1, EV-2 (with countdown), EV-3 booking, EV-5, EV-7 race script; tests EV-T01 to EV-T10, EV-T12, EV-T19. |
| Fri 6 Nov (Should) | EV-4 cancel booking, EV-6 organizer pages (create, edit, cancel, attendees, check-in); remaining tests; USER_GUIDE screenshots; `SQL_CARD.md`. |
| Could | An "Add to calendar" `.ics` download on the event page. |

## 5. Features

### Responsive page layout (every feature)

Use responsive card grids for events, tickets and the organizer dashboard where suitable. Event details and booking information may sit side by side on desktop and stack in source order on phones. Event forms use `form-width`; attendee tables use `table-wrap` with local horizontal scrolling. Read [RESPONSIVE.md](../../architecture/RESPONSIVE.md) before adding page CSS. Do not create another sidebar/bottom bar or use a fixed 480 px page width. Keep module CSS under `modules/events/public/` and scope selectors to this module.

### EV-1 Events list: `GET /events` (Must)

- Top bar "Events", `tab: null`, `back: '/search'`.
- One card per event from `listEvents(me.userId, me.universityId)`: cover (or a calendar icon), title, organizer name, venue, start time (`ui.hkt`), and a status chip:

  | status | Chip text | Extra |
  |---|---|---|
  | `on_sale` | On sale · 48 left | |
  | `sold_out` | Sold out | |
  | `upcoming` | Opens in 01:59:30 | live countdown (`ui.countdownAttr(release_at)`) |
  | `in_progress` | Happening now | |
  | `ended` | Ended | not in this list, which leaves out events that have ended; shown on the event page (EV-2) and in `?mine=1` |
  | `cancelled` | Cancelled | |

  A "Booked" tick when `booked_by_me`.
- `?mine=1` (organizations and admins): their own events including ended and cancelled ones, newest first, each with "sold / capacity" and "checked in" from `listMyEvents` (the `organizerStats` block in `queries.sql`), and a "New event" button.
- Empty state: "No upcoming events yet."
- Rules: BR-16 audience (an event for one university is listed only to that university's users and its organizer).

### EV-2 Event page: `GET /events/:id` (Must)

- `getEvent(id, me.userId, me.universityId)`; no row means 404 (not 403, so a hidden event does not reveal it exists).
- Shows cover, title, organizer (linking to `/u/<handle>`), venue, start and end (HKT), description (escaped, line breaks kept), "Tickets: 48 of 50 left", the audience ("HKU members only" or "Open to all universities").
- The action area depends on state:

  | State | Shows |
  |---|---|
  | I hold a ticket | "Your ticket" with the code in large type, booked time, and "Cancel booking" (with `data-confirm`) while the event has not started |
  | `upcoming` | Countdown to the release; when it reaches zero, `kit.js` fires `countdown:done` and the page reloads to show the Book button |
  | `on_sale` | A `btn btn-cta` "Book a ticket" button (POST `/events/:id/book`) |
  | `sold_out`, `in_progress`, `ended`, `cancelled` | The status chip, no button |
- For the event's organizer: "Edit", "Attendees" and "Cancel event" links. For an admin who is not the organizer: "Attendees" only, because editing and cancelling are the organizer's (EV-6).

### EV-3 Book a ticket: `POST /events/:id/book` (Must)

Run `bookTicket` (`queries.sql`) in one `tx()`:

1. The conditional `UPDATE events ... SET tickets_left = tickets_left - 1 WHERE ... tickets_left > 0 AND release_at <= now AND starts_at > now AND cancelled_at IS NULL AND audience ok`.
2. If it changed 0 rows, return `{ ok: false }` and, outside the transaction, re-read the event to explain why. Each answer has a message and a JSON `reason` code: "Sold out" (`sold_out`), "Tickets go on sale at 10:00" (`not_open`), "Booking has closed" (`closed`, the event has started) and "This event was cancelled" (`cancelled`); a user who may not see the event gets 404.
3. Otherwise insert the ticket with a new code. On `isDuplicate(err)` for the primary key, the `tx()` rolls back and the answer is "You already have a ticket" (`already_booked`). On a duplicate `ticket_code` (rare), retry once with a new code.

Ticket codes: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0, O, 1 or I), using `crypto.randomInt`.

Finish with `res.done({ to: '/events/' + id, json: { ok, reason, ticketsLeft, code }, flash })`; success flash: "Booked. Your ticket code is FN7Q2K9A." On success `reason` is null. The race demo (EV-7) counts the replies by these `reason` codes.

Why this is safe: the UPDATE takes the event row's lock, so concurrent bookings run one after another, and each re-checks `tickets_left > 0`. Never "SELECT the count, then INSERT": two requests can both see one ticket left. Proven by `check_race_booking.sh` and EV-T10.

### EV-4 Cancel my booking: `POST /events/:id/cancel-booking` (Should)

`cancelBooking` in one `tx()`: lock the event row first (`SELECT ... FOR UPDATE`, same lock order as booking, so the two never deadlock), refuse if the event has started or was cancelled, delete my unchecked ticket, and if a row was deleted add one to `tickets_left`. Flash "Booking cancelled".

### EV-5 My tickets: `GET /me/tickets` (Must)

Top bar "My tickets", `tab: 'me'`, `back: '/me'`. `myTickets(me.userId)`: upcoming first (soonest first), then past ones. Each shows the event title, start time, the code, and "Checked in" or "Cancelled" where true; each links to the event page. Empty state: "No tickets yet" with a button to `/events`.

### EV-6 Organizer pages: `/events/new`, `/events/:id/edit`, `POST /events/:id/cancel`, `GET /events/:id/attendees`, `POST /events/:id/check-in`, `GET /events?mine=1` (Should)

- **Create** (`/events/new`, `requireRole('organization', 'admin')`): fields title (≤ 80), description (≤ 2,000), venue (≤ 120), starts, ends, release (HTML `datetime-local`, read as Hong Kong time and stored as UTC), capacity (1 to 5,000), audience (my university or all), optional cover (one image through `uploads.images({ field: 'cover', max: 1 })`, so the form is multipart and posts to `csrfUrl('/events/new')`, `ARCHITECTURE.md` §6.8; a refused file arrives as `req.uploadError`, shown under the cover field like any other error, and a saved cover is removed again with `uploads.remove` when another field fails). Errors shown under each field, status 400, with the other fields kept. Ends after starts; release before starts (a release in the past means on sale immediately). `tickets_left` starts at `capacity`.
- **Edit** (`/events/:id/edit`, organizer only, else 404): same form. Capacity may not go below tickets sold ("12 tickets are already booked"). Assign `tickets_left` **before** `capacity` in the UPDATE (MySQL assigns left to right; see the gotcha in `queries.sql`). The implementation uses `tickets_left = new_capacity - (capacity - tickets_left)` to avoid a negative unsigned intermediate during valid capacity reductions.
- **Cancel** (`POST /events/:id/cancel`): sets `cancelled_at`; tickets stay as a record; booking is then refused.
- **Attendees** (`/events/:id/attendees`, organizer or admin, else 404): table of handle, university, code, booked time, checked-in time; a "Check in by code" form (`POST /events/:id/check-in`, body `code`), which answers "Checked in: wing0cuhk", "Already checked in at 19:02" or "No ticket with that code".
- **My events** (`/events?mine=1`): see EV-1.

### EV-7 Race demo: `npm run demo:race` (Must)

`scripts/demo-race.js`, run against a running dev server: `node scripts/demo-race.js --event 1 --buyers 200 --tickets 50 --delay 5`.

1. With direct SQL (a dev tool, like the seed): delete the event's tickets, set `capacity = tickets_left = 50` and `release_at = now + 5 s`; create 200 users `racer0001` to `racer0200` (e-mails `racer0001@connect.hku.hk` and so on, HKU) if missing. Handles must have exactly 9 characters (`ck_user_handle`). `DATA_MODEL.md` §3 allows these direct writes.
2. Log each in through `/dev/login-as/<handle>` with its own cookie jar and read its CSRF token from the event page (`<meta name="csrf-token">`).
3. Print a countdown; at the release time fire all 200 `POST /events/1/book` requests at once (with `Accept: application/json`).
4. Print: booked, sold out, other errors, `tickets_left`, the ticket count, and "OVERSOLD: no" from the invariant query.

Expected output: `booked 50, sold out 150, errors 0, tickets_left 0, tickets 50, oversold: no`.

## 6. `queries.js`

Each function corresponds to a block in `queries.sql`; `@variables` become `?` in the same order.

| Function | Returns | Used by |
|---|---|---|
| `listEvents(userId, universityId)` | rows with `status`, `booked_by_me` | EV-1 |
| `listMyEvents(organizerId)` | rows with `sold`, `checked_in`, `counter_ok` (the `organizerStats` block) | EV-1, EV-6 |
| `getEvent(eventId, userId, universityId)` | one row or null | EV-2 and every POST |
| `bookTicket(eventId, userId, universityId)` | `{ ok, code }` | EV-3 |
| `cancelBooking(eventId, userId)` | `{ ok, reason }` | EV-4 |
| `myTickets(userId)` | rows | EV-5 |
| `createEvent(organizerId, fields)` | new id | EV-6 |
| `updateEvent(eventId, organizerId, fields)` | `affectedRows` | EV-6 |
| `cancelEvent(eventId, organizerId)` | `affectedRows` | EV-6 |
| `attendees(eventId, organizerId, isAdmin)` | rows | EV-6 |
| `checkIn(eventId, code, organizerId, isAdmin)` | `{ handle, checkedInAt, already }` or null | EV-6 |

## 7. Tests (`modules/events/tests/`)

Call `before(resetDb)` in each file. Personas are in `DATA_MODEL.md` §5.

| ID | Feature | Test |
|---|---|---|
| EV-T01 | EV-1 | As `mandy0hku`, `/events` lists events 1, 2, 3 in start order with "On sale", "Sold out" and "Opens in"; event 4 (past) is absent. |
| EV-T02 | EV-1 | As `wing0cuhk`, `/events` lists 1 and 2 only. |
| EV-T03 | EV-2 | As `wing0cuhk`, `/events/3` answers 404. |
| EV-T04 | EV-2 | As `mandy0hku`, `/events/3` shows a `data-countdown` element and no Book button; `/events/1` shows her code `FN7Q2K9A` and "Cancel booking". |
| EV-T05 | EV-3 | `newbie0hk` books event 1: 303 to `/events/1`; the page shows a code; `tickets_left` is 47. |
| EV-T06 | EV-3 | Booking event 1 again: "You already have a ticket"; `tickets_left` still 47; one ticket row. |
| EV-T07 | EV-3 | `newbie0hk` books event 2: "Sold out"; no ticket row. |
| EV-T08 | EV-3 | `newbie0hk` books event 3 before release: "Tickets go on sale at ..."; with `newbie.json('/events/3/book', {})` (`ARCHITECTURE.md` §10) the reply is `{ ok: false, reason: 'not_open' }`. |
| EV-T09 | EV-3 | A booking POST without a CSRF token answers 403. |
| EV-T10 | EV-3 | Concurrency through HTTP: 30 new HKU users made with `make.user()`, each logged in with `agentAs(handle)`, book an event with 10 tickets at once (`Promise.all`); exactly 10 tickets exist and `tickets_left` is 0. |
| EV-T11 | EV-4 | `mandy0hku` cancels her event 1 booking: ticket gone, `tickets_left` 49. Cancelling after the start (set `starts_at` in the past with SQL) is refused. |
| EV-T12 | EV-5 | `wing0cuhk`'s `/me/tickets`: event 2 first, then event 4 marked "Checked in". |
| EV-T13 | EV-6 | `filmsoc00` creates an event: it appears on `/events` for HKU users; `mandy0hku` gets 403 on `/events/new`. |
| EV-T14 | EV-6 | Creating with the release after the start: status 400 and the error under the release field; nothing inserted. |
| EV-T15 | EV-6 | Editing event 1's capacity to 1 (2 sold): error, nothing changed. Raising it to 60 gives 58 left. |
| EV-T16 | EV-6 | `filmsoc00` cancels event 1: the page shows "Cancelled" and booking is refused. |
| EV-T17 | EV-6 | `hikeclub0` sees two attendees on event 2; `filmsoc00` gets 404 there. |
| EV-T18 | EV-6 | Check-in by code `DB9H4R7W` succeeds once, then says "Already checked in". |
| EV-T19 | EV-5 | `newbie0hk`'s `/me/tickets` shows the empty state. |

Run them with `npm test -- modules/events`. The SQL itself is checked by `npm run check:sql` (`queries.sql` and the 120-buyer race).

## 8. Definition of done

- The [responsive acceptance checklist](../../architecture/RESPONSIVE.md#acceptance-checks-for-every-page) passes: no horizontal document overflow, appropriate navigation, readable forms, wrapping long text, visible focus and touch targets at least 44 px high. Add phone and desktop screenshots to the PR.

- EV-T01 to EV-T19 pass, and `npm test`, `npm run lint` and `npm run check:sql` are green in CI.
- `npm run demo:race` prints the expected result three times in a row.
- Every page checked as `mandy0hku`, `wing0cuhk`, `newbie0hk` and `filmsoc00`, at 390, 768 and 1440 CSS pixels, and with JavaScript off (the countdown then shows the release time instead).
- `USER_GUIDE.md` has screenshots; `SQL_CARD.md` is written (§9).

## 9. Presentation (SQL card)

`docs/modules/events/SQL_CARD.md` holds one slide's worth:

1. The booking transaction (the UPDATE with `tickets_left > 0`, then the INSERT), with three talking points: the row lock queues buyers; the primary key stops double booking; the CHECK and UNSIGNED column are the last line of defence.
2. The race result: 120 buyers (SQL) or 200 (HTTP), 50 tickets, 50 sold, the rest told "sold out", and the invariant query returning no rows.
3. Why `tickets_left` is a stored derived attribute although the course says not to store them (`DATA_MODEL.md` §7.1).

## 10. Prompt for a coding agent

> You are working in the Campus Notes repository on the **events** module only. Read `AGENTS.md`, `docs/architecture/RESPONSIVE.md`, `docs/architecture/ARCHITECTURE.md` (§1, §5, §6, §9) and `docs/modules/events/DEV_GUIDE.md`. Implement feature **EV-3** (replace with the feature you want) exactly as specified in §5 of the guide, using the SQL in `docs/modules/events/queries.sql` (turn `@variables` into `?` placeholders in `modules/events/queries.js`). Write the tests listed for that feature in §7 in `modules/events/tests/`. Change no file outside `modules/events/`, `scripts/demo-race.js` and `docs/modules/events/`. When done, run `npm test -- modules/events` and `npm run lint`, check the changed pages at 390, 768 and 1440 px with JavaScript on and off, and summarise what you changed and anything in the guide you could not follow.
