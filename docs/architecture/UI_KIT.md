# UI kit

The backbone ships one stylesheet (`public/css/kit.css`), one script (`public/js/kit.js`), a set of EJS partials (`views/partials/`) and template helpers (`ui.*`). Build every page from these and the four members' pages will look like one app. If you need a component that is not here, build it inside your module first (`modules/<m>/public/<m>.css`) and open a `contract-change` issue if others could use it.

Everything is local: no CDN, no web fonts, no icon fonts. The app must run on a plane.

## 1. Look and feel

A dark, desktop-first responsive website in our own name and colours. The reference screenshots (`docs/reference/triple-uni-screenshots/`) explain feature flows; [RESPONSIVE.md](RESPONSIVE.md) defines the current desktop, tablet and phone layout.

| Token (CSS variable) | Value | Used for |
|---|---|---|
| `--bg` | `#101012` | page background and desktop/tablet header |
| `--surface` | `#1c1c1c` | cards, menu groups, inputs |
| `--surface-2` | `#2a2a2a` | pressed states, chips |
| `--line` | `#333333` | dividers |
| `--text` | `#e8e8e8` | body text |
| `--muted` | `#9a9a9a` | times, counts, hints |
| `--brand` | `#864442` | phone top bar, active switches and brand backgrounds |
| `--brand-soft` | `#e3a49b` | the brand colour as text on dark surfaces: links, the active tab (the dark maroon fails WCAG AA as text on black) |
| `--accent` | `#d92f5c` | the + button, unread badges, primary toggles |
| `--cta` | `#f3ec68` (text `#111`) | the one main action of a form (Publish, Book): class `btn btn-cta` |
| `--ok` / `--warn` / `--danger` | `#4caf7a` / `#e0a030` / `#e5484d` | flash messages, statuses |
| `--radius` | `16px` desktop/tablet; `12px` phone | cards and groups |
| `--gap` | `20px` desktop/tablet; `16px` phone | spacing unit |

Font: the system UI font stack (`-apple-system, "PingFang HK", "Noto Sans CJK TC", "Segoe UI", sans-serif`), 16 px body. Desktop uses a wider centred shell, up to 1280 px including the left sidebar. Forms and prose are bounded at about 42 rem; tablet and phone widths adapt fluidly. Touch targets are at least 44 px high, and keyboard focus is visible.

## 2. Page anatomy (`views/layout.ejs`)

The shared shell adapts without JavaScript:

- **Desktop (at least 1024 px):** a left sidebar with Feed, Search, New post, Messages, Events and Me sits beside the page title, flash message and content.
- **Tablet (768 to 1023 px):** an expanded content column with bottom navigation; suitable card lists use two columns.
- **Phone (below 768 px):** a full-width single column and compact bottom tabs; bottom padding keeps page controls above the fixed navigation.

`res.page(view, { title, tab, back, hideTabs, styles, scripts })` fills the frame; `styles` and `scripts` add your module's own files from `/m/<module>/`. Pages without an active destination (a post page, settings) pass `tab: null` and usually `back`. `hideTabs: true` on compose hides compact tabs; the logged-in desktop sidebar remains available. Logged-out pages have no authenticated navigation and use readable centred forms. Modules provide page content, not another navigation frame. See [RESPONSIVE.md](RESPONSIVE.md) for the complete contract.

The layout's `<head>` carries `<meta name="csrf-token" content="...">`. `kit.js` sends that token as the `X-CSRF-Token` header on every `fetch`, and scripts that drive the app over HTTP (the race demo) read it from there.

## 3. Partials

Use with `<%- include('partials/<name>', { ... }) %>`. An EJS include also sees the page's own locals, so pass every local a partial uses, even as `null`, or a page local with the same name (a `type` or `value` of your own) can leak into it. A page local must also not use a name Express or EJS reserve, such as `settings` or `body` (`ARCHITECTURE.md` §6.3 lists them; `res.page` refuses them).

