# Competitor benchmark RQ7: Slop-Inator (Dysnomia)

Researched 2026-10-21 (all counts are snapshots from that day unless dated otherwise). "Proven" means read from code, config, commits, release pages or the store API; "asserted" means README, store copy or the author's own posts; "unverified" means only a summary or a third-party tracker was seen. Clean room: the code was read for behavior only and is described in words. The code is asserted MIT and the data CC BY-SA 4.0; nothing from either is reproduced here. The tool is 7 days old on the research day. Most counts are near zero and most claims rest on the author's own commits.

## 1. Identity

- Name "Slop-Inator" (package name, AMO name, README title). The author explains the name as a nod to the "-inator" gadgets in the cartoon Phineas and Ferb (Bluesky post 6 of 7, 2026-10-20, at://did:plc:eeelvuw2ecigd2ltjjdor47m/app.bsky.feed.post/3mydgoumfas2v , read through the public Bluesky API 2026-10-21). Spelling variants "SlopInator", "Slop Inator" and "Slopinator" match no other Steam tool; GitHub and Hacker News hits for "slopinator" are unrelated projects (an audio mastering app, a poisoned-repo project, a log viewer; https://api.github.com/search/repositories?q=slopinator , https://hn.algolia.com/api/v1/search?query=slop-inator&tags=story , both 2026-10-21).
- Press article that names it: PCGamesN, 2026-10-21, headline "Steam Next Fest has been dominated by AI. A new browser extension helps you cut through the slop", byline Lauren Bergin (https://www.pcgamesn.com/steam/ai-browser-extension , read through a fetch tool that returns summaries and short quotes; wording is partly unverified). It says: "it's perhaps one of the most advanced." It says the creator is "Elanis", the tool is "still in its early stages", and gives one download link to the GitHub repo "for both Windows Chrome and Firefox" (same article).
- Repo https://github.com/Dysnomia-Studio/slopinator : organization Dysnomia-Studio, created 2026-10-14, last push 2026-10-20 19:34 UTC, 0 stars, 0 forks, 6 open issues, 186 commits on main, size 1,532 KB, language TypeScript, no topics, no description (https://api.github.com/repos/Dysnomia-Studio/slopinator , 2026-10-21).
- Author: GitHub user Elanis, who also runs a one-person game studio (Dysnomia, https://dysnomia.studio , 2026-10-21). 182 of the 186 commits are by Elanis and 4 by a bot that recompresses images (https://api.github.com/repos/Dysnomia-Studio/slopinator/contributors).
- License: the README states MIT for the code with the copyright line "Dysnomia, Elanis, and code contributors", and CC BY-SA 4.0 for the data files (https://raw.githubusercontent.com/Dysnomia-Studio/slopinator/main/README.md). The tree holds no LICENSE file and the GitHub API reports no license (https://api.github.com/repos/Dysnomia-Studio/slopinator/git/trees/main?recursive=1). The license is asserted in README text only. AMO shows the license as "Custom License" and its page does not display a custom text (https://addons.mozilla.org/en-US/firefox/addon/slop-inator/license/).
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/slop-inator/ , add-on ID 3099506, listing created 2026-10-17, default locale French, categories "appearance" and "games-entertainment", no privacy policy, no EULA, no tags, no promoted badge, no payment required, support link is the repo issue tracker (https://addons.mozilla.org/api/v5/addons/addon/slop-inator/ , 2026-10-21).
- Chrome Web Store ID hgflafbjgbapndncdllnmkefinafckoj, linked from the README and from the author's announcement post (README above; Bluesky post 4 of 7, at://did:plc:eeelvuw2ecigd2ltjjdor47m/app.bsky.feed.post/3mydg2n3b3c23). The store page was not readable (see heading 12).
- Desktop part: none. PCGamesN writes "Windows", but the release assets are a Chrome zip, a Firefox zip and a sources zip only (https://api.github.com/repos/Dysnomia-Studio/slopinator/releases). The one C# project in the tree is a data-preparation console tool that runs in the weekly CI job and is not packaged (https://github.com/Dysnomia-Studio/slopinator/tree/main/tools/GenerateNotUpdatedAppsList , workflow https://github.com/Dysnomia-Studio/slopinator/blob/main/.github/workflows/get_games_before_gpt.yaml). The article's "Windows" most likely names the platform the browsers run on (inference from the asset list and the tree).
- Size model: free. README: "I do not plan to have any donation or revenue directly related to the browser extension"; it points to the author's own games instead (README above).
- Studio privacy policy exists on the studio site but covers the studio's websites and games and does not mention the extension (http://dysnomia.studio/privacy/ , 2026-10-21).

## 2. Detection and accuracy

The author states three sources in his announcement thread (2026-10-20): games with no update since ChatGPT's release are "automatically human", games with a Steam AI disclosure automatically get warning icons, and crowdsourced data (Bluesky post 2 of 7, at://did:plc:eeelvuw2ecigd2ltjjdor47m/app.bsky.feed.post/3mydfydu7k223). The code agrees with that (https://github.com/Dysnomia-Studio/slopinator/blob/main/entrypoints/content.ts , read 2026-10-21, version 0.2.0 plus README-only commits). Order of decision for each app:

- Step 1, bundled "before GPT" list: if the app ID is in a list of 65,629 app IDs shipped inside the extension, every badge category shows "human" and nothing is fetched. The list holds IDs from 30 to 2,236,980 (counted from https://github.com/Dysnomia-Studio/slopinator/blob/main/entrypoints/steam_app_before_gpt.json , 2026-10-21, 499,233 bytes). The popup text for such a game says the game "hasn't been updated since ChatGPT or any public big LLM released (2022-11-30)" (content script above). Green therefore means "no build update since 2022-11-30" and is no developer statement.
- How the list is built: a weekly CI job (Sundays) logs on to Valve's network anonymously with a .NET library, asks for product info in batches of 100 app IDs, reads the public branch build timestamp, and keeps IDs whose timestamp is on or before 2022-11-30; a script then writes the list and the job commits it (workflow and tool above). The tool re-checks only the IDs in the current list (a code comment calls testing all public apps a to-do), which lets the list shrink and never grow from CI. The list inside a store package changes only with a new release, since the extension makes no request for it.
- Step 2, store page fetch: for every other app the extension downloads the full English store page of that app (store language forced to English) and checks whether the raw HTML contains Steam's English disclosure heading text anywhere. The check is a plain substring test over the whole page, not limited to the disclosure section (content script above). It also reads one header block of the page (the breadcrumb trail, going by Steam's page layout; not tested) to find a parent app for a DLC, demo or soundtrack, fetches the parent page too, and ORs the parent's flag into the child's flag.
- Step 3, curated data: if the app (or its parent) has an entry in the bundled data file, each of five categories (code, art, translation, sound, voice) gets the stored status. A missing category shows "unknown". The file has 132 entries on 2026-10-21 (counted from https://github.com/Dysnomia-Studio/slopinator/blob/main/entrypoints/steam_app_data.json). 116 entries are all-human and share one source, a Bluesky starter pack (a curated list of accounts; the page was not readable, so what it asserts about these games is unverified). 12 entries cite a Steam store page, 3 carry the text "Slop-Inator developer created this game!" and 1 cites a GameSpot article. 14 entries have at least one AI status. Every entry has exactly one source. Eleven curated IDs are also in the before-GPT list; because step 1 runs first, those show human.
- Step 4, no curated data: if the page flag (own or parent) is true, all five categories show the orange "warning" status. Otherwise all five show "unknown" (white).
- Verified example: Arc Raiders (app 1808500) has only a voice entry set to AI, sourced to a GameSpot article. Voice shows red and the other four show white; PCGamesN shows the same picture (data file above; PCGamesN above).
- The page flag is purely "the heading exists". The extension reads no flag from an API and does not parse the disclosure text. A "warning" cannot tell pre-generated from live-generated use, marketing from in-game use, or "no AI used" from real use. The disclosure text itself is not shown.
- Semantics versus our rule 4: the extension has no "not disclosed" state. A fetched page with no heading, a failed fetch (the error is logged and swallowed), an age-check page and a never-seen game all end as "unknown" (white). In the other direction "human" is shown for pre-GPT builds and for the starter-pack list, and the popup prints the plain word "human" per category. PCGamesN calls green "clean" (PCGamesN above). The wording makes an absence claim that the sources do not support for a disclosure-based tool.
- Language handling: because the page is fetched in English, detection does not depend on the user's store language, and a translated heading cannot break it. A rename of the English heading would break every language at once. The app page itself is not read; the tool downloads the same page again.
- Parent lookup relies on the breadcrumb markup. If that lookup fails it yields app ID 0 in the code path, which would route the lookup away from the app's own data and show "unknown". That consequence is an inference from reading the code; it was not tested.
- A "past" status exists in the status list and in the 0.2.0 release notes ("orange icons"), but the tree has no past-status images, and the helper that maps "past" to the warning image computes the mapped name and then does not use it. No data entry uses "past" today. Inference from code, untested (https://github.com/Dysnomia-Studio/slopinator/releases/tag/v0.2.0 , content script above).
- Accuracy: no accuracy figure, tests or sample set exist anywhere in the repo (tree above). The author's own open issues name three gaps: show warnings for games that used AI in earlier versions (issue 12, closed 2026-10-20), a "marketing" badge (issue 13, open), and rework of the data format to ease contributions (issue 6, open) (https://api.github.com/repos/Dysnomia-Studio/slopinator/issues?state=all).
- False flags and misses on record from users: none yet; there is no outside issue, review or post (headings 7 and 8).
- Heuristic risk without a data point: image generators were public before 2022-11-30 (general knowledge, no source fetched). A game frozen before that date can still contain generated assets, and the heuristic cannot see them.

## 3. Surface coverage

- Content script matches every page under the store host over http and https; it acts only on three URL prefixes at load time: app pages, search pages and sale pages (https://github.com/Dysnomia-Studio/slopinator/blob/main/entrypoints/content.ts). AMO shows the permission as the whole store host since 0.2.0 and as app pages only for 0.1.2 (https://addons.mozilla.org/api/v5/addons/addon/slop-inator/versions/?page_size=50).
- Covered, from the code and the 0.2.0 release notes (https://github.com/Dysnomia-Studio/slopinator/releases/tag/v0.2.0): app pages (a badge row in the header), DLC, demo and soundtrack pages through parent inheritance, search result rows (added 2026-10-20, issue 9), and sale or event pages such as the Next Fest page (added as "experimental" on 2026-10-20, issue 10). The sale support depends on the layout classes of Steam's sale widgets; the notes call it experimental. PCGamesN says it flags "Steam pages, sale pages, and demo pages" (PCGamesN above).
- Not covered by the code: home page, wishlist, category and tag pages, curator pages, publisher pages, search suggestions, cart, library, community pages, Workshop. No issue tracks them yet.
- Single-page navigation: each branch runs once at page load. A store view that swaps content without a load is not rescanned, except that the search and sale branches poll once per second for new rows.
- Steam desktop client: no mention anywhere; no desktop build exists (heading 1).
- Mobile: open issue 15 "Improvement: Mobile UI badges", opened 2026-10-20 with an empty body (https://github.com/Dysnomia-Studio/slopinator/issues/15). The AMO API shows no Android compatibility entry for either version. No further detail.
- Other stores: itch.io support is planned, issue 18 opened 2026-10-20 (https://github.com/Dysnomia-Studio/slopinator/issues/18), and PCGamesN repeats the plan. The README says "public apps, especially on Steam games".

## 4. UX and user control

Proven from the code unless marked:

- App page: five small icons (code, art, translation, sound, voice) are added to the right-hand header button group next to Steam's own buttons. A click toggles a text panel under the row with a line per category ("human", "ai", "unknown", "warning"), a "Sources" list (links open in a new tab; a source equal to the current page prints "Text on the current page"), and a link inviting contributions to the data. The panel is positioned over the page with a hard-coded dark background. Nothing blocks the page; there is no overlay and no blur.
- Search page: the same five icons are appended to each result row. Sale page: icons are added inside item cards. No hide, dim or filter mode exists on any page.
- Settings: none. The extension has a toolbar popup that is the framework starter page with the heading "Behold! The Slop-Inator!" and a picture; it holds no controls (https://github.com/Dysnomia-Studio/slopinator/blob/main/entrypoints/popup/App.tsx). There is no options page, no storage, no per-game dismissal and no override. The way to correct a verdict is a pull request to the data file, one game per pull request with source links (README), and a link in the panel leads to that instruction (issue 5, closed 2026-10-17). Issue 14 "create an UI to make it easier to contribute" is open.
- Own UI languages: English only. Panel text, category names and status words are English literals; issue 4 "Improvement: i18n" is open and the badge text version is described as to be improved "once translations are set up" (release notes 0.2.0 above). The code sets no alternative text or ARIA label on the badge images (inference from reading the code; the page markup was not inspected live).
- Visual language: color per status, red for AI, green for human, white for unknown, orange for warning (PCGamesN and release notes above). Icons are category pictograms such as a megaphone and a palette (PCGamesN). Whether the icons read as native Steam UI was not assessed.
- Author-reported fix on 2026-10-20: infinite scroll on search made the badges "a bit buggy" (issue 16, closed 2026-10-20 with an "experimental fix" commit, https://api.github.com/repos/Dysnomia-Studio/slopinator/issues/16).
- Reader feedback: none found (heading 8).

## 5. Privacy and permissions

- AMO file permissions: only the store host match, no optional permissions, data collection "none" for 0.1.2 and 0.2.0; AMO shows no privacy policy and no EULA; the page lists one required permission, access to data on store.steampowered.com, and says the developer states the extension does not require data collection (https://addons.mozilla.org/api/v5/addons/addon/slop-inator/versions/?page_size=50 , https://addons.mozilla.org/en-US/firefox/addon/slop-inator/ , 2026-10-21).
- No storage permission appears in the AMO data, and the code stores nothing (no storage use found in the content script). Everything is held in memory for the page's life and dropped on navigation.
- Background code: the source has a background entry whose only content is a starter-template line that prints a greeting to the console (https://github.com/Dysnomia-Studio/slopinator/blob/main/entrypoints/background.ts). The framework therefore likely emits a background service worker or script in the packages. The Firefox package ships a background script of 556 bytes (file list, 2026-10-22); the Chrome package was not downloaded.
- Resource exposure: the build config makes the status icon files readable by any web page (all sites) and any extension ID (https://github.com/Dysnomia-Studio/slopinator/blob/main/wxt.config.ts at tag v0.2.0). The Firefox package confirms the exposure: its manifest lists the status images as web-accessible resources in the version 2 form, which any web page may load (package read 2026-10-22). That lets any site probe whether the extension is installed (inference; standard probing technique, not tested).
- Declared outbound requests: README privacy section: "I will never recieve any of your data nor does any third party service. No telemetry is used." and "The only http calls are in the app are on the site itself" (README above). A README commit on 2026-10-20 19:33 UTC, 22 minutes after the 0.2.0 tag, rewrote that section "since I do http calls (but to steam itself)" (https://github.com/Dysnomia-Studio/slopinator/commit/cf4a853).
- Outbound requests, proven from the code: one request per app to the Steam store host for that app's English page, and one more for its parent app when the app is a DLC, demo or soundtrack. No other host appears in the script. The data sets are bundled; there is no backend, no list download and no analytics (code and README agree).
- Credentials: the fetch call sets no credentials option. The browser default then applies and sends the user's store cookies to the same origin (inference from the absence of an option; not tested). Our rule 1 requires credentials omitted.
- Data sent to Valve: the app IDs of every search or sale row displayed, not only the app the user opened. Valve receives a full-page fetch for each row where a normal visit would send none (inference).
- Retention: none by the extension. Studio logs are not involved.
- The weekly CI job talks to Valve's network with an anonymous logon from a GitHub runner; it sends app IDs of the bundled list and shares nothing from users (workflow and tool above).

## 6. Efficiency

- Requests: one full English store page per app per page view. This applies to the app page the user is on, to every search row and to every sale card, unless the app is in the before-GPT list (no request). Apps with curated data are fetched too, because step 2 runs before the curated lookup (content script above). A DLC, demo or soundtrack adds a second full page for its parent.
- No persistent cache: results live in memory for the page load only; a reload or the next search page repeats every download. No batching, no Steam item API.
- Search page: a timer fires every second for the life of the tab and re-queries all result rows; rows without a badge are processed one after another with awaited fetches. A cold page of 50 results makes up to 50 sequential full-page downloads. A new timer tick marks the previous pass stale; in-flight downloads are shared through a map of pending requests and are not repeated. The timer is never cleared (no page-hide cleanup found). Our rule 13 forbids polling.
- Sale page: same one-second timer; the large-card branch adds one badge per tick.
- Bundle size: Chrome package 535,113 bytes (Web Store update check, https://clients2.google.com/service/update2/crx?response=updatecheck&prodversion=130.0.0.0&acceptformat=crx3&x=id%3Dhgflafbjgbapndncdllnmkefinafckoj%26uc , metadata only, nothing downloaded); Firefox package 540,339 bytes (AMO API); GitHub release zips 525,889 and 525,861 bytes. The 499 KB list dominates the size. A UI library (React) is a dependency used by a popup that shows a heading and an image (package.json at https://github.com/Dysnomia-Studio/slopinator/blob/main/package.json).
- No performance complaint exists yet; there are no outside reports.

## 7. Maintenance and responsiveness

All times UTC. Sources: commits, issues, releases and AMO API at the URLs in heading 1, read 2026-10-21.

- The project is 7 days old: first commit 2026-10-14 14:24; 186 commits by 2026-10-20 19:34. 132 of the 186 are single-game data commits, one per curated entry, made by a helper script (the large batches ran on 2026-10-19 between 19:58 and 20:30). The other 54 are code, CI, icons and README, including 4 by the image bot.
- Releases (GitHub): v0.1.0, v0.1.1 and v0.1.2 on 2026-10-17 (15:38, 15:55, 16:23); v0.1.3 and v0.1.4 on 2026-10-19 (07:42, 07:46; marked pre-release); v0.2.0 on 2026-10-20 19:12. A rolling release named "Prerelease" is rebuilt on every push to main. Release notes exist only for v0.2.0 (one list of features, code changes and data changes).
- AMO holds only versions 0.1.2 and 0.2.0. The commit messages around 0.1.3 and 0.1.4 show two attempts to set a Firefox add-on ID and a note that the ID "is not valid" for the store (commits ec8b8ed, b59db02); that these releases never reached AMO is proven by the AMO versions list, the reason is an inference.
- AMO review time: 0.1.2 uploaded 2026-10-17 16:23, approved 2026-10-20 16:25 (3 days); 0.2.0 uploaded 2026-10-20 19:12, approved 19:16 (4 minutes) (AMO versions API).
- Chrome: the Web Store update check returned version 0.2.0 on 2026-10-21, within 2 days of the tag. Approval time per release is not retrievable.
- Issues: 14 issues, all opened by Elanis between 2026-10-16 and 2026-10-20, all with empty bodies and zero comments; 8 closed, 6 open. The numbers 1, 2, 3 and 17 are bot pull requests that recompress images. Closed issues were closed within about 1 day of opening, most by a commit message that names the issue (issue 9 opened 2026-10-19 20:01, closed 2026-10-20 18:43; issue 5 opened 2026-10-16 20:06, closed 2026-10-17 15:01). No outside issue, pull request or comment exists, which leaves reader turnaround unmeasurable.
- Maintainer position, from his announcement thread: the project is a "small side project", open to contributions and issues, and may be slow to update (Bluesky post 3 of 7, at://did:plc:eeelvuw2ecigd2ltjjdor47m/app.bsky.feed.post/3mydfzzg3c223; read as a summary; the wording is unverified).
- Process: no tests, no lint step and no type check run in CI (workflow files listed in the tree). A tag push builds, uploads and submits both stores through the build tool's submit command with secrets from the repo settings (publish workflow above). Dependabot is set for monthly updates targeting a "develop" branch (https://github.com/Dysnomia-Studio/slopinator/blob/main/.github/dependabot.yml); whether that branch exists was not checked.
- Planned work (open issues on 2026-10-21): i18n (4), data structure rework (6), "marketing" badge (13), contribution UI (14), mobile badges (15), itch.io (18).

## 8. Reach and trust

- Firefox, 2026-10-21: 4 daily users, 3 weekly downloads, 0 ratings, 0 reviews (AMO API https://addons.mozilla.org/api/v5/addons/addon/slop-inator/ and https://addons.mozilla.org/api/v5/ratings/rating/?addon=slop-inator&page_size=50).
- Chrome, 2026-10-21, trackers only (unverified): 0 users, 0 ratings, a stale version 0.1.1, one language (https://extscope.org/extension/hgflafbjgbapndncdllnmkefinafckoj , https://chromeboard.com/extension/slop-inator-hgflafbjgbapndncdllnmkefinafckoj). The trackers lag the store; the update check shows 0.2.0. The store's own count was not readable.
- GitHub, 2026-10-21: 0 stars, 0 forks; release asset downloads total 11 across 6 releases (https://api.github.com/repos/Dysnomia-Studio/slopinator/releases).
- Author's announcement thread: root post 22 likes, 8 reposts, 2 bookmarks, 1 reply by 2026-10-21; later posts 0 to 3 likes; every reply in the thread is by the author (public Bluesky API, https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=at://did:plc:eeelvuw2ecigd2ltjjdor47m/app.bsky.feed.post/3mydfvdlfm223 , 2026-10-21).
- Press found: PCGamesN, 2026-10-21 only. It frames the tool as new, early-stage and open source, and it also sends readers to AI warning for Steam as a tool that "does exactly what it says" (PCGamesN above). No outlet has reviewed accuracy. No other article, forum thread or Hacker News item names the tool (searches 2026-10-21).
- Review themes: no store review exists on AMO and none could be read on Chrome. Community threads on Reddit were not reachable (see heading 12). The tool's trust today rests on the author's word and on a three-day-old history.
- In favor: public repo, no backend, a no-telemetry claim that the code backs, and a stated source for every curated verdict. Against: green "human" from a build date and from a social list, no outside review yet, and one maintainer.

## 9. Packaging and distribution

- Stores: Chrome Web Store (ID in heading 1), Firefox AMO (listing created 2026-10-17) and GitHub release zips for sideloading; the README says pre-release versions are on the Releases tab. Edge Add-ons: no listing found; the Edge product-details endpoint for the Chrome ID returned 404 (https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/hgflafbjgbapndncdllnmkefinafckoj , 2026-10-21). No userscript variant exists.
- Update path: store review for Chrome and Firefox. Data and the pre-GPT list reach users only through a new extension version.
- Source: public TypeScript project built with the WXT framework and React; a sources zip is attached to each release for Firefox review (publish workflow above). Whether the packages are minified is unknown; they were not opened.
- Manifest version: Chrome 3 per one tracker (unverified: ExtScope lists "Manifest V3" for 0.1.1). Firefox: manifest version 2 with a background script and a browser action, read from the downloaded package on 2026-10-22 (hash matches AMO). AMO lists minimum Firefox 58.0, and the repo config sets no minimum version (config above).
- Listing languages: Firefox default locale French with English text; Chrome shows 1 language (tracker). No listing translations exist.
- Listing copy (asserted): "A chrome/firefox extension to show the Generative AI usage on public apps, especially on Steam games." AMO adds that it is open source and that users can contribute data (AMO API).

## 10. Coverage and Restraint evidence

Supports Coverage:

- Store language does not matter: the English page is fetched for every app (content script).
- Badges on app pages, search rows, sale or event pages and on DLC, demo and soundtrack pages through the parent link (content script, release notes).
- Per-category detail (code, art, translation, sound, voice) where sourced data exists, for example Arc Raiders voice (data file, PCGamesN).
- Works on Chrome and Firefox desktop (store listings).
- Gaps: home, wishlist, category, curator pages (no code path); no Steam client, no confirmed mobile support; sale support is experimental; one markup dependency for the parent lookup (content script).

Supports Restraint:

- One host contacted, the Steam store; no backend, no telemetry, no storage; data collection "none" on AMO (code, AMO API).
- Permission is a single host match (AMO API).
- Non-blocking UI: small icon row, no overlay (content script).
- Counter-evidence: background entry present in source, status icons exposed to all sites, a one-second polling timer, one full-page fetch per row with no persistent cache, credentials default on the fetch, and "human" shown for a build-date heuristic and for a social-list source (code, config, README).

## 11. Lessons for our design

- Match: show the source behind every verdict, with links, and a visible route to correct it. The tool lists sources per badge and a data-contribution link in the panel.
- Match: use a language-neutral source for list surfaces, which keeps a translated heading from breaking detection. Avoid a substring test over the whole page, and avoid downloading the page the user is viewing a second time.
- Avoid: a green or "human" state built on a last-build date or a social list. Our three states (disclosed, not disclosed, unknown) never claim "AI-free", and "not disclosed" must stay apart from "unknown" (the tool merges both into one white state).
- Avoid: a bundled seed list, a background entry, a one-second timer, a refetch of every row on every load with no persistent cache, and icon files that any website can probe.
- Watch: parent-app inheritance for DLC, demo and soundtrack is a useful behavior; derive it from Steam's own item data, with a bounded cache, instead of page markup.

## 12. Not retrievable

- Chrome Web Store page, reviews tab, privacy tab, user count, rating and listing languages: WebFetch to the store URL returned a Google consent redirect that cannot be answered; the built-in browser was not tried because it refuses the store. Trackers filled in and are marked unverified.
- Contents of the published Chrome package: not downloaded (rule). The Firefox package was downloaded on 2026-10-22 and its manifest and file list read (sections 5 and 9).
- AMO custom license text: the license page shows only AMO's site footer license.
- Bluesky starter pack that sources 116 curated entries: the page is a script-driven app and returned no content; the public API was not queried for it.
- Reddit, Steam Community forums, X and Mastodon: Reddit is blocked for the built-in browser and the search tool; the Mastodon profile returned a title only. No community feedback was found anywhere.
- Edge listing: none found. A Chrome Web Store search for spelling variants of the name was not possible for the same consent reason; AMO, GitHub, Hacker News and web search showed no second tool with a near name on Steam.
- Behavior on live Steam pages (age-gated apps, rate limits, breadcrumb markup changes, the effect of the substring check on real HTML): not tested; statements on those points are inferences from code and are marked.
- No page text addressed to AI agents was seen.

## Other tools seen

- AI warning for Steam, https://www.pcgamesn.com/ai/extension-warns-steam-generative-ai : named in the PCGamesN article as the tool that "does exactly what it says"; profiled in rq2.
- AI Generated Content Filter for Steam, https://addons.mozilla.org/en-US/firefox/addon/ai-content-filter-for-steam/ : appears in the AMO search for "steam ai" (81 daily users, 2026-10-21); profiled in rq3.
- Non-Steam tools with near names on AMO, not profiled: Slop Evader (https://addons.mozilla.org/en-US/firefox/addon/slop-evader/ , avoids AI slop), Slop Sweeper (https://addons.mozilla.org/en-US/firefox/addon/slop-sweeper/ , blurs generated images), SlopScan (https://addons.mozilla.org/en-US/firefox/addon/slopscan/ , scores git repositories).
