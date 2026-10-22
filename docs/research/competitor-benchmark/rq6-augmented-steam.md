# RQ6: Augmented Steam (IsThereAnyDeal), competitor benchmark

Status: draft. Research date: 2026-10-21. No scoring in this note.

Clean room: Augmented Steam is GPL-3.0 and project rule 6 forbids using anything from it. No source file was read on purpose. Sources used: GitHub issues, discussions and pull request descriptions via `gh api`, the changelog file, the README, the wiki, the repository file tree (names only), the Firefox AMO public API, the Edge Add-ons public product JSON and page, and the project website. The note records behavior and decisions in words. It carries no code, selectors or snippets. Section 12 lists what leaked into view by accident.

Prior note: `docs/research/steam-ai-disclosure/rq4-prior-art.md` section 1.6. "Confirmed" below means the prior note was right and the detail is not repeated.

Short names used for URLs: ISSUES = https://github.com/IsThereAnyDeal/AugmentedSteam/issues , CHANGELOG = https://github.com/IsThereAnyDeal/AugmentedSteam/blob/develop/changelog.yml , AMO = https://addons.mozilla.org/api/v5/addons/addon/augmented-steam/ , AMO-RATINGS = https://addons.mozilla.org/api/v5/ratings/rating/?addon=augmented-steam , EDGE-JSON = https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/dnpjkgmekpilchdgolfifobohlohlioc , EDGE-PAGE = https://microsoftedge.microsoft.com/addons/detail/augmented-steam/dnpjkgmekpilchdgolfifobohlohlioc , SITE = https://augmentedsteam.com/ .

## 1. Identity

