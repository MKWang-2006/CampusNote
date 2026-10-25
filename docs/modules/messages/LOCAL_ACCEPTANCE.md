# Messages acceptance runbook

Owner: Member 3, **MKWang-2006**. Baseline: main `f9e8f68`, synchronized on 25 Oct 2026. This delivery implements MS-1 to MS-7 and retains the original shared schema, triggers and layout. MS-8 controls are excluded. See [HANDOFF.md](HANDOFF.md) for review and integration.

## 1. Start and reset safely

Follow the repository [README](../../../README.md) to configure Node, MySQL and a private `.env`. Keep `DB_NAME` and `DB_NAME_TEST` different. Run `npm run dev` from the repository root.

Open <http://localhost:3000/messages>. Use Developer shortcuts to select a persona. Repository demo accounts use password `campus123`.

For repeatable seed-based checks, back up development data you want to retain, verify that the configured development database is disposable, then run `npm run db:reset`. This replaces that database and removes later demonstration messages/reports. Reload and select a persona again. Stop the app with Ctrl+C; stopping preserves data.

The owner's Windows helper scripts are local-only conveniences, not repository dependencies. That environment uses loopback MySQL port 3307 and separate development, application-test and SQL-check databases. Credentials, database files, backups and runtime logs are excluded from this delivery.

## 2. Seed walkthrough

Run these checks in order. Complete the initial unread sequence before creating additional messages.

| Action | Expected result |
| --- | --- |
| Choose Mandy and open Messages | Navigation badge **4**, Notifications **3**, one Visitor conversation about #600005 with **1** unread |
| Open Notifications | Seven rows, three initially highlighted; per-post aliases; navigation badge becomes **1** |
| Return and open Visitor / #600005 | Three chronological messages, own messages on the right, "You appear as Host"; badge becomes **0** |
| Send "Friday 2pm works." and reload | The message remains in the conversation |
| Switch to Kelvin and open Messages | Counterpart is Host; total badge is **5**, falling to **4** after opening the conversation |
| Reply as Kelvin, then return as Mandy | Both see the persisted thread; anonymous counterparts expose no public handle or avatar |
| Choose Newbie, open Messages and Notifications | "No conversations yet." and "No notifications yet." |
| Newbie: #600001 / Message the host / send | A conversation is created; Newbie is Visitor and the counterpart is Host |
| Newbie: request `/messages/c/1` | Not found; another pair's private messages stay inaccessible |
| Newbie: request `/admin/reports` | Not allowed, HTTP 403 |
| Newbie: report #600007 as Spam twice | First submission succeeds; the second says it was already reported |
| Admin: Me / Reports | #600007 is grouped as **2 reports**; admin can see its author handle |
| Hide #600007 | "Hidden. 2 reports resolved."; ordinary post requests return 404 |
| Restore #600007 | Content returns; resolved reports remain in the audit history |

Development account switching also uses `/dev/login-as/<handle>`, provided by the shared app.

## 3. Discover and Content integration

| Action | Expected result |
| --- | --- |
| Newbie: `/u/jason0ust` / Message / send | Public conversation names Jason; the user link returns to his profile |
| Click Message again on Jason's profile | Reuses the same conversation without losing messages |
| Newbie: `/u/filmsoc00` / Message / send | Displays HKU Film Society and links back to its profile |
| Message Mandy from #600001 and separately from `/u/mandy0hku` | Different conversations; anonymous Host/Visitor identities stay separate from public handles |
| Newbie: `/u/newbie0hk` | No Message button; directly addressing oneself returns 400 |
| Newbie: report named post #600013 twice | One report is stored; duplicate submission adds no row |
| Admin hides #600013; Mandy checks the lists | Absent from All/university Feed, My posts and public profile; detail returns 404 |
| Admin restores #600013; refresh the lists | The post reappears and its processed report stays resolved |

Post #600013 is named, so it exercises the public profile as well as the other lists. Post #600007 separately demonstrates seed report aggregation. MS-I03 verifies banned-profile behavior in the isolated test database without banning development accounts.

## 4. Boundaries and browser checks

- Reject blank/whitespace messages and messages over 1,000 Unicode characters without writing them; preserve the draft on errors.
- Require a report reason. Details are optional, at most 300 characters. Reject own content and unavailable targets.
- Check 390 x 844, 768 x 1024 and 1440 x 900: no document overflow, readable long text, shared navigation and visible controls.
- Tab to Send and check focus. Clickable controls, including radio labels, must be at least 44 px high.
- Repeat sending/reporting/hiding/restoring without page scripts. The recorded port-3001 adapter supplied CSP `script-src 'none'; object-src 'none'`; the global browser JavaScript preference was not changed. The adapter is not an app endpoint or dependency.

Published screenshots show English UI/example text. Original multilingual seed data remains unchanged; the module safely renders arbitrary user content without translating it.

## 5. Automated checks and code reading

Run `npm test -- modules/messages`, `npm run lint`, `npm test` and `npm run check:sql`. Configure the MySQL client as described in the README. The local SQL wrapper supplies private client settings and its own database.

There are **40 executed Messages tests**: 26 guide cases, 8 regressions and 6 integration cases. The recorded full Windows suite has one existing path assertion failure and six existing TODO markers. See [VALIDATION.md](VALIDATION.md); do not describe its exit code as a pass.

Read `index.js` for the badge, `routes.js` for input/permission checks, `queries.js` for SQL/transactions, then the EJS views. See [SQL_CARD.md](SQL_CARD.md) for the trigger, latest-message query and read pointers; [MAIN_ADAPTATION.md](MAIN_ADAPTATION.md) explains provenance and remaining team work.