| Partial | Locals | Renders |
|---|---|---|
| `post-card` | `card` (a `v_post_cards` row), `link` (default `/posts/:id`) | The feed card from screenshot 01: `#600012`, avatar, topic chip, like (heart), watch (star) and comment counts, text (clamped to 4 lines), cover thumbnail with "+n" when there are more images, time, and the author's university code; the handle (or organization name) when shown. |
| `post-list` | `cards`, `nextUrl` (or null), `empty` (text) | A list of `post-card`s, a "Load more" link, or the empty state. |
| `tabs` | `items: [{ label, href, active }]` | The horizontal, scrollable tab strip at the top of the feed. |
| `menu` | `groups: [[{ href, icon, label, badge, danger }]]` | Grouped rows with a chevron, as on the Me page (screenshots 06 and 07). A row given `form` instead of `href` (`{ form: '/auth/logout', icon, label, danger }`) renders as a POST form with `csrfField()`, for actions such as Log out. |
| `stat-row` | `items: [{ label, value, href }]` | The four counts on the Me page. |
| `empty` | `text`, `href`, `label` | A centred icon, a sentence and an optional button. |
| `field` | `name`, `label`, `type`, `value`, `error`, `max`, `hint`, `rows`, `autocomplete`, `inputmode` | A labelled input or textarea with its error, and a live counter when `max` is set. `autocomplete` and `inputmode` are copied onto the input when given (the sign-up and login forms use them). |
| `toggle` | `name`, `label`, `checked`, `hint` | The switch rows from the compose page. Submits `1` when on and `0` when off (a hidden input carries the 0). |
| `topic-chips` | `topics`, `name`, `selected`, `error` | Radio chips for picking one topic (compose page). |
| `avatar` | `code`, `size` (`sm` 32, `md` 44, `lg` 72) | The avatar image for an avatar code. |
| `confirm-dialog` | `id`, `text`, `ok`, `cancel` | The modal from screenshot 04; opened by `kit.js`. |
| `like-watch` | `postId`, `liked`, `watched`, `likeCount`, `watchCount` | The two toggle buttons as AJAX forms (used by content on the post page). Each form posts the action it wants next (`like=1` when not liked, `like=0` when liked) and expects the reply `{ liked, likeCount }` or `{ watched, watchCount }`; the bindings below keep the button, the count and the next action in step. |

## 4. Template helpers (`ui.*`)

| Helper | Returns | Example |
|---|---|---|
| `ui.alias(n)` | Alias name for an alias number | `0` → `Host`, `1` → `Alice`, `26` → `Zoe`, `27` → `Alice 2` |
| `ui.timeAgo(date)` | Short relative time in HKT | `just now`, `5 min ago`, `3 h ago`, `16 Oct 22:19` |
| `ui.hkt(date, withYear)` | Absolute HKT time | `16 Oct 22:19`, `16 Oct 2026 22:19` |
| `ui.date(date)` | The HKT day only | `16 Oct 2026` |
| `ui.icon(name)` | A line icon from `public/img/icons.svg` (print with `<%- %>`; names in §7) | `ui.icon('star')` |
| `ui.avatarUrl(code)` | Path of an avatar image | `/static/img/avatars/fox.svg` |
| `ui.postNo(id)` | Display number | `#600012` |
| `ui.excerpt(text, n)` | Text cut at n characters with an ellipsis | |
| `ui.plural(n, 'comment')` | `1 comment`, `3 comments` | |
| `ui.countdownAttr(date)` | `data-countdown="2026-10-17T10:00:00Z"` for `kit.js` | event release timers |

The alias names are Alice, Bob, Carol, Dave, Eve, Frank, Grace, Heidi, Ivan, Judy, Kevin, Lily, Mallory, Nina, Oscar, Peggy, Quinn, Rupert, Sybil, Trent, Ursula, Victor, Walter, Xavier, Yvonne and Zoe. Avatar codes are the file names in `public/img/avatars/`: bear, cat, chick, film, fox, frog, ghost, koala, mountain, octopus, owl, panda, penguin, rabbit, tiger and whale; `ui.avatars` lists them.

## 5. Behaviour from `kit.js`

Mark up the HTML; the script does the rest. Without JavaScript every page still works.

