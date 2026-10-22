# Steam AI Games Indicator (Pierre-Demessence)

Researched 2026-10-21. Counts are snapshots from that day unless a date is given. "Confirmed" means the earlier note (docs/research/steam-ai-disclosure/rq4-prior-art.md, section 1.3) was checked against the primary source named here; the confirmed detail is not repeated. "Proven" means read from source, commits or issue data. "Asserted" means README copy. "Measured" means I ran a read-only probe in the built-in browser on 2026-10-21 (anonymous fetches, no sign-in, credentials omitted). Clean-room rule: behavior is described in words; no selectors, patterns or code are recorded.

Repo base URL used below: https://github.com/Pierre-Demessence/SteamAIGamesIndicator . Raw reads came through the GitHub API (https://api.github.com/repos/Pierre-Demessence/SteamAIGamesIndicator/contents/...).

## 1. Identity

- Name: "Steam AI Games Indicator" (README title). It ships two separate userscripts and one data file: "Steam AI Banner" (steamAIBanner.user.js, header version 1.1), "Steam AI Badge" (steamAIBadge.user.js, header version 2.1) and appids.json (source: README and script headers, https://raw.githubusercontent.com/Pierre-Demessence/SteamAIGamesIndicator/main/README.md).
- Owner: personal GitHub account "Pierre-Demessence", created 2012-05-20, 54 public repos, 33 followers on 2026-10-21 (source: https://api.github.com/users/Pierre-Demessence). The owner's portfolio lists the project with the text "A collection of userscripts that makes Steam AI-content disclosures more visible" (source: https://github.com/Pierre-Demessence/pierre-demessence.github.io, file src/data/projects.ts).
- License: MIT, "Copyright (c) 2025 Pierre Demessence" (source: LICENSE in the repo). Confirmed against the repo API (license field).
- Repo facts on 2026-10-21: created 2025-12-04, last push 2026-09-20, 2 stars, 0 forks, 0 subscribers, 0 open issues, no releases, no tags, one branch (main), repo description and topics empty (source: https://api.github.com/repos/Pierre-Demessence/SteamAIGamesIndicator, /tags, /releases, /branches). Confirmed: license, creation, last push, stars, open issues.
- Size model: 9 files. Banner script 5,085 bytes, badge script 26,291 bytes (31,376 bytes of JavaScript in total, readable and unminified), appids.json 385,906 bytes, three README screenshots of 60,540, 202,109 and 205,578 bytes (source: https://api.github.com/repos/Pierre-Demessence/SteamAIGamesIndicator/git/trees/main?recursive=1). The tree holds no CI, tests, build step or package manifest.
- Author count: one. 28 of 28 commits are by the owner (source: https://api.github.com/repos/Pierre-Demessence/SteamAIGamesIndicator/contributors).

## 2. Detection and accuracy

Banner script (proven, source read on 2026-10-21, https://raw.githubusercontent.com/Pierre-Demessence/SteamAIGamesIndicator/main/steamAIBanner.user.js):

- It runs on an app page only. It looks for the store page's content-descriptor block, checks that the block's first heading reads the English phrase "AI Generated Content Disclosure" (case-insensitive), takes the block's second paragraph as the developer text, and shows it in a banner. No second paragraph means no banner.
- The heading test is English only. The banner has no locale handling. Issue 1 (section 7) reports a banner that did not appear while the badge worked; the reporter's pasted replacement script matches the heading across several languages. The thread does not state the cause. Inference: the reporter's store language was not English (their replacement script has French button labels).
- Measured on 2026-10-21: on 31 of 31 disclosed pages sampled from the seed list, the descriptor block held exactly one heading and two paragraphs, the first being a Steam sentence ("The developers describe how their game uses AI Generated Content like this:") and the second the developer text. The "second paragraph" assumption held in all 31.

Badge script (proven, source read on 2026-10-21, https://raw.githubusercontent.com/Pierre-Demessence/SteamAIGamesIndicator/main/steamAIBadge.user.js):

- Decision order for each tile with an app ID: (1) the ID is in the seed list: badge at once; (2) a fresh cache entry exists: use it; (3) the ID is at or below the highest ID in the seed list and not in the list: treat as not AI, no request; (4) otherwise queue a live check of the app page.
- Live check: GET of the app's store page with the English language parameter, one request at a time. A positive is any case-insensitive occurrence of the heading phrase anywhere in the returned HTML. The check does not look inside the descriptor block and does not read the disclosure text.
- Language handling: the English language parameter on fetched pages makes the live check language-independent. This parameter was added on 2026-06-22 (commit e23b662, https://github.com/Pierre-Demessence/SteamAIGamesIndicator/commit/e23b662). Before that date the live check fetched pages with no language parameter (proven by the 2025-12-06 script, https://raw.githubusercontent.com/Pierre-Demessence/SteamAIGamesIndicator/fce0e07/steamAIBadge.js). Seed-list hits do not depend on page language.
- Confirmed from the earlier note, with the badge script as source: the cache lifetimes, the serial queue with a fixed delay, the list-completeness shortcut, the app-name-marker guard, and the grants and connect hosts.
- Correction and detail: the list-completeness shortcut and the guard against non-app pages arrived together with the fetch cache on 2026-06-22 and 2026-06-23 (commits e23b662 and 43d714f). From 2025-12-04 to 2026-06-22 the script live-fetched every non-listed app on every page load with no cache (source: the 2025-12-06 script above).

Accuracy evidence:

- Seed-list precision, measured. I sampled 40 IDs systematically (every 643rd entry, starting at the 8th) from the 25,739-ID list on main and fetched each app page anonymously on 2026-10-21. 32 of 40 returned a real app page, and all 32 carried the disclosure heading (0 stale entries among the 32 checkable). Of the other 8: 7 ended on a Steam sign-in page that redirects toward an age check (3 confirmed by final URL, 4 inferred from an identical 31,920-character response with a redirect), and 1 redirected to the store home page. One of the 32 real pages sits behind a canonical redirect to a different app ID (4628640 to 4617640); the list holds at least one ID that is not the page's own ID. n=40 gives wide error bars.
- Closed-world assumption, measured from list history. Between list versions, entries were never removed (set comparison of the three versions of appids.json). Of the 9,816 IDs added on 2026-06-22, 4,076 (41.5%) were below the previous list's highest ID (4,218,340). Of the 5,923 IDs added on 2026-09-19, 2,211 (37.3%) were below the previous highest ID (4,867,200). Since 2026-06-22 the badge script never live-checks an ID below the list's highest ID. Apps like these stay unbadged until the next manual list refresh. The first list (2025-12-04) predates the shortcut, so its gap was covered by live checks at the time. Source for the versions: https://raw.githubusercontent.com/Pierre-Demessence/SteamAIGamesIndicator/3bc5dc5/appids.json , .../838e7ef/appids.json , .../e904356/appids.json (read through the API, compared locally).
- Age gates and error pages: the guard only stops a negative from being stored. Pages that return a sign-in redirect or the store home page are never badged by a live check and are re-requested on the next page load (inference from code: nothing is cached for them). Measured on 2026-10-21: an unknown app ID redirects to the store home page with HTTP 200, about 987,000 characters, no app-name marker and no heading; a non-existent ID is therefore a roughly 1 MB download that the script discards.
- False flags: in 13 non-AI pages I fetched (well-known titles, 2026-10-21) the phrase test returned no hit; one known disclosed title (ARC Raiders, app 1808500) returned a hit. No false positive seen. The test is a whole-page text search; a store description that quotes the heading would also match (inference from code, not observed).
- Wording: the badge says "Uses AI" and the README says "Uses AI" badges. The badge does not distinguish scope (pre-generated, live-generated, tools) because it never reads the disclosure text. The banner header repeats Steam's heading and shows the developer text verbatim, set as plain text (source: banner script).
- Unknown versus not disclosed: the UI has two states, badge or nothing. There is no "unknown" state and no "not disclosed" label. Absence of a badge covers real negatives, list-shortcut negatives and failed lookups alike.

## 3. Surface coverage

- Banner: app pages only, one location (top of the title container). Observed to need the English heading (section 2).
- Badge: the match rule covers every page on the store host, which includes app pages, where it badges recommendation and similar-title tiles but not the page's own title. Surfaces handled by the badge script, one table entry each in the source (proven): modern capsules with decorator flags (regular store and the personal calendar, a separate React app), home-page sale and store capsules, home spotlight, home tab rows, panel capsules, older flagged spotlight tiles, tab-list items, search result rows, wishlist rows in the older layout (an input carrying the app ID), and wishlist rows in the React layout (a draggable item whose ID attribute carries the app ID). Commit messages place the personal calendar in version 1.5 and home capsules in version 2.1.
- Dates (proven, commit log): tab items and spotlight 2025-12-04, search rows and wishlist 2025-12-06, personal calendar and React wishlist 2026-09-19, search hide filter 2026-09-20, home capsules 2026-09-20 (source: https://api.github.com/repos/Pierre-Demessence/SteamAIGamesIndicator/commits?per_page=100). Confirmed from the earlier note: it is the only tool of the four that covers wishlist and home capsules.
- React wishlist and home: the script anchors on the capsule image and on the app ID in an element attribute, and states that Steam's class names there are hashed (source comment in the badge script; commit ba85d7d message "Remove dependencies on Steam's volatile hashed classes", https://github.com/Pierre-Demessence/SteamAIGamesIndicator/commit/ba85d7d). A failing scan for one surface is caught; the others still run. Untested by me: how the badge survives a React re-render that drops the badge but keeps the same wrapper element (the script marks a wrapper as done once and never re-adds; inference, unverified).
- Not handled: pages that link apps through bundle or package URLs (only app links are parsed), Steam client, Steam mobile app. Android browsers with a userscript manager are not mentioned by the README (unverified either way). Steam client is a userscript-free surface (inference).

## 4. UX and user control

- Banner: red block above the game title with a warning-sign emoji, Steam's heading and the developer text, full length and not collapsible in main (version 1.1). A collapsible variant exists only in the issue 1 comment by the reporter and was not adopted (section 7).
- Badge: a red "Uses AI" pill with a warning icon. Placement follows the host tile: a collapsing flag on search rows and older spotlights, an overlay pill on capsule images, stacked below Steam's own "On wishlist" or "In library" flags (source: badge script and commit c258435 message, https://github.com/Pierre-Demessence/SteamAIGamesIndicator/commit/c258435). No tooltip, no link to the disclosure text.
- Hide filter: one checkbox labelled "Hide items with AI disclosure", appended to the search sidebar block named "Narrow by preferences". It hides search rows that carry a badge. The choice persists in userscript storage. It supports keyboard use (button role, Enter and Space) (source: badge script and README). Steam's own hide filters are mirrored in styling and behavior.
- Measured on 2026-10-21: the anonymous search page has no "Narrow by preferences" block (its filter blocks are price, tag, players, feature, controller, accessibility, Deck, VR, OS, language); a signed-out visitor sees no hide control. The block probably appears for signed-in accounts; not verified because no sign-in is allowed.
- Rows pending a live check stay visible until the check ends (inference from code: a row is hidden only after it is badged).
- Hide applies to search only. No hide on wishlist, home or tag pages. No blur or dim mode.
- Settings: one persisted setting (the hide choice). No settings page, no per-publisher or per-game allow or block list, no banner dismissal, no override of a verdict, and no cache reset in the code (the userscript manager's storage view is the only route; inference).
- UI languages: English only. Every string (badge, banner header, filter label) is a literal in the source. No catalog.

## 5. Privacy and permissions

- Banner grants: none (page context). Banner match: app pages on the store host (source: banner script header).
- Badge grants (three) and connect hosts (two): confirmed against the script header, same source as above. Match: every page on the store host.
- Outbound requests (proven from source):
  - to raw.githubusercontent.com: one GET of appids.json when the 24 hour cache is stale. It carries no app IDs; GitHub sees the user's IP and the repo path.
  - to store.steampowered.com: one GET per queued app page, the app ID in the URL path.
  - nothing else. No analytics, no telemetry, no call to SteamDB or any third-party host.
- Cookies: the script does not set the manager's "anonymous" option. The Tampermonkey documentation describes that option as "don't send cookies with the request" (source: https://www.tampermonkey.net/documentation.php?q=GM_xmlhttpRequest, read through a summarizer, which noted the default is not stated explicitly). Inference: live checks go out with the user's Steam cookies. Not observed at runtime.
- Trust model: the seed list and both scripts update from the owner's main branch (update and download URLs point to raw main). There are no releases, tags or signed packages. Any push to main reaches every install after the manager's next update check. Data is parsed as JSON, never run as code (source: badge script).
- Developer text goes into the page as plain text, never as markup (source: banner script).

## 6. Efficiency

- Seed list: 385,906 bytes, 25,739 string IDs, refreshed at most once per 24 hours per profile (cache TTL in the badge script), stored whole in userscript storage and rebuilt into an in-memory set on every page load (inference from code: the set is built each load).
- Live check: one full HTML app page per unseen, non-listed ID above the list maximum. Measured on 2026-10-21: the 32 disclosed pages from the seed sample were 96,851 to 168,794 characters each; 14 well-known titles were 133,456 to 402,200 characters (median 218,680). No batching, no use of a lighter Steam API.
- Throttle: serial queue with a fixed delay confirmed. New detail: the delay also follows a failed request. No timeout handler, no backoff, no retry cap (source: badge script). A hung request would stall the queue (inference).
- Request volume: bounded only by how many distinct new IDs the user's pages show. A search page of 25 to 50 unseen IDs means that many serial requests. Unresolvable IDs (age wall, removed, region-locked) repeat on every page load.
- Cache: lifetimes confirmed. New detail: all per-app results live in one stored object; expired entries are pruned on load; positives are saved at once, negatives with a 1.5 s debounce; the save is flushed on page hide. No size cap (source: badge script).
- Scanning: one mutation observer on the page body, debounce 200 ms, never disconnected. Each run re-queries ten tile surfaces over the whole document and skips elements seen before via weak sets. Work grows with page size, not with the size of the change. A second small observer watches the search results container's class attribute. The banner observes the whole document with a 300 ms debounce, patches the page's history methods (page context, because the banner uses no grants), and disconnects on unload.
- Initial delay: the badge script waits 500 ms before starting.

## 7. Maintenance and responsiveness

- Cadence (source: https://api.github.com/repos/Pierre-Demessence/SteamAIGamesIndicator/commits?per_page=100, 28 commits). Last 12 months (2025-10-21 to 2026-10-21): all 28 commits, in three bursts. 2025-12-04 to 2025-12-06: 15 commits. 2026-06-22 to 2026-06-23: 7 commits. 2026-09-19 to 2026-09-20: 6 commits. Active days: 6. Gaps: 198 days, then 88 days. No commit for 31 days as of 2026-10-21. Months with no commit: January to May 2026, July, August, October (to date); October and November 2025 predate the repo.
- Commit style: plain sentences in 2025; Conventional Commits style from 2026-06-22. Three commits (e23b662, 43d714f, f70b8cb, 2026-06-22 to 2026-06-23) carry a "Co-authored-by: Copilot" trailer (source: commit messages in the commits API).
- Issues and PRs, all of them on 2026-10-21 (source: https://api.github.com/repos/Pierre-Demessence/SteamAIGamesIndicator/issues?state=all , /pulls?state=all , /issues/comments , /issues/events):
  - Issue 1 "SteamBanner Not Working as intended". Opened 2025-12-06T06:51Z by VincentLorenzi. First maintainer response: none, in any form (no comment, label, assignment or linked commit). Closed 2025-12-06T07:15Z by the reporter, 24 minutes after opening, in the same second as the reporter's own comment. Theme: banner missing on a game page while the badge worked on Arc Raiders, Chrome. The reporter posted a full replacement banner script (header version 1.2, heading test across several languages, collapsible text). A second user commented at 07:12Z asking "Can i work on this ?"; no reply and no PR followed. Main still holds banner version 1.1; the report's likely cause (heading language) is unfixed.
  - Pull requests: none, open or closed (0 on /pulls?state=all).
  - Total: 1 issue, 0 PRs, 0 maintainer replies. The last maintainer commit before the issue was 2025-12-06T01:55Z (fce0e07); the next commit was 2026-06-22T23:11Z, about 198 days after the issue opened.
- Breakage and fix history (proven, commits): install links pointed at files without the userscript suffix until 2026-06-22T23:14Z, when commit 8155620 renamed them; its message says "to make them installable" (https://github.com/Pierre-Demessence/SteamAIGamesIndicator/commit/8155620). By that message, the install links stayed unusable for 6.5 months after the repo was created. The commit also changed the README links.
- Seed list refresh (proven, history of appids.json): 2025-12-04 10,000 IDs (commit 3bc5dc5), 2026-06-22 19,816 (commit 838e7ef, +9,816), 2026-09-19 25,739 (commit e904356, +5,923). Two refreshes in 10.5 months, 200 and 89 days apart. Entries only grew. No automation in the repo; the generating tooling sits in a directory the repo ignores (commit 34f366b, "add tools directory to ignore list", 26 seconds before the 2026-06-22 refresh). The list was 32 days old on 2026-10-21. The first version holds exactly 10,000 unique IDs sorted ascending, which suggests a 10,000 row cap on the source (inference); GamingOnLinux reported 12,284 games with a disclosure on SteamDB on 2025-10-21 (https://www.gamingonlinux.com/2025/10/want-to-avoid-ai-gen-on-steam-this-browser-userscript-might-save-your-day).
- SteamDB provenance, exact wording. README: "The pre-built list is sourced from [SteamDB](https://steamdb.info/tag/1368160/?sort=id_asc)." (added by commit 432756b on 2025-12-06, https://github.com/Pierre-Demessence/SteamAIGamesIndicator/commit/432756b ). Commit 3bc5dc5 (2025-12-04, appids.json added) body: "Taken from https://steamdb.info/tag/1368160/?sort=id_asc". The two refresh commits say only "update list of appids" and "update appids.json". The README also invites readers to open an issue or PR to add missing IDs to the file. The note does not assess this against SteamDB's FAQ (no verdict; SteamDB could not be opened, section 12). The list holds 25,739 IDs on 2026-09-19, while the earlier note cites 14,367 titles on the SteamDB tag on 2026-09-23 from a secondary report; the gap is unexplained.

## 8. Reach and trust

- Installs: no figure exists. The scripts are not on Greasy Fork, OpenUserJS or any listing I could query, and GitHub raw serves no counter. Greasy Fork API queries on 2026-10-21 for "Steam AI Banner", "steam ai badge", "AI Games Indicator", "SteamAIGamesIndicator", "steam ai disclosure" and the surname returned nothing related (source: https://api.greasyfork.org/en/scripts.json?q=...). OpenUserJS search for "steam ai" returned only unrelated Steam workshop scripts (source: https://openuserjs.org/?q=steam%20ai , summarized). Confirmed from the earlier note: no Greasy Fork or OpenUserJS listing.
- Stars 2, forks 0, subscribers 0 on 2026-10-21 (repo API). A GitHub repository search for the repo name returned only the repo itself; code search for the repo path returned the owner's portfolio and this project's own research notes (source: gh search repos and gh search code, 2026-10-21).
- Press and community: none found. Web searches for the tool name, the owner name, the script names and the filter label returned only the repo page and articles about a different tool ("AI warning for Steam", seeeeew): XDA 2025-10-27 does not mention this tool (source: https://www.xda-developers.com/identifying-steam-games-use-ai-content-just-got-easier-extension/ , read through a summarizer); GamingOnLinux 2025-10-21 predates the repo's creation on 2025-12-04.
- Forks that matter: none (0 forks; network count 0).
- Trust signals: MIT license, readable source, a README disclaimer ("not affiliated with Valve or Steam"), single maintainer, no releases, auto-update from main. The README says Steam requires the disclosure "since late 2024"; Valve's rules date from January 2024 (secondary source from its URL date and title, page not opened: https://mobilesyrup.com/2024/01/10/valve-announces-guidelines-for-games-that-use-ai-steam/). Confirmed: the README imprecision flagged in the earlier note.

## 9. Packaging and distribution

- Install path: userscript manager plus two raw GitHub URLs (one per script). The README names Tampermonkey (Chrome, Firefox, Edge, Safari, Opera), Violentmonkey (Chrome, Firefox, Edge, Opera) and Greasemonkey (Firefox) (source: README). Confirmed.
- Link install: the author's own commit message says the scripts became installable on 2026-06-22T23:14Z; before that the README linked files without the userscript suffix (section 7). Not tested by me.
- Update path: both scripts declare update and download URLs on raw main; the manager's own schedule decides when updates arrive. Version bumps happen on most feature commits (badge 1.4 on 2026-06-23, 1.5 on 2026-09-19, 2.0 and 2.1 on 2026-09-20).
- Managers tested: no test evidence in the repo, issues or commits. The README lists Greasemonkey, but the badge script requests only the old underscore-style APIs, while Greasemonkey 4 replaced them with dotted promise APIs and offers a polyfill (source: https://www.greasespot.net/2017/09/greasemonkey-4-for-script-authors.html , read through a summarizer). Inference: the badge script does not run on Greasemonkey 4 or later; untested.
- Two scripts means two installs, two update streams and no shared code. No browser-store listing, no signed package.

## 10. Coverage and Restraint evidence

Supports Coverage:

- Ten tile surfaces from one table, including the React wishlist and home capsules, the only tool of four surveyed to cover them (source: section 3 and the earlier note).
- Seed list of 25,739 IDs on 2026-09-19 gives instant badges on first paint with no requests; live checks catch IDs above the list maximum.
- Seed-sample precision 32 of 32 checkable (section 2).
- Hide filter in the native sidebar style.
- English language parameter on live checks (since 2026-06-22).

Weakens Coverage:

- Banner is English only; issue 1 unresolved on main.
- Closed-world shortcut: 37.3% to 41.5% of later list additions sat below the previous maximum.
- 7 of 40 sampled IDs sit behind a sign-in or age redirect on an anonymous fetch (17.5%, n=40).
- Hide control absent for signed-out visitors; hide covers search only.
- List refreshed twice in 10.5 months by hand; 32 days old on 2026-10-21.

Supports Restraint:

- Negatives are stored only after a real store page loads (proven); verified that unknown IDs return the store home page with HTTP 200 and would otherwise cache a false negative.
- No label for non-badged games; the UI makes no "AI-free" claim.
- Two connect hosts, no analytics, text set as plain text, serial throttled queue, bounded cache lifetimes.

Weakens Restraint:

- Wording "Uses AI" claims use, not disclosure; no scope shown.
- Unknown and not disclosed collapse into "no badge"; below-maximum IDs are treated as not AI without a lookup.
- Live checks probably send Steam cookies (default manager behavior, unobserved).
- Whole-document observer and ten full-document queries per mutation burst; no observer disconnect on the badge script; cache without a size cap; unresolvable IDs refetched on every page load.
- Update channel is the owner's main branch with no release step.

## 11. Lessons for our design

- Match: one table entry per tile surface, with no scanner edit for a new surface (their pattern; our rule 11). Cover wishlist, home and calendar from day one; the competitor added home, the React wishlist and the calendar 9.5 months after launch.
- Avoid: any "everything below the highest known ID is negative" rule. It breaks our three-state verdict (unknown is not "not disclosed") and failed for 37% to 41% of later additions in their own list history.
- Avoid: per-app HTML page fetches as the detection source. They cost about 100 to 400 thousand characters each, serial at 1 s, and hit sign-in or age walls (7 of 40 in the sample). Our GetItems batches of 50 sidestep that; confirm in RQ2 that the response carries the disclosure.
- Match: never store a negative from a response that is not the expected data shape; map redirects, walls and error pages to "unknown".
- Avoid: "Uses AI" copy, English-only strings and install-by-raw-URL packaging (the competitor needed 6.5 months to make the links installable). Use "AI use reported" from a localized catalog, and ship through the stores.

## 12. Not retrievable

- SteamDB tag page and FAQ: the built-in browser hit a Cloudflare challenge on https://steamdb.info/tag/1368160/ ; I did not attempt to pass it. SteamDB's FAQ text and the live tag count are therefore not re-verified here.
- Signed-in behavior: the hide control's presence, the React wishlist, the personal calendar and real age-gate flows need a signed-in session. No sign-in done. The userscripts were not installed; badges, banner, cookie behavior and Greasemonkey 4 compatibility had no runtime test.
- Install or usage counts: none exist; GitHub raw offers no counter and GitHub traffic data needs write access.
- How appids.json is generated: the tooling directory is ignored by git and not published.
- Cookie default for the cross-origin request API: the Tampermonkey docs page I read through a summarizer did not state it; the cookie claim is an inference.
- The Greasy Fork and OpenUserJS checks searched titles and descriptions through their search endpoints; a script with a different name could exist.
- Android and Steam client behavior: no source, no test.
