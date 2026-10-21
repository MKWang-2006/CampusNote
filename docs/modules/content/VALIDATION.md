# Content validation

## PR 1: pages (CT-1 form, CT-2, CT-3 thread, CT-7, CT-8 links)

Checked against main `89fed67` and the 21 October responsive guide. Local original-app research informed flat threads, image ordering and return navigation; project rules take precedence. No original-app screenshots or user data are included.

- Six HTTP tests cover CT-T01/02/08/09/10/11/15 (GET)/25/26 (read side)/27/29, including real 20-item pagination, Unicode escaping, aliases and hidden/deleted anchors.
- Shared lint passed. Full-suite result is recorded in the PR; existing integration TODOs remain explicitly pending.
- Post detail inspected in Chromium at 390×844, 768×1024 and 1440×900, with screenshots in `img/`. These are local seeded personas.
- Writes are completed by the next PR in the series; this PR establishes the read-only checkpoint.
- Contract clarification [#5](https://github.com/Michael-wzl/CampusNote/issues/5): the shared D22 account sidebar shows the viewer's own handle. Content never reveals an anonymous author's or commenter's handle, including within the author's own Content area. The old whole-page wording is not marked fully satisfied pending coordinator clarification.

## PR 2: publishing and interactions (CT-1 to CT-7)

- 17 Content HTTP tests cover the guide's CT-T01–CT-T30 behaviors on the Content side. CT-T22's actual Discover Watching page remains pending; its database contract and notifications are verified.
- Upload tests include 6/7 files, PNG signature, disguised files, wrong MIME type, >5 MB, Unicode 750/751 and comment 500/501 boundaries. A deliberate SQL failure after a partial image insert proves transaction rollback and uploaded-file cleanup.
- 20 simultaneous first comments through HTTP produce aliases 1–20; five concurrent comments from the same participant retain one alias.
- SQL suite: 456 PASS checks, including 30 concurrent first comments and repeated-participant race. The no-lock comparison failed 28/30 transactions as expected.
- Chromium phone workflow with JavaScript **enabled and disabled**: publish, comment as Host, like and watch all succeeded; no document overflow. Compose screenshots at 390/768/1440 px are in `img/`.
- Discover personal lists and Messages destinations remain placeholders on the baseline. Content writes the expected records and links; those destination screens are not represented as completed.
