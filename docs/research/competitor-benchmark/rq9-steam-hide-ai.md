# Steam Hide AI (Suvitruf)

Researched 2026-10-21. Counts are snapshots from that day unless a date is given. Tags: [code] read from the script source (MIT license, so reading was allowed), [api] GitHub API data, [listing] README or listing copy (asserted, not proven), [measured] read-only probe or count by me on 2026-10-21, [tracker] third-party tracker (none used). Clean-room rule: behavior is described in words; no selectors, patterns or code are recorded. The author's server was not called and no sign-in was made.

Repo base URL: https://github.com/Suvitruf/steam-hide-ai . Raw reads came through the GitHub API (https://api.github.com/repos/Suvitruf/steam-hide-ai/contents/...).

Important context: the repo was created on 2026-10-21T19:06Z, the same day as this research, and had 6 commits at 20:27Z. Everything below describes a day-zero project; no history exists beyond those hours.

## 1. Identity

- Name: "Steam Hide AI" (script header and README title). One userscript, `steam-hide-ai.user.js`, plus a small metadata file for update checks. [code] https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/steam-hide-ai.meta.js
- Header version 0.2.0 on 2026-10-21. [code] same URL.
- Author: GitHub account "Suvitruf" (created 2012-07-10, 85 public repos, 121 followers on 2026-10-21). [api] https://api.github.com/users/Suvitruf
- Server host in the script and README is `steam-ai-hide.apanasik.com`; the README images sit on `projects.cdn.aapanasik.com`; the Patreon page is `apanasik`. All three tie the project to the author's personal domain. [listing] https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/README.md , https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/.github/FUNDING.yml
- License: MIT. [api] https://api.github.com/repos/Suvitruf/steam-hide-ai (license field)
- Repo facts on 2026-10-21: created 2026-10-21T19:06Z, last push 2026-10-21T20:27Z, 0 stars, 0 forks, 0 subscribers, 0 open issues, no releases, no tags, one branch (master), no topics. [api] same URL plus /tags, /releases, /branches.
- Size model: 9 files. `steam-hide-ai.user.js` 110,708 bytes (readable source), README.md 9,428 bytes, README.ru.md 14,435 bytes, `community-list.json` 130 bytes, `community-list.min.json` 34 bytes, meta file 979 bytes, LICENSE 1,072 bytes, FUNDING.yml 35 bytes, .gitattributes 275 bytes. No tests, CI, build step or package manifest in the tree, although the README says tests exist. [api] https://api.github.com/repos/Suvitruf/steam-hide-ai/git/trees/HEAD?recursive=1
- Contributors: one (4 commits attributed on the contributors endpoint; 6 commits in the log). [api] https://api.github.com/repos/Suvitruf/steam-hide-ai/contributors
- AI disclosure by the author: README says the code, tests and README were written together with a model and reviewed by a human. [listing] README section "Disclosure".
- Sponsorship: GitHub Sponsors and Patreon links. [listing] FUNDING.yml and README.

## 2. Detection and accuracy

Script source read in full on 2026-10-21: https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/steam-hide-ai.user.js (3,698 lines, 110,708 bytes, unminified bundle). Every [code] bullet below comes from it unless another URL is given.

How it decides:

