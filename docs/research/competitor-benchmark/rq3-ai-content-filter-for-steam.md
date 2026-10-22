# Competitor benchmark: AI Generated Content Filter for Steam (SoBloxsy / Iren)

Researched 2026-10-21. Every count carries its read date. No scores here; section 10 and 11 hold the evidence a score needs.

Evidence tags used in the bullets:

- [code]: read in the repository source at commit 3183f8c (version 3.4.1, last push 2026-08-22). Behavior is described in words only. Stores now serve 3.4.2, which has no public source (see section 12).
- [api]: GitHub or AMO API response read on 2026-10-21.
- [listing]: the author's own copy in a store listing or README (asserted, not proven).
- [measured]: my own requests from the built-in browser pane on store.steampowered.com, logged out, 2026-10-21. The extension was not installed or run.
- [tracker]: third-party tracker of the Chrome Web Store, read through a summarizing fetcher; unverified against the store.

"Confirmed" means the primary source agrees with `docs/research/steam-ai-disclosure/rq4-prior-art.md` section 1.2 (rq4). "Corrects rq4" marks a changed fact.

## 1. Identity

- Name "AI Generated Content Filter for Steam" [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/manifest.json. The repository is named "AI-Content-Hider-for-Steam", its description is "Take back control of your Steam browsing experience." [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam
- Author: one person, GitHub user SoBloxsy, display name "Iren", account created 2018-12-11, 70 public repositories [api] https://api.github.com/users/SoBloxsy. The author's site is a one-line landing page with no extension list, privacy policy or contact [measured via fetch 2026-10-21]
- Store IDs: Firefox slug `ai-content-filter-for-steam`, AMO add-on ID 2970049, Gecko ID `extensions@iren.blue`, listing created 2026-01-12 [api] https://addons.mozilla.org/api/v5/addons/addon/ai-content-filter-for-steam/. Chrome ID `fgkeoeoibigdcdkfdckkpodhfhppgdlo`, publisher iren.blue [tracker] https://extscope.org/extension/fgkeoeoibigdcdkfdckkpodhfhppgdlo. Both IDs confirmed (rq4) against https://raw.githubusercontent.com/SoBloxsy/AI-Content-Hider-for-Steam/main/README.md
- License: Apache-2.0. The LICENSE file is in the repo (11,357 bytes, added 2026-01-15 in commit c097030) and the API reports `apache-2.0`; AMO lists "Apache License 2.0" [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam and the AMO URL above. The README does not name the license. Confirmed (rq4), with the file now checked.
- Size model: plain JavaScript, no build step in the repo, no dependencies, no tests, no CI, no releases, no tags. Root files: manifest, background script (1,436 bytes), content script (19,639 bytes), popup page and script, three PNG icons, an icons folder with an SVG [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/contents/. Repo size 95 KB.
- Repo state on 2026-10-21: created 2025-12-25, last push 2026-08-22, 4 stars, 0 forks, 1 subscriber, 1 open issue, 0 pull requests, 17 commits, 1 contributor [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam and /contributors. Corrects rq4 on stars (2 then, 4 now).
- Same author ships a second extension, "Private Wishlist for Steam", promoted inside this popup [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/popup.html

## 2. Detection and accuracy

- Rule: a game "uses AI" when the English words "AI Generated Content Disclosure" show up. There is no other signal, no Steam data feed and no list. [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/content.js
- On an app page the script looks in the store page's content-descriptor block for a second-level heading that contains the English phrase. It then reads the first italic element after the heading as the developer's disclosure text; when none is found it shows the hard-coded text "Unknown usage". [code] same file.
- On every other surface it fetches the app's store page and tests whether the phrase appears anywhere in the returned HTML. It does not check that the phrase sits in the heading. A page that quotes the phrase in its own description would flag (inference from the test). [code] same file.
- Language handling: the fetch has no language parameter and no language header. It is a same-origin request, so it carries the person's cookies and Accept-Language, and Steam answers in the person's store language. Confirms rq4's open point (no English page requested). [code] same file.
- Measured effect: for app 5072580 a default fetch returned 104,014 characters containing the English phrase; the same fetch with Accept-Language Spanish returned 105,701 characters with a Spanish heading and no English phrase anywhere. [measured] https://store.steampowered.com/app/5072580/
- Consequence for non-English store languages: the app-page banner never appears, and list items get a "no disclosure" verdict that is cached for 7 days. The code holds no heading table for other languages. For comparison rq4 records about 33 languages in seeeeew's tool. [code] and [measured] as above.
- Verdict model: true or false only. No unknown state. A network exception returns false and is not cached. Any response that arrives, whatever its HTTP status, is judged by the phrase test and cached for 7 days; the code never reads the status. A throttling or error page would be stored as "no disclosure" (code path; I did not trigger it). Corrects rq4, which did not record this. [code] same file.
- Packages and bundles: Steam search rows for packages carry a comma-separated list of app IDs. The script puts the raw list into the page address; Steam answered with the first app's page (title matched app 35140, 137,130 characters); a package is judged on its first app only. 4 of 50 rows on a "collection" search carried such lists. [measured] https://store.steampowered.com/search/?term=collection
- Unknown or delisted app IDs: Steam redirects the request to the store home page (989,252 characters for app 99999999), which holds no phrase; the verdict is "no disclosure". [measured] https://store.steampowered.com/app/99999999/
- The disclosure's scope (pre-generated, live, marketing only, development only) is never read or shown. The banner prints the developer's text and nothing else. [code]
- Developer text handling: the banner is assembled as an HTML string and the developer's text is spliced into it, so the text is parsed as markup instead of set as plain text. Exploitability not tested. [code]
- A commented-out block in the current file would build a green "No AI content usage" banner for pages without the section. It is disabled, so absence is never shown as a verdict on app pages. [code] content.js
- Accuracy in the wild: no false-flag report exists in the issue tracker, the 2 AMO ratings or the 3 Chrome reviews. One Chrome review says nothing is flagged (Brave, section 8); the cause is not established. Language is one measurable cause of exactly that symptom, not shown to be the cause for that reviewer. [api] and [tracker]
- Undisclosed AI use is invisible, as for the other tools in this set (README states the tool relies on the mandatory section). [listing] https://raw.githubusercontent.com/SoBloxsy/AI-Content-Hider-for-Steam/main/README.md

## 3. Surface coverage

- The content script is registered for every page on the store host over http and https, top frame only. Behavior then forks by whether the address contains "/app/", contains "/wishlist/", or neither. [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/manifest.json and content.js
- App pages: banner (section 4). Wishlist: pills and highlight (section 4). Everything else: a scanner for any element that carries Steam's app-ID attribute or belongs to the search row, tab item, tab row item or sale capsule families. [code] same file.
- Measured on the logged-out store home page: 82 distinct app IDs were linked; 77 of them (94%) sat on elements with the app-ID attribute. A search page: 50 of 50 rows carried it. Search, home carousels and tab lists fall inside the scanner's reach. Three non-capsule elements on the home page also carried the attribute (2 buttons and the page-takeover container); hide mode could reach elements that are not game tiles (inference). [measured] https://store.steampowered.com/ and https://store.steampowered.com/search/?term=collection
- Not covered: sale and event pages. A Vivaldi reviewer says it works on lists such as New Releases but not Demos or Next Fest pages (2026-10-20), and the only GitHub issue (2026-10-20) asks for Next Fest. In my pane the Next Fest sale page showed no app links, which left its markup uninspected. [tracker] https://extscope.org/extension/fgkeoeoibigdcdkfdckkpodhfhppgdlo and [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/issues/1. Corrects rq4, which said the tool covers "all store pages".
- Wishlist: added in commit 7e957db (2026-08-01, version 3.4.0), Chrome first; Firefox got it in 3.4.1 on 2026-08-22 [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/commits/7e957db and the AMO ratings URL in section 8. Confirmed (rq4) for wishlist support.
- Steam client: no native support. The author reported on 2025-12-30 that version 3.2.1 worked ("Perfect") through Extendium 1.1.1 on Millennium 2.32.0 on Windows, with screenshots; the issue was closed 2026-06-10 by a bot message. Self-reported. [api] https://api.github.com/repos/BossSloth/Extendium/issues/53
- Android: the AMO compatibility block lists Firefox 128 and later with no Android entry [api] https://addons.mozilla.org/api/v5/addons/addon/ai-content-filter-for-steam/. Chrome on Android has no extensions. No mobile claim in the listings.

## 4. UX and user control

- Three modes, one global setting: show a label (default since 3.3.3; before that highlight), highlight, hide. Stored in the browser's synced extension storage. [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/popup.js and content.js. Confirmed (rq4) for the modes and default.
- Search rows, tab items and capsules: label mode appends the muted text "[AI CONTENT USED]" to the title, or lays a dark strip with the label over the capsule image when no title element exists. Highlight turns the label red and gives the tile a red 2 px border and a dark red background. Hide removes the tile from layout and shows no label. Hiding happens after the fetch returns, so tiles are visible first and then vanish (inference from the async flow). [code] content.js
- App page: a bordered banner is inserted at the top of the left column, titled "AI Disclosure" (hard-coded English), with a small icon and the developer's text; it is red-bordered in all three modes. The branch for hide mode on app pages is an empty block, so hide does nothing there. Confirmed (rq4). The banner has no dismiss control, no collapse and no per-game override. [code] content.js
- Wishlist rows: a small pill reading "AI Content Used" is inserted above the Add to Cart button, found by matching the English button label; when the label is not found (any other UI language, or rows without that button) the pill is appended at the end of the row. Label mode gives a muted pill. Highlight gives a red pill plus the red border and background. Hide is converted to highlight because the author found that removing rows breaks the wishlist layout (code comment). Confirmed (rq4) for the hide fallback. [code] content.js
- Search sidebar: a "Narrow by AI Usage" block built from Steam's own filter styling, with three rows ("Hide AI content", "Highlight AI content", "Show AI label"). A click re-applies styles to checked tiles with no reload. It is inserted only if the options container exists at load time. [code] content.js
- Toolbar popup: three mode cards (Highlight, Text Only (Default), Hide It), a Clear Cache button, a statistics block (games checked, AI-flagged games, reset link), a dismissible promo for the author's other extension, and a version link. Changing the mode or clearing the cache reloads the active tab. [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/popup.html and popup.js
- Toolbar badge: red count of flagged items on the current tab. The statistics count network checks only (cached verdicts are not counted) and are stored locally. [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/background.js
- Missing controls: no allow-list for developers or publishers, no per-surface toggle, no per-game override, no "report a false flag", no export of settings, no keyboard shortcut, no options page. [code]
- Own UI languages: English only. All strings are literals in the scripts and popup; there is no locale folder. Store listing languages: AMO lists en-US only [api]; the Chrome tracker lists "English (1)" [tracker].
- Reviewers' view: a 5-star Chrome reviewer values the light touch and the choice between label and hide (section 8) [tracker].

## 5. Privacy and permissions

- Manifest permissions: `storage` only. No `host_permissions`. One content-script match for the whole store host. A popup action. A background service worker. A web-accessible SVG resource pattern exposed to store pages, which lets a store page probe for the extension's presence (inference). [code] https://github.com/SoBloxsy/AI-Content-Hider-for-Steam/blob/main/manifest.json. Confirmed (rq4). AMO shows "Access your data for store.steampowered.com" as the required permission for 3.4.2 [api].
- Data-collection declaration: the repo manifest declares "none" for Firefox since 3.4.0; AMO lists `data_collection_permissions: none` for all six versions and shows "doesn't require data collection" [api] https://addons.mozilla.org/api/v5/addons/addon/ai-content-filter-for-steam/versions/
- Chrome Web Store privacy tab: not readable (section 12). The tracker repeats the listing text and marks it unverified [tracker].
- Listing claim: "does not collect user data, track your browsing history, or communicate with external servers." [listing] https://raw.githubusercontent.com/SoBloxsy/AI-Content-Hider-for-Steam/main/README.md
- What the code does: the only network calls are same-origin fetches of store app pages. No analytics, no third-party host, no remote script. The only other outward path is a popup link to another Chrome Web Store listing that opens on click. [code] content.js and popup.html. The claim holds if Valve's store host does not count as "external".
- Fetch credentials: the request uses the default mode, so the person's Steam cookies go with every check, including checks for apps that only appear on a wishlist or a carousel. The project rule requires credentials omitted. [code] content.js
- Local data: one cached verdict per app ID seen, in extension local storage, with a timestamp. That list is a record of which games appeared on the person's pages and stays on the device. Entries are never pruned except by the Clear Cache button. The mode string sits in synced storage. [code] content.js and popup.js
- No privacy policy URL on AMO (`has_privacy_policy` false) [api]. The README and the listing carry the privacy statement.

## 6. Efficiency

- Requests: one full app-page GET per unseen app per 7 days per browser profile, no batching, no concurrency limit, no retry or back-off. A check starts when a tile is within 200 px of the viewport. Confirmed (rq4). [code] content.js
- No in-flight de-duplication: the same app appearing in two tiles can start two fetches at once (inference from the flow).
- Page weight, five sample app pages: 104,014 to 296,667 characters of HTML each; the one gzip size I read was 22,422 bytes. A delisted or unknown ID returns the home page at 989,252 characters. A search page of 50 rows therefore pulls on the order of 50 full pages (about 1 MB gzipped if all resemble the sample; estimate from one gzip reading). [measured] https://store.steampowered.com/app/5072580/ and the pages for apps 271590, 1245620, 1091500, 1174180
- Cache: an in-memory map plus extension local storage; 7 days for both positive and negative verdicts; expired entries stay in storage until overwritten or cleared. Confirmed (rq4) for the 7-day TTL. Added: before 3.3.3 (2026-06-22) verdicts never expired. [code] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/commits/9ab4289
- Observers: one IntersectionObserver and one MutationObserver on the page body (subtree), neither disconnected, no debounce. On app pages the body observer re-runs the detector on every mutation for the life of the page; on the wishlist every mutation re-scans every candidate row. [code] content.js
- Messaging: each network check sends a stats message to the service worker, which does a storage read and write; each flagged tile sends a badge message. The script logs a console line for every check. [code] content.js and background.js
- Package size: content script 19.6 KB; whole package 63,174 bytes on Chrome and 68,628 bytes on AMO for 3.4.2 [api] https://addons.mozilla.org/api/v5/addons/addon/ai-content-filter-for-steam/ and the update check in section 9.
- Performance complaints: none found in reviews, issues or the AMO feed.

## 7. Maintenance and responsiveness

- Commits, last 12 months (2025-10-21 to 2026-10-21): 17, all by the author. Dec 2025: 4 (on 12-25 and 12-26). Jan 2026: 9. Feb to May: 0. Jun: 2 (06-06, 06-22). Aug: 2 (08-01, 08-22). Sep to Oct: 0. Four months out of twelve have a push. [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/commits?per_page=100
- Longest gap between commits: 138 days (2026-01-19 to 2026-06-06). Last push is 60 days before the read date. [api] same URL.
- Releases: none on GitHub. Store releases on AMO: 6 versions (3.2.6 on 2026-01-12, 3.3 on 01-18, 3.3.1 on 01-19, 3.3.3 on 06-22, 3.4.1 on 08-22, 3.4.2 on 2026-10-21). [api] https://addons.mozilla.org/api/v5/addons/addon/ai-content-filter-for-steam/versions/
- Store build outpaces the repo: version 3.4.2 reached AMO (file created 2026-10-21 03:45 UTC) and the Chrome update server (version 3.4.2, package 63,174 bytes) with no commit in the repo after 2026-08-22. No release notes on 3.4.2. Whether it answers the 2026-10-20 coverage reports is unknown. [api] and https://clients2.google.com/service/update2/crx (a version query; no package downloaded).
- Repo and store packages diverge: AMO 3.3.3 (2026-06-22) already required Firefox 128, while the repo's manifest at that commit has no Gecko block (added 2026-08-01). The ignore file lists a build script, zip files and an agents folder, none of them in the repo. [api] https://addons.mozilla.org/api/v5/addons/addon/ai-content-filter-for-steam/versions/ and https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/commits/7e957db
- AMO review turnaround: first version took about 3 days (uploaded 2026-01-12 05:54, reviewed 2026-01-15 05:55); the next five took 1 to 6 minutes each. [api] versions URL above.
- Responsiveness, with dates:
  - Wishlist for Firefox: requested in an AMO review 2026-08-19 19:56 UTC; version 3.4.1 uploaded 2026-08-22 21:11; developer reply "done" 2026-08-22 21:28. About 3 days 1 hour to the build, 3 days 1.5 hours to the reply. [api] https://addons.mozilla.org/api/v5/ratings/rating/?addon=ai-content-filter-for-steam
  - GitHub issue 1 (Next Fest): opened 2026-10-20 08:11 UTC; one "+1" comment from a second person 2026-10-20 15:02; no maintainer response as of the read on 2026-10-21 (about 1.5 days). [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/issues/1
  - Chrome 1-star review 2026-09-24: no developer reply visible in the tracker (Chrome reply view unavailable). [tracker]
  - The README sends bug reports to an email address, not to the tracker.
- Issues and pull requests, all of them (read 2026-10-21; `state=all` returns 1 item, 0 pull requests):
  - Issue 1, "Please also filter next fest". Opened 2026-10-20. First maintainer response: none. Closed: open. Theme: event page coverage. [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/issues/1
- Mentions of the tool in other trackers (read 2026-10-21):
  - Extendium issue 53, opened by the author 2025-12-30 to list the extension as working in the Steam client; first response 2026-06-10 (162 days, a label-triggered bot message); closed the same day. https://api.github.com/repos/BossSloth/Extendium/issues/53
  - Augmented Steam issue 2408, "Add AI content filtering", opened 2026-10-21 by a third party who links this repo; 0 comments; open. https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam/issues/2408
- Breakage and fix history (from commit messages): 3.3 on 2026-01-18 removed the need to refresh the search page and moved injection to document end; 3.3.1 on 2026-01-19 ("bub fix" on AMO); 2026-06-06 added the tab row item family; 3.3.3 added the service worker, the 7-day TTL and wider element coverage; 3.4.0 added the wishlist. No heading-text or language breakage is recorded anywhere. [api] https://api.github.com/repos/SoBloxsy/AI-Content-Hider-for-Steam/commits?per_page=100
- Open issue themes: event page coverage only.
- Contributors: one. No outside pull request.

## 8. Reach and trust

- Firefox, 2026-10-21: 81 average daily users, 23 weekly downloads, rating 5.0 from 2 ratings, 1 text review. [api] https://addons.mozilla.org/api/v5/addons/addon/ai-content-filter-for-steam/ and the AMO page https://addons.mozilla.org/en-US/firefox/addon/ai-content-filter-for-steam/. Corrects rq4 (80 users then).
- Chrome: about 1K users, store rating 3.7 from 3 ratings; the tracker's trend points are 2026-10-16 and 2026-10-17. [tracker] https://extscope.org/extension/fgkeoeoibigdcdkfdckkpodhfhppgdlo. A second tracker showed "1K+" on a 2026-08-23 snapshot (https://chromeboard.com/extension/ai-generated-content-filt-fgkeoeoibigdcdkfdckkpodhfhppgdlo). A search-engine copy of the store page, undated, showed about 375 users and one 5.0 rating. All unverified against the store.
- Star detail is ambiguous: the tracker labels the three Chrome reviews 3, 1 and 5 stars (text average 3.0) while the store average 3.7 only fits ratings of 5, 5 and 1 for a count of 3. The 3-star label on the 2026-10-20 review is therefore unverified. [tracker]
- Chrome reviews (all three the tracker holds; quotes are trimmed by the tracker to about 125 characters):
  - Guilt Fiend, 1 star, 2026-09-24, version 3.4.1: "Does not work (Brave browser)." followed by "Doesn't flag AI games with the AI Generated Content Disclosure". The tracker also summarizes "therefore doesn't hide or highlight them". This is the full recoverable text of the review the brief asked about; the Chrome page itself could not be read. [tracker]
  - Molly Whuppie, labelled 3 stars, 2026-10-20, version 3.4.1, Vivaldi: "works on most steam pages where there are lists of games"; reports it fails on Demos and Next Fest layouts. [tracker]
  - Casual Combine, 5 stars, 2026-07-07, version 3.3.3: "I really like how unintrusive this is versus the alternatives." Praises the label and hide choice. [tracker]
- AMO reviews (all 2, read in full via the ratings API):
  - Roku, 5 stars, 2026-08-19, version 3.3.3: "I would love it if you added support for this to work on wishlists" with the edit "thank you for adding it!"; developer reply "done" 2026-08-22.
  - Anonymous, 5 stars, 2026-10-20, version 3.4.1, no text.
  - Source: https://addons.mozilla.org/api/v5/ratings/rating/?addon=ai-content-filter-for-steam&page_size=50
- Review themes: positive on low intrusion and the hide/label choice; negative on missed detection (one browser report) and uncovered pages (event pages, Firefox wishlist lag). No complaint about privacy, speed or false flags.
- Press: none found. Web searches by name, by store ID and by repository name returned only the listings and trackers. Three pages read through the summarizing fetcher name seeeeew's tool and not this one: XDA (2025-10-27) https://www.xda-developers.com/identifying-steam-games-use-ai-content-just-got-easier-extension/ , gardinerbryant.com (2026-06-16) https://gardinerbryant.com/solve-the-steam-next-fests-ai-problem-with-this-extension/ and a Steam forum thread https://steamcommunity.com/discussions/forum/1/567036884123986925/ . Other press hits (GamingOnLinux, Outlook Respawn) were seen as titles only. Reddit is blocked for the search tool. Community mentions: the Extendium report and Augmented Steam issue 2408 (section 7).
- Trust signals: pseudonymous individual publisher, minimal website, email-only support, Apache-2.0 source, no privacy policy page, no store-verified publisher badge visible (Chrome page unreadable).

## 9. Packaging and distribution

- Stores: Chrome Web Store and Firefox AMO (listed, public). No Edge Add-ons listing found (one site-restricted search, no result). No userscript build. GitHub holds source only, no releases or tags. [listing] https://raw.githubusercontent.com/SoBloxsy/AI-Content-Hider-for-Steam/main/README.md and [api] AMO URL above.
- Update path: store auto-update. AMO versions are approved within minutes after the first one. Chrome review time is unknown.
- Manifest version 3. The repo manifest declares a service worker; the Firefox package declares a background script and a minimum Firefox of 128.0 (package manifest read 2026-10-22). [code] manifest. Firefox minimum version 128. [api]
- Version skew across channels: repo 3.4.0 (2026-08-01) reached Chrome but not AMO, which went 3.3.3 to 3.4.1; both stores show 3.4.2 on 2026-10-21 and the repo still shows 3.4.1. [api], the update check and the Firefox review in section 8.
- Package sizes for 3.4.2: Chrome 63,174 bytes (update check), AMO 68,628 bytes. The tracker reports 60.82 KiB for 3.4.1 on Chrome. [api] and [tracker]
- Listing languages: English only on both stores (section 4). Listing copy is the README text.
- Source availability: public Apache-2.0 repo, but the store builds come from outside the repo (section 7).

## 10. Coverage and Restraint evidence

Reading used: Coverage is breadth and reliability of finding disclosed games across surfaces and languages. Restraint is minimal permissions, minimal data movement, minimal intrusion, and honest handling of unknowns and of what a disclosure proves. Items marked "limit" count against the list they sit in.

Supports Coverage:

- Scans search results, home carousels, tab lists, wishlist and app pages; 94% of linked apps on the home page and 50 of 50 search rows carry the tagged element (section 3, measured).
- Looks ahead 200 px and watches late-loaded rows, so scrolling lists get checked (section 6, code).
- Reaches the Steam client through Extendium on the author's report (2025-12-30, section 3).
- Wishlist support since 2026-08-01 (Chrome) and 2026-08-22 (Firefox).
- Limit: English-only phrase test; a Spanish-language page holds no English phrase (section 2, measured).
- Limit: event and sale pages (Next Fest, Demos) are not covered, per a 2026-10-20 review and the only open issue (section 3).
- Limit: packages are judged on their first app; error and redirect pages are cached as "no disclosure" (section 2).

Supports Restraint:

- `storage` permission only, no host permissions, no remote code, no third-party host, no analytics (section 5, code).
- Default list mode is a muted label (chosen in 3.3.3); hide never applies on the wishlist or the app page (section 4, code).
- App-page text is the developer's own disclosure under the heading "AI Disclosure", with no claim about actual AI use; absence is never shown as a verdict (section 2, code).
- Limit: no unknown state; failed, localized or redirected fetches are stored as "no disclosure" for 7 days.
- Limit: the flag fires on the presence of the phrase and says nothing about what the disclosure states (no scope, no "none used" check).
- Limit: fetches carry cookies; the app-page banner has no dismiss; developer text goes into the banner as markup; cache entries are never pruned.

## 11. Lessons for our design

- Match the native-looking sidebar control for the list mode with live re-apply and no page reload; avoid the global popup that reloads the tab. Also match the muted label as the quiet default.
- Match the minimal manifest (storage plus the store match), same-origin fetch and a TTL cache; avoid caching any response before checking the HTTP status and the page's own identity, and keep "unknown" as its own stored state.
- Avoid an English-only string test: Steam serves the heading in the store language (measured). Use a language-independent signal or a forced-English fetch, plus a per-language canary.
- Avoid one full page per tile: pages weigh 100 to 300 KB and a bad ID returns about 1 MB; use batched requests, de-dupe in-flight work, skip package lists, and disconnect observers on page hide.
- Plan placement entries for event and sale pages (the first coverage request after the wishlist), keep Firefox and Chrome releases in step from one version source, and render developer text with plain-text assignment.

## 12. Not retrievable

- Chrome Web Store detail, reviews tab and privacy tab: the built-in browser refused the host ("only works in a full browser"); the fetch tool was redirected to Google's consent page (302) on three URL forms and cannot answer the consent form; claude-in-chrome tools were excluded by the brief. Chrome install count, rating and review text therefore come from a tracker (section 8) with the limits listed there. Store-side facts not recovered: privacy practices answers, listing languages beyond the tracker's "English (1)", version history, reply threads on reviews.
- What did work for Chrome: a version query on the extension update service (3.4.2, package 63,174 bytes) without downloading the package.
- Other mirrors: chrome-stats.com returned 403; the Wayback Machine host is refused by the fetch tool; ChromeBoard held no reviews and a 2026-08-23 version.
- Source of 3.4.2: the repo has no matching commit. The Firefox package was downloaded on 2026-10-22 (hash matches AMO) and its manifest and file list read, not its code. Its content script is 23,388 bytes, against 19,639 bytes at repo version 3.4.1 (section 1), so the store build carries about 19% more script than the repo head. The Chrome package was not downloaded.
- Live wishlist and event page behavior: not observed (a wishlist needs sign-in; the Next Fest page showed no app links in my pane). Wishlist notes come from code only.
- Firefox background behavior: the Firefox package declares a background script and no service worker, so the background runs in Firefox. Read from the downloaded package manifest on 2026-10-22; runtime not tested.
- Cause of the Brave failure: not established. Language is one measured candidate; browser or shield effects are untested.
- Press and community: Reddit is blocked for the search tool; nothing found for this tool elsewhere.
- One read of a shared browser tab returned an unrelated SteamDB check page that another session had loaded; I discarded it and used my own tab.
