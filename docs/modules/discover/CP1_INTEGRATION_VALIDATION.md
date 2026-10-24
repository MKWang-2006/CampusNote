# CP1 combined merge validation — 23 Oct 2026

Scope: [Feed #14](https://github.com/Michael-wzl/CampusNote/pull/14), [My posts #16](https://github.com/Michael-wzl/CampusNote/pull/16) and [public profiles #18](https://github.com/Michael-wzl/CampusNote/pull/18). Refs [Discover #2](https://github.com/Michael-wzl/CampusNote/issues/2), [My posts #15](https://github.com/Michael-wzl/CampusNote/issues/15) and [public profiles #17](https://github.com/Michael-wzl/CampusNote/issues/17). This is the CP1 subset, not completion of the whole Discover module.

## Integration review

The independent branches were combined locally before the first upstream merge. Conflicts were confined to Discover's query functions/exports, route imports and smoke list. All six query function bodies and the original views, page script and acceptance checks were compared against their feature branches and retained unchanged. Routes keep both `ref` and `notFound`; smoke paths keep Feed filters and the three safe public profile targets. No anonymous author's profile was added to smoke paths.

The validated application tree is local preflight commit `530be3864d5f40273f8031bbc7fac25990fc1a7d` (tree `156a588d21e04a056eb6c6110383ed1e0a73078d`). Later changes in this integration record update only Discover's documentation/status; feature code remains identical. All differences from baseline `995b84d` stay in `modules/discover/` and `docs/modules/discover/`. No schema, dependency, shared file or other module changed; application queries remain read-only.

## Combined evidence

Node 24.19.0 and MySQL 8.4.13, with dedicated `campus_notes_cp1_merge_dev` and `campus_notes_cp1_merge_test` databases on loopback port 13378.

- **26 real HTTP/database tests pass**, 0 fail/0 TODO, together: 9 Feed + 8 My posts + 9 public-profile cases.
- **400 original browser layout checks pass against the same combined application**: 160 Feed + 80 My posts + 160 profile cases. Five personas, 320/390/768/1440 px and JavaScript on/off; existing navigation, images, targets, focus, links and empty states remain usable.
- A real **JavaScript-off combined workflow** publishes anonymous and named all-university Food posts. Both appear in Feed and the author's private My posts; only the named post appears on the own/cross-university public page. Anonymous cards show no name. After Content deletes both posts, they disappear from all three lists.
- **Native 200% browser page zoom passes** Food Feed, My posts, own profile, organization profile and an empty profile, including post → Back navigation. Chrome Settings supplied the zoom: viewport 1418 → 709 CSS px, DPR 1 → 2, no horizontal overflow and working compact navigation. Zoom was reset afterwards.
- Whole-tree ESLint passes; Prettier passes with `--end-of-line auto` for the existing Windows checkout.
- Full Windows suite: **185 cases, 178 pass, 1 existing baseline path-assertion failure, 6 existing integration TODOs**. The only failure remains `test/core/reset.test.js` comparing a POSIX trigger path with Windows `path.join`; it was previously reproduced on untouched `995b84d`. Shared tests were preserved. No TODO was counted as passed.

Required Linux `ci` runs standard lint, all application tests and SQL checks on each updated PR and again on main. The PR pages record each exact tested head and run. Each merge uses GitHub's normal protected-main API and an expected head SHA; conflicts are resolved on the personal fork, followed by fresh CI. Squash messages cite #2 and the corresponding feature issue; #2 stays open for remaining work.

Original screenshots and per-feature details remain in [Feed evidence](VALIDATION.md), [My posts evidence](MY_POSTS_VALIDATION.md) and [profile evidence](USER_PAGE_VALIDATION.md). Browser evidence is desktop Chromium 151; physical devices and Safari/Firefox were not checked.