- Source of truth is Steam's own disclosure block on the app's store page. A page counts as "labeled" when the content-descriptor block carries a heading equal to one of 30 localized titles of Steam's disclosure heading. The titles come from the MIT project seeeeew/aiwarningforsteam (credited in the README). [code] [listing] https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/README.md
- Developer text is the italic text inside that block, or, when none, the block content after the first paragraph (Steam's own intro sentence). [code]
- App pages: the script reads the page it is on from the DOM, in any store language, and writes the verdict into its own cache with no request. [code]
- Listings: for each card whose app ID has no usable cache entry, the script fetches `store.steampowered.com/app/<id>` with the English language parameter and parses the returned HTML text with pattern matching (not a DOM parser). Because the fetch asks for English, the heading test succeeds without the localized set. [code]
- Three stored states: "labeled" (heading found, text kept), "clean" (page loaded, no heading), "unknown" (non-200 status, age-gate redirect or age-gate markup, or a network error). A 429 or 403 answer is treated as rate limiting: nothing is stored and a backoff starts. [code]
- "Clean" is written whenever a 200 page has no heading. The code never compares the final address with the requested app ID. A redirect to the store home page, a delisted app or a region-blocked page therefore stores "clean" for 7 days (inference from code; not observed at runtime). [code]
- "Unknown" entries are re-requested every time the card becomes visible; the 1-day TTL does not stop the refetch, because the resolver only skips fetching for "labeled" and "clean". [code]
- Decision function (order): manual never-hide list wins; then manual always-hide list; then the label rule; then the community rule. A game is hidden when at least one rule yields a reason. While a label is missing or unknown the card stays visible and shows a "checking" hint. [code]

The keyword classifier:

- Categories: 8 names in the type list: art, text, voice, music, code, video, live generation ("live" internally), other. Built-in keywords exist for 7 of them; "other" has no built-in keywords and gets a match only from the user's own extra keywords. [code]
- Built-in keyword entries counted on 2026-10-21: 784 in total. Art 201, text 143, music 93, voice 71, code 73, video 109, live 94. Languages: 11 (English, Russian, German, French, Spanish, Portuguese, Italian, Polish, Japanese, Chinese, Korean). English has the most entries per category (art 46, text 25, live 26, voice 16, music 15, code 15, video 12). [measured] counted by me from the script's data block.
- Matching: text is Unicode-normalized and lowercased. Latin and Cyrillic keywords match at word boundaries; a trailing star means "any letters may follow". Chinese, Japanese, Korean and Thai keywords match as substrings. [code]
- Negation: a window of 48 characters before and 48 after each match, cut at the nearest clause punctuation or clause-breaker word. Cue lists: 120 words before, 124 after, 68 clause breakers, in the same 11 languages. A negated match is recorded but does not count. [code] [measured] counts.
- Result: the set of categories with at least one non-negated match. One keyword hit is enough; there is no weighting, no score and no confidence value. [code]
- Default filter: hide a labeled game only when the classifier found "art". A labeled game whose text names no art keyword is shown, with no banner. [code] [listing] README table "hide when AI was used for: art".
- Accuracy on the repo's own examples: the repo ships no examples, fixtures or tests. The tree holds 9 files and none is a test, although the README says tests were written. So there is no ground truth to score against. Two README screenshots show one flagged example each; see section 4. [api] https://api.github.com/repos/Suvitruf/steam-hide-ai/git/trees/HEAD?recursive=1
- Wording of reasons shown to the user: "AI used for: art" or "official AI disclosure" or "community: N reports". The banner title for all of them is the sentence "This game uses AI-generated content". [code]

Gates and failures:

- Age gates: the main entry returns early on the age-check page. The fetcher treats an age-check redirect or age-gate markup as "unknown" (not cached as clean). [code]
- Rate limiting: on 429 or 403 the queue pauses 30 seconds, doubling per consecutive hit to a 10-minute cap; the resolver returns nothing and the card stays unchecked. [code]
- Language handling: Steam's own heading in 30 languages for the app page; English forced for listing fetches; classifier text in 11 languages; UI strings in 2. A disclosure written in a language outside the 11 (for example Turkish or Czech) matches no keyword and, with the default filter, is neither hidden nor bannered. [code]
- Misses by design: (a) disclosure text that names no use ("we used AI in development") matches nothing; (b) the default hides only art, so voice, music or code only disclosures stay visible until the user ticks them; (c) games with undisclosed AI appear only through the community list, which is empty on 2026-10-21 (section 5). [code]
- False flag risks visible in the keyword data (inference, not measured): the art list includes very short or generic words (for example "art", "icon", "2d", "render*", "visuals"), and the text list includes "names", "plot" and "description*". A disclosure that says AI was used for "UI icons" or "marketing images" hits art. A statement that says no AI art was used is handled only by the negation window; a long sentence with the negation outside 48 characters would still flag. [code]

Measured on 2026-10-21 (my probes; anonymous read-only fetches of public store pages with credentials omitted, 10 app pages plus 1 invalid ID, 1.2 s apart; the classifier slice of the script was run offline in Node on the fetched texts, with no network access):

- Page structure: 9 of 9 reachable disclosed pages carried one disclosure block with a heading, one Steam intro paragraph and one developer paragraph with italic text and no nested divs. The script's parsing assumptions held on all 9. [measured]
- 1 of 10 sampled IDs (3360250, taken from a sibling seed list) landed on a sign-in page (31,920 characters) on an anonymous fetch. The script would store "unknown" for such a page and refetch it on each visit. [measured]
- An invalid app ID (999999999) returned HTTP 200 after a redirect to the store home page: 983,814 characters, no heading, no age-gate markup. The script's checks (status, age-check address, age-gate markup) would pass it and store "clean" for 7 days. [measured] [code]
- Classifier on 9 live disclosure texts (my reading of each text against the categories returned, n=9, small): 5 matched the described uses with no spurious category; 1 returned no category because the text names no use (the ARC Raiders text, app 1808500: "procedural- and AI-based tools to assist with content creation"); 1 was right partly by chance (app 4492940: it credited art from both the AI "visuals" and a sentence that says pixel art was hand-drawn); 1 was a scope error (app 3958080: AI used only for store-page marketing images, text says none in the game; result art plus video, so the default art filter would hide it); 1 was a wrong category (app 4761110: "LLMs ... used in development" returned live generation). A negation case worked: app 5015150 says it does not use AI during gameplay and live generation was correctly negated. [measured]
- The classifier cannot separate store-page use from in-game use, and one keyword for language models maps to runtime generation. [measured] [code]

## 3. Surface coverage

Source for the code bullets: the script URL in section 2.

- Pages the script runs on: every page of the store host, plus one page on the author's server (the sign-in return page). The script skips age-check pages. It runs in the top frame only. [code]
- App pages: the script reads the page's own disclosure block, shows a banner or full-page warning when the rules say hide, and always adds a "Community reports" panel (section 5). It does not scan the other capsules on an app page (recommendations, "more like this"); an app page runs the app-page path only. [code]
- Every other store page (search, wishlist, front page, tag and category pages, bundles): a generic scanner treats any link whose address holds an app path, or any element carrying an app-ID data attribute, as a card. It hides or marks the outermost matching element. Search has a special case that limits scanning to the results container and cards that are result rows. Wishlist and all other pages use the generic rule. [code]
- One table entry per surface does not exist here. A new surface works only if Steam renders an app link or the app-ID attribute there. Bundle and package links without an app path are not parsed. [code] (inference for bundles)
- The README says that on the wishlist only placeholder and blur are possible. The code at this commit has no wishlist-specific path and no such restriction. Treat the README line as unverified. [listing] https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/README.md [code]
- Not covered: Steam community pages, Steam client (no userscript manager there), Steam mobile app. Android is not mentioned in the README; Tampermonkey and Violentmonkey availability on mobile browsers was not checked. [listing] [code] (inference)
- Runtime: I did not install the script or run it on live pages. Coverage on the React-rendered wishlist and the front page is a reading of the code, not an observation. [code]

## 4. UX and user control

Source: script URL in section 2 and README URL in section 1.

- Listing hide styles (setting "How to hide on listings"): remove the card; replace it with a one-line placeholder (default, labeled "recommended" in the settings); or blur the card with a badge that unblurs on hover. The placeholder shows the title "Hidden: AI content", the reason and a "Show" link. [code] [listing]
- Show link: reveals that card for the current page view only; the reveal is an element state, so a reload hides it again. The link is a plain clickable span with no role or key handler in the code. [code]
- Pending state: a card whose label is missing shows a tiny "checking AI disclosure" hint and stays visible until the check ends. [code]
- App page, "banner" (default): an amber box above the purchase block with the title "This game uses AI-generated content", a line "Why it was flagged" with the reasons, the developer's disclosure text, and a link "Never hide this game". The disclosure text is set as plain text, so it is verbatim. [code] The README screenshot shows the banner with the developer text "In this game, artificial intelligence is only used so as to create images" and the reason "AI used for: art". [listing] https://github.com/Suvitruf/steam-hide-ai (image viewed through GitHub's image proxy)
- App page, "overlay": a full-page blurred overlay with three buttons: "Open anyway", "Go back" (browser history) and "Never hide this game". It blocks the page until the user chooses. [code]
- The banner and overlay appear only when the rules decide to hide. A game with a disclosure that matches no selected category gets no banner, so the developer text stays unseen. [code]
- Settings: opened by a 32 px "No AI" icon added to Steam's header (tooltip "AI filter") or a userscript-manager menu entry. Fields: label rule (do not hide, hide all, hide by selected categories), community toggle with category mode and reporter threshold, hide style, app-page mode, background checking on or off, parallel requests 1 to 4, always-hide and never-hide app ID lists, extra keywords per category, community list URL, UI language, clear label cache, export and import as JSON (the export leaves out the sign-in token), sign-in state, sign out, and "Delete my data on the server". [code]
- Overrides: manual always and never lists win over every rule. The banner and overlay offer one-click "never hide"; the string for one-click "always hide" exists in the code but no control uses it. [code]
- Dismissal: no way to dismiss a banner for a single visit other than the per-game never-hide rule or switching the app-page mode off. [code]
- Diagnostics: a menu entry shows a JSON block (script version, manager name and version, page path, storage kind, which manager APIs exist, stored key names, and the signed-in SteamID64 with token expiry). The README says the block "contains no personal data". The code includes the SteamID64 when signed in, so the claim is imprecise. [code] [listing]
- UI languages: English and Russian only. The language follows the Steam page language: a Russian page gives Russian, every other page gives English. [code]
- Disclosure of AI authorship: the README states that the code, tests and README were written with a model and reviewed by a human. [listing] README section "Disclosure", added in commit 74b6ba6 on 2026-10-21 (https://api.github.com/repos/Suvitruf/steam-hide-ai/commits/74b6ba6).

## 5. Privacy and permissions

Source: header and body of the script (URL in section 2) and the README "Privacy" section (URL in section 1).

- Matches: the whole store host, and the sign-in return page on the author's server. Run time: document start. Top frame only. [code]
- Grants (9): style injection, value read, value write, value delete, value listing, value-change listener, open in tab, menu command, cross-origin request. [code]
- Connect hosts (2): `steam-ai-hide.apanasik.com` (the author's report server) and `raw.githubusercontent.com` (community list). No wildcard. [code]
- Outbound requests, all proven from code:
  - To store.steampowered.com: one GET of an app page per unlabeled app on a listing, as a same-origin page request with the page's credentials. Steam cookies therefore go along. The target is a Valve host the user is already on, but our rule calls for credentials omitted. [code]
  - To raw.githubusercontent.com: a GET of the community list at most once an hour, with an entity-tag conditional request. The call is made from the start-up routine on every store page without checking whether the community feature is on. The README states "at most once an hour" and "off by default" for the feature, not that the download is skipped when off. [code] [listing]
  - To the author's server, only on user action or while signed in: open the sign-in page in a new tab; submit, edit or withdraw a report; fetch "my reports" at most once every 24 hours when signed in (triggered by any store page load); delete all my data. [code]
  - Nothing else: no analytics, no telemetry and no third-party fonts or scripts. [code]
- Cookies: the script does not set the manager's anonymous option on its two cross-origin hosts, so cookie handling for those two hosts follows the manager's default (unverified). Steam cookies are host-scoped and are not sent to either host. [code]
- Language side effect check: on an anonymous visitor, a fetch of a store page with a language parameter did not change the language of later plain fetches (Spanish then English then plain, plain stayed English). Signed-in behavior not tested. [measured] 2026-10-21 on https://store.steampowered.com/app/1808500/

The community list and report server:

- What is sent, and when: a report carries the app ID, the chosen categories (art, text, voice, music, code, video, live generation, other), an optional comment of up to 500 characters, a flag "the page shows the official Steam AI disclosure" taken from a checkbox, and the script version. It goes with a bearer token whose payload holds the user's SteamID64 and an expiry time. The token is issued after Steam OpenID sign-in. [code] [listing]
- Sign-in flow: the script opens the author's server in a new tab; the server sends the browser through Steam's sign-in; the return page carries the token in the address fragment; the script reads it, stores it in the manager's storage, strips it from the address bar and closes the tab. The script decodes the token locally to show the SteamID64 and expiry in the settings. [code]
- What the server stores, per the README: SteamID64, reports (game, categories, comment) and a hashed IP address for abuse protection. [listing]
- What the README says it does not learn: password and Steam cookies. [listing] That fits the OpenID design (sign-in happens on Valve's site). Not verifiable from the script alone.
- What comes back: a JSON object with a version, a timestamp and an app map; each app ID maps to the number of distinct reporters and a count per category. The script validates the shape strictly before storing. Identities are not in the list. [code] [listing]
- How reports are verified: the README says reports come from "real Steam accounts" via Steam sign-in. It states one report per game per account and 30 reports per day. It states that a game enters the list at 5 distinct accounts and leaves below 3, and that the full list carries "trusted reporters" per game. The README does not define "trusted", the account requirements (age, purchases, limited accounts) or any check of the claim itself. The only content check in the client is a self-declared checkbox. [listing] (nothing here is proven from server code)
- User-side threshold: default 20 reporters, applied in the script on top of the server's 5. Per-category mode applies the threshold per category. [code] [listing]
- Developer redress: the README describes no dispute, appeal or removal path for a developer named by reports. [listing] (absence in README only)
- Retention: the README does not state how long reports or hashed IPs are kept. Account deletion exists ("Delete my data on the server"), which the README says removes everything. No separate privacy policy or terms file exists in the repo. [listing] [api] https://api.github.com/repos/Suvitruf/steam-hide-ai/git/trees/HEAD?recursive=1
- Who runs it: the author, under a personal domain. A sponsor link (GitHub Sponsors) and a Patreon page sit in the repo. [listing] https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/.github/FUNDING.yml
- Server code: not public. The 85 public repos of the author hold no server repo; a GitHub code search for "steam-ai-hide" returns only this repo's two script files (2026-10-21); a file in this repo states that the script and lists are "published by the build pipeline"; the script's own settings text calls this repo "the public dist repository". The source and the server are therefore elsewhere. License of the server: unknown. [api] https://api.github.com/users/Suvitruf/repos , https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/.gitattributes [code]
- State on 2026-10-21: the published community list is the empty placeholder (the app map has no entries, generated 2026-10-21T00:00:00Z, 34 bytes for the minified file). The hourly rebuild the README describes has not produced a commit; the repo's six commits are all by hand. [api] https://api.github.com/repos/Suvitruf/steam-hide-ai/commits
- Trust model of the list: the list is a file on the author's master branch; any push changes what every user with the feature on sees (the script checks only the data shape). [code] [api]
- Conflict with our rules: reports send app IDs and a stable Steam identity to a non-Valve host, and the list download goes to a second non-Valve host (GitHub) without user action. Our rule 1 allows app IDs to leave the browser only for two Valve hosts. [listing] [code]

## 6. Efficiency

Source: script URL in section 2, measured sizes from my probes on 2026-10-21.

- Requests per app page: none for the page itself. The page's own verdict comes from the DOM. [code]
- Requests per listing: one full HTML store page per card whose app ID has no usable cache entry and that sits within 300 px of the viewport (an intersection observer defers off-screen cards). No batching and no use of a lighter Valve API. [code]
- Page weight: 9 disclosed pages fetched anonymously were 100,959 to 184,495 characters each (median 108,011); the invalid-ID redirect to the store home page was 983,814 characters. [measured]
- Queue: 2 parallel requests by default (setting 1 to 4), at least 300 ms between starts, a 30 second pause after a 429 or 403 that doubles up to 10 minutes, timeouts of 15 to 20 seconds exist only on the helper for the two cross-origin hosts (the store-page fetch has no timeout, so a hung request holds one of the two slots). Duplicate requests for one app ID share one pending request; pending tasks are sorted by a priority number. [code]
- Cache: one record per app in manager storage. Lifetimes: labeled 30 days, clean 7 days, unknown 1 day. An expired entry is pruned at most once a day at start-up, which lists every stored key. No size cap. The "unknown" lifetime does not stop refetching (section 2). [code]
- Settings change: all cards are re-evaluated; classification is memoized per app on the page. [code]
- Observers: one mutation observer on the body (child list, subtree) with a 50 ms debounce that re-queries the whole document for cards on each burst; processed cards are marked with an attribute (no weak sets). One intersection observer. The scanner has a stop method that nothing calls; no handler runs on page hide. [code]
- Classifier cost: each classify call runs about 784 compiled patterns over the text, plus negation checks. [code] [measured] (counts)
- Community list: conditional GET once an hour; 34 bytes now. [code] [api]
- Size: script 110,708 bytes, unminified; about 1,276 of its 3,698 lines (35 percent) are keyword and negation data. [api] [code]
- No scan-time or bundle-size budget exists in the repo (no tests, no CI). [api]

## 7. Maintenance and responsiveness

Source: https://api.github.com/repos/Suvitruf/steam-hide-ai/commits?per_page=100 , /issues?state=all , /pulls?state=all (all read 2026-10-21 about 20:50Z).

- Age: repo created 2026-10-21T19:06:09Z, same day as this research; first commit 19:06:11Z; last commit 20:27:04Z. [api]
- Cadence: 6 commits in 81 minutes by one author (initial commit; first script version at 19:43Z; README image at 19:56Z; removal of the editable server address from settings at 20:03Z; icon instead of text at 20:18Z; icon position fix at 20:27Z). Commit messages are plain sentences, no Conventional Commits, no trailers. [api]
- The script header version stayed 0.2.0 through all six commits; the first script commit was 109,239 bytes, the last 110,708. [api] https://api.github.com/repos/Suvitruf/steam-hide-ai/contents/steam-hide-ai.user.js?ref=e7c54ec
- Issues: 0 opened (open or closed). Pull requests: 0. So no response times, no closure times and no themes exist. [api]
- Releases and tags: none. CI and tests: none in the tree, although the README says tests were written. [api] [listing]
- Contributors: one. [api]
- Breakage and fix history: none to report. One fix visible in history: the commit that removed the editable server address from the settings dialog and hid the default address from diagnostics and exports. [api] https://api.github.com/repos/Suvitruf/steam-hide-ai/commits/edf164e
- Build model: scripts and lists are published by an automated pipeline from a private source (section 5). Maintenance cadence of the private source is not observable. [api]

## 8. Reach and trust

- Installs: no count exists. Not on Greasy Fork: API queries for "steam hide ai", "steam-hide-ai", "Suvitruf", "apanasik", "steam ai disclosure" and "steam ai generated hide" on 2026-10-21 returned no matching script (two queries returned one unrelated chat translator). Not on OpenUserJS: search "steam hide ai" returned no scripts on 2026-10-21 (read through a summarizer). [measured] https://api.greasyfork.org/en/scripts.json?q=steam+hide+ai , https://openuserjs.org/?q=steam%20hide%20ai
- Stars 0, forks 0, subscribers 0, network 0, no discussions on 2026-10-21. [api] https://api.github.com/repos/Suvitruf/steam-hide-ai
- Author reach: GitHub account since 2012-07-10, 85 public repos, 121 followers. [api] https://api.github.com/users/Suvitruf
- Press and community: none found. Three web searches (tool name plus author, the server host, the repo name) returned only an October 2025 article about a different userscript and unrelated pages. Reddit and the Chrome Web Store were not tried. [measured] 2026-10-21 searches
- Trust signals: MIT license; readable unminified source; credits to seeeeew/aiwarningforsteam (MIT) and a public-domain icon; "not affiliated with Valve" line; honest AI-authorship disclosure. Weak signals: day-zero repo, one maintainer, no releases, no listings, private source behind a published bundle, an account-backed server with unstated retention. [listing] [api] [code]
- The README says Steam "does not require developers to disclose AI use". That is imprecise: Steam requires disclosure for content players see and for live-generated content, and a January 2026 rule update narrowed it (secondary report seen only in a search summary, unverified). [listing] https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/README.md

## 9. Packaging and distribution

- Install path: userscript manager plus one raw GitHub address that ends in the userscript suffix. README names Tampermonkey (Chrome, Edge, Firefox, Safari, Opera) and Violentmonkey; Greasemonkey is stated as unsupported. [listing] https://raw.githubusercontent.com/Suvitruf/steam-hide-ai/master/README.md
- Update path: the header points the manager at a small metadata file on the master branch; the manager polls it and downloads the script when the version changes. The version has not changed in the first six commits (section 7), so a manager that compares versions would not offer those commits as updates until the number changes (inference). [code] [api]
- Trust model: every push to master reaches all installs; no release step, no signing. [code] [api]
- Managers tested: no test evidence in the repo. The script's own diagnostics assume Tampermonkey or Violentmonkey style APIs. [api] [code]
- Hosts: GitHub only. No Greasy Fork, OpenUserJS or browser store listing. [measured]
- Install-time surface: the script asks for 9 grants and 2 connect hosts; the manager shows these at install. [code]

## 10. Coverage and Restraint evidence

Coverage, supports:

- Reads the app's own page in any store language by matching Steam's heading in 30 localized forms. [code]
- Forces English for listing fetches, so one heading test works. [code]
- Generic scanning of app links on every store page, with lazy off-screen handling and a mutation observer for added cards. [code]
- Classifier in 11 languages, with negation handling that worked on one live negation (app 5015150). [code] [measured]
- Age gates become "unknown", not "clean"; 429 and 403 trigger a growing pause. [code]
- 9 of 9 reachable disclosed pages matched the script's page-structure assumptions. [measured]

Coverage, limits:

- No runtime test by me; surfaces are a reading of code. [code]
- Redirects to the home page and other 200 error pages store "clean" for 7 days. [measured] [code]
- "Unknown" entries are refetched on every visit; 1 of 10 sampled IDs hit a sign-in page anonymously. [code] [measured]
- Default filter hides only art; classifier results on 9 live texts: 5 clean matches, 1 empty, 1 lucky, 1 scope error, 1 wrong category. [measured]
- UI in 2 languages; heading set stands on one third-party list of 30 titles. [code] [listing]
- Day-zero project: no evidence of surviving a Steam markup change. [api]

Restraint, supports:

- Developer text rendered as plain text, verbatim. [code]
- Default behavior is non-blocking (placeholder and banner); per-card reveal and per-game never-hide exist. [code]
- No analytics; two hosts only; server contact only on sign-in and report, plus a daily sync when signed in. [code]
- Account deletion on the server and an export that leaves out the token. [code] [listing]
- Honest AI-authorship disclosure and credits. [listing]
- Pending cards are not hidden before the label is known. [code]

Restraint, limits:

- Banner title reads "This game uses AI-generated content", for disclosed and for crowd-reported games alike. Our rule 4 wording is "AI use reported". [code]
- Crowd reports present undisclosed games as AI users on the strength of counts; reporters self-declare. [code] [listing]
- App IDs and a SteamID64-bearing token go to a non-Valve host; the list download hits GitHub on every store page start-up regardless of the toggle. [code]
- Store-page fetches carry Steam cookies. [code]
- 9 grants; full-page overlay option blocks the page. [code]
- Observers are never disconnected; cache has no cap. [code]
- Update channel is the author's master branch with a private build source. [api] [code]

## 11. Lessons for our design

- Avoid: any keyword classifier as the gate for hide or dim. On 9 live disclosure texts it produced one scope error (store-page marketing read as art) and one wrong category (language models in development read as live generation). Show Steam's own text verbatim and let the reader judge scope.
- Match: heading recognition from Steam's own 30 localized titles for any path that reads page DOM, text set as plain text, and a user-visible reason next to every flag. Confirm in RQ2 whether the API path already returns the text.
- Avoid: crowd reports, a Steam sign-in, a hashed-IP store and a second non-Valve host. They break rule 1 and the three-state verdict in rule 4 (a crowd claim is neither "disclosed" nor "not disclosed"). The same design adds a trust and retention burden the README leaves unstated.
- Avoid: storing a verdict from any 200 response, and refetching "unknown" on every visit. Their redirect-to-home case stores "clean" for 7 days (measured). We store only from a response of the expected shape and keep unknown short-lived with a retry limit.
- Match: placeholder with a "Show" link, per-game never-hide, hide-style choice, diagnostics export without secrets, and settings export and import. Avoid: "This game uses AI-generated content" copy, a blocking overlay, and an English-and-Russian-only UI.

## 12. Not retrievable

- The author's server (`steam-ai-hide.apanasik.com`): not called, by rule. No API schema, privacy policy, terms or retention text exists in the repo; the README "Privacy" section is the only statement found.
- Server code, build pipeline and tests: private or absent. The six commits show only the published output.
- How reports are verified server-side, what "trusted reporters" means, hashed-IP algorithm and retention: not stated anywhere I could read.
- Runtime behavior: the script was not installed or run; signed-in behavior, wishlist, front page and age-gate flows are code readings. The classifier test ran the script's classifier slice offline on 9 texts I fetched; it is a small sample.
- Cookie defaults of the manager for the two connect hosts: not verified.
- Whether the hourly list rebuild works: no automated commit existed at 2026-10-21T20:50Z.
- Reddit, the Chrome Web Store and SteamDB were not tried (refused or Cloudflare-blocked for earlier agents). Press search used three web searches only.
- README.ru.md was compared only through the diff of its changes, not read in full.
- Page text addressed to AI agents: none seen.
