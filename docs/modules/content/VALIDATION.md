# Content validation

## PR 1: pages (CT-1 form, CT-2, CT-3 thread, CT-7, CT-8 links)

Checked against main `89fed67` and the 21 October responsive guide. Local original-app research informed flat threads, image ordering and return navigation; project rules take precedence. No original-app screenshots or user data are included.

- Six HTTP tests cover CT-T01/02/08/09/10/11/15 (GET)/25/26 (read side)/27/29, including real 20-item pagination, Unicode escaping, aliases and hidden/deleted anchors.
- Shared lint passed. Full-suite result is recorded in the PR; existing integration TODOs remain explicitly pending.
- Post detail inspected in Chromium at 390×844, 768×1024 and 1440×900, with screenshots in `img/`. These are local seeded personas.
- Writes are completed by the next PR in the series; this PR establishes the read-only checkpoint.
- Contract clarification [#5](https://github.com/Michael-wzl/CampusNote/issues/5): the shared D22 account sidebar shows the viewer's own handle. Content never reveals an anonymous author's or commenter's handle, including within the author's own Content area. The old whole-page wording is not marked fully satisfied pending coordinator clarification.