| Attribute | Behaviour |
|---|---|
| `<form data-ajax>` | Submits with `fetch` (CSRF header added), then applies the JSON reply (`res.done({ json })`) to the elements inside the form: `data-bind="<key>"` sets an input's value or another element's text to `json[key]`; `data-bind-pressed="<key>"` sets `aria-pressed` to `json[key]`; `data-bind-not="<key>"` sets an input's value to `0` when `json[key]` is true and `1` when false (the next action). Used by like and watch. |
| `data-confirm="Delete this post?"` on a form or button | Asks first, using `confirm-dialog`; `data-confirm-ok="Delete"` names the OK button. |
| `data-leave-guard` on a form | If any field changed, leaving the page (back arrow, a tab, closing) asks "Leave and discard this draft?" (screenshot 04). Submitting the form does not ask. |
| `data-max="750"` on a textarea | Live "750 characters left" counter under it. |
| `data-countdown="<ISO time>"` | Live `hh:mm:ss` countdown; when it reaches zero the element gets the class `is-open` and fires a `countdown:done` event (events reload the Book button). |
| `data-autosubmit` on a select | Submits its form on change (search sort, topic filter). |
| `data-preview="images"` on a file input | Shows thumbnails of the chosen images and enforces the image limit (`data-max-files`, default 6), the types and the 5 MB size before upload. |

## 6. Page patterns

- **List page** (feed, my lists, search results): optional `tabs`, then `post-list`. Reuse the shared responsive card layout; keep the topic strip locally scrollable. Load more links keep the current tab and filter.
- **Detail page** (post, event): a card at the top, then actions, then the thread or details. Use `readable` for long text; an independent supporting panel may sit beside the main content in `page-grid-wide` on desktop and stacks on phones. Comments stay in chronological reading order. Destructive actions sit at the bottom in `--danger`, with `data-confirm`.
- **Form page** (compose, settings, new event): `form-width` around `field`s and `toggle`s in surface groups, one `btn btn-cta` button at the bottom. Validation errors re-render the page with status 400, the user's values and a message under each bad field.
- **Menu page** (Me, admin): `menu` groups, as in screenshots 06 and 07.
- **Status words:** use the same words everywhere: "On sale", "Sold out", "Opens in", "Happening now", "Ended", "Cancelled", "[deleted]", "[hidden by a moderator]".

## 7. Icons

Line icons drawn from one sprite file, `public/img/icons.svg`, which the browser downloads once and caches: `<%- ui.icon('star') %>` prints a small `<svg class="icon icon-star">` that points into it, in the current text colour. CSS may resize an icon and change its `stroke-width` (`.empty .icon` does). The names: feed, search, plus, messages, me, star, star-filled, comment, heart, heart-filled, bell, back, chevron, image, flag, trash, ticket, calendar, lock, globe, clock, gear, info, doc, logout. An unknown name is an error. To add an icon, add a `<symbol id="name" viewBox="0 0 24 24">` to the sprite (coordinator). Emoji may be used for the feed's 👀 and 🔥 tabs, as in the reference app.

## 8. CSS classes in `kit.css`

Use these before writing your own CSS, so every module looks the same.

| Class | For |
|---|---|
| `page-grid` | One column below 768 px, two equal card columns from 768 px. |
| `page-grid-wide` | One column below 1024 px, roughly 3:2 primary/supporting panels from 1024 px. |
| `readable`, `form-width` | Keep prose and forms within about 42 rem while fitting narrow screens. |
| `card` | A padded surface block (a post header, an event, a notice). |
| `group` | A surface block without padding that holds `field`s, `toggle`s or menu rows, separated by lines. |
| `stack`, `row`, `row-between`, `wrap` | Vertical spacing; a horizontal row; a row pushed to both ends; let a row wrap. |
| `muted`, `small`, `center`, `danger`, `pre` | Secondary text; 13 px; centred; red; keep the user's line breaks (message and post bodies). |
| `chip`, `chip-brand`, `chip-ok`, `chip-warn`, `chip-danger` | Small labels: a topic, "HKU", "On sale", "Sold out", "Banned". |
| `btn`, plus `btn-cta`, `btn-brand`, `btn-danger`, `btn-ghost`, `btn-sm`, `btn-block` | Buttons and button-like links. `btn-cta` is the one main action of a form, full width. |
| `link-button`, `inline` | A submit button that looks like a link; a form that sits inside a line of text (`<form class="inline">`). |
| `form`, `alert` | A form's column of groups; a red notice at the top of a form (a 400 message that belongs to no field). |
| `prose` | Paragraphs and lists of running text (About, Terms). |
| `table-wrap` + `table` | A table that scrolls within its own container when needed (admin and attendee pages); never widens the document. |
| `full-bleed` | A banner or image that spans the whole column (the Me banner). |
| `sr-only` | Text for screen readers only. |

Check every page at 390, 768 and 1440 px using the [responsive acceptance checklist](RESPONSIVE.md#acceptance-checks-for-every-page). Keep module CSS scoped; shared shell classes are maintained by the coordinator.
