# Steam: AI Content Disclosure Badge (ceeprus)

Researched 2026-10-21. Counts are snapshots from that day unless a date is given. Tags: [code] read from the script source, [api] read from the GitHub API, [listing] a distribution page or search endpoint, [measured] my own anonymous read-only probe (public store pages, credentials omitted, 4 requests in total, 2026-10-21), [tracker] an issue or PR thread. "Asserted" means README, header or commit-message copy; "proven" means source, commit diffs or API data. Clean-room rule: behavior is described in words; no selectors, patterns or code are recorded. The license is MIT, so reading the source was allowed.

Repo base: https://github.com/ceeprus/userscript . Raw reads came through the GitHub API (https://api.github.com/repos/ceeprus/userscript/contents/...). "Script" below means steam/steam-ai-disclosure.user.js at header version 2.41 unless a version is named.

## 1. Identity

- Name: "Steam AI Content Disclosure Badge" in the script header; "Steam: AI Content Disclosure Badge" in the README table (source: script header and https://raw.githubusercontent.com/ceeprus/userscript/main/README.md). [code]
- File: steam/steam-ai-disclosure.user.js, header version 2.41, 166,347 bytes, 2,791 lines, readable and unminified; the first monorepo version (commit ccbd475, 2026-06-20) was 15,537 bytes, 279 lines, header version 1.9 (source: https://api.github.com/repos/ceeprus/userscript/contents/steam/steam-ai-disclosure.user.js and the same path at ref ccbd475). The script grew about 10.7 times in 4 months. [api]
- Container: a personal monorepo called "userscript", description "Personal Userscripts", holding 13 scripts for unrelated sites (X, YouTube, Steam inventory, Backloggd, VRChat, Modrinth, GitHub, and others). The README opens with "bunch of fast vibecoded stuff, not for your use" (source: README above). The script is one of 13 rows in one README table. [api]
- Earlier home: the first monorepo commit carries version 1.9 and its first header pointed at a standalone repository ceeprus/steam-ai-disclosure; that repository returns 404 on 2026-10-21 (source: https://api.github.com/repos/ceeprus/steam-ai-disclosure , and the header at https://api.github.com/repos/ceeprus/userscript/contents/steam/steam-ai-disclosure.user.js?ref=ccbd475). History before 2026-06-20 is not readable. [api]
- Author: GitHub user ceeprus, profile name "Cee", account created 2019-11-26, 10 public repos, 20 followers, on 2026-10-21 (source: https://api.github.com/users/ceeprus). [api]
- License: MIT, "Copyright (c) 2026 Cee" (source: https://raw.githubusercontent.com/ceeprus/userscript/main/LICENSE ; the repo API license field also says MIT; the script header says MIT). [api]
- Repo facts on 2026-10-21: created 2026-06-01, last push 2026-10-17, 2 stars, 0 forks, 0 subscribers, 0 open issues, issues enabled, one branch (main), no releases, no tags, 132 commits all by ceeprus, repo size 730 KB (source: https://api.github.com/repos/ceeprus/userscript , /releases , /tags , /branches , /contributors). [api]
- Size model: one file with no build step, no package manifest, no tests and no CI in the tree (source: https://api.github.com/repos/ceeprus/userscript/git/trees/HEAD?recursive=1). A commit message (c576201, 2026-09-21) says "13 new regression tests" cover its fixes; no test files exist in the repo, and that claim is unverified. [api]
- Provenance of the heading list: until commit 99eb29d (2026-09-22) a comment above the localized heading list read "data, MIT from seeeeew/aiwarningforsteam" (source: the script at ref acae34b, line 113). That commit removed the credit and says the headings "were re-read from Steam's own pages, one request per store language, and match what was there" (source: https://github.com/ceeprus/userscript/commit/99eb29d). The 28 strings in 2.41 are the same strings as in the credited version. This is a project-rule 6 (originality and credit) data point for us. [code]

## 2. Detection and accuracy

How it decides (proven, script source read on 2026-10-21):

- Source of truth: the store's HTML app page. There is no Steam API call, no seed list and no remote list. The script fetches the full app page for each game it has not seen, parses it, and looks for the AI disclosure heading. [code]
- Heading test: the heading text of a second-level heading must equal one of 28 hard-coded localized heading strings after whitespace is collapsed. It must sit inside the page's content-descriptors block, or inside a parent box under 2,000 characters of text. The second rule is the guard against a developer's own heading of the same text inside a long store description (the author reports a 45 KB false positive fixed on 2026-09-21, commit c576201). [code]
- Fast path: before building a document it checks the raw text for the descriptors block and for any heading string, with a tolerant variant for line breaks, non-breaking spaces and entity-encoded apostrophes. A page without them is a negative and its game name is read by a light text match. [code]
- Disclosure text: the text after the heading up to the next heading, with Steam's lead-in sentence dropped, capped at 400 characters, shown in the badge tooltip. The cap means the developer text is not shown whole when long. [code]
- Current page: on an app page the script reads the loaded page instead of fetching it, and seeds the cache from it, only when the app-name element exists and no age gate is present. [code]

Language handling:

- The lookup request does not ask for a language. The first version (commit ccbd475) asked for English and US pricing; commit c576201 (2026-09-21) removed that because asking for a language makes Steam send a cookie that changes the language the user browses in. Pages therefore come back in the user's own store language, and the 28-heading list has to cover every language. [code]
- Measured gap, 2026-10-21: I fetched the disclosed game ARC Raiders (app 1808500) in Arabic, Latin American Spanish and Brazilian Portuguese. Latin American Spanish and Brazilian Portuguese headings match entries in the list. The Arabic heading (not reproduced here, ASCII rule) matches none of the 28 strings. An Arabic-language Steam user therefore gets no badge on any game, and the page is cached as a clean negative for 7 days. Source: https://store.steampowered.com/app/1808500/?l=arabic , ?l=latam , ?l=brazilian . [measured]
- Related inference: in blur and hide modes an unbadged game reads as "checked and cleared", and the Arabic gap turns a missing badge into a game that stays visible with no warning mark. [code]
- Language upkeep: the code comment says the list must be re-read from Steam one language at a time when Steam adds a language. There is no automated check. [code]

Gates, errors and what is stored (proven):

- Statuses 429 and 503 pause all reads (the server's Retry-After value, capped at 5 minutes, or a backoff that starts at 30 seconds and doubles to 5 minutes). Any non-OK status, a 15 second stall, a body over 8 million bytes, a login or age-check redirect, and an app page with no app-name element all throw and store nothing. [code]
- Age gate: on the first gated page the script writes two cookies that declare a birth date of 1 January 1990 (host-only, one day, secure, same-site lax), but only when Steam's own birth-date cookie is absent; it reads the cookie back to confirm, then re-reads the page. A title that still gates (adult-only titles with a per-app opt-in) is treated as an error, not as a negative. Commit c576201 (2026-09-21) dropped a third cookie, the mature-content display preference, as "not ours to set". [code]
- Failed lookups are retried twice, after 60 seconds and after 300 seconds. In blur and hide modes a failed game gets a small grey "AI?" chip with the tooltip "AI disclosure check failed ... This game was not verified". In badge mode that chip is hidden by style. [code]
- Exception, a negative stored from a non-app page: when the final URL after redirects is neither an app page nor a login or age-check page (for example the store front), the script stores a plain negative for 7 days and shows nothing. The code labels the result "not an app" but the stored row keeps only the flag, text, name and timestamp; the label is lost. [code]
- Measured on 2026-10-21: a non-existent app ID (99999999) returns HTTP 200 and redirects to the store front, 983,813 characters, with no app-name element and no descriptors block. By the code path above that response is stored as a negative. Source: https://store.steampowered.com/app/99999999/ . [measured]
- The code comment on this path says a delisted game's redirect "must not be cached as clean", while the next lines of the same function cache it. The commit message for 2.40 (2026-10-04) says Labs experiments and Steam hardware are non-games and get no marker. The two statements point at different intents; the observable result is a stored negative. [code]
- Negatives are re-checked after 7 days "because devs can add it later" (code comment). A disclosed result lasts 30 days. A disclosure removed by a developer stays badged for up to 30 days; a disclosure added later appears after up to 7 days. [code]

Accuracy evidence:

- Seed or ground-truth test: none in the repo, none run by me beyond the language probe. No published false-positive or miss rate. [api]
- Author-run crawl claims (asserted, commit messages only): "swept every corner of the live store" in 2026-09-22 (commit 99eb29d) and "fixes from a store-wide crawl" in 2026-10-04 (commit 0904805). No data attached. [api]
- Verdict states: effectively four in filter modes (disclosed badge; clean, no mark; lookup in flight, a spinning chip; failed, the "AI?" chip) and two in badge mode (badge or nothing). "Unknown" exists as a visible state only while blur or hide is on. [code]
- Wording: the chip reads "AI"; the fallback tooltip reads "This game discloses AI generated content"; the blur overlay reads "AI disclosure: hover to reveal"; the eye tooltip reads "AI disclosure: badge disclosed games" and variants. None says "uses AI" or "AI-free". [code]

## 3. Surface coverage

The script is not a table of surfaces. It has six generic candidate rules plus a large set of layout-repair routines for hiding. Both are described in words below (source: the script, candidate scan and pack routines). [code]

Candidate rules (what counts as a game tile), proven:

- Any element carrying Steam's own app-ID data attribute (classic capsules: home, search rows, tab lists, specials and similar).
- Any link to an app page that wraps an image (React capsules on sale, event, charts, creator and hover-popup pages).
- Discovery-queue style video cards with no app link; the ID is read from the nearest capsule or trailer asset address.
- The old store's single hover tooltip box, whose element ID carries the app ID.
- The short description inside an expanded sale widget (a badge line under the description).
- The front-page tab preview panel (ID read from screenshot or trailer asset address).
- The app page itself: a chip after the title; the disclosure box gets a tinted bar and an "AI" chip drawn by style; the chip scrolls to the box and pulses it twice (not under reduced-motion).
- News links, text-only links, Labs experiments and Steam hardware are skipped.

Pages the author says were swept, asserted (commit 99eb29d, 2026-09-22; commit 0904805, 2026-10-04): home, specials, categories, genres, tags, explore (including the "new" page), charts, search with an infinite-scroll result of about 1,100 rows, demos, news, franchise, developer, curator, sale events, game pages, bundles, DLC pages, the recommendation grids and the recommended page, the Deck "great on deck" page, the Remote Play hub, featured-deals pages and the 2 by 2 tag blocks. No test evidence is in the repo. [api]

Match scope (proven, header): every path on the store host, excluding checkout, login, join and account paths and any widget path; frames are skipped. [code]

Not covered:

- Steam desktop client and Steam mobile app: userscripts cannot run there (inference from how managers work; no source for the client). [code]
- Android browsers with a userscript manager: not mentioned by the README. The stylesheet has one hover-less (touch) rule for the title hide button, which shows touch awareness but no Android test (unverified). [code]
- Community, workshop, guide and profile pages on the community host: not in the match scope. [code]
- Wishlist, library and personal calendar pages: they sit on the store host or the client; the generic link rules would pick up app links with images on a wishlist, but I found no mention of the wishlist in the source or commit messages (unverified either way). The commit messages mention "signed-in users' own rows" and the signed-in recommended-tags lists (commits 8808dad, 0904805). [code]

## 4. UX and user control

- Badge: a small dark chip with amber text "AI", styled after Steam's own capsule flags (discount chip, "Free To Play"); corner overlay on capsules, inline after the title in hover popups, a line under sale-widget descriptions, and a chip after the title on app pages. Corner chips let clicks through. When Steam's "In Library" or "Wishlisted" ribbon, a DLC ribbon or a LIVE chip occupies the corner, the chip sits below it. The tooltip shows the developer text (capped at 400 characters) and the script name and version. [code]
- Four modes, cycled by a single eye button docked in the store's global header (a second copy pins to the top-left of the viewport after scrolling past the header; if the header cannot host it, it floats in a corner): skip (no lookups at all), badge (default), blur (card blurred until hovered, with an overlay label), hide (card removed). The mode is stored per browser profile. [code]
- Hide mode also removes the card's leftovers: carousels are recounted to match dots and scrollbars to the games left, sale rows and grids close up and re-centre, short rows keep capsule size with invisible stand-ins, an emptied section takes its heading with it, and a list whose games are all hidden goes away. On React pages it also prunes Steam's own list data before Steam reads it (see section 5). Tabs move the preview to a game still shown. [code]
- Personal hide list: a second eye button toggles a user-made list of games, independent of AI. A button follows the pointer to the capsule under it (22 pixels, a crossed-out eye) and adds or removes that game; app pages get the same button after the title. The list shows modes hide (removed) or show (faded, red outline); an alt-click on the second eye empties the list after a confirm. The list is stored as app ID to game name, re-read before every change to keep two tabs from overwriting each other. [code]
- Share list: export as text (a header line, then one store link and name per line) or as a json file named steam-hidden-games; import accepts the json file, plain text, store links or bare app IDs, adds without removing, caps a file at 2 MB. The README calls this "share your hidden list". [code]
- Manager menu commands: cycle the AI mode, show all hidden games, export, import, and clear the AI disclosure cache. There is no settings page. [code]
- Dismissal and overrides: none for a verdict. The user cannot mark a game "not AI" or silence a single disclosed game except by adding it to the personal hide list. No per-developer or per-tag list. [code]
- Accessibility: the title chip, header buttons and hide buttons are focusable, carry a button role and respond to Enter and Space; the title chip has an ARIA label; the dialog has a role and an ARIA label and closes on Escape; reduced motion is honored for the scroll and pulse. The blur overlay text is drawn by style, not as real text. [code]
- UI languages: English only. Every string is a literal in the source (tooltips, ARIA labels, dialogs, menu entries, the blur overlay). No catalog. [code]
- Non-blocking: the badge never blocks navigation or hides content in the default mode. In hide mode the user opts in. When a page's content security policy blocks the stylesheet, the controls stand down rather than break the layout; before commit c576201 (2026-09-21) the author reports the header button pushed the store content down 914 pixels. [code]

## 5. Privacy and permissions

- Grants (proven, header): set, get, delete and list stored values; add style; register menu command; read script info. No cross-origin request grant and no connect host declaration; the manager shows no connect prompt. The match is the store host. [code]
- Outbound requests: only same-origin GETs of store app pages (the app ID is in the URL path) made with the page's own fetch call. No analytics, telemetry, GitHub call, third-party host or Steam API host. Everything stays on the Valve store host the user is already on. [code]
- Cookies: the lookups pass no credentials option and the browser default for a same-origin request sends the user's Steam cookies. This is inference from the default; I did not observe a request. The project rule requires credentials omitted. [code]
- Cookie writes (proven): (1) the two age cookies in section 2, set for one day when Steam's own birth-date cookie is absent; side effect: the user's own mature-content age gates are also skipped for that day. (2) Steam's recently viewed cookie: each background app-page read adds the game to the user's recently viewed list; after each read the script strips its own reads from that cookie, restores the previous entries, and does the same on page hide and tab hide. The author found this on 2026-09-22 (commit 99eb29d: a demo's page redirects to the full game, which Steam then recorded). [code]
- Page-world code: on React store pages (those that carry an application config element) the script injects an inline script into the page at document start. That script replaces the page's request-open method and fetch function, wraps one of Steam's item-filter helpers, and hands the response text of three Steam calls (the content hub data call, the sale dynamic app query and the signed-in recommended-tags call, the last one binary) to the userscript to remove hidden games before Steam reads them. It also edits the list attributes in the page's config element. This is intrusive page-world patching tied to Steam internals. No remote script is loaded. It does not use eval or Function construction in the userscript itself (the page script is built from a function's source text and a few quoted constants). [code]
- Data stored locally: per app, a row with the disclosed flag, text (400 characters), game name (120 characters) and timestamp; the mode, the personal list mode and the personal hide list; a sweep timestamp. Nothing leaves the browser except as the user's export. [code]
- Developer text is set through text properties and the title attribute, not as markup. [code]
- Update channel: the header update and download addresses are the raw main branch of the repo; any push to main reaches every install on the manager's next check (see section 9). [code]

## 6. Efficiency

- Request pattern: one full HTML app page per unseen game that comes within 300 pixels of the viewport, in every mode except skip. Measured on 2026-10-21: ARC Raiders pages were 181,891, 182,517 and 187,408 characters in three languages (anonymous, uncompressed text length). The store front, which a non-existent ID resolves to, was 983,813 characters. A search page with 25 unseen results is therefore about 4.5 million characters of HTML before compression (arithmetic from the measured page size). [measured]
- Author figure: "this script's own ~120 requests per page view" provoke 429 responses (commit c576201, 2026-09-21). Asserted by the author. [api]
- Throttle: 3 concurrent reads; each read aborts after 15 seconds; the queue is answered newest first; the games on screen go first on infinite-scroll pages (the author reports the deepest badged row went from 221 to 1,040 of 1,100 rows, commit 99eb29d, asserted). Switching to skip drops the whole queue. [code]
- Prefetch: in blur and hide modes, when nothing on screen is waiting and the page is visible, it looks ahead in the lists Steam is about to draw, 12 games deep per list, at most 80 per page load, never while throttled. [code]
- Backoff: pauses all reads for the server's Retry-After value (cap 5 minutes) or a backoff of 30 seconds doubling to 5 minutes after 429 or 503. Failed games retry at 60 and 300 seconds. [code]
- Cache: one stored row per game, positives for 30 days, negatives for 7 days, rows validated on read (type, timestamp and a skewed clock), a daily sweep removes expired rows, no size cap. The cache is read synchronously from the manager per tile. A menu command clears it. [code]
- Observers: one intersection observer on tiles (300 pixel margin); one mutation observer on the whole document element (child list, subtree), never disconnected; debounced to 250 ms after a quiet period and 1,000 ms after 10 sweeps that found nothing new; skipped while the tab is hidden; its own nodes are ignored. A resize observer on the header, a second intersection observer for the follow button, scroll, resize, pointer and visibility listeners, and a patched history push and replace method to catch navigation. Scanned nodes sit in a weak set. [code]
- Size: 166,347 bytes of readable JavaScript for 13 features; no bundle budget. The stylesheet is installed as a constructed sheet first, then a style element, then the manager's call, and each route is checked by measuring a test element. [code]
- Cost shape: no batching and no use of a lighter Steam API; the cost grows with each distinct game seen and repeats every 7 days for negatives. There is no cold-start list. [code]

## 7. Maintenance and responsiveness

- Cadence (source: https://api.github.com/repos/ceeprus/userscript/commits?path=steam/steam-ai-disclosure.user.js , 45 commits). All 45 fall between 2026-06-20 and 2026-10-07, on 15 active days. By month: June 5, July 3, August 1, September 34, October 2. Gaps between active days, in days: 1, 2, 19, 5, 6, 9, 42, 8, 1, 1, 1, 2, 9, 3. The longest quiet stretch is 42 days (2026-08-01 to 2026-09-12). The last change to the script was 2026-10-07, 14 days before 2026-10-21; the repo's last push was 2026-10-17 (another script). [api]
- Versions: header 1.9 at import (2026-06-20), 2.2 on 2026-06-21, 2.3 on 2026-06-23, 2.11 on 2026-09-12, 2.33 to 2.38 on 2026-09-23, 2.39 on 2026-09-25, 2.40 on 2026-10-04, 2.41 on 2026-10-07 (source: commit subjects and bodies in the commit list above). No tags or releases back the version numbers. [api]
- Commit style: plain sentences and "Bump version" in June; conventional-commit style "feat(steam-ai)" and "fix(steam-ai)" from 2026-09-12; "Steam AI disclosure 2.NN: ..." subjects from 2026-09-23. None of the 132 commit messages in the repo carries a co-author or "generated with" trailer (API scan, 2026-10-21). The README calls the repo "vibecoded". [api]
- Issues and PRs, all of them on 2026-10-21: 0 issues (open or closed), 0 pull requests, 0 issue comments, 0 PR review comments (source: https://api.github.com/repos/ceeprus/userscript/issues?state=all , /pulls?state=all , /issues/comments , /pulls/comments). Issues are enabled and the script header names the issues page as its support address. There is no first-response or time-to-close to report. [tracker]
- Breakage and fix history (proven, commits):
  - 2026-06-20 to 2026-07-12 (about 22 days): the update and download addresses in the header pointed at a file name that does not exist; auto-update was dead for anyone who installed 1.9 to 2.3; fixed 2026-07-12 in commit ecab7ee, which says "404, auto-update dead" (source: https://github.com/ceeprus/userscript/commit/ecab7ee). Installs from that window never updated and need a manual reinstall. [api]
  - 2026-07-17: only the capsule link was hidden, not the card (commit 3303035). 2026-08-01: hide "swallowed calendar day cells" (commit cad0db5). 2026-09-12: hide growth "swallowed curator pages" (commit b45ddc6). [api]
  - 2026-09-21: nine silent failures found by an audit (commit c576201): a blocked stylesheet pushed the store down 914 pixels and no tile became visible; 429 and 503 pages were stored as "no AI" for 7 days; an age gate was stored the same way; a stalled socket held a slot forever; a heading in a developer's description caused a false positive that swept 45 KB into the tooltip; a non-object cache row threw inside the observer and stranded 10 of 12 tiles. All fixed in that one commit, with a stated reproduction against the real store origin. [api]
  - 2026-09-22: the charts app re-renders the whole document and dropped the attributes both filters rely on, and hide silently did nothing; hidden games were stored with wrong names (a column label, "<game>'s screenshot 1"); background reads wrote games into recently viewed (commit 99eb29d). [api]
  - 2026-10-04: DLC, demo and soundtrack pages offered the base game's hide button over the title's own; news links, Labs experiments and hardware were treated as games (commit 0904805). [api]
- Turnaround to Steam changes: no case to measure. The 2.40 notes say layouts were fixed "from a store-wide crawl" (asserted). Commit messages say the author tested against mock pages and the live store in Chromium; no test files are in the repo. [api]
- Contributors: one (132 of 132 commits by ceeprus). Bus factor 1. [api]
- Responsiveness in the sense of replies to users: unmeasurable, no tracker activity of any kind. [tracker]

## 8. Reach and trust

- Install counts: none exist. The script is not on Greasy Fork, OpenUserJS or Sleazy Fork. Greasy Fork's user page for ceeprus (user 728005) lists one script, "FFXIV Language redirect", 2 total installs on 2026-10-21 (source: https://api.greasyfork.org/en/users/728005.json , read through a summarizer). Greasy Fork searches for "Steam AI Content Disclosure Badge" and "steam ai disclosure" returned nothing related; OpenUserJS searches for "ceeprus", "steam ai disclosure" and "steam ai content disclosure" returned nothing (the second hit a rate limit and was repeated with another query); a Sleazy Fork search returned nothing (source: https://api.greasyfork.org/en/scripts.json?q=... , https://openuserjs.org/?q=... , https://api.sleazyfork.org/en/scripts.json?q=...). The raw GitHub host serves no counter. [listing]
- Stars 2, forks 0, subscribers 0, 0 open issues on 2026-10-21 (repo API). The stargazer list returns HTTP 404 on an unauthenticated read. GitHub code search for the script path returns only this repo; a repo search for the owner returns only the owner's pages repository (source: gh search code and gh search repos, 2026-10-21). [api]
- Press and community: none found. Web searches for the script name, the owner handle and its features returned only a GamingOnLinux article of 2025-10-21 about a different tool (a userscript that warns on pages with a disclosure); that article predates this repo by 7 months and names neither the owner nor this script (source: https://gamingonlinux.com/2025/10/want-to-avoid-ai-gen-on-steam-this-browser-userscript-might-save-your-day , read through search summaries). Reddit and Bluesky were not searched directly (see section 12). [tracker]
- Trust signals: MIT license; readable source; a single maintainer; a README that says the repo is not for others' use; no releases; auto-update from main; a clean outbound surface (section 5). No security policy, no signing. [api]
- Provenance of ideas: three features of commit 836ebcc (2026-09-12) are described in its body as "shaped after seeeeew/aiwarningforsteam"; the localized heading list came from that project under MIT until the credit was removed on 2026-09-22 (commit 99eb29d). Both facts bear on our credit rule. [api]

## 9. Packaging and distribution

- Install path: click a raw GitHub URL ending in the user-script suffix; the README says that with Violentmonkey "it'll prompt you to install automatically" (source: README). No store listing, no Greasy Fork or OpenUserJS page, no Firefox or Chrome extension (the repo topics list "chrome-extension" and "firefox-extension", but the repo has no extension). [listing]
- Update path: header update and download addresses point to the raw main branch of the repo; the manager's own schedule decides when updates arrive. Every push to main reaches all installs. For the first 22 days the addresses were wrong (section 7). [code]
- Managers named: Violentmonkey (README). Topics also list Tampermonkey and Greasemonkey, but there is no support statement or test evidence for either. The script uses only the older underscore-style manager calls; Greasemonkey 4 replaced them with dotted promise calls; it probably does not run there (inference from the manager's documented API change; untested). [code]
- Menu commands (cycle mode, show all hidden, export, import, clear cache) depend on the manager's menu call; the code checks that the list-values call exists before clearing the cache. The cycle command serves a user left in hide mode with a blocked stylesheet and no visible control. [code]
- Header: runs at document start, skips frames, sets a support URL, an icon (a data URI, no external fetch) and the license. [code]
- Managers tested by me: none. I did not install or run the script. [code]

## 10. Coverage and Restraint evidence

Supports Coverage:

- Most generic scanner among the tools read to date: any app link wrapping an image, Steam's app-ID attribute, plus discovery-queue, hover-popup, sale-widget and tab-preview cases, over the whole store host (section 3). [code]
- Ships the heading in 28 languages, with whitespace and entity tolerance, and avoids asking Steam for a language, which keeps the user's language setting intact. [code]
- Adapts to React re-renders: re-asserts badges that a re-render drops, rescans nodes React reuses for another game, watches the root attributes the filters hang off, handles navigation without a page load. [code]
- Hide mode repacks carousels, grids, rows, tabs and takeover banners and leaves no hole; prunes Steam's own list data before Steam draws it (asserted for the front page, sale pages, the Remote Play hub and signed-in recommendation rows). [code]
- A failed lookup gets a visible "AI?" mark in blur and hide modes, retried twice. [code]

Weakens Coverage:

- Arabic is missing from the heading list: measured miss on 2026-10-21, stored as a clean negative for 7 days (section 2). [measured]
- Adult-only titles that need a per-app age opt-in stay unverified; the script sets a blanket birth date for a day but not the per-app opt-in. [code]
- A non-existent, delisted or redirected app ID is stored as a negative for 7 days with no mark (section 2). [measured]
- The heading match is exact text. A Steam wording change in any language breaks that language silently; there is no automated check in the repo. [code]
- Detection depends on two page features (the content-descriptors block and the app-name element); a Steam markup change breaks both the lookup and the on-page seed. [code]
- Cold start: no seed list; a new profile fetches an app page per tile before any badge. [code]
- English-only UI; Steam client and mobile app out of reach; community host out of scope. [code]
- No tests in the repo; every coverage claim beyond the code rests on commit-message assertions. [api]

Supports Restraint:

- Every outbound request goes to the Valve store host the user is on; no connect host, no analytics, no remote list, no GitHub call from the script. [code]
- Permissions: storage and style calls, one menu call, one info call; no cross-origin grant. [code]
- Wording: "AI" chip with "discloses" in the fallback tooltip; no "uses AI" or "AI-free" copy. [code]
- Non-blocking in the default mode: corner chips pass clicks through; blur and hide are opt-in via the eye; keyboard reachable. [code]
- Does not store a negative from age-gate pages, 429 or 503, login redirects, timeouts or oversize bodies; marks failures in filter modes. [code]
- Throttled: 3 at a time, 15 second abort, Retry-After honored, doubling backoff, daily sweep of expired rows. [code]
- Developer text set as text, not markup. [code]

Weakens Restraint:

- Writes cookies in the user's browser: a one-day blanket birth date (also lifts the user's own age gates for that day) and edits to the recently viewed cookie to hide the script's own reads (section 5). [code]
- Sends Steam cookies on its background reads (default same-origin behavior; unobserved at runtime), against our credentials-omitted rule. [code]
- Patches the page world: replaces fetch and XHR open, wraps a Steam helper, injects an inline script, rewrites Steam's JSON and binary list responses and config attributes. High coupling and breakage risk; the nearest thing to dynamic-code behavior among the tools read to date, though no remote code is fetched. [code]
- A full app page per tile (about 180,000 characters each, measured on one title) in default badge mode; the author reports about 120 requests per page view. [measured]
- The page observer never disconnects and runs in every mode, including skip. [code]
- Tooltip text capped at 400 characters; long developer text is not shown whole. [code]
- Update channel is the owner's main branch with no release step. [code]
- Unknown versus not disclosed is a visible state only in blur and hide modes; badge mode collapses them, and a redirect-to-store-front negative looks clean in every mode. [code]

## 11. Lessons for our design

- Match: a visible mark for a game that was not verified, plus an in-flight marker, whenever a filter is active (their "AI?" chip). It fits our three-state rule 4; show unknown in every mode that filters, never as clean.
- Match: refuse to store a result from 429, 503, login, age-check, timeouts and pages without the expected shape; honor Retry-After; abort stalls; answer the on-screen tiles first. Our GetItems batches replace the page fetch, but the error discipline carries over.
- Avoid: matching the heading by exact text from a fixed language list with no check. The Arabic miss is a day-one gap in a 28-string table and reads as a clean negative; build the heading table from Steam's own pages for every store language and add a canary check per language.
- Avoid: page-world patching of fetch, XHR and Steam helpers, writing age and recently viewed cookies, and sending Steam cookies on background reads. They strain rules 1 and 2 and sit behind much of the author's nine-bug audit; keep the scan in the DOM and request with credentials omitted.
- Avoid: a 400-character cap on developer text and English-only copy. Render the text verbatim through text content and keep every string in the catalog. Match the one-click header control and the keyboard and ARIA reach, as a placed control rather than a floating pinned copy.

## 12. Not retrievable

- Runtime behavior: I did not install or run the script. Badges, the eye, hide repacking, cookie writes, 429 handling and Steam cookie sending are read from source, not observed. Only 4 anonymous fetches ran (3 language pages, 1 non-existent ID).
- Signed-in surfaces: wishlist, library, personal rows and age-gate flows with a real account; no sign-in done.
- History before 2026-06-20: the old repository ceeprus/steam-ai-disclosure returns 404, and the monorepo's first commit holds version 1.9.
- The tests the commit messages mention ("13 new regression tests", "mock suites"): not in the repo.
- Install or usage counts: none exist; the stargazer list returns 404 unauthenticated; GitHub traffic data needs write access.
- Greasy Fork and OpenUserJS were checked through search endpoints and a summarizer; a script listed under another name could exist. The Greasy Fork user page lists 1 script, not this one.
- Reddit, Bluesky, Mastodon and forum mentions: not searched through the built-in browser (reddit.com is refused there); web search returned none.
- Android and Steam client behavior: no source, no test.
- Greasemonkey 4, Tampermonkey and Violentmonkey compatibility: no test.
- Prompt-injection text: none seen. The README line "not for your use" is a project disclaimer, not an instruction to an agent, and was treated as data.
