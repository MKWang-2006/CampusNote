# Events module

Owner: coordinator. EV-1 to EV-7 are implemented: event lists and audience checks, release countdowns, transactional booking/cancellation, tickets, organizer forms, attendees/check-in, and the HTTP concurrency demo. No teammate module is imported.

- Start with [the user guide](../../docs/modules/events/USER_GUIDE.md) for screenshots and the seed walkthrough.
- [DEV_GUIDE.md](../../docs/modules/events/DEV_GUIDE.md) defines the acceptance contract; `queries.js` contains every application SQL statement.
- Run `npm test -- modules/events` for 23 checks covering EV-T01 to EV-T19 and regression cases.
- [VALIDATION.md](../../docs/modules/events/VALIDATION.md) records the verified tests, mobile checks and race result. [SQL_CARD.md](../../docs/modules/events/SQL_CARD.md) provides the presentation explanation.

Use `/events` directly while the teammate-owned Search page is being built. `Me → My tickets` is available through the existing identity module.

The race fixture changes development data: it replaces **all tickets for the selected event**, sets that event's capacity, inventory and release time, and creates reusable `racer0001` accounts. Run it against a throwaway local development database, with the app and script configured to use the same database:

```bash
npm run demo:race -- --event 1 --buyers 200 --tickets 50 --delay 5
```

Racers log in before the script arms the release countdown, so login preparation does not use up the countdown. The real booking requests then start together. After the demo, `npm run db:reset` restores seeded development data (and removes all development changes).
