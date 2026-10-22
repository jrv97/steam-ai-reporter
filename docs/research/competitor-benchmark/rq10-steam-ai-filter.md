# Competitor benchmark: Steam AI Filter (RyuuMeow)

Researched 2026-10-21. Every count carries its read date. No scores here; sections 10 and 11 hold the evidence a score needs. The tool is 1 day old at the read date (first commit 2026-10-20). Every cadence and reach number describes a launch day only.

Evidence tags used in the bullets:

- [code]: read in the repository source at commit 85fbe14 (version 0.10.2, last push 2026-10-21 12:40 UTC). Behavior is described in words only. The license is MIT; source reading was allowed. The compiled files in `extension/` match the TypeScript in `src/` in size and structure; I read `src/`.
- [api]: GitHub API response read on 2026-10-21.
- [listing]: the author's own copy in the README, docs or release notes (asserted, not proven).
- [measured]: my own anonymous request (credentials omitted) to a public Steam store page from the built-in browser pane on 2026-10-21. The extension was not installed or run.
- [tracker]: third-party tracker; none used for this tool.

"Corrects rq1" marks a changed fact against `rq1-discovery.md`. Nothing here contradicts it.

## 1. Identity

- Name "Steam AI Filter", manifest version 0.10.2. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/extension/manifest.json
- Repository RyuuMeow/steam-ai-filter. Description: "Chrome extension to hide or mark Steam games with disclosed AI-generated content", plus a Traditional Chinese line. Topics include ai-disclosure, manifest-v3 and typescript. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter
- Author: one GitHub user, RyuuMeow, account created 2022-06-14, 37 public repositories, 15 followers. [api] https://api.github.com/users/RyuuMeow
- License: MIT. LICENSE file present (1,065 bytes), the API reports `mit`, package.json says MIT, and the install package carries the same file. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter and [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/package.json . The MIT license arrived in commit 4b1b4d9 on 2026-10-20 13:08 UTC ("publish with MIT license"), the same minute the API shows the repository as created. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/commits/4b1b4d9
- Dates: first commit 2026-10-20 05:22 UTC (0e1424f); repository created 2026-10-20 13:08 UTC; last push 2026-10-21 12:40 UTC. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/commits?per_page=100
- Size model: TypeScript in `src/` (12 modules), compiled to plain, unminified JavaScript in `extension/` (committed to the repo for no-build installs), static assets in `public/`, 47 test and fixture files in `tests/` (8 of them Node test files), build and packaging scripts in `scripts/`, documentation in `docs/`. Dev dependencies: TypeScript and Chrome type definitions. No runtime dependencies. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/git/trees/main?recursive=1 and [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/package.json
- Languages by bytes on 2026-10-21: JavaScript 329 KB, TypeScript 140 KB, HTML 57 KB, CSS 35 KB. Repo size 1,698 KB; a 1.15 MB zip of icon artwork is the bulk. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/languages
- State on 2026-10-21: 9 stars, 0 forks, 0 watchers, 31 commits, 1 contributor, 3 releases (v0.7.1, v0.8.0, v0.10.2), 3 tags, 0 issues and 0 pull requests in any state. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter and https://api.github.com/repos/RyuuMeow/steam-ai-filter/contributors
- Scope: Chrome desktop only. The README opens with "A Chrome extension that filters Steam store games using developers' AI content disclosures." No Firefox build, no userscript. [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/README.en.md
- Docs are written first in Traditional Chinese. The English and Simplified Chinese READMEs are shorter; the detailed usage and data-handling document exists in Traditional Chinese only (README.en.md states this). [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/usage.md

## 2. Detection and accuracy

Source of truth

- The only evidence is the developer's "AI Generated Content Disclosure" section on the app's store page. Steam's Artificial Intelligence tag is a theme tag and counts for nothing. Earlier versions had a "broad" level that used the tag; the v0.10.2 release notes and the design doc say the broad level is gone and the tag takes no part in matching. The dialog text still tells the user the tag "may only describe the game's theme". [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/design.md and https://github.com/RyuuMeow/steam-ai-filter/releases/tag/v0.10.2 ; [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/core.ts and src/i18n.ts
- Steam reuses one container for mature-content and AI sections. The code checks the section heading text before it reads the body. [code] core.ts and lookup.ts in the same folder. [measured] confirmed on app 5072580: two descriptor sections, headings "AI Generated Content Disclosure" and "Mature Content Description". https://store.steampowered.com/app/5072580/

How it gets the text

- On a game's own detail page the content script reads the section straight from the page. The heading must be the English wording or one of two Chinese wordings (Traditional or Simplified). [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/core.ts
- On list pages (home, search, sale, wishlist, carousels) a card carries no disclosure. A background service worker fetches the app's store page as HTML with the language forced to English through a URL parameter, then parses it as text. Nothing from the page is run or inserted. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/lookup.ts and https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/background.ts
- The text is the first italic block inside the section, with tags stripped, entities decoded, capped at 2,000 characters. [code] lookup.ts
- Before it says "not found" it checks that the fetched page is the right and a complete page: the page's canonical address names the same app ID, the app-name element and the description element exist, and the document ends with its closing tags. Anything else is "unavailable". It also refuses pages over 4,000,000 characters and non-HTML responses. [code] lookup.ts ; tests cover an age-gate text, a different app's page, a truncated page, a changed layout and an empty quote, all expected "unavailable". [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/tests/lookup.test.cjs
- If the English heading phrase shows up in the page but outside the expected structure, the result is "unavailable" with the reason "format changed". A phrase inside a script block is ignored. This works as a built-in canary for markup changes. [code] lookup.ts and the test file above.
- Redirects abort the request. A delisted ID or a gated page therefore returns "unavailable", never "not found". [code] lookup.ts ; [measured] app 99999999 with redirects disabled: the fetch failed; with redirects followed it landed on the store home page (983,813 characters, no app elements). https://store.steampowered.com/app/99999999/
- Cookies and login state travel with the fetch (credentials included). The first lookup commit (543a42a, 2026-10-20 08:22 UTC) sent no credentials; the next lookup change (2ddd544, 08:58 UTC) added them. The commit message gives no reason. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/commits/2ddd544 and [code] lookup.ts at those two commits.

Verdict states

- Three states: disclosed, not found, unavailable (unknown). "Unavailable" is never turned into "not found" and never shows the green check. Docs: age verification, login, region limits, timeouts and malformed pages stay unknown (usage.md, my translation). [code] lookup.ts and content.ts ; [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/usage.md
- A "checked" icon appears only when a disclosure was read or a full, identity-checked page held none. The icon text says the result does not prove whether AI was used. [code] content.ts and i18n.ts in the same folder.

Categories and how it assigns them

- Seven filter items: Art, Music / sound effects, Voice acting, Story / text, Translation, Code, and Unspecified use (a disclosure exists but no category matched). Only Art is on by default. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/core.ts and i18n.ts
- Assignment is keyword matching on the developer's text. The text is normalized and split into clauses at sentence ends, at contrast words (but, however, while, except) and at some joins where a new subject or action starts. Clauses that deny AI use (no, not, never, without, and Chinese equivalents) or state hand-made or human-made work are dropped; "not only" is read as inclusion. Each remaining clause is checked against six keyword lists, each with English, Traditional Chinese and Simplified Chinese terms. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/disclosure.ts and disclosure-keywords.ts
- Special cases: translated dialogue or text counts as Translation and not as Story; writing code, unit tests or shaders is removed from Story; text-to-speech is removed from Story and falls to Voice; some bare words (model, script, asset, character) are deliberately excluded. [code] disclosure.ts and the comment at the top of disclosure-keywords.ts
- A game is flagged when at least one detected category is selected. With no detected category it is flagged only if Unspecified is selected. An allow-listed game is never flagged. With nothing selected, nothing is flagged. [code] core.ts
- The docs admit the limits: the keyword lists are not a full semantic model, and complex negation or cross-sentence reference can misfire (usage.md, my translation). The README disclaimer says "Local classification may produce false matches or miss AI use". No accuracy test against real Steam disclosures exists in the repo; the disclosure tests I read (first 4,500 characters of the file) use short invented sentences in English and Chinese, such as mixed lists and denials. [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/usage.md and README.en.md ; [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/tests/disclosure.test.cjs
- Effect of the defaults: with only Art selected, a disclosure that names no art term lands in Unspecified and stays unmasked. The test file asserts this for the sentence "AI used during development." under default categories (not hidden). [code] tests/disclosure.test.cjs

Language handling

- List-page cards: works in any store language, because the fetch forces English. [measured] `?l=english` with an `Accept-Language: es` header and no cookies returned 104,042 characters with the English heading; the same URL without the parameter returned 105,701 characters with a Spanish heading and no English phrase; `?l=spanish` returned 105,729 characters, also Spanish. https://store.steampowered.com/app/5072580/ . This is the fix the rq3 note recommended for the other repo-backed tool.
- Detail page of the viewed game: read from the page; it needs an English or Chinese heading. [measured] the Spanish heading is a different phrase with no word in common. Inference: the detail-page notice (a bar stating "This game matches a selected AI use") does not appear in a store language other than English, Traditional Chinese or Simplified Chinese, because the page's own game is never sent for lookup (the lookup only follows list cards that scroll near the viewport). [code] content.ts ; not run.
- Disclosure body language: Steam does not translate the developer's text. Keyword lists cover English and Chinese only; a Spanish, Japanese or Korean disclosure classifies as Unspecified. The README claims heading support for three languages and keywords for three. [code] disclosure-keywords.ts ; [listing] usage.md

Misses and false flags

- Undisclosed AI use is invisible, as for every tool in this set. The README says a missing match "does not prove that no AI was used" (README.en.md, Use section). [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/README.en.md
- Bundles and packages are never judged. A card tied to more than one app, or to a bundle or sub link, is skipped. [code] core.ts ; [listing] usage.md
- No false-flag or miss report exists: 0 issues, 0 pull requests, no store reviews, on 2026-10-21. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/issues?state=all

## 3. Surface coverage

- Content script runs on every path of the store host over https, top frame only, after the document is idle. There is no page allow-list. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/extension/manifest.json ; design.md says page type only changes what the status bar shows.
- Card discovery is generic: links to app pages, app-ID attributes, and the media inside them, expanded up to 12 ancestors to the single-game artwork group, stopping at mixed-game shelves, page roots and navigation. Known layouts get extra handling: Steam search rows, home capsules, tab rows, wishlist rows, home "single recommendation" blocks, Next Fest expanded cards, slides and trailer carousels. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/core.ts and layout.ts
- The viewed game on a detail page stays visible and gets a notice bar; other games on that page are filtered. Store pages with no game cards get no bar. [listing] usage.md
- Named in the docs as covered: home, search, Next Fest and sale pages, categories, charts, wishlist, curator pages, plus "new paths" by the same card logic. [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/usage.md
- Stated gaps: custom carousels and absolutely positioned containers may need extra adaptation; Steam search cards carry only some tags (not used for the verdict); the first lookup takes time, and a card can show briefly before it is masked. [listing] usage.md and README.en.md (the carousel and tag points are in usage.md, my translation)
- Evidence that it works on live Steam: none public. The validation record (my translation) says tests use a local Chromium, a Chrome API stand-in and synthetic Steam HTTP responses, and that the extension was not reloaded in a real Chrome profile and no real Steam account was changed. An optional script checks two public app IDs anonymously. [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/validation.md and docs/development.md
- Steam client: not supported. Steam Community: not supported. Other domains: no. [listing] README.en.md Scope and privacy section.
- Android: not supported (desktop Chrome only). Firefox, Edge as a store: no build; the manifest has a service-worker background only. [listing] README.en.md ; [code] manifest.

## 4. UX and user control

- Four modes on one slider: Off, Mark, Mask (default), Hide. A drag previews the mode and release applies it; keyboard arrows, Home and End work; animations respect reduced motion. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/popup.ts and popup.html in the same folder.
- Mark: a pill reading "AI" plus one pill per detected use (Art, Music / sound effects, Voice acting and the other items); a click opens a dialog with the developer's original disclosure and an "Always show this game" button. [code] content.ts and i18n.ts
- Mask: a frosted blur built from the card's own cover image, labelled "AI-generated content", space kept. On hover or keyboard focus three buttons fade in: Unmask, Allow this game, Not interested. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/mask.ts
- Unmask is per page and temporary: one click reveals the card, an eye button masks it again, switching mode or categories clears it. An optional setting reveals on hover only. [listing] usage.md ; [code] content.ts
- Hide: the whole matching block collapses with a reversible style, not by removing Steam's nodes. Recognized horizontal carousels reflow and collapse when all cards match. A bar lists hidden games with the reason and lets the user open the disclosure or set an exception. [code] content.ts and layout.ts ; [listing] design.md
- Masked cards behave as a locked group: inner content is made inert and hidden from assistive tech, video and audio are paused, Steam hover previews are blocked, and clicks (including middle click) are captured until the user unmasks. Original attributes are restored on unmask. [code] mask.ts and content.ts
- Allow list: per app ID with the title saved. Added from the mask, the disclosure dialog or the hidden list; removed in Settings, Automation and exceptions. Allowed games are skipped by the lookup too. No allow list by developer or publisher, and no block list. [code] content.ts, popup.ts, background.ts
- Check icons: green when checked with no selected use matched, amber when a selected use matched; switchable off. Masked and hidden cards show none. [code] content.ts
- Settings: category toggles on the first screen; a gear opens Checks and cache (recheck interval default, 1, 7 or 30 days; clear lookup cache), Network (request interval 0.7, 1, 2 or 5 seconds; concurrency 1 to 4), Display (check icons, reveal on hover), Automation and exceptions, Language. Writes are serialized and a failed save restores the stored value. [code] popup.html and popup.ts
- Storage scope: settings and cache sit in the browser's local extension storage; the code never uses synced storage, and settings do not follow the user across devices. [code] a scan of all compiled files found no synced-storage call. https://github.com/RyuuMeow/steam-ai-filter/tree/main/extension
- UI languages: English, Traditional Chinese, Simplified Chinese. The first language follows the browser; a Language setting overrides. Game names and the developer's disclosure stay untouched. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/i18n.ts ; [listing] README.en.md
- Developer text is placed in the dialog and bar as plain text; the two inner-markup assignments in the content script and mask carry static templates only. [code] a scan for dynamic markup insertion; content.ts and mask.ts. Not a proof against all injection.
- Wording: the mask says "AI-generated content". The mark pill says "AI". The dialog title says "Original developer disclosure". The check icon says "This does not prove whether AI was used". The first two are stronger than "AI use disclosed". [code] i18n.ts https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/i18n.ts
- Dismissal: the detail-page bar has no dismiss control. Turning the mode to Off removes every mark and restores cards. [code] content.ts
- Missing controls: no per-surface toggle, no developer allow list, no report-a-false-flag, no export of settings, no keyboard shortcut. [code] popup.html and popup.ts

## 5. Privacy and permissions

- Manifest permissions: `storage` and `alarms`. Host permission: `https://store.steampowered.com/*`. Content-script match: same. A service-worker background. Web-accessible resources: 10 icon files, exposed to store pages only. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/extension/manifest.json . Our rule 3 allows `storage` and the content-script match only; this tool also holds host access, a background worker and `alarms` (used for the 30-second ignore timer).
- Outbound hosts: the audit of all 12 compiled script files found network calls only in the lookup module, the ignore module and the background worker, and the only host named is store.steampowered.com. No XHR, no beacon, no eval, no dynamic function constructor, no analytics. [code] https://github.com/RyuuMeow/steam-ai-filter/tree/main/extension ; matches the README: "Network requests go only to the Steam store". [listing] README.en.md
- It does not call api.steampowered.com. All lookups are full store-page fetches. [code] lookup.ts
- Credentials: every request sets credentials to include, cache bypass on the ignore calls, and redirects are errors. Cookies go to Valve as they would from a browser tab. The extension does not read cookie values. [code] lookup.ts and ignore.ts ; [listing] usage.md. Our rule 1 requires credentials omit.
- Local data kept: settings; the allow list (app ID and title); a lookup cache of up to 500 entries including the disclosure text (capped at 2,000 characters each), which is a record of games that appeared on the user's pages; the ignore state described below. Cache is trimmed to the 500 newest on every write. [code] lookup.ts, ignore.ts
- Privacy claims: "Settings, exceptions, and cache stay local. There is no AI API, shared database, or third-party tracking." The code agrees. [listing] README.en.md ; [code] audit above. No privacy-policy page exists because there is no store listing.

Account-writing action (the "Not interested" and automatic ignore features)

- What it does: it adds games to the signed-in Steam account's "ignored" (not interested) list. Two entry points: a per-card "Not interested" button on a mask (one game per click) and an optional automatic mode (off by default). [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/ignore.ts and content.ts ; [listing] README.en.md
- Endpoints, in words: (1) a GET of the store home page to read the account ID and the page's session token from the page's own script data; (2) a GET of the store's user-data endpoint (the path under /dynamicstore/ that Steam's own front end uses) to read the list of ignored apps; (3) a POST to the store's recommendation-ignore endpoint (path under /recommended/) with the session token, the app ID and a flag meaning "add"; (4) a second GET of the user-data endpoint to confirm the game now appears in the ignored list. [code] ignore.ts ; [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/design.md says the request format was checked against Steam's public front-end script.
- Credentials: browser cookies for the signed-in Steam session (credentials included), plus the session token it parses out of the home page. The token lives only in the call chain, never in storage, messages or logs (author's claim; the code agrees on the paths read). The account ID is stored locally. [code] ignore.ts
- Per-card button: the user must make a real click (synthetic clicks are rejected). No confirmation dialog follows. It does not turn on the automatic mode, shares the 30-second spacing with it, and reports success only after the read-back. [code] mask.ts and ignore.ts ; [listing] usage.md
- Automatic mode: a switch in the popup under Automation and exceptions, labelled "Automatically mark as not interested", with one warning sentence beside it ("In Mask or Hide mode, adds matching games to the current Steam account's ignore list"). No modal, no typed phrase. Turning it on checks that Steam is signed in, binds the account, and starts after 30 seconds. [code] popup.html, popup.ts, i18n.ts
- Candidates: only games the user's browsing surfaces, only in Mask or Hide mode, only those matching the selected uses and not allow-listed; a theme tag alone never qualifies. The queue holds at most 200 games, each expiring 15 minutes after it was seen; the pace is one game per 30 seconds across all tabs; the local done list stops at 5,000. [code] ignore.ts ; [listing] usage.md
- Safety behaviors: a durable reservation of the next slot before each request; re-check of settings and cache before sending; skip if already ignored; pause on a login loss, an account switch, a 401 or 403, or an unreadable or changed ignore list; retry after 2 and 10 minutes, pause after the third failure; a 429 or 503 waits at least 15 minutes or the server's Retry-After. Lookups and ignore actions respect one shared cooldown. [code] ignore.ts and background.ts
- What the user must confirm: flipping the switch is the only confirmation. Turning it off cancels the queue but does not undo completed ignores; the user restores a game on its Steam store page. [listing] usage.md
- Disclaimer: the README warns that the feature "changes the current Steam account's ignore list", cites the Steam Subscriber Agreement, and says background queries and automated account actions may bring rate limits or account restrictions. [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/README.en.md
- Cost per ignore action: one home-page fetch (983,813 characters anonymous, measured) plus two user-data reads and one POST. [measured] https://store.steampowered.com/ ; the user-data reads were not called (they need a signed-in session).
- The tool did not hit any Steam account endpoint in this research. I read the code only.

## 6. Efficiency

- Requests per page: one full app-page GET per unseen app, no batch, no use of Valve's batch API. Only cards within 400 px of the viewport are queued, nearest first; hidden tabs queue nothing. [code] content.ts and lookup.ts
- Throttle: default 0.7 seconds between request starts and 2 in flight, shared by all tabs through the background worker; user options 0.7 to 5 seconds and 1 to 4 concurrent. Same-ID requests merge. The queue accepts 32 waiting jobs and answers "queued" (retry after 30 seconds) beyond that. Timeout 10 seconds. A 429 or 503 pauses all lookups for the Retry-After time, between 1 minute and 1 hour, and the pause survives restarts. [code] lookup.ts
- Request cost: the fetched page is large. [measured] 104,042 characters (app 5072580, forced English), 105,701 (same, Spanish), and 296,709 (app 1091500). Inference: a 50-row search page with nothing cached needs 50 fetches, at least 35 seconds of start spacing at defaults, and 5 to 15 million characters of HTML before compression.
- Cache: in the worker memory plus extension storage; 500 entries, newest kept; disclosed results 7 days, not-found results 1 day, unavailable results 5 minutes (the page script adds 30 to 60 second guards for its own errors); user override of 1, 7 or 30 days recomputes from the original check time. A cleared cache keeps the server cooldown. [code] lookup.ts and popup.ts ; [listing] usage.md
- DOM work: a MutationObserver on the body with an attribute filter, batched at 100 ms, re-reads only cards marked dirty; an IntersectionObserver with a 400 px margin; per-card render state is kept in a weak map and an unchanged state skips all DOM writes. Per-card listeners are added (click, key, pointer enter and leave), tied to one abort controller. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/src/content.ts
- Teardown: observers, timers and listeners stop when the extension context is invalidated (after an update) and the cards are restored. There is no pagehide handler in any compiled file. [code] content.ts ; scan of extension/ files.
- Perf evidence: the validation record cites a synthetic run, 200 cards over 20 unchanged refreshes: 8,000 mask updates and 108,000 DOM mutations before the fix, 0 after (commit 82fe1ee, 2026-10-21 12:23 UTC). The record states the figures come from local synthetic cards and are not real Steam frame rates (my translation). [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/docs/validation.md
- Package size: release archive 89,959 bytes for v0.10.2 (RAR); 41 files. Page-injected JavaScript totals about 106 KB across 8 files, plus 8 KB of CSS. The background worker loads about 78 KB of scripts. All unminified. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/releases and https://api.github.com/repos/RyuuMeow/steam-ai-filter/git/trees/main?recursive=1
- Tests: the repo claims 64 Node tests and 25 browser scenarios with 435 assertions; CI runs the type check, the Node tests, the build and a package comparison; the browser scenarios run locally only. Not re-run by me. [listing] validation.md and development.md

## 7. Maintenance and responsiveness

- Commits: 31 in about 31 hours, from 2026-10-20 05:22 UTC to 2026-10-21 12:39 UTC, all by RyuuMeow. Types: 10 feat, 8 fix, 5 docs, 2 ci, 2 chore, 1 each of style, refactor, perf and test. Conventional Commit headers throughout. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/commits?per_page=100
- Releases: v0.7.1 on 2026-10-20 13:11 UTC, v0.8.0 on 2026-10-20 15:22 UTC, v0.10.2 on 2026-10-21 12:41 UTC. No v0.9.x or 0.1 to 0.6 releases. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/releases
- CI: 15 workflow runs on 2026-10-21 (12 Check, 3 Release), all completed with success. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/actions/runs
- Breakage and fix history (from the 8 fix commits, all self-reported by the author, none from a user): homepage filtering and masks (2026-10-20), cards across the store and recommendation groups, complete cards and carousel slots, complete homepage recommendations, popup sizing and invalidated content scripts after an update, horizontal scroll in the popup, restored masks losing their anchor, extension artwork disturbing card grouping (2026-10-21). No fix addresses a Steam markup change or a language problem, since the repo is too new for Steam to have changed under it. [api] same commits URL.
- Issues and pull requests, all of them (read 2026-10-21; both lists empty): none. No date opened, no maintainer response, no close. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/issues?state=all and https://api.github.com/repos/RyuuMeow/steam-ai-filter/pulls?state=all
- Responsiveness: not measurable; no outside report exists. The README has no contact address and no issue template.
- Contributors: one. No outside commit.
- Direction signals: the author added a README disclaimer on account risk (commits c5235b5 and ece04c4, 2026-10-20 15:29 and 15:34 UTC), about 4 hours after the automatic ignore commit (eb9d3e7, 2026-10-20 11:45 UTC), and kept the feature. [api] commits URL above.
- Test depth: 47 test and fixture files for a 1-day-old repo, including fixtures that replay Steam markup the author says it observed. [api] tree URL above ; [listing] development.md

## 8. Reach and trust

- GitHub, 2026-10-21: 9 stars, 0 forks, 0 watchers. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter
- Release archive downloads on 2026-10-21: v0.7.1 22, v0.8.0 51, v0.10.2 20; total 93. Counts include repeat and automated downloads. [api] https://api.github.com/repos/RyuuMeow/steam-ai-filter/releases . No store means no install count.
- Press: none found. Searches on 2026-10-21 by tool name, author name and repository path, in English and Traditional Chinese, returned no page about this tool. The PCGamesN article of 2026-10-21 on Steam AI extensions names Slop-Inator and AI warning for Steam, and does not name this tool (read through a summarizing fetcher; unverified). https://www.pcgamesn.com/steam/ai-browser-extension
- Community mentions: a GitHub search for the repository name returned 0 issues or pull requests that link it. [api] https://api.github.com/search/issues?q=%22RyuuMeow%2Fsteam-ai-filter%22 ; Reddit was not searched (blocked for earlier agents).
- Reviews: none anywhere, since there is no listing. Trust signals: pseudonymous individual, MIT source, a written disclaimer about Steam terms risk, a detailed validation record, CI on every push, no privacy-policy page, no store badge, no contact route. The account-write feature raises the trust bar above that of the read-only tools in this set.

## 9. Packaging and distribution

- Install path: download the release archive (a RAR file, which needs an archiver such as WinRAR or 7-Zip) or the repo ZIP, extract, open the Chrome extensions page, turn on Developer mode, choose Load unpacked, pick the folder that holds the manifest, keep that folder in place. [listing] https://github.com/RyuuMeow/steam-ai-filter/blob/main/README.en.md
- Update path: manual. Copy new files over the same folder, click reload on the extensions page, refresh every Steam tab. No auto-update. [listing] README.en.md Update section. The manifest has no update address. [code] manifest.json
- Why unpacked only: the repository gives no reason. README (3 languages), usage, design, development and validation docs, and the release notes contain no mention of the Chrome Web Store, a submission, a policy or a review. No issue discusses it. The cause is therefore unknown. [listing] all docs read in full on 2026-10-21 (README.md, README.en.md, README.zh-CN.md in part, docs/usage.md, design.md, development.md, validation.md, .github/release-notes.md). Observations that bear on it, without a stated link: the extension POSTs to a Steam endpoint with a token parsed from a page; the README tells users to assess Steam Subscriber Agreement risk; the repo is 1 day old.
- Release pipeline: pushing a version tag runs checks, builds the archive, test-extracts it and compares every file, then publishes a GitHub release with the archive as the only asset. Version tag, package.json, lockfile and manifest versions must agree. [code] https://github.com/RyuuMeow/steam-ai-filter/blob/main/.github/workflows/release.yml ; [listing] development.md
- Stores: none. Firefox, Edge and userscript builds: none. [listing] README.en.md
- Source and build parity: the repository holds the compiled folder users install, and a CI step fails when it differs from a fresh build. [listing] development.md

## 10. Coverage and Restraint evidence

Coverage means working on every Steam surface and store language and surviving Steam markup and translation changes. Restraint means minimal permissions, Valve hosts only, non-blocking UI and honest wording ("AI use disclosed", never "uses AI"). Items marked "limit" count against the list they sit in.

Supports Coverage:

- Runs on every path of the store host with generic card discovery; no page allow-list (section 3, code).
- Forced-English lookups return the English heading in any store language (section 2, measured: Spanish header, English phrase present).
- Page identity, completeness and a "heading seen outside the expected structure" canary keep a changed layout or gate from becoming "not found" (section 2, code and tests).
- Dedicated handling for home recommendation blocks, Next Fest expanded cards, trailer blocks and carousels, with 25 local browser scenarios (section 3, listing).
- Three keyword languages and a three-language UI (section 4, code).
- Limit: no live-Steam test record; validation uses synthetic responses (section 3, listing).
- Limit: the detail-page notice needs an English or Chinese heading; other store languages lose it (section 2, code plus measured Spanish heading).
- Limit: the disclosure body is classified only in English and Chinese; other languages fall to Unspecified, which is off by default (section 2, code).
- Limit: Chrome desktop only; no Firefox, userscript, Android or Steam client (section 3).
- Limit: bundles, packages and unrecognized carousel layouts are skipped or need adaptation (sections 2 and 3).
- Limit: default settings flag only Art; disclosures with no art term pass (section 2, inference).

Supports Restraint:

- Three result states with "unavailable" never shown as "not found"; redirects, gates and truncated pages stay unknown (section 2, code and tests).
- Verbatim developer text shown as plain text in the dialog; the check icon says it does not prove AI was or was not used (section 4, code).
- Only Valve's store host is contacted; no analytics, no remote code, no eval, no synced storage (section 5, code scan).
- Courteous lookups: 0.7-second spacing, 2 concurrent, shared queue, Retry-After honored and persisted, hidden tabs silent (section 6, code).
- Account writes are opt-in, off by default, paced, verified by read-back, and paused on any doubt; the per-card button needs a real click (section 5, code).
- Mask is reversible per card, restores original accessibility attributes, and keeps layout (section 4, code).
- Limit: `alarms`, host access and a background worker are held; our rule allows none of these (section 5).
- Limit: credentials are included on every request, including the page lookups (section 5).
- Limit: it can write to the Steam account ignore list using a session token parsed from a page (section 5).
- Limit: the mask reads "AI-generated content" and the mark reads "AI", not "AI use disclosed" (section 4).
- Limit: masked cards capture clicks and block Steam hover previews until the user unmasks, and Mask is the default mode on first install (sections 4 and 9).
- Limit: the lookup cache is a stored list of up to 500 games the user saw, with disclosure text (section 5).

## 11. Lessons for our design

- Match the forced-English page lookup, the page identity and completeness check before any "not found", the "heading outside expected structure" canary and the tests on gate, redirect and truncated pages. Avoid reading the heading in the page with a three-language list; use one language-independent route for every surface.
- Match the three-state verdict and the "checked does not prove" wording. Avoid "AI-generated content" on masks; use "AI use disclosed" and keep the developer text verbatim in plain text.
- Match per-card Unmask with an eye to mask again, an allow list kept by app ID, serialized settings with rollback on a failed save, and the unchanged-state skip for DOM writes. Avoid per-card listeners, click capture on unmasked-by-default shelves, and a default mode that hides before the user chose.
- Avoid one full store-page fetch per app (100 to 300 KB each, measured) when a batched request returns 50 apps; if a per-use filter is wanted, treat keyword classification as a labelled heuristic in a separate layer, not as the verdict, and measure it on real disclosures first.
- Avoid account-writing actions, `alarms`, host access and a background worker under our rules 1 and 3; if a "not interested" action is ever wanted it needs an ADR first, and this tool's pattern (real click, slot reservation before the request, read-back confirmation, pause on doubt) is the reference to study.

## 12. Not retrievable

- Chrome Web Store: not queried (the built-in browser refused that host for earlier agents; not retried). A search by name found no store page for this tool, but absence there is not proof. The README implies there is no listing.
- Running the extension: not done (clean-room rules; no install). All behavior comes from reading the source at commit 85fbe14. Live behavior on wishlist, signed-in pages and Next Fest layouts was not observed.
- The ignore flow: never called. Its signed-in requests need an account, and the brief forbids account writes. The user-data endpoint response format comes from the author's docs and code only.
- Classifier accuracy: not tested. I did not run the classifier on real disclosures; there is no false-flag rate.
- Press, forums and Reddit: Reddit was not searched; Taiwanese forums were reached only through two general web searches that returned nothing for this tool.
- Two source files not read line by line: `layout.ts` (carousel reflow) and `select.ts` (dropdown widget). Both were covered by the design document and by a scan of the compiled copies for network calls, dynamic code and markup insertion.
- Issue and review turnaround: no data exists; 0 issues, 0 pull requests, no store reviews.
- Page text addressed to AI agents: none seen in the repository or in the pages read.
