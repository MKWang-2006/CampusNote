# How we work (for every member)

The whole team process fits on this page. Nothing here needs a meeting.

## 1. The loop for one feature

1. **Pick** your role using `START_HERE.md`, then the next feature from your DEV_GUIDE (such as `CT-3`). Track it in your role issue checklist, or open a separate issue if useful.
2. **Branch** from an up-to-date `main`:
   ```bash
   git switch main && git pull
   git switch -c content/CT-3-comments        # <module>/<feature ID>-<few words>
   ```
3. **Build** it from your DEV_GUIDE. Run the app with `npm run dev` and log in as personas from the login page (development only).
4. **Test**:
   ```bash
   npm test -- modules/content      # your module's tests
   npm run lint                     # style and obvious mistakes
   npm test                         # everything, before you push
   ```
5. **Commit** with the module and feature ID: `content: comments with aliases and replies (CT-3)`.
6. **Push and open a pull request**: `git push -u origin content/CT-3-comments`, then open the PR on GitHub. Fill in the template. CI runs lint, all tests and the SQL checks.
7. **Merge** when CI is green: squash and merge (module-only PRs merge themselves; PRs touching shared files wait for the coordinator). Delete the branch and check off the feature in your role issue.

Keep PRs small: one feature, ideally under 400 changed lines. Pull `main` into your branch at least daily (`git pull origin main`) so you never drift.

## 2. Rules that keep us out of each other's way

- Change files only inside `modules/<your module>/` and `docs/modules/<your module>/`. Anything else is a shared file: open a `contract-change` issue (`ARCHITECTURE.md` §13).
- Write only your module's tables (`WORK_DIVISION.md` §1). Read anything.
- Link to other modules only with the URLs in `WORK_DIVISION.md` §3.
- Never commit `.env`, `node_modules/` or `uploads/`. Never force-push `main`.
- If you are blocked for more than a day, say so in the feature's issue with the `question` label, and work on your next feature meanwhile.

## 3. Sunday status (21:00, three lines)

Comment on the "Weekly status" issue linked from `START_HERE.md`:

```
Done: CT-1, CT-4
Next: CT-3, CT-5
Blocked: nothing
```

## 4. Using a coding agent (Claude Code, Codex, Cursor)

AI coding tools are allowed for the project, but you must be able to explain every line, especially the SQL you present.

1. Start the agent in the repository root. It reads `AGENTS.md` automatically (Cursor: add it as a rule).
2. Give it your DEV_GUIDE and one feature at a time. Each DEV_GUIDE ends with a ready-made prompt.
3. Read the diff before committing. Run the tests yourself. If the agent touched a file outside your module, revert that file.
4. Ask the agent to explain any SQL you do not fully understand, then check the explanation against the course notes.

## 5. Pull request template (`.github/pull_request_template.md`)

```markdown
## What
Feature IDs: CT-3
One or two sentences on what a user can now do.

## Screenshots
Before / after, or the new page.

## Checklist
- [ ] Only files in my module (or labelled `contract-change` and reviewed by the coordinator)
- [ ] Only my module's tables are written
- [ ] SQL uses `?` placeholders; user text printed with `<%= %>`
- [ ] Visibility checked for anything about a post; ownership checked for every change
- [ ] Acceptance tests from my DEV_GUIDE added and passing; `npm test` and `npm run lint` pass
- [ ] Checked in the browser as two personas, including `newbie0hk` for empty states
- [ ] USER_GUIDE section written or updated
```

## 6. Code owners (`.github/CODEOWNERS`)

Shared paths and the coordinator's modules have `@Michael-wzl` as owner in [.github/CODEOWNERS](../../.github/CODEOWNERS). Teammate module folders are unassigned so each member can claim a role. The coordinator reviews changes outside your module, including schema changes. CI must pass for every PR.

GitHub branch protection is configured to require a pull request and passing `ci`, with code-owner review enabled for covered paths and no force pushes. When a PR changes only an unowned teammate module, it can merge without a coordinator approval. Do not merge shared changes until the coordinator has reviewed them.

The repository owner retains GitHub’s default admin override for coordinator maintenance. Teammates follow the PR/CI rules above.
