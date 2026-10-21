# Events validation, 21 October 2026

EV-1 through EV-7 are implemented. The Could-priority calendar download is not implemented.

## Automated checks

`npm test -- modules/events`: **23 passed, 0 failed**, covering all EV-T01 to EV-T19. Tests include:

- Audience-filtered events and 404 responses; correct statuses, countdown markup, and ticket ordering/empty states.
- Booking, sold out, release time, closed/cancelled events, CSRF rejection and duplicate booking rollback.
- Thirty simultaneous HTTP buyers competing for ten tickets: exactly ten successes, twenty sold-out replies and zero inventory remaining.
- Valid capacity reductions/increases, refusal below sold count, organizer/admin permissions, cancellation and repeat check-in.
- Random ticket-code collision retry; multipart cover cleanup; escaped user text; malformed request bodies.
- Hong Kong to UTC conversion, invalid calendar dates and MySQL's minimum DATETIME year, including UTC rollover at the boundary.

Targeted ESLint and Prettier checks passed. These checks ran with Node 24 and a temporary MySQL 8.4.13 instance, against isolated `campus_events_test` and `campus_events_race_dev` databases. Full-project test/SQL/CI status is recorded by the coordinator separately.

## HTTP race

The app and script used the same temporary local development database. Three consecutive runs of:

```bash
node scripts/demo-race.js --event 1 --buyers 200 --tickets 50 --delay 2
```

Each printed:

```text
booked 50, sold out 150, errors 0, tickets_left 0, tickets 50, oversold: no
```

The demo then restored its isolated database to the normal seed. It did not change the main development database.

## Browser checks

At a 390 × 844 viewport, checked with JavaScript enabled and disabled:

- Mandy: events list and her event-1 ticket.
- Wing: upcoming and past tickets.
- Newbie: empty ticket list.
- Film Society: My events, create form and attendees.

Every page returned HTTP 200 without horizontal document overflow. JavaScript showed a live countdown; disabling it left the explicit HKT release time visible. [Screenshots](screenshots/) use 390-pixel width and an expanded height so each complete page is visible without the fixed tab bar covering the middle of the capture. They contain seed personas and seed data only.

The Search/content/discover/messages teammate modules remain skeletons; their navigation and final end-to-end flow must be completed by their owners. The events routes themselves are available directly and through the existing Me menu.