- Product: Augmented Steam, browser extension by IsThereAnyDeal (ITAD, a deal-tracking company). Fork and spiritual successor of Enhanced Steam, which ended in February 2019 (README: https://github.com/IsThereAnyDeal/AugmentedSteam/blob/develop/README.md).
- Repo: https://github.com/IsThereAnyDeal/AugmentedSteam . GPL-3.0, created 2019-01-09, default branch `develop`, 1,788 stars, 128 forks, 14 watchers, Discussions and wiki enabled, last push 2026-10-21 (read 2026-10-21; https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam).
- Open work on 2026-10-21: 351 open issues and 8 open pull requests (https://api.github.com/search/issues with `is:issue is:open` and `is:pr is:open`); the repo API reported 360 open items earlier the same day.
- Store IDs: Chrome `dnhpnfgdlenaccegplpojghhmaamnnfp`, Edge `dnpjkgmekpilchdgolfifobohlohlioc`, Firefox slug `augmented-steam`, add-on ID `{1be309c5-3e4f-4b99-927d-bb500eb4fa88}` (README badges; AMO).
- Store URLs: https://chromewebstore.google.com/detail/augmented-steam/dnhpnfgdlenaccegplpojghhmaamnnfp (unreadable, see section 12), EDGE-PAGE, https://addons.mozilla.org/en-US/firefox/addon/augmented-steam/ .
- Publisher on AMO and Edge: IsThereAnyDeal. Support email on AMO: augmentedsteam@isthereanydeal.com (AMO).
- Server: separate repo https://github.com/IsThereAnyDeal/AugmentedSteam_Server , MIT, PHP, 145 stars, last push 2026-08-12 (https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam_Server).
- Funding: Patreon `IsThereAnyDeal` (https://github.com/IsThereAnyDeal/AugmentedSteam/blob/develop/.github/FUNDING.yml).
- Size model: product with a company behind it and a feature set far beyond Steam badges: price comparison from many stores, highlighting of owned and wishlisted games, search filters, sort and filter on market, friends, groups, badges, reviews, notes, custom links, profile backgrounds, age gate skipping, batch actions (SITE, README). Firefox package is 18,196,144 bytes for v5.0.0 (AMO, file size).
- Contributors in the repo history, all-time, from the GitHub API on 2026-10-21: MxtOUT 1,971, jshackles 1,826 (Enhanced Steam founder), tfedor 1,686, candela97 962 (https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam/contributors).

Corrections and confirmations against rq4 section 1.6:

- Confirmed: no AI-disclosure feature as of 2026-10-21; issue 1913 opened 2024-04-25 with about 10 comments and 12 thumbs-up; issue 2362 opened 2026-08-13 with 0 comments; GPL-3.0; the maintainer comments in 1913 are from one collaborator in April 2024; seeeeew's MIT offer on 2025-10-27; the 2026-06-22 and 2026-10-19 complaints about the standalone extension.
- Corrected: the VaporLens poll figures (158 votes, 66% keep) were a snapshot quoted by GamingOnLinux on 2026-01-05. The live poll on 2026-10-21 reads 217 votes: 125 keep (57.6%), 92 remove (42.4%) (https://github.com/IsThereAnyDeal/AugmentedSteam/discussions/2240). Source of the old figure: https://www.gamingonlinux.com/2026/01/augmented-steam-browser-plugin-added-ai-features-from-vaporlens/ .
- Corrected: the poll was opened by a community member (azalty) on 2025-12-27, the maintainer then decided on 2026-01-03 (same discussion).
- Added: a third request exists. Issue 2408 "Add AI content filtering" was opened today (2026-10-21), asks for something like another extension's AI content hider, 0 comments (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2408).
- Corrected: the manifest is now retrieved (section 5). It is Manifest V3 with a service worker.
- Corrected: stars 1,785 to 1,788, forks 127 to 128, last push 2026-10-16 to 2026-10-21. Firefox users 64,156 on 2026-10-20 to 64,147 on 2026-10-21 (AMO).
- Open question the prior note left: the Chrome page. Still unreadable; a third-party badge gives about 400k users (section 8).

## 2. Detection and accuracy

No detection exists. The material here is demand and the maintainers' reasoning. Both open requests carry the label `augmentation` (ISSUES/1913, ISSUES/2362, ISSUES/2408).

### Issue 1913 "Option to see warning about games with AI generated content"

Opened 2024-04-25 by kazerniel (no repo role), open, 10 comments, 12 thumbs-up on the issue, last update 2026-10-19 (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/1913; API read 2026-10-21).

- Request: show a warning "basically same as the DRM warning". Reason: Steam's disclosure sits low in the description, so the author wants it attention-grabbing (issue body).
- Maintainer side, one person: candela97 (collaborator). 2024-04-25 asked for an example game. 2024-04-27 replied that it is tricky: other content descriptor sections look alike, only the text tells them apart, and the text "it'll likely get localized at some point" (comment, 1 thumbs-up, edited 2024-06-22). Nothing since. The owner and release manager, tfedor, has not commented on 1913 or 2362 (comment lists via API).
- candela97 last committed 2024-11-23 and last commented in the repo 2025-03-04 (commits and comments APIs, section 7). The only maintainer who engaged with the AI-disclosure request is no longer active. The gap since the last maintainer reply is about 29 months.
- 2025-02-19 Tenome (1 heart): asked for a re-review because Steam now shows the disclosure under its own header. No answer.
- 2025-02-20 kazerniel (4 thumbs-up): reported a user-style workaround that paints the box red; he still has to scroll to it. 2025-09-28 same user: a second workaround that moves the box to the top of the left column. Both are user CSS; not reproduced.
- 2025-08-18 agostaxyz (2 thumbs-up): Steam's internal app key 565 (aicontenttype) can be empty, 1 (pre-generated) or 2 (live-generated), citing SteamDB and a Steamworks post (https://store.steampowered.com/news/group/4145017/view/3862463747997849618). No answer.
- 2025-10-27 seeeeew (contributor, 6 heart reactions, the highest on the thread): his MIT-licensed AI warning extension does something very close; code can be reused; too busy to port it. He has 89 commits in the repo but none on `develop` in the last 12 months (commit counts, section 7).
- 2026-06-22 NamelessVoice: wants a banner like the DRM one; calls the standalone extension "really ugly" because its modal blocks the page.
- 2026-10-19 PXAbstraction: wants a popup or banner that shows the developer's own disclosure text; says some developers misuse the field to say they do not use AI (example named: Crime Scene Cleaner) and those games must not be filtered; says the standalone extension has no options, blurs search results, and has had no update since July.
- Subscribers who joined late: zeromind 2025-04-21, DawEdhel 2025-10-08, AbsenceJam 2026-08-25, janlarres 2026-10-20 (issue timeline).

### Issue 2362 "Allow us to filter games with generative AI content from the store"

Opened 2026-08-13 by sarantula, 0 comments, 0 reactions, no maintainer reply as of 2026-10-21 (https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam/issues/2362). Ask: hide games with generative AI from the store, to "discourage devs from using it" and cut asset-flip games.

### Issue 2408 "Add AI content filtering"

Opened 2026-10-21 by GrimTheWanderer, 0 comments. Ask: add something like https://github.com/SoBloxsy/AI-Content-Hider-for-Steam; reason: "ai slop flooding the platform" (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2408).

### Other AI-related threads (tracker and discussions searched 2026-10-21 for AI, LLM, VaporLens, generative, slop, ChatGPT)

- VaporLens issues and PRs: 2194 request (2025-11-02, by VaporLens's creator yamalight, maintainer agreed 2025-11-06), 2198 PR (2025-11-07), 2229 colors, 2232 collapse request (2025-12-15, 5 reactions), 2246 "VaporLens highlights" (2025-12-28, 7 reactions), 2314 last-updated date, 2370 bug, 2389 fix PR (https://github.com/IsThereAnyDeal/AugmentedSteam/issues?q=vaporlens). Details in section 4 and 7.
- Poll discussion 2240 "VaporLens integration poll": 22 top-level comments, 8 upvotes (https://github.com/IsThereAnyDeal/AugmentedSteam/discussions/2240).
- No other discussion mentions AI. The tracker has 15 discussions in total (GraphQL read 2026-10-21).
- Request 2301 "DRM Popup" (2026-04-09, 1 reaction) cites the AI warning extension's popup as the model (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2301). Users treat banners and popups for disclosures as one family.
- One more theme: a contributor PR (2372, open since 2026-08-23) was written with an AI assistant and says so; no maintainer reaction in 59 days and no repo rule on AI-assisted PRs (https://github.com/IsThereAnyDeal/AugmentedSteam/pull/2372; file tree has no contribution policy).

### What the evidence says

- Two jobs are requested: make the disclosure visible on the app page (1913, 2301-style) and filter or hide in listings (2362, 2408). Only the first has votes over time.
- Users want the developer's text shown, a dismissible banner, no page-blocking modal, no blurred results.
- A presence-only check mislabels pages whose developers write "no AI" in the field (2026-10-19 comment).
- Maintainer reason for not building it: the heading text is the only discriminator and may be localized. The numeric app key idea went unanswered.

## 3. Surface coverage

- Page classes (from the content-script URL patterns in the store manifest: 40 script groups, 196 patterns, read 2026-10-21 from EDGE-JSON; same hosts on AMO):
  - Store: home, app pages, bundles, packages (sub), search, cart, wishlist (own and other users, with a double-slash variant), account, licenses, register key, add funds, digital gift cards, points shop, age check.
  - Community: profiles (id and profiles forms), inventory, market (home, listings, search), workshop and shared files (browse, details, guide editor), groups, friends, following, badges, game cards, booster creator, trade offers, reviews, recommended, activity and status pages, stats, games and followed games, guides.
- Steam markup mix: the maintainer writes that "Valve continues to update Steam and fully rebuild it in React" and expects page-by-page change (4.2.0 notes, CHANGELOG; release 2024-12-06). In 4.4.2 he says he stopped inlining features "so it's hopefully more future proof" (CHANGELOG; release 2025-11-29).
- Steam desktop client: not supported. Discussion 2307 (2026-04-18, 5 upvotes), issue 2375 (2026-08-25), issue 2383 "Desktop Steam App support" (2026-09-08, 4 comments) ask for it; the client's built-in browser is Chromium and can load extensions per those threads (https://github.com/IsThereAnyDeal/AugmentedSteam/discussions/2307 , ISSUES/2383). Pull request 2377 by a user (opened 2026-08-26, open) lets the extension initialize in the client; the author calls it a starting point with layout gaps; the maintainer commented 2026-10-01 that he must study initialization (https://github.com/IsThereAnyDeal/AugmentedSteam/pull/2377). A commenter says a third-party client mod (Millennium plus an extension host plugin) works today (ISSUES/2383, 2026-10-09). Unverified.
- Mobile: no declared Android support. AMO lists desktop Firefox only, minimum 140.0 (AMO, `compatibility`). Issue 1964 "Declare Firefox for Android compatibility" (opened 2024-07-12, 11 thumbs-up, 1 comment from a user on 2025-06-04, no maintainer reply, open) reports that sideloading works (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/1964). Issue 1815 (2024-01-04) asks the same.
- Browser differences: a collaborator said on 2023-12-13 all functionality is the same in Chrome and Firefox (https://github.com/IsThereAnyDeal/AugmentedSteam/discussions/1807); one user found a toolbar pin difference on 2026-02-10 (same thread).

## 4. UX and user control

- Settings location: options page opens in its own tab (manifest `options_ui` with open in tab, EDGE-JSON).
- Settings structure (repo file tree, names only, read 2026-10-21): option modules named General, IsThereAnyDeal, AI/LLM, Price, Store, App page, Community, plus About and Changelog pages. The count of individual options is not retrievable without reading source. Unverified.
- Option growth is a known worry: issue 493 "Decrease number of options" (2019-08-23, 7 reactions, labels `augmentation`, `discussion needed`, open). A collaborator answered on 2022-07-17: "we shouldn't have any "advanced" or "non-essential" features"; the team reduces options by reworking features so they can ship default-enabled (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/493). Users suggested hiding advanced options or adding a search box; neither shipped as far as the thread shows.
- Defaults: additive features ship on. The maintainer says new features that "don't change current behavior but add stuff" are on by default (4.5.1 notes, CHANGELOG; same view in https://github.com/IsThereAnyDeal/AugmentedSteam/discussions/2240 on 2025-12-28). Some features ship off: tab-title prefix (4.4.0), experimental video no-pause (4.3.0), both "turned off by default" (CHANGELOG).
- Warnings: the extension already shows a DRM warning on app pages; users name it as the model for an AI warning (ISSUES/1913, 2301). Changelog 2.6.0 separated DRM warnings from purchase boxes.
- Dismissal that failed: the red banner "Make sure that you are logged into steamcommunity.com" came back on every page. Issue 2104 (opened 2024-12-28, 20 reactions, closed 2025-04-28) reports the "Don't show again" button did nothing (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2104). Five AMO reviews between 2023-10-10 and 2025-03-13 complain about it (AMO-RATINGS). A visible failure badge "N request(s) failed" is open in issue 2182 (opened 2025-10-03, 30 comments, label `more info needed`; https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2182).
- Backups: settings import and export since 1.4.4; sync of notes with ITAD since 4.1.0 (CHANGELOG).
- Language: a Latin American Spanish user reported on 2024-12-19 that the extension works only if Steam runs in English (AMO review; AMO-RATINGS); 2.x notes show many language-sensitive fixes.

### The contested feature: VaporLens review summaries (LLM)

Timeline, all from CHANGELOG, discussion 2240 and the AMO ratings:

- 2025-11-02 VaporLens's creator proposed the feature; 2025-11-06 maintainer accepted; 2025-11-07 PR 2198 (asks: English strings only, 4-space indentation). On 2025-11-29 the maintainer found Steam's content security policy blocked the fetch in Firefox; the creator moved it to the background; on 2025-12-03 the maintainer simplified the code on his own branch and the creator closed the PR on 2025-12-04 (https://github.com/IsThereAnyDeal/AugmentedSteam/pull/2198).
- 2025-12-11 v4.5.0 shipped it on by default. The notes name it as "turned on by default".
- 2025-12-19 first 1-star AMO review about it. 2025-12-27 v4.5.1 notes: the maintainer says he does not use AI on ITAD or Augmented Steam but cannot control third parties, calls VaporLens "built around AI", admits the default drew "a bunch of negative feedback" and puts keep-or-remove to a vote. Same day he adds a collapse option. The poll opened that day.
- 2025-12-28 the maintainer replied in the discussion: "I understand the hate of LLM and AI, I hate it too." (attributed to tfedor, same discussion). He argued the summaries are pre-generated offline, not on demand.
- 2026-01-03 v4.6.0: VaporLens stays, on by default but collapsed; a quick settings link; a new AI/LLM settings category; an AI/LLM kill switch; an explanation in settings; an LLM note in the box; the changelog popup stays until closed. He promises no more LLM features and says the feature would be dropped if it moved to on-demand LLM calls (CHANGELOG 4.6.0; discussion 2240 on 2026-01-05).
- 2026-01-04 and 2026-01-05 he answered critics one by one. He said he does no usage tracking: "I don't track any usage stats, or any other stats from Augmented Steam." (2026-01-06, discussion 2240).
- Poll result on 2026-10-21: 217 votes, 125 keep, 92 remove.
- Complaints in the discussion thread: default-on without a notice, no sign where the content comes from (2025-12-28, 12 upvotes), reuse of reviewers' text without consent, summary accuracy, intrusive box size, moral and environmental objections, "I'm tired of having AI put in the products I use daily" (brianx87, 2026-01-05, 4 upvotes). Defenders: it can be switched off; low impact; useful (top comments with 33, 26, 21, 20 upvotes on each side).
- Maintainer reflections: he calls the default "bad judgement call" and says opt-in would have been possible but "should all features be opt-in?" (discussion 2240, 2026-01-05 and 2025-12-28). He says the feature would have drawn less anger if it used classic NLP instead of an LLM.
- Visible exits: three commenters said they removed the extension or switched to another (waffletacos, brianx87, yncandescent); a fourth said he can no longer recommend it (SupDos). One said on 2026-01-04 he dropped his Patreon support; the maintainer offered a refund (discussion 2240).
- VaporLens's creator joined the thread on 2025-12-30. He says it runs on small Mistral models, about 4M tokens a day, no revenue as of 2026-01-05 (his claims; unverified).

## 5. Privacy and permissions

- Manifest (Chromium build as shown in the Edge listing JSON, version 5.0.0, read 2026-10-21): Manifest V3; permissions `storage`, `contextMenus`, `webRequest`, `offscreen`; host permissions `*://*.steampowered.com/*`, `*://steamcommunity.com/*`, `*://*.isthereanydeal.com/`; no optional permissions; background is a service worker; 40 content-script groups with 196 URL patterns (EDGE-JSON; the AMO permission list shows 195 patterns, a one-entry difference I did not trace).
- Firefox build (AMO API, v5.0.0): `storage`, `contextMenus`, `webRequest`, the same three host patterns, no optional permissions; minimum Firefox 140.0; data collection declared as `none` required and `websiteContent` optional (AMO, `file`). The `offscreen` permission does not appear on AMO.
- Edge privacy panel: data handled is "Website content"; declares it is not sold, not used for unrelated purposes, not used for credit decisions; says personal data is collected (EDGE-PAGE, read 2026-10-21). Chrome privacy tab not readable.
- Permission justification text on the stores (Chrome developer-dashboard fields): not retrievable. The wiki page "Use of permissions" gives reasons in words: storage for user preferences; contextMenus for context menu entries; the two Steam host patterns for cross-origin requests from the background; the ITAD host for authorization; webRequest (and the blocking variant) for ITAD authorization as a Chrome workaround, listed as optional (https://github.com/IsThereAnyDeal/AugmentedSteam/wiki/Use-of-permissions). The page is stale: it describes the old manifest and does not mention offscreen.
- Firefox consent: v4.8.0 (2026-07-22) "now we ask you for data collection consent before you connect Augmented Steam with IsThereAnyDeal"; version bump "due to updated manifest requirements from Mozilla" (CHANGELOG 4.8.0). Importing the ignore list into ITAD needs new ITAD permissions and a reconnect (CHANGELOG 4.7.0).
- Backend: ITAD servers plus a separate open server (MIT). Documented API groups by file name: app data, DLC info, early access list, market card prices and averages, prices, profile backgrounds, currency rates, similar games, Twitch streams (server `docs/` names, https://github.com/IsThereAnyDeal/AugmentedSteam_Server). The server crawls data itself (cron jobs); in 4.2.3 (2025-07-29) the maintainer dropped card averages because Steam's throttling made the crawled prices "less accurate over time" (CHANGELOG).
- Outbound data, from the project's privacy text on SITE (read 2026-10-21, undated):
  - Requests usually carry the IDs of the games you browse and your currency, "not tied to your account in any way".
  - Profile features may send your numerical Steam ID; using them can require logging in to ITAD servers through Steam, which stores the ID.
  - Request logs include IP addresses, kept at most 90 days, usually 30.
  - Contact for data removal: es@isthereanydeal.com.
  - Extension and server code are open for review.
  - The text names only ITAD servers. It does not mention VaporLens, a third-party host the extension queries from the background (PR 2198 discussion, 2025-11-30). What leaves the browser for VaporLens is not documented in anything read. Unverified.
- Dependency risk: when ITAD's site went down on 2024-08-20, a user reported the extension stopped working; the issue closed the same day when ITAD recovered (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2014).
- Security report: issue 2390 (opened 2026-09-18, AI-assisted, open, 0 comments) alleges the messaging between the content script and its page-context script can be spoofed by another script already running on Steam pages. No maintainer reply in 33 days. The repository file tree has no security policy file (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2390). Only the maintainers can judge the claim.
- Maintainer stance on telemetry: no usage stats at all (see section 4 quote).

## 6. Efficiency

- Complaints found: issue 1976 (2024-07-15): store pages took several seconds to load and CPU spiked, because a periodic ITAD sync ran on every page load with large collections; a user fixed it by PR 1975 and both closed 2024-07-20 (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/1976). Older notes: 1.4.1 "Fixed memory crash for big libraries" (2020-01-13) and 1.4.2/1.4.3 "Fix high disk & CPU usage and improve loading times" (2020-03-06) (CHANGELOG).
- Steam throttling shapes design: 4.2.3 (2025-07-29) says Steam "increasingly" throttles market queries; the team moved card prices from the server to the extension; 4.7.0 (2026-05-20) fetches card prices on demand "to prevent Steam's throttling" (CHANGELOG).
- Caches: the repo tree names a persistent browser database (schema versions up to 8), a persistent cache module and a session cache module (names only). A user-reported bug (issue 2400, opened 2026-10-01, open) says a cached Steam store data set is overwritten with empty data when the Steam store session expires (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2400). A contributor added a 24-hour cache for VaporLens data (PR 2198, 2025-11-09); the final version was rewritten by the maintainer and the details are not in any description read.
- Storage quota: issue 2171 (2025-08-14, closed 2025-12-11, 8 comments) is titled as exceeding a write-operations-per-minute quota (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/2171). Title only; not read in depth.
- Offscreen document: the Chromium manifest asks for `offscreen` (EDGE-JSON); the tree has a DOM-parsing module with an offscreen variant and a native variant (names only). Reading is an inference: a service worker has no DOM, so HTML parsing in the background needs an offscreen page on Chromium. No wiki page or changelog entry documents it (wiki lists 6 pages: Home, Building idb library, Debugging, Development setup, Release checklist, Use of permissions). Unverified.
- Manifest V3 move: v4.0.0 (2024-06-22) is "Major extension rewrite" because "Google is forcing Manifest v3" (CHANGELOG); v4.1.0 (2024-08-28) is the first MV3 release on all platforms (CHANGELOG).
- Content security policy lesson from the maintainer (PR 2198, 2025-11-29): Steam's policy blocks fetches to a third-party host from page scripts; Chrome let it pass for extension code, Firefox blocked it; the fix was to fetch from the background script (https://github.com/IsThereAnyDeal/AugmentedSteam/pull/2198).
- Package size: 18.2 MB on Firefox (AMO). No timing or memory budget is documented anywhere read.
- Page-load cost: issue 995 "Prevent repeated content reflow after app page load" (2021-01-02, open, 0 comments) (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/995).

## 7. Maintenance and responsiveness

Release cadence (GitHub releases API, https://api.github.com/repos/IsThereAnyDeal/AugmentedSteam/releases, read 2026-10-21, all published by tfedor):

- 10 releases in 2024, 9 in 2025, 10 in 2026 so far; 15 in the last 12 months (2025-10-21 to 2026-10-21). Median gap between releases from 3.0.0 (2024-02-13) on: 22 days.
- Longest gaps: 2.6.0 (2023-09-13) to 3.0.0 (2024-02-13) 153 days; 4.2.1 (2024-12-11) to 4.2.2 (2025-06-07) 178 days, announced as "Long overdue bugfix release" (CHANGELOG); 4.6.3 (2026-03-12) to 4.7.0 (2026-05-20) 69 days; 4.7.0 to 4.8.0 (2026-07-22) 63 days. Users asked "Is this add-on abandoned?" on 2023-10-10 (AMO review).
- Of the 15 releases in the last 12 months, 9 name a Steam-side change as the reason: 4.4.0, 4.4.2, 4.6.0, 4.6.1, 4.6.2, 4.6.3, 4.7.0, 4.8.0, 4.8.1 (CHANGELOG).

Breakage events. Steam-side dates are unknown; "first report" is the earliest public report I found. Fix date is the GitHub release; Firefox users get it after store review.

| Event                                                                    | First report                                                                          | Fix release                                               | Lag                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| Wishlist rebuilt in React                                                | 2024-11-17 (issue 2080)                                                               | 4.2.0, 2024-12-06                                         | 19 days               |
| Store layout and filters after Steam update                              | 2025-10-04 (AMO review); 2025-10-19 (issue 2187)                                      | 4.4.0, 2025-11-07                                         | 34 and 19 days        |
| Video player, queue and wishlist buttons after Steam update              | 2025-11-08 to 2025-11-20 (issues 2199 to 2213)                                        | 4.4.2, 2025-11-29                                         | 9 to 21 days          |
| Inventory quick and instant sell                                         | 2025-11-20 (issue 2212)                                                               | 4.4.2, 2025-11-29                                         | 9 days                |
| Same feature again                                                       | 2026-01-07 (issue 2256)                                                               | 4.6.1, 2026-01-07                                         | 0 days                |
| Wishlist hover and prices                                                | 2026-02-04 (issue 2269)                                                               | 4.6.2, 2026-02-04                                         | 0 days                |
| Wishlist not loading                                                     | 2026-03-04 (issue 2289)                                                               | 4.6.3, 2026-03-12                                         | 8 days                |
| Search result tags missing                                               | 2026-02-05 (issue 2272)                                                               | 4.7.0, 2026-05-20                                         | 104 days              |
| Inventory quick sell (third time)                                        | 2026-05-13 (issue 2320)                                                               | 4.7.0, 2026-05-20                                         | 7 days                |
| Steam June 2026 storefront redesign: highlights and Early Access banners | 2026-06-09 (issue 2334)                                                               | none as of 2026-10-21; user PR 2372 open since 2026-08-23 | 134 days and counting |
| Wishlist breaking change                                                 | 2026-07-22 (hotfix twice in one day, 4.8.0 and 4.8.1); prices 2026-07-26 (issue 2356) | 4.8.2, 2026-08-08                                         | 0 to 13 days          |
| Quick sell (fourth time)                                                 | 2026-08-14 and 2026-08-17 (issues 2364, 2366)                                         | 4.8.3, 2026-08-18                                         | 1 to 4 days           |
| Review summary box markup change                                         | 2026-08-19 (issue 2370)                                                               | 5.0.0, 2026-10-02                                         | 44 days               |
| Duplicate screenshot removal                                             | 2026-10-10 (issue 2404)                                                               | none as of 2026-10-21                                     | 11 days and counting  |

Sources: issue pages under https://github.com/IsThereAnyDeal/AugmentedSteam/issues/ with the numbers shown; release dates from the releases API; fix claims from CHANGELOG. The June 2026 redesign link to issue 2334 comes from PR 2372's description (https://github.com/IsThereAnyDeal/AugmentedSteam/pull/2372) and is a reading of that text.

- Maintainer policy on churn: 4.8.1 (2026-07-22) says that if Steam breaks wishlists again he "might wait a little bit for it to settle down" (CHANGELOG).
- Bug-labelled issues created since 2025-06-01 (API read 2026-10-21): 97 total, 64 closed, 33 open. Median time to close 14.4 days, 24 closed within 7 days, 43 within 30 days, 10 after more than 90 days (https://api.github.com/search/issues with `label:bug created:>=2025-06-01`).
- Store review lag on Firefox: 4.3.0 was submitted 2025-09-23 and 4.3.1 on 2025-09-30, and neither was approved on 2025-10-04; the maintainer wrote "it's out of our hands" (AMO review reply, AMO-RATINGS). 4.4.2 was released 2025-11-29 and Mozilla approved it 2025-12-09 (reply dated 2025-12-09). Replies on 2024-02-13 and 2024-03-26 show uploads waiting 4 and 5 days for approval.
- Developer replies on AMO reviews: 12 replies from 2019 to 2025, fastest same day (AMO-RATINGS).
- Contributors and bus factor (commits on `develop`, GitHub commits API read 2026-10-21):
  - 2025-10-21 to 2026-10-21: 256 commits; tfedor 230 (90%), przemo20 9, yamalight 6, dependabot 4, G0bbleG0bble 3, four others 1 each.
  - 2024-10-21 to 2025-10-21: 161 commits; tfedor 143, candela97 8, dependabot 4, others 1 to 3.
  - candela97 (second maintainer) last commit 2024-11-23, last repo comment 2025-03-04.
  - Issue comments in the last 12 months: tfedor 131, przemo20 26 (comments API).
  - The server repo shows the same pattern: tfedor 233 of 248 commits (server contributors API).
  - Reading: one active maintainer who is also the release manager, backend author and support contact. The community supplies several fix PRs.
- Backlog: oldest open pull request in the current list is 2313 (2026-05-02); 2372 has no comments after 59 days; open pull requests also include 2377 (Steam client, 2026-08-26) (https://github.com/IsThereAnyDeal/AugmentedSteam/pulls).
- Contribution rules: there is no CONTRIBUTING, SECURITY or code of conduct file in the tree (names only). Rules appear in review comments: send only English strings (translations flow through a hosted tool), 4-space indentation (PR 2198 comments, 2025-11-07 and 2025-11-29). Issue templates for bugs and features exist (`.github/ISSUE_TEMPLATE`). No rule about AI-assisted contributions is written anywhere I read.
- Release process documentation is stale: the wiki checklist lists manual uploads to AMO and Chrome, a GitHub tag and a Discord announcement (https://github.com/IsThereAnyDeal/AugmentedSteam/wiki/Release-checklist). CI workflow files `build.yml` and `run-build.yml` exist (names only).
- Support channels: GitHub issues, and the project Discord server (`#as-general`, `#as-bugs`) (README). Discord content is not readable.

## 8. Reach and trust

Counts, read 2026-10-21:

| Store   | Users                                      | Rating | Ratings             | Source                                         |
| ------- | ------------------------------------------ | ------ | ------------------- | ---------------------------------------------- |
| Firefox | 64,147 daily users                         | 4.64   | 549 (151 with text) | AMO                                            |
| Edge    | 79,660 active installs (page says 79,000+) | 4.6    | 50                  | EDGE-JSON, EDGE-PAGE                           |
| Chrome  | about 400k                                 | 4.2    | 376                 | shields.io badge JSON, third-party, unverified |

- Badges: Firefox "Recommended" (AMO `promoted`), Edge "Featured" (EDGE-JSON `isBadgedAsFeatured`). Chrome unknown.
- Sum across stores: about 544k users, mixing a daily-user count, an install count and a rounded third-party number (my arithmetic; treat as rough).
- Firefox rating mix: 465 five-star (84.7%), 35 four, 14 three, 5 two, 30 one (5.5%) (AMO-RATINGS, all 549 read).
- AI backlash in the ratings (AMO-RATINGS):
  - Ratings before 2025-12-11 (v4.5.0 date): 483, average 4.72, 17 one-star (3.5%).
  - Ratings from 2025-12-11 to 2026-10-17: 66, average 4.03, 13 one-star (19.7%).
  - 2025-12-11 to 2026-03-31: 43 ratings, 12 one-star, 11 of them naming AI or VaporLens.
  - By year: 2024 average 4.61, 2025 4.49, 2026 3.91.
  - I read the 29 reviews that name AI or VaporLens (2025-12-19 to 2026-03-19; 28 found by keyword, 1 in Russian): 16 critical (11 one-star, 2 two-star, 1 three-star, 2 five-star asking for removal) and 13 supportive (all five-star). Two supportive reviews mention review bombing as the reason they wrote. Manual classification; counts approximate.
  - The Edge listing shows no review after 2025-05-16 in "all regions" and no AI mention (EDGE-PAGE, 9 most recent shown). The maintainer expected a "second wave" once v4.5.x reached Chrome and Edge (discussion 2240, 2025-12-28). Chrome reviews unreadable.
- Praise themes (AMO text reviews, 2019 to 2026): "must-have" for any frequent Steam user; price comparison and ITAD integration; wishlist tools; highlighting owned games; notes; fully customizable; free, open source and "doesn't want to track you" (2025-12-28 review); ProtonDB link for Linux and Steam Deck users (2026-01-02); prefers browsing the web store over the Steam client because of the extension (2025-02-20, 2026-01-25).
- Complaint themes, in order of how often they recur in the text reviews: (1) things break after Steam or extension updates (wishlist, cart, quick sell, scrolling), 2023 to 2025; (2) the steamcommunity login banner with broken dismissal, five reviews 2023-10-10 to 2025-03-13; (3) default-on AI feature, 2025-12-19 onward; (4) abandonment fear during long release gaps, 2023-07-14 and 2023-10-10; (5) English-only Steam requirement, 2024-12-19; (6) tracking links, 2026-07-09; (7) breaks user scripts, 2024-03-11. One Edge review (Brazil, 2025-05-16) claims the extension takes account points and sells items; no other source supports it; unverified.
- Press: GamingOnLinux, 2026-01-05, Liam Squires-Hand: "Augmented Steam browser plugin added AI features from VaporLens"; the fetch summary says the visible comments lean critical and some switched to the SteamDB extension (https://www.gamingonlinux.com/2026/01/augmented-steam-browser-plugin-added-ai-features-from-vaporlens/; summary from a fetcher, unverified). One web search found no other coverage.
- Maintainer says he posted a Reddit thread and got "a handful of responses" (discussion 2240, 2026-01-05); thread not read.

## 9. Packaging and distribution

- Stores: Chrome Web Store, Edge Add-ons, Firefox AMO (README badges). Edge is the Chromium package; Firefox has its own build with different manifest fields (AMO vs EDGE-JSON).
- Manifest version: 3 on all three since v4.1.0 (2024-08-28); v4.0.0 (2024-06-22) was the first MV3 rewrite (CHANGELOG). Chromium uses a service worker plus an offscreen permission; Firefox minimum 140.0 (AMO).
- Source and build: GPL-3.0; README documents `npm install` then a build command per browser, with development and production modes (README). No minification statement is documented in anything read.
- Update path: store auto-update; in-extension changelog popup after update; since 4.6.0 it stays until closed unless disabled (CHANGELOG 4.6.0); GitHub release notes; Discord news (wiki checklist).
- Update lag: Firefox review took 10 days on 4.4.2 (section 7). Chrome and Edge lag unknown.
- Listing languages: the Edge listing is available in 1 language (EDGE-PAGE); the AMO listing has en-US as default locale (AMO). The product itself ships 29 UI language files (repo file tree names: bg, cs, da, de, el, en, es-419, es-ES, fi, fr, hu, id, it, ja, ko, nl, no, pl, pt-BR, pt-PT, ro, ru, sv-SE, th, tr, ua, vi, zh-CN, zh-TW). Translations come through a hosted translation service; the maintainer cannot check them and asks contributors to touch only the English file (PR 2198, 2025-11-07).
- Licence stance: extension GPL-3.0 (README says "GNU General Public License v3 or newer"; AMO says GPL-3.0 only: the two differ); server MIT. The site invites users to verify the code, help improve it or build their own version (SITE).
- Site: https://augmentedsteam.com/ lists download buttons for all three browsers, source links for extension and server, the Discord invite and the privacy text.

## 10. Coverage and Restraint evidence

Supports Coverage (find and surface every relevant case):

- Request volume for visibility of the AI disclosure: 1913 has 12 thumbs-up and 6 non-maintainer commenters over 30 months; 2362 and 2408 add listing filters (ISSUES).
- The extension already reaches about 196 URL patterns across Steam store and community, so a disclosure marker would reach many surfaces (EDGE-JSON).
- Users cite numeric app key 565 as a structured detection route that avoids heading text (issue 1913, 2025-08-18).
- Users ask for a popup so the disclosure is not missed in Discovery Queue and Next Fest browsing (issue 1913, 2026-10-19).
- Audience size: roughly 544k users across three stores (section 8).

Supports Restraint (precision, user control, low noise):

- Users want the developer's own text, a dismissible banner, no page-blocking modal, no blur (issue 1913, 2026-06-22 and 2026-10-19).
- Developers misuse the field to say "no AI"; a presence-only flag would be wrong (issue 1913, 2026-10-19).
- Maintainer reason for 2024 refusal: the only discriminator is heading text that may be localized (issue 1913, 2024-04-27).
- Default-on AI-adjacent UI cost the project rating and trust: Firefox average 4.72 before v4.5.0 to 4.03 after; 11 one-star reviews citing it between 2025-12-11 and 2026-03-31 (AMO-RATINGS).
- The remedy the maintainer chose: collapsed by default, a kill switch, a settings category, an explanation, a note in the box (CHANGELOG 4.6.0).
- A dismissal control that failed drew 20 reactions on one issue and five bad reviews (issue 2104, AMO-RATINGS).
- Permissions are broad (three host patterns, `webRequest`, `offscreen`, 196 patterns) and the project took no step to narrow them in the material read.

## 11. Lessons for our design

- Match: a non-blocking banner modeled on the DRM warning, showing the developer's disclosure text through plain text, dismissible, with a per-feature off switch. Evidence: issue 1913 comments of 2026-06-22 and 2026-10-19; changelog 4.6.0 kill switch.
- Match: put the AI-related controls in their own named settings group with a one-paragraph explanation of what the feature does and what it sends. Evidence: the group, kill switch and explainer drew the maintainer's way out of the VaporLens dispute (CHANGELOG 4.6.0).
- Avoid: shipping anything that touches the AI debate default-on or silently. Our own feature is AI-aware, yet users on both sides will read its defaults as a stance; the 2025-12 episode took the Firefox average from 4.72 to 4.03, with 12 one-star ratings between 2025-12-11 and 2026-03-31, 11 of them citing AI.
- Avoid: relying on heading text alone and on presence alone. The maintainers named localization as the blocker in 2024; users named misuse of the field in 2026. Our verdict states (disclosed, not disclosed, unknown) and the structured API route answer both points.
- Avoid: single-maintainer exposure, a permanent error badge or banner without a working dismiss, and a feature chain that stops when one backend is down. Evidence: 90% of commits by one person, 178-day release gap, issue 2104 and 2182, the 2024-08-20 ITAD outage. Also test Firefox early: content-script fetches to third-party hosts hit Steam's content security policy there while Chrome let them pass (PR 2198, 2025-11-29); our rule 3 forbids a background script, so this needs a check against Valve's own hosts.

## 12. Not retrievable

- Chrome Web Store page, reviews, privacy practices tab and permission justification text. The built-in browser refused the site ("only works in a full browser"). A plain fetch redirected to a Google consent wall; I did not click through it. Chrome users, rating and rating count come from shields.io badge JSON (a third-party scrape): 400k, 4.2, 376 (read 2026-10-21). Review text and the Chrome release date for v4.5.x are unknown.
- Edge: only the 9 most recent text reviews were visible; 50 ratings in total; Edge store permission justification text not shown.
- Discord (the maintainer's main support channel, and where he says the VaporLens discussion also ran) and the Reddit thread he mentions.
- The count and defaults of individual settings: no public doc lists them; only source would. Not read by design.
- Steam-side dates of each markup change: only first user reports are known.
- Stale wiki: Home is an unchanged placeholder from 2019-05-23; five other pages are developer notes from the manifest-V2 era.
- Whether the offscreen document handles HTML parsing: inferred from file names only.
- What data goes to VaporLens: undocumented in anything read.
- Clean-room exposure log. These public pages contained code or markup specifics that I saw while reading for behavior: issue bodies and comments 1913 (user CSS), 2390 (code and file paths), 2370 (selectors), 2104 and 2014 (console traces with file names), 1976 (an endpoint path), and pull request descriptions 2372 and 2377 (selectors) and 2389 (a file reference). None of it is recorded here. The repository file-tree listing gave file and folder names only; the Edge product JSON includes the published manifest. The decision whether this exposure matters for rule 6 belongs to the project owner.
