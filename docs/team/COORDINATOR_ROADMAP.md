# Coordinator roadmap

**For Michael.** The plan from today to the presentation, what to do at each step, and how to keep four people moving with one meeting. Dates are 2026. Checkpoints fall on Sundays so that weekday classes are untouched.

## 1. Timeline

| Date | Milestone | Coordinator does | Members do |
|---|---|---|---|
| Fri 16 to Sun 18 Oct | **Design pack and decisions** | Read `docs/README.md`, then make the five calls in `team/DECISIONS.md`. Publish the team GitHub repo (§3). | Nothing yet (A2 and midterm). |
| Sat 17 to Tue 20 Oct | **Backbone** | Claude builds the backbone, identity and module skeletons (D2). Review and run it (§4). Merge it as the first commit on `main`. | A2 due Mon 19 Oct 23:59. |
| Wed 21 Oct | Midterm quiz | Evening: send the pre-read message (§5). | Midterm. Install Node 22+ and MySQL 8.4 if time allows. |
| **Thu 22 Oct** | **Kickoff (the only meeting, 60 min)** | Run the agenda in §6. Freeze the schema. | Confirm role claims, run the app, begin a real feature. |
| **Sun 25 Oct** | **CP1: walking skeleton** | Check every module's pages render with seed data and CI is green. | Read-only pages for your module. |
| Mon 26 Oct | Project tutorial (TA) | Attend. Note anything the TA expects that we do differently, and adjust the README or slides. | Attend. |
| **Sun 1 Nov** | **CP2: all Must features merged** | Check against each DEV_GUIDE's Must list. Re-scope anything at risk (§8). | Must features with tests. |
| **Fri 6 Nov** | **Module complete** | Check §7 of `WORK_DIVISION.md` for every module. | Should features, USER_GUIDE with screenshots, SQL card. |
| Sat 7 to Fri 13 Nov | **Integration week** | Run the runbook in §7. Tag `v1.0` on Fri 13 Nov. | Fix your bugs within a day; shared duties. |
| Tue 17 Nov | Video final | Review it against `PRODUCT_SPEC.md` §9. | Content owner delivers the video. |
| Wed 18 Nov | SQL injection lecture | Optional slide: our placeholders versus string concatenation. | |
| Thu 19 Nov | Slides final | Review timing. | Discover owner delivers the slides. |
| Fri 20 and Sun 22 Nov | Rehearsals (30 min each, online) | Time the talk at 5:00 or less; practise the TA's likely questions (§9). | Everyone speaks. |
| **Mon 23 or Wed 25 Nov** | **Presentation** | | |

The Moodle deadline for source code and README has not been announced. Ask the TA by 6 Nov; until then, plan to submit by 22 Nov.

## 2. The weekly rhythm (asynchronous)

- **Sunday 21:00, status comment.** Each member comments on the pinned "Weekly status" issue in three lines: *Done* (feature IDs merged), *Next* (feature IDs this week), *Blocked* (anything, or "nothing").
- **Monday noon, coordinator reply.** One comment: what is on track, anything re-scoped, any contract change made.
- **Pull requests.** Module PRs merge when CI is green; the author merges (squash). PRs touching shared paths need the coordinator's review, which he gives within 24 hours.
- **Questions** go in the issue of the feature they block, with the `question` label, not in chat, so the answer is findable later. Chat (WhatsApp or WeChat) is for urgent things only.

## 3. Repository setup (21 Oct handoff)

