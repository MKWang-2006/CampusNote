# Michael's short checklist

## Ready in the workspace

- [x] Desktop-first responsive shell, shared helpers and updated teammate guides.
- [x] Content ownership recorded for Catherine135; Discover for hX1-dev; both collaborator invitations sent.

- [x] Neutral role options; ownership follows teammate claims.
- [x] `START_HERE.md`, module guides and a short teammate message.
- [x] CI, PR template and CODEOWNERS installed with `@Michael-wzl`.
- [x] One-command `.env` setup and an optional local MySQL container.
- [x] Code review of the backbone/identity and fixes for database-reset/load-test safeguards.
- [x] Contact page uses project issues; no team email placeholder to fill.
- [x] Events implementation, mobile screenshots, SQL card and its acceptance tests.
- [x] Three role-claim issues and a pinned weekly-status issue are created.
- [x] Project committed and pushed to the public `Michael-wzl/CampusNote` repo.
- [x] `main` requires PRs, passing `ci`, code-owner review for shared paths, and resolved conversations; force pushes and branch deletion are disabled. The repository owner retains GitHub’s default admin override.

## Your remaining actions

1. **Get the remaining teammate’s GitHub username and Messages claim.** Invitations have been sent to Catherine135 (Content) and hX1-dev (Discover); they must accept on GitHub before pushing. Ask the remaining teammate to choose Messages, then record and invite their account.
2. **Send [TEAM_MESSAGE.md](TEAM_MESSAGE.md)**. Roles are [Content #1](https://github.com/Michael-wzl/CampusNote/issues/1), [Discover #2](https://github.com/Michael-wzl/CampusNote/issues/2) and [Messages #3](https://github.com/Michael-wzl/CampusNote/issues/3); [weekly status is #4](https://github.com/Michael-wzl/CampusNote/issues/4). The first checkpoint is 25 Oct; confirm dates with the team if needed.
3. **Read [CODE_WALKTHROUGH.md](CODE_WALKTHROUGH.md)** so you can explain the code you own. Automated review cannot replace your understanding for the presentation.

No manual copying of `.github` files, username replacement, team-email setup or private-repo subscription is needed. The authenticated CLI is used for publication; the GitHub connector's write-access issue does not block the handoff.

## Validation

Fresh checks on 21 Oct: **115 application tests pass, 0 fail; 7 TODOs await the teammate modules.** ESLint and formatting pass. **456 SQL checks pass**, including the 120-buyer booking race and the comment-alias race. Events also passed a 200-buyer HTTP race: 50 booked, 150 sold out, no overselling.

See [VALIDATION.md](VALIDATION.md) for exact scope and limitations, and [GitHub Actions](https://github.com/Michael-wzl/CampusNote/actions) for the remote CI result. Passing at kickoff means the shared app and coordinator modules work; Content, Discover and Messages remain deliberate starter modules.

## Later work

Review and merge teammate PRs, confirm the official source-submission deadline with the TA, finish the Chen E-R diagram and slides/video, and rehearse. These are later course deliverables, not blockers to claiming a role and starting now.
