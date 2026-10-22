# Competitor benchmark RQ2: AI warning for Steam (seeeeew)

Researched 2026-10-21 (all counts are snapshots from that day unless dated otherwise). "Confirmed" means the earlier note (docs/research/steam-ai-disclosure/rq4-prior-art.md, section 1.1) is checked against a primary source and needs no repeat. "Unverified" means only a summary or a third-party tracker was seen. "Proven" means read from code, manifest, commits or issue threads; "asserted" means store or README copy.

## 1. Identity

- Name "AI warning for Steam", short name "AI warning"; author seeeeew; free; MIT; one author (manifest https://raw.githubusercontent.com/seeeeew/aiwarningforsteam/main/manifest.json; AMO https://addons.mozilla.org/api/v5/addons/addon/ai-warning-for-steam/ ; both read 2026-10-21).
- Repo https://github.com/seeeeew/aiwarningforsteam: MIT (confirmed), created 2025-05-17, last push 2026-09-25, 223 stars, 1 fork, 12 open issues, 16 issues in total, 0 pull requests ever, 14 tags, no GitHub releases, repo size 1,771 KB, no topics, no CI workflow files in the tree, no tests (https://api.github.com/repos/seeeeew/aiwarningforsteam , https://api.github.com/repos/seeeeew/aiwarningforsteam/git/trees/main?recursive=1 , /pulls?state=all , /releases , /tags). The earlier note gave 182 stars on 2026-10-20 or earlier; the count is now 223.
- The tree holds only: LICENSE, README, one script file (16,204 bytes, readable, not minified), the manifest, an icon, and promo images (tree URL above).
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/ai-warning-for-steam/ , add-on ID 2951652, categories "alerts-updates" and "games-entertainment", listing created 2025-10-21, no privacy policy, no EULA, no tags, no promoted badge (AMO API above).
- Chrome Web Store ID clegcobheppnnigaaeelfkeomjcngmnh, publisher shown as "seeeeew's apps", independent publisher (tracker https://extscope.org/extension/clegcobheppnnigaaeelfkeomjcngmnh , unverified; the store page itself could not be read, see heading 12).
- Userscript: the same file, with a userscript header, installed from the repo raw URL; the README links Greasy Fork only as a setup guide for userscript managers and names no listing there or on OpenUserJS (https://raw.githubusercontent.com/seeeeew/aiwarningforsteam/main/README.md ; absence on those hosts is the earlier note's finding and is not re-checked here).
- Size model: free, no donation or payment link on AMO or in the README (AMO API: requires_payment false; README read in full). Support route is GitHub issues plus a developer email on AMO (AMO API).
- Stated scope in the README: "will not add unrelated features" (README above). The README says all variants "run the exact same code" (same README).
- The same author also publishes a sibling for itch.io, repo seeeeew/aiwarningforitchio, MIT, created 2025-11-29, last push 2025-12-03, 23 stars, 0 open issues (https://api.github.com/repos/seeeeew/aiwarningforitchio , announced by GamingOnLinux on 2025-12-03, https://www.gamingonlinux.com/2025/12/theres-now-an-ai-warning-notice-browser-plugin-for-itch-io-as-well-as-steam). One person splits time across two projects.
- A new rival appears in press on the research day: PCGamesN on 2026-10-21 names "Slop-Inator" (Windows, Chrome, Firefox) as "one of the most advanced tools of its kind" and calls the leader's tool one that "does exactly what it says on the tin" (https://www.pcgamesn.com/steam/ai-browser-extension). Slop-Inator is outside this note; flagged for the scoring pass.

## 2. Detection and accuracy

Proven from the script (https://raw.githubusercontent.com/seeeeew/aiwarningforsteam/main/aiwarningforsteam.user.js , read in full 2026-10-21, version 1.1.2):

- Two separate detection paths exist.
  - App page: after the page loads, the script looks inside the store page's content-descriptor section for a heading whose text equals one of the known Steam headings. A match means "disclosure present". The match is an exact string comparison against a built-in table of the heading as Steam words it in each store language. The table has 30 language keys and 28 distinct strings (Spanish and Latin American Spanish share one; Portuguese and Brazilian Portuguese share one). That equals the 30 store languages found by a third party on 2026-06-23 (29 language links plus English; issue 4 comment, https://github.com/seeeeew/aiwarningforsteam/issues/4). The earlier note said "about 33"; the correct figure is 30 keys.
  - Search page: for each result row the script fetches the full store page of that app with the language forced to English, then checks whether the raw HTML contains the English heading in a second-level heading element. This path does not depend on the user's store language.
- The detection signal is only "the section exists". The script reads no flag, no API field and no structured data. It does not parse the disclosure text, so it cannot tell pre-generated from live-generated use, marketing from in-game use, or "no AI was used" from real use. The full disclosure text is shown to the user so the reader can judge (code above).
- The app-page path writes a cache entry for the visited app (present or absent), in the user's language, on every visit. If the heading no longer matches the table (as in the Russian and French breaks), the script records "absent" for that app, and the search path then trusts that entry. Until 1.1.2 (2026-09-25) a stale "absent" entry survived an extension update; the 1.1.2 commit message says "invalidate cached values after extension update" (commit https://github.com/seeeeew/aiwarningforsteam/commit/44bdc31 , commit list https://api.github.com/repos/seeeeew/aiwarningforsteam/commits). That the French break caused this is an inference from timing: the fix and the invalidation shipped within 80 minutes of each other on 2026-09-25.
- The search path does not check the HTTP status, a redirect target or an age gate before it stores "absent". Any response that lacks the heading (an error page, a rate-limit page, an age check page) is cached as "not disclosed" for 7 days (code above; the effect on real Steam responses is an inference and was not tested). This is the unknown-versus-not-disclosed mix-up that our rule 4 forbids. A network failure is handled differently: a thrown fetch error marks the row "failed" in red and caches nothing.
- Heading changes by Steam break detection per language until a release. Known events: Russian heading shortened (issue 1, opened 2026-02-25, https://github.com/seeeeew/aiwarningforsteam/issues/1); Malay added to the store (issue 5, opened 2026-06-13, https://github.com/seeeeew/aiwarningforsteam/issues/5); French heading word changed from "Disclosure" to "Notification" (issue 13, reported 2026-09-24, https://github.com/seeeeew/aiwarningforsteam/issues/13). Three heading-related events between 2026-02-25 and 2026-09-24 (7 months), in a tool whose extension builds exist since 2025-10-21. Confirmed against the earlier note. Issue 4 (a check for changed headings in all languages, opened 2026-05-05 by the maintainer) is still open on 2026-10-21; a reader supplied a working Python checker on 2026-06-23 and the maintainer said on 2026-06-26 they would use it and add a JavaScript version to the repo later (https://github.com/seeeeew/aiwarningforsteam/issues/4). No such check is in the repo tree on 2026-10-21.
- False flags on record (disclosure present, but not generative AI use as the user means it):
  - Upscaling disclosed by one publisher (issue 12, 2026-09-15, https://github.com/seeeeew/aiwarningforsteam/issues/12). Confirmed against the earlier note.
  - Developers who write "no AI was used" in the section (issue 16, opened 2026-10-21, https://github.com/seeeeew/aiwarningforsteam/issues/16; a theory by the opener, no example game named).
  - A developer who uses AI only for translation reports their own game labeled as "garbage AI" (Chrome review 2026-08-22 on a tracker, unverified, https://extscope.org/extension/clegcobheppnnigaaeelfkeomjcngmnh).
  - A reader on the Chrome listing wants "an option to report false flagging" (2025-12-04, same tracker, unverified); no report channel exists in the tool.
- Misses on record: games that use AI but carry no disclosure are invisible by design. One Chrome reviewer complains that a game with AI art "as in-game arts" is not marked (2026-07-11, tracker, unverified); the cause (missing disclosure versus a table gap) is not stated.
- No accuracy figure exists anywhere in the project; no tests; no sample set of known pages (tree URL above).

## 3. Surface coverage

- Matched URLs, from the manifest: store app pages and store search pages only; both http and https are allowed in the extension, https only in the userscript header (manifest and script above).
- Not covered, from the manifest and from maintainer replies: home page and sale pages (issue 15, opened 2026-10-21, no reply yet, https://github.com/seeeeew/aiwarningforsteam/issues/15), category and tag pages and wishlists (issue 10: the maintainer replied on 2026-07-20 "this will be added to both category and wishlist pages in the future", https://github.com/seeeeew/aiwarningforsteam/issues/10), search auto-complete suggestions (issue 7, maintainer wants it, blur only, https://github.com/seeeeew/aiwarningforsteam/issues/7), the curator-review activity feed (issue 9, maintainer: "Yes, this will be added at some point", https://github.com/seeeeew/aiwarningforsteam/issues/9).
- Chrome reviewers ask for the same gap: "Doesn't show on games until you go on the game page." (2026-06-16) and a wish for game tag and list pages (2026-07-19), both tracker-sourced and unverified (https://extscope.org/extension/clegcobheppnnigaaeelfkeomjcngmnh).
- Steam desktop client: no official support. The maintainer wants it but cannot run the plugin loader Millennium on their system (issue 3, 2026-05-04, https://github.com/seeeeew/aiwarningforsteam/issues/3). Readers report three working routes: Millennium with the Extendium plugin; installing the Chrome build from the Web Store inside the client's own browser (works on Linux, Windows and Steam Deck gaming mode per comments dated 2026-06-21); the userscript run through AdGuard desktop (comment 2026-10-01). The maintainer declined a README guide on 2026-06-26 because it "might look like official support" (same issue). Confirmed against the earlier note (issue 3 has 11 comments and 3 reactions on 2026-10-21).
- Mobile: Firefox for Android is declared compatible from version 120.0 on AMO (https://addons.mozilla.org/api/v5/addons/addon/ai-warning-for-steam/versions/?page_size=50); the README says the userscript works in any browser with userscript support on desktop or mobile (README above). The project makes no Chrome-for-Android claim; a reader asked on 2025-12-03 whether it works in Chrome-based Android browsers and no answer is visible (GamingOnLinux comments, https://www.gamingonlinux.com/2025/12/theres-now-an-ai-warning-notice-browser-plugin-for-itch-io-as-well-as-steam). Whether the search sidebar block works on Steam's mobile layout is not tested.
- Steam mobile app: not covered; no issue asks for it.
- Other surfaces readers ask for outside the issue tracker: Workshop items (ResetEra post, 2026-10-20 or 21, relative timestamp only, unverified as to date, https://www.resetera.com/threads/steam-next-fest-oct-2026-has-8k-game-demos-twice-the-amount-of-june-2026-we-are-drowning-in-ai-shit.1664863/page-4).

## 4. UX and user control

Proven from the script unless marked:

- App page: a full-viewport overlay with a heavy background blur and a dark tint opens on every load of an app page that has a disclosure. The overlay holds Steam-styled modal chrome: a title (the disclosure heading plus the app name), a scroll area (350 px max height) with the developer's text copied from the page, a Close button, a corner close control, and a faint watermark link to the repo with the name and version. Click on the backdrop also closes it. The source registers click handlers only; no keyboard handler for Escape appears in the file.
- The page behind is left in place and visible only through the blur until the modal closes.
- Dismissal is per page load. There is no "do not show again", no per-game or per-developer setting, no setting to turn the modal off, no toolbar button, no options page and no popup (manifest has no action or options entry). The maintainer's answer on 2026-07-12: not a priority, a settings panel might come later, and in the meantime readers can restyle with a CSS manager (issue 8, https://github.com/seeeeew/aiwarningforsteam/issues/8).
- Known layout bug: very long disclosures push the Close button out of view and let the watermark overlap the text (issue 2, opened 2026-05-04, open, no maintainer comment, https://github.com/seeeeew/aiwarningforsteam/issues/2).
- Search page: a block titled "Narrow by AI Generated Content Disclosure" is added to the search sidebar with two choices, blur and hide. Default is blur on first use. Clicking the active choice again turns the feature off ("show"). The choice and the block's collapsed state are stored. A row being checked shows a small spinner and the text "Checking for ..." in English; a failed check shows a faint red "failed" note (hidden in off mode). A blurred row shows a centered English line "... found" and a faint watermark with name and version; hovering unblurs it.
- Overrides: none today. Planned or discussed: per-game exceptions "further down the road", extended to developers and publishers (issue 12, maintainer reply 2026-09-25); an "ignore this game" button in the popup (issue 6, "very low priority", opened 2026-06-15); an ignore button in the blur state (issue 11, labeled wontfix on 2026-09-25 because it would mean touching Steam's own events or DOM).
- The tool's own UI languages: the popup heading and the Close button come in all 30 store languages; the search sidebar text, the loading and failed notes, the blur label and the watermark are English only. The README says "not all features are translated into languages other than English" (README above). Store and AMO listings are English only (AMO API default locale en-US; README statement of 2025-10-24 in commit https://github.com/seeeeew/aiwarningforsteam/commit/30cc569).
- Reader feedback on UX: praise for the "obvious" popup and for blur (heading 8); complaints on the Chrome listing about the popup ("annoying popup", 2026-06-16) and a wish for an inline cue next to the title (2026-05-30), both tracker-sourced and unverified (https://extscope.org/extension/clegcobheppnnigaaeelfkeomjcngmnh). Two commenters on the Augmented Steam thread also dislike the modal (see heading 8).

## 5. Privacy and permissions

- Manifest 1.1.2: manifest version 3, one permission (storage), no host permissions, no background script or service worker, no action, no options page, one content script on the two match patterns, a Firefox ID and a data-collection declaration of "none" (manifest above). Confirmed against the earlier note.
- AMO file for 1.1.2 lists permissions as storage plus the two match patterns, no optional permissions, data collection "none"; AMO shows no privacy policy and no EULA (AMO API above, 2026-10-21).
- The AMO page shows users one required-permission line, "Access your data for store.steampowered.com", and says the developer states the extension does not require data collection; the footer links only Mozilla's general privacy page (https://addons.mozilla.org/en-US/firefox/addon/ai-warning-for-steam/ , read 2026-10-21). The storage permission does not appear in that prompt.
- Versions 0.2.5 through 1.0.3 had no storage permission and matched app pages only; storage and the search match arrived with 1.1.0 on 2026-06-19 (AMO versions API https://addons.mozilla.org/api/v5/addons/addon/ai-warning-for-steam/versions/?page_size=50 ; the 1.0.2 manifest diff in commit https://github.com/seeeeew/aiwarningforsteam/commit/7e27fe7). Data collection "none" is declared for 1.0.0 and later, not for 0.2.5.
- Chrome install prompt: storage only plus the two sites, per a tracker (extscope link above, "storage only", unverified); the Chrome listing's own privacy tab was not readable. The tracker says the Chrome page has no privacy policy and that the listing description says the tool fetches each game's Steam page to detect disclosures and caches the results (same tracker, unverified).
- Outbound requests, proven from the script: (1) the full store page of each uncached app on the search page, from the store origin; (2) a loading-spinner image from Valve's community CDN host (a static image, no app ID in the URL). No other host is named. The fetch sets no credentials option, so it uses the browser's default for same-origin requests, which includes the user's store cookies (inference from the absence of an option; not tested). The app IDs visible on a search page therefore go only to Valve; the project's own rule is stricter (credentials omitted).
- Local storage: config in the browser's synced storage (filter mode, collapse state, last version, last update time) and per-app cache entries in local storage (script above). In the userscript the same data goes to the manager's value store. Synced storage means the filter choice may travel between a user's browsers; no personal data is stored.
- Injected markup: the popup title is built by placing the page's app name into an HTML string without escaping (script above). The source of that text is Steam's own page, so the exposure is small; it still contradicts a verbatim-through-text-content rule.

## 6. Efficiency

- App page: zero extra requests; one local storage write per page view of any app page (script above).
- Search page, per uncached result row: one full store page download (HTML of the whole page) in English. All rows found are checked in parallel with no concurrency limit, no queue, no viewport gating, no abort and no batching. Steam's batch item API is not used (script above; no mention of any API host in the source).
- A single mutation observer watches the result list and its subtree; every DOM change in the list triggers a new query for rows without a checked mark, so each row is checked once per page load. The observer is never disconnected (no page-hide cleanup in the file). Turning the filter off stops all checks.
- Cache: positive entries 30 days, negative entries 7 days; entries older than the last time the extension changed version are ignored (1.1.2 onward). Confirmed against the earlier note, with the addition that the version rule is new on 2026-09-25 (commit 44bdc31 above). Stale entries are ignored when read, never deleted (no cleanup code), so the local cache only grows.
- With a warm cache a search page costs only local storage reads.
- Size: script 16,204 bytes raw; Chrome package 12,714 bytes (Web Store update check, https://clients2.google.com/service/update2/crx?response=updatecheck&prodversion=130.0.0.0&acceptformat=crx3&x=id%3Dclegcobheppnnigaaeelfkeomjcngmnh%26uc , metadata only, nothing downloaded); Firefox package 17,606 bytes (AMO API above). Tracker shows 12.42 KiB for Chrome (extscope above).
- Performance complaints: none found in the 16 issues, in the 32 AMO ratings, or in the 10 Chrome review excerpts on the tracker. No issue mentions rate limiting from Steam. A worst-case search page with a cold cache starts one parallel full-page fetch per row (inference from code; not measured).

## 7. Maintenance and responsiveness

Commit history (https://api.github.com/repos/seeeeew/aiwarningforsteam/commits plus each commit's file list, read 2026-10-21): 20 commits on main, all by seeeeew, no pull requests, no outside contributor commits ever.

- 2025-05-17 and 2025-05-18: 7 commits in about 2 hours (23:06 to 01:05 UTC), from the initial commit to userscript version 0.2.3; 13 more commits follow.
- Silence from 2025-05-18 to 2025-10-21 (156 days). It ends on the day the first press article ran (GamingOnLinux, 2025-10-21 10:43 UTC, confirmed: https://www.gamingonlinux.com/2025/10/want-to-avoid-ai-gen-on-steam-this-browser-userscript-might-save-your-day); the commits that day, from 20:38 UTC, add a logo and a new screenshot, and the AMO listing was created at 21:24 UTC.
- 2025-10-24: native extension manifest added (the AMO 0.2.5 file is dated 2025-10-21).
- Last 12 months (2025-10-21 to 2026-10-21): 13 commits on 8 distinct days: 2025-10-21, 2025-10-24, 2025-11-30, 2025-12-02, 2026-02-25, 2026-06-13, 2026-06-19, 2026-09-25.
- Silences inside the year: 2025-12-02 to 2026-02-25 (85 days), 2026-02-25 to 2026-06-13 (108 days), 2026-06-19 to 2026-09-25 (98 days). No commit since 2026-09-25 (26 days as of this note).
- Releases: no GitHub releases; 14 tags (0.1.0 to 1.1.2). Version 1.1.1 exists as a tag and commit (2026-09-25) but not on AMO; the AMO list jumps from 1.1.0 to 1.1.2.
- Release history with dates and what each fixed (AMO versions API above, matched with commits):
  - 1.0.0 (2025-11-30): more info in the popup (app name, localized Close, watermark).
  - 1.0.1 (2025-12-02): a stray untranslated string replaced by punctuation.
  - 1.0.2 (2026-02-25): Russian heading changed by Steam; fix commit 17:07 UTC, AMO upload 17:32 UTC.
  - 1.0.3 (2026-06-13): Malay added.
  - 1.1.0 (2026-06-19): search blur/hide and the sidebar block; 299 lines added.
  - 1.1.1 (2026-09-25, not on AMO): French heading.
  - 1.1.2 (2026-09-25): cache invalidation after update; AMO notes say French fix.
- Fix speed from fix commit to the AMO upload: 25 min (1.0.2), 14 min (1.0.3), 6 min (1.1.0), 24 min (1.1.2) (commit and AMO file times above). On 2026-09-25 the maintainer reported the Firefox build live 10 minutes after its upload (16:44 to 16:54 UTC, issue 13) while the Chrome version was "awaiting approval". The Chrome approval date for 1.1.2 is not retrievable; a tracker crawl still showed 1.1.0 on its date (https://chromeboard.com/extension/ai-warning-for-steam-clegcobheppnnigaaeelfkeomjcngmnh , unverified), and the Chrome update check reports 1.1.2 on 2026-10-21.

Issues (all 16, none is a pull request; times in UTC from https://api.github.com/repos/seeeeew/aiwarningforsteam/issues?state=all , comments and events endpoints, read 2026-10-21). First maintainer response means the first comment or label-with-reply by seeeeew after the opener; "self-filed" means the maintainer opened it.

- 1 Detection broken in Russian: self-filed 2026-02-25 17:06; closed 17:07 (1 min), by the fix commit; theme: Steam changed a heading.
- 2 Display issues with very long disclosures: self-filed 2026-05-04; open; no comment; theme: layout bug.
- 3 Steam desktop client: self-filed 2026-05-04; first outside comment 2026-06-21 (47 days); first maintainer comment 2026-06-26; open; theme: client support.
- 4 Check heading changes in all languages: self-filed 2026-05-05; first maintainer comment 2026-06-26 (after an outside script); open; theme: language canary.
- 5 Malay support: self-filed 2026-06-13 02:31; closed 13:17 (10 h 46 min); theme: new language.
- 6 Ignore button in the popup: self-filed 2026-06-15; open; no comment; theme: convenience.
- 7 Blur in search suggestions: opened 2026-06-20 by a reader; first maintainer response 2026-06-26 (5 d 16 h); open; theme: surface gap.
- 8 Control the blurring: opened 2026-06-30; response 2026-07-12 (12 d 9 h); open; theme: popup customization.
- 9 Curator reviews in the activity feed: opened 2026-07-11; response 2026-07-13 (1 d 10 h); open; theme: surface gap.
- 10 Blurring on category pages: opened 2026-07-20; response 2026-07-20 (2 h 25 min); open; theme: surface gap, wishlist.
- 11 Ignore button in blur state: opened 2026-08-25; response 2026-09-25 (30 d 21 h); wontfix label, still open; theme: convenience.
- 12 Whitelist for developers and publishers: opened 2026-09-15; response 2026-09-25 (10 d); open; theme: false flag, allow-list.
- 13 Detection broken in French: opened 2026-09-24 16:25 by a reader; first maintainer response 2026-09-25 09:51 (17 h 26 min); closed 2026-09-25 16:40 (24 h 16 min); theme: Steam changed a heading.
- 14 Millennium plugin version: opened 2026-10-20 23:00; answered and closed as duplicate of 3 on 2026-10-21 00:08 (1 h 8 min); theme: client support.
- 15 Support for sale pages: opened 2026-10-21 07:42; no response yet (12 h 49 min at 20:31 UTC); theme: surface gap.
- 16 Actually show the disclosure: opened 2026-10-21 09:56; no response yet (10 h 34 min); theme: false positives from "no AI used".

Turnaround for closed issues: only 4 issues have ever been closed, so a "last 10" figure does not exist. The four: 1 min (issue 1), 1 h 8 min (issue 14), 10 h 46 min (issue 5), 24 h 16 min (issue 13). Median about 5 h 57 min. Two of the four (issues 1 and 5) were opened by the maintainer: issue 1 one minute before the fix commit, issue 5 about 11 hours before it. Reader-reported turnaround therefore rests on issues 13 and 14 alone.

Open issue first responses to readers: 2 h 25 min, 17 h 26 min, 1 d 10 h, 5 d 16 h, 10 d, 12 d 9 h, 30 d 21 h (issues 10, 13, 9, 7, 12, 8, 11). Responses cluster on a few days (2026-06-26: issues 3, 4, 7; 2026-09-25: issues 11, 12, 13), which points to batch triage. Bugs get answered fastest; feature requests wait days to weeks.

Stated maintainer positions (all in the issue threads above, dates UTC):

- Allow-list (issue 12, 2026-09-25): per-game exceptions were already considered "further down the road" and would extend to developers and publishers: "I'll probably add this at some point, but don't expect it too soon". Not started; no commit since.
- Modal (issue 8, 2026-07-12): "Currently this is not a priority for me"; a settings panel may come first and a modal setting after it; a CSS manager is the stopgap proposed. The popup stays the core feature (README, AMO description).
- Steam client (issue 3, 2026-05-04 and 2026-06-26): the maintainer wants to "officially support this in the future" but cannot run Millennium on their system, and will not write a README guide before testing it. On 2026-10-21 the maintainer closed issue 14 (a request for a Millennium plugin) as a duplicate and pointed to the Chrome build plus Extendium or a user video.
- Language checks (issue 4, opened 2026-05-05): the maintainer wants an automated check for changed headings in all languages; on 2026-06-26 they said they would use a reader's Python script and add a JavaScript version to the repo later. Not shipped by 2026-10-21; the French break happened 2026-09-24.
- Search suggestions (issue 7, 2026-06-26): wanted, blur only, because hiding suggestions could empty the list. Curator feed (issue 9, 2026-07-13) "will be added at some point". Category and wishlist pages (issue 10, 2026-07-20) "in the future". No commits for any of these by 2026-10-21 although issues 7, 9 and 10 were assigned to the maintainer on 2026-07-20.
- Ignore button (issue 6, 2026-06-15) "very low priority"; in the blur state (issue 11, 2026-09-25) declined as wontfix: it would mean touching Steam's own events or DOM, "more effort and risk than I'd like".
- Scope (README): "will not add unrelated features". Reuse (Augmented Steam issue 1913, 2025-10-27): offered the MIT code to that project.

Open issue themes (12 open on 2026-10-21): surface gaps (7, 9, 10, 15), Steam client (3), language canary (4), popup customization and ignore (6, 8, 11), allow-list (12), layout bug (2), false positives from non-AI disclosures (16). No open issue is a crash or a data problem.

## 8. Reach and trust

- Firefox, 2026-10-21: 5,551 daily users, 701 weekly downloads, 32 ratings all 5 stars, Bayesian 4.79, 11 with text; ratings API read in full (https://addons.mozilla.org/api/v5/ratings/rating/?addon=ai-warning-for-steam&page_size=50). The earlier note said 5,475 users and 29 reviews; confirmed, counts grew. No maintainer reply on any AMO review.
- Chrome, per trackers only (unverified): 10K users, 4.2 average from 21 ratings, 13 with text, version 1.1.2 on one tracker and 1.1.0 on another (https://extscope.org/extension/clegcobheppnnigaaeelfkeomjcngmnh , https://chromeboard.com/extension/ai-warning-for-steam-clegcobheppnnigaaeelfkeomjcngmnh). An earlier crawl of the same two trackers showed 2K+ users, 4.6 from 10 ratings, version 1.0.2 (seen through a search-result summary; crawl date not stated). PCGamesN reported "about 4,000" Chrome installs on 2026-06-16 (https://www.pcgamesn.com/ai/extension-warns-steam-generative-ai). Chrome installs therefore went from about 2K to about 4K (2026-06-16) to about 10K (2026-10-21), a rise that follows the June and October Next Fest press waves (cause is an inference from timing).
- Combined reach: about 15.5K users across both stores (5,551 + 10K; inference from two figures of different quality).
- GitHub stars: 223 on 2026-10-21 (182 in the earlier note). The stargazer history endpoint returned 404, so star growth by date is not available.
- AMO review themes (11 with text, all 5 stars):
  - Praise for an obvious popup: "does exactly what it says in a elegant (and more importantly obvious) manner" (2026-06-20).
  - Praise for blur and hide: a 2026-07-18 reader says it "looks exactly how I imagine Valve would" do it.
  - Value statements: "Absolutely obligatory addon if you value art." (2026-06-21).
  - Two non-English reviews (Russian 2026-08-04, German 2025-12-07).
  - One feature idea (2025-12-08): remember games that later drop their disclosure, with a note on server load.
  - No review mentions a false flag, a miss, a crash or slowness.
- Chrome review themes (10 of 13 text reviews visible on the tracker, truncated, unverified): four 5-star, one 4-star, two 3-star, one 2-star, two 1-star among the 10 visible. The tracker's distribution for all 13 text reviews is seven 5-star, one 4-star, two 3-star, one 2-star, two 1-star, so the 3 hidden reviews are 5-star (inference); five of 13 text reviews give 3 stars or fewer.
  - Negative: "Doesn't show on games until you go on the game page." (1 star, 2026-06-16); "Useless lazy extension" (1 star, 2026-07-11); a 2-star note that some AI-using games are not marked (2026-07-11); a 3-star "Works, but without mercy." (2026-09-10).
  - Mixed: a game developer says their own game was labeled although AI only helped with translation (5 stars, 2026-08-22); wish for customization (4 stars, 2026-05-30); wish for tag and list pages (5 stars, 2026-07-19); "needs an option to report false flagging" (3 stars, 2025-12-04).
  - Positive: "Really helpful, thanks!" (5 stars, 2026-09-11); a Spanish review praising the popup (5 stars, 2026-01-13).
- The Chrome crowd rates lower and complains of coverage and false flags; the Firefox crowd rates 5 stars throughout and writes about values. Whether that reflects audience or selection is unknown.
- Press (date, outlet, what it says; no outlet reports a complaint about the tool itself):
  - 2025-10-21 GamingOnLinux: userscript that shows a warning before the page can be used; 39 reader comments, where one reader calls it "an incredibly simple script"; readers ask to fold it into Augmented Steam and ask about Steam building it in (https://www.gamingonlinux.com/2025/10/want-to-avoid-ai-gen-on-steam-this-browser-userscript-might-save-your-day). Confirms the earlier note.
  - 2025-12-01 TheGamer: tells readers to "expect the warning to pop up a lot"; browser only (https://www.thegamer.com/browser-extension-stops-you-from-buying-ai-slop-on-steam/).
  - 2025-12-02 Outlook Respawn: free, browser only, not in the Steam app (https://respawn.outlookindia.com/gaming/gaming-news/free-ai-warning-tool-flags-generative-content-on-steam-store).
  - 2025-12-03 GamingOnLinux (itch.io sibling) and a personal blog post by a user who calls the popup intrusive but says it "works seamlessly like a dream" (https://shadenexus.ca/blog/posts/2025-12-03-ai-warning-steam.html).
  - 2026-06-16 PCGamesN (about 4,000 Chrome installs; credits a post on X for finding it; says it runs only in Chrome, which is wrong, a Firefox build exists), the Gardiner Bryant blog, and MeinMMO (German; free; not in the Steam app) (https://www.pcgamesn.com/ai/extension-warns-steam-generative-ai , https://gardinerbryant.com/solve-the-steam-next-fests-ai-problem-with-this-extension/ , https://mein-mmo.de/google-addon-warnt-vor-ki-in-spielen/).
  - 2026-06-22 GamingOnLinux (search blur and hide), 7 comments, none about the tool's flaws (https://www.gamingonlinux.com/2026/06/the-ai-warning-for-steam-browser-plugin-adds-steam-search-filtering/).
  - 2026-06-30 games.gg: says the tool "went viral"; Steam client workaround unconfirmed (https://games.gg/news/steam-ai-disclosure-plugin-sweeney-valve/).
  - 2026-10-20 Shane the Gamer: Next Fest October edition with 8,202 demos; the tool flagged as an answer; the article repeats that undisclosed AI is not caught (https://www.shanethegamer.com/news/steam-next-fest-ai-games-filter/).
  - 2026-10-21 PCGamesN: calls it a tool that "does exactly what it says on the tin"; names a newer rival, Slop-Inator (https://www.pcgamesn.com/steam/ai-browser-extension).
  - A gHacks article (2025-10-29) named in the earlier note was not found by search or fetch on 2026-10-21; unverified.
- Community threads:
  - ResetEra, 2026-06-15: six posts; praise ("This is so excellent") and the one downside "only works on the browser version of the store" (https://www.resetera.com/threads/steam-next-fest-has-over-8-600-demos-and-almost-1700-of-them-have-ai-disclosures.1551832/).
  - ResetEra, 2026-10-20 (shown as "Yesterday"): five posts; "This extension is great!", it makes disclosures "way more obvious"; a wish to cover Workshop items (https://www.resetera.com/threads/steam-next-fest-oct-2026-has-8k-game-demos-twice-the-amount-of-june-2026-we-are-drowning-in-ai-shit.1664863/page-4).
  - Lemmy repost of the itch.io article, about 10 months before 2026-10-21: one commenter says the tool "basically just checks if there is a disclosure" and distrusts extension data access; another welcomes it (https://piefed.nullspace.lol/post/68020).
  - Augmented Steam issue 1913 (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/1913): the maintainer offered the MIT code on 2025-10-27 and said they were too busy to port it themselves (confirmed). Two readers dislike the leader's UX: on 2026-06-22 a "modal box that blocks the entire page" and a wish for a red banner like the DRM one; on 2026-10-19 that it "has no options" and blurs search results. The 2026-10-19 comment also says the developer ruled out customization and that the tool "hasn't been updated since July". Both claims fail on the record: the maintainer called customization "not a priority" with a settings panel possible later (issue 8, 2026-07-12), and version 1.1.2 shipped 2026-09-25. The same comment notes that some developers use the section to say they do not use AI.
  - Reddit, Hacker News and Bluesky threads: Reddit blocks the search tool; Hacker News search returned 0 hits; Bluesky posts were not found by search (see heading 12).

## 9. Packaging and distribution

- Stores: Firefox AMO and Chrome Web Store, plus the userscript from the repo (README above). Edge store: not checked.
- Update path: AMO and Chrome review each update; the README claims "usually" less than a day. The userscript updates at once through its update URL set in the script header (script above). On 2026-09-25 the maintainer wrote that Userscript and Firefox were live and Chrome was awaiting approval (issue 13 comment, https://github.com/seeeeew/aiwarningforsteam/issues/13).
- Source: public, MIT, one script file shared across all three variants; the extension manifest points at the same file as the userscript. The repo has no build step, no package file and no lockfile (tree above), so there is no dependency list and no toolchain to audit.
- Manifest version 3 in the repo and in the Firefox file (the Chrome side is a tracker statement, unverified). Firefox minimum 109.0a1 for desktop and 120.0 for Android (AMO API).
- Differences between builds: both stores list version 1.1.2. The Chrome package is 12,714 bytes (update check above) and the Firefox package 17,606 bytes (AMO API; the AMO page shows 17.19 KB, the same figure); the packages differ in size and may differ in file set, but neither was downloaded, so content differences are not checked. The manifest in the repo carries the Firefox ID block, which Chrome ignores. The README says every variant runs the same code. Proven same source in the repo; not verified inside the two published packages.
- Store listing languages: English only (README 2025-10-24 statement; tracker shows 1 language for Chrome).
- Listing copy asserts two features: a modal popup on pages with a disclosure and blur or hide in search (AMO description).

## 10. Coverage and Restraint evidence

Supports Coverage:

- Heading table covers all 30 store languages (issue 4 comment 2026-06-23 plus script).
- Search results get blur or hide on top of the app page popup (script; AMO description).
- Runs as Firefox desktop, Firefox for Android, Chrome and userscript (AMO API, README).
- Works inside the Steam client by three community routes (issue 3).
- Search path forces English, so search detection survives a heading change in the user's language (script).
- Missing: wishlist, category, sale, home, suggestions, curator feed (issues 7, 9, 10, 15; Chrome reviews).

Supports Restraint:

- Single storage permission, no host permissions, no background code, data collection "none" on AMO (manifest, AMO API).
- Two URL patterns only (manifest).
- Shows the developer's full text so the reader can judge (script).
- Stated scope: no unrelated features (README).
- Maintainer declines changes that touch Steam's own events or DOM (issue 11, 2026-09-25).
- Counter-evidence: a full-page modal with no off switch, blur on by default in search, any disclosure treated as a warning, false flags for upscaling and translation (issues 8, 12, 16; Chrome reviews).

## 11. Lessons for our design

- Match: the permission footprint (storage only, no host permissions, no background code) and showing the disclosure text verbatim next to the verdict.
- Match: force an English store page or a language-neutral source for list surfaces, so a changed translation cannot hide a game; add the canary check the maintainer opened as issue 4 and never shipped.
- Avoid: caching "not disclosed" from any response that lacks the heading; store "unknown" for failed, redirected or age-gated fetches (their search path stores a false negative for 7 days).
- Avoid: a blocking modal with no off switch and blur on by default; users asked for inline cues, tag and wishlist coverage, a game or publisher allow-list and a false-flag channel (issues 8, 10, 12; Chrome reviews).
- Avoid: one full-page download per row in parallel with no limit and a never-pruned cache; batch by app ID and bound the cache.

## 12. Not retrievable

- Chrome Web Store page and Reviews tab: the built-in browser refuses chromewebstore.google.com ("only works in a full browser"); WebFetch gets a Google consent redirect that cannot be answered without a form post. No Chrome user count, rating, review text, privacy tab or listing languages from the store itself; third-party trackers fill in and are marked unverified. Three of 13 Chrome text reviews are not visible even on the tracker.
- Contents of the published Chrome and Firefox packages: not downloaded (rule); only sizes and versions from the Web Store update check and AMO were read, so the two builds are not byte-compared. AMO's online code viewer (code.addons.mozilla.org) did not resolve from the fetch tool.
- Approval date of Chrome 1.1.2: no source. The Chrome store's own "what's new", version history, size and updated date: not readable; the tracker lists none.
- Chrome store review text beyond the tracker's first page (3 of 13 text reviews) and the 8 star-only ratings: not retrievable.
- Chrome install history: chrome-stats.com returned 403; chromeboard shows a stale version (1.1.0). Only the three data points in heading 8 exist.
- GitHub stargazer history: the stargazers endpoint returned 404 for the gh token in use, so star growth by date is missing.
- Reddit: the search tool cannot reach reddit.com; the r/Steam thread that Shane the Gamer cites (over 8,800 upvotes) was not read, so Reddit praise and complaints are not covered. Hacker News: no hits. Bluesky: the maintainer's announcement posts (cited by games.gg) were not found by search. Steam Community forum threads: none found by search.
- The Web Archive was refused by the fetch tool, so no earlier snapshot of the Chrome page could be read.
- The gHacks article named in the earlier note (2025-10-29): not found.
- Not tested: real behavior of the tool on Steam (age-gated apps, rate limits, mobile layout). The statements on those points are inferences from code and are marked as such.