The public repository is [Michael-wzl/CampusNote](https://github.com/Michael-wzl/CampusNote). The app and `docs/` are the repository root. `.github/` is installed and CODEOWNERS uses `@Michael-wzl`; no manual file copying or Student Developer Pack application is needed for kickoff.

The current handoff checklist is [COORDINATOR_TODO.md](COORDINATOR_TODO.md). Teammates start at [START_HERE.md](../../START_HERE.md), claim one of the three role issues, and follow the root README to run the app. Feature checklists live in their DEV_GUIDEs; a Projects board and an issue for every feature are optional.

Invite the three teammates as collaborators using their GitHub usernames. `main` is protected with pull requests, passing `ci`, code-owner review for shared paths, resolved conversations, and no force pushes/deletion. The owner retains the default admin override. Module-only PRs do not need a coordinator approval; changes to shared code do.

## 4. Reviewing the backbone (about 4 to 6 hours)

Do this before kickoff; you will own this code and answer questions about it.

- [ ] `npm install`, `npm run db:reset`, `npm run dev`; log in as each persona; click every tab.
- [ ] `npm test` and `npm run check:sql` pass locally; CI passes on GitHub.
- [ ] Read `core/` file by file against `ARCHITECTURE.md` §6. Every function there exists with that signature.
- [ ] Read `modules/identity/` (register, verify, login, Me page) as if you would present it.
- [ ] Try to break it: register with a non-university e-mail, a wrong code six times, an expired code, a POST without a CSRF token, `/posts/600008` as an HKU user.
- [ ] Each empty module folder has `index.js`, a placeholder page and a README pointing to its DEV_GUIDE.

## 5. Teammate message

Use [TEAM_MESSAGE.md](TEAM_MESSAGE.md), which contains the repository link, three available roles and the short starting path.

## 6. Kickoff agenda (Thu 22 Oct, 60 minutes)

| Min | Item | Outcome |
|---|---|---|
| 0 to 10 | Demo the running backbone: register, feed with seed data, dev login, mailbox | Everyone sees the target. |
| 10 to 20 | The rules: own folder, one writer per table, views, URL contracts, small PRs, Sunday status | `ARCHITECTURE.md` §1. |
| 20 to 30 | Confirm the recorded roles (Member 1 — Content: Catherine135; Member 2 — Discover: hX1-dev; Member 3 — Messages: MKWang-2006) and shared duties | Names recorded in the role issues and module READMEs. |
| 30 to 50 | Everyone gets the app running and opens a first feature branch; help whoever is stuck | Everyone can run the app and knows their first feature. |
| 50 to 60 | Dates (CP1, CP2, 6 Nov), how to ask questions, Q&A | Schema frozen from now on. |

## 7. Integration week runbook (Sat 7 to Fri 13 Nov)

| Day | Do |
|---|---|
| Sat 7 | Feature freeze: only bug-fix PRs from now. Write `test/e2e/golden-path.test.js` from `PRODUCT_SPEC.md` §6. Run `npm run load-test`; every page under 300 ms. |
| Sun 8 | **Bug bash** (asynchronous, led by the Messages owner): each member spends an hour using two other modules with their USER_GUIDE, filing issues labelled `bug` with steps to reproduce. |
| Mon 9 to Wed 11 | Owners fix their bugs. Draw the Chen E-R diagram from `DATA_MODEL.md` §1 (draw.io, saved in `docs/data/er/`). Write the README for markers (setup in 5 commands, personas, feature list, where the SQL is). Messages owner does the rebuild test on a second laptop using only the README. |
| Thu 12 | Release candidate: fresh `db:reset`, full click-through as every persona, all tests and SQL checks green. |
| Fri 13 | Tag `v1.0`. Export the Moodle package (zip of the tagged source without `node_modules` and `uploads`). |

## 8. Keeping scope under control

- At CP1, a module with no pages yet is the main warning sign. Talk to its owner the same day.
- At CP2, any unfinished **Must** feature: cut that module's **Could** features, then its **Should** features, then bring in the buddy (`WORK_DIVISION.md` §8).
- Never add features after CP2, however small. Polish beats breadth in a 5-minute presentation.
- Contract changes after kickoff: allowed only for bugs or blockers, and always through a `contract-change` issue that you resolve within a day.

## 9. Questions to prepare for

- Why is `tickets_left` stored when derived attributes should not be? (`DATA_MODEL.md` §7.1)
- What happens if two people book the last ticket at the same moment? (the race test; show the numbers)
- How is anonymity guaranteed? (the views plus the privacy contract test)
- How do you stop SQL injection? (placeholders everywhere; one slide comparing a concatenated query)
- Why is `reports.target_id` not a foreign key? (§7.3)
- How did you use AI tools, and can each member explain their SQL? (each member presents their own SQL card)

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A member is late or silent | medium | CP1 makes it visible in week 1; buddy system; MoSCoW cut lines. |
| MySQL setup problems on a member's laptop | medium | README troubleshooting; the optional `docker compose up -d mysql` path in the root README; pair at kickoff. |
| Code nobody can explain (AI-generated) | medium | Every member presents their own SQL card and rehearses the questions above. |
| Anonymity or visibility leak | low | Shared views plus the privacy and visibility contract tests in CI. |
| Live demo fails | low | The video is pre-recorded; the app runs offline from a seed reset. |
| Late schema change | low | Schema frozen at kickoff; `contract-change` process. |
| Branch protection not configured | low | Same rules by convention; the coordinator watches merges. |
