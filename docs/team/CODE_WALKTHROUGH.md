# The coordinator's code in ten minutes

The app is Express + EJS with raw SQL on MySQL. No front-end build step is required. The full API reference is [ARCHITECTURE.md](../architecture/ARCHITECTURE.md).

1. **A request enters [app.js](../../app.js).** It loads the session and user, checks CSRF for writes, then calls a module router. Public auth/static pages work without login; other pages go through the login wall. The layout and shared UI live in `views/` and `public/`.
2. **Login belongs to [identity](../../modules/identity/routes.js).** A university email selects the university; signup/reset codes are verified before changing credentials. Passwords are hashed. Development shortcuts and the fake mailbox let the team work without real email delivery.
3. **SQL belongs in a module's `queries.js`.** [core/db.js](../../core/db.js) provides `q()` and `tx()`. `?` placeholders keep user values out of SQL text; `tx()` commits all steps or rolls back all steps. Each table has one writer, so teammates can build independently.
4. **Privacy is shared.** Post lists and comments use the database views in [schema.sql](../../db/schema.sql), and [core/cards.js](../../core/cards.js) centralizes post visibility. A hidden or university-restricted post answers 404. Anonymous cards do not expose the author's handle; EJS escapes user text with `<%= %>`.
5. **Your events showcase is a transaction.** [events/queries.js](../../modules/events/queries.js) claims a seat with a conditional decrement, then inserts the ticket in the same transaction. No seat means no insert. A duplicate attendee or code collision rolls back the decrement. Cancellation locks the event first and restores one seat only when a ticket is deleted. Capacity edits preserve `capacity - tickets_left = ticket rows`.

## What to run before showing the project

Follow the root [README](../../README.md), then run `npm test` and `npm run lint`. `npm run check:sql` also needs the MySQL CLI and its connection arguments. `npm run demo:race` is the events concurrency demo; read its usage before running it on a dedicated development database.

The tests rebuild `DB_NAME_TEST`. It must differ from `DB_NAME`. Keep `.env`, uploaded files and original-app reference screenshots out of Git.

## Questions you should be able to answer

- What happens if two people book the last seat? Why does the losing request leave no ticket?
- Why does a duplicate booking not reduce the available-seat counter?
- What happens if publishing or another multi-step write fails halfway through?
- Why are login, CSRF, table ownership and anonymous display rules shared?
- Which modules are still placeholders, and which tests are pending their implementation?

Your teammates' first pages use the existing seed data and dev login. They do not need your events code to start their own work.
