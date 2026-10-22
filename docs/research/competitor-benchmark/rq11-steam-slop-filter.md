# Competitor benchmark: Steam Slop Filter (dunkbing)

Researched 2026-10-21. Short profile: the tool runs on crowd votes instead of the developer's disclosure and has no license. This note records behavior and privacy cost only. Clean room: I read the README, PRIVACY.md, the manifest, directory listings, commit messages and API metadata. No source file, server config or schema was opened, the extension was not installed or run, and the backend was not called. No scores.

Evidence tags:

- [code]: the manifest only, at https://github.com/dunkbing/steam-slop-filter/blob/main/extension/manifest.json (main branch, last push 2026-10-20 19:36 UTC).
- [api]: GitHub, AMO or Hacker News API response read on 2026-10-21.
- [listing]: the author's own README or PRIVACY.md (asserted, not proven), or a vendor documentation page.
- [measured]: none. No requests were made to the tool or its server.
- [tracker]: none found for this tool.

## 1. Identity

- Name "Steam Slop Filter", version 0.1.0, Chrome and Firefox Manifest V3 extension. The manifest description says it lets a person vote on and hide AI-slop games on Next Fest, search and sale pages, using community votes and Steam AI disclosures. [code] https://github.com/dunkbing/steam-slop-filter/blob/main/extension/manifest.json
- Author: GitHub user dunkbing (account created 2018-08-05, 121 public repositories, 57 followers). [api] https://api.github.com/users/dunkbing
- Repo on 2026-10-21: created 2026-10-20 16:52 UTC, last push 2026-10-20 19:36 UTC, 7 commits, 1 contributor, 4 stars, 0 forks, 0 releases, 0 tags, 0 issues, 0 pull requests, size 27 KB; JavaScript 20,381 bytes, CSS 2,298, HTML 1,749 across the whole repo. Root holds README.md (590 bytes: one-line pitch, the flag rule, install steps, no screenshots), PRIVACY.md (1,156 bytes), .gitignore and three folders: extension/, api/ (server) and test/. [api] https://api.github.com/repos/dunkbing/steam-slop-filter and https://api.github.com/repos/dunkbing/steam-slop-filter/contents/
- License: none. GitHub reports no license, the root has no LICENSE file and the README names none. Without a license, default copyright applies and no reuse right is granted (general GitHub guidance). [api] https://api.github.com/repos/dunkbing/steam-slop-filter and [listing] https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository

## 2. Detection and accuracy

- Flag rule: a game is flagged when the person voted it slop, or when the community did: at least 3 votes and at least 60 percent slop, both thresholds adjustable. By arithmetic, 2 slop votes out of 3 (67 percent) cross the default; two strangers can flag a game for any user on the defaults. [listing] https://github.com/dunkbing/steam-slop-filter/blob/main/README.md
- Second rule: a switch flags all games that carry a Steam AI disclosure. How the disclosure is read (store page markup or a fetch), how it handles non-English store pages, and whether an unknown state exists: not stated in the README, PRIVACY.md or manifest. The test fixtures are named "ai" and "mature" (file names only). [listing] README URL above and [api] https://api.github.com/repos/dunkbing/steam-slop-filter/contents/test/fixtures
- A vote is a judgment on the game ("slop") and says nothing on whether AI use was disclosed or occurred; the README does not define slop. A vote carries a random install ID with no account, which makes casting one free. A per-network cap exists but its size is not stated, and a reinstall yields a new ID (inference). [listing] https://github.com/dunkbing/steam-slop-filter/blob/main/PRIVACY.md
- Accuracy: no published figure, no labeled set, no issue reports (0 issues on 2026-10-21). [api] https://api.github.com/repos/dunkbing/steam-slop-filter/issues?state=all

## 3. Surface coverage

- The content script matches all pages of the store host and runs once the page is idle; the manifest description names Next Fest, search and sale pages, and the last commit (2026-10-20 19:36 UTC) mentions vote badges on search hover. [code] manifest URL above and [api] https://api.github.com/repos/dunkbing/steam-slop-filter/commits?per_page=100
- App pages, wishlist, home carousels, tag and curator pages: not documented; no screenshot or list exists. Not retrievable without running the tool.
- Platforms: README gives Chrome and Firefox desktop install steps only. The manifest also declares a Firefox for Android minimum (142), with no README mention. Steam client, Edge, Safari and a userscript build: not mentioned. [listing] README URL and [code] manifest URL.
- Languages: manifest name and description are literal English text and the extension folder holds no locales folder. Vote counts are looked up by app ID and would not depend on the store language (inference); the disclosure switch is unknown (section 2). [code] manifest URL and [api] https://api.github.com/repos/dunkbing/steam-slop-filter/contents/extension

## 4. UX and user control

- Flagged games are dimmed or hidden. A person can vote on a game (vote badges appear on tiles, per a commit message) and clear a vote; clearing deletes it on the server. [listing] README and PRIVACY.md URLs above, [api] commit list URL above.
- Settings named in the README: minimum votes, slop percent, and the switch that flags all games with a Steam disclosure. Settings and the person's own votes sit in extension storage. The manifest points the toolbar popup and the options page at one small HTML page (1,749 bytes). [listing] README and PRIVACY.md URLs, [code] manifest URL.
- Tile look, label wording, vote controls, hide behavior and any per-developer or per-surface control: not documented and not observed (not installed). Not retrievable.

## 5. Privacy and permissions

- Permissions: `storage`, plus host access and the content-script match for the store host only. No background script and no other host. The author's server host appears in none of the manifest, README or PRIVACY.md. Firefox: data collection declared as required, category websiteActivity; minimum Firefox 140. [code] manifest URL.
- What leaves the browser: the Steam app IDs of the games shown on the page being viewed, sent to the author's server to fetch vote counts; the policy says these requests carry no identifier and nothing is stored per user. A vote sends the app ID, the vote, a random install ID and a time; the server also keeps a salted hash of the IP address with each vote to cap votes per network per game. No accounts and no sign-in: the install ID is the only handle. [listing] https://github.com/dunkbing/steam-slop-filter/blob/main/PRIVACY.md
- Retention: no period stated. Clearing a vote deletes it. Uninstalling deletes the local install ID and leaves the remaining votes unlinkable; the extension cannot contact the server on uninstall, so those votes stay (inference). The IP hash stays with each vote. The policy says data is never sold or shared and only aggregate counts per game are public. The policy file was added 2026-10-20 18:59 UTC, 3 h 11 min after the first commit. [listing] PRIVACY.md URL and [api] commit list URL above.
- Server code is public in the same repo under api/: a source file (6,750 bytes), a SQL schema, a deploy config and a lockfile; the names suggest a Cloudflare Worker with SQL storage (inference). Not opened; no license; whether the deployed server matches the repo is not verifiable. Cost: each page with tiles tells a non-Valve host the set of app IDs viewed and, as with any request, the network address. [api] https://api.github.com/repos/dunkbing/steam-slop-filter/contents/api

## 6. Efficiency

- Not measured: no install, no backend call. Request count, batching, lookup caching and any local cache: not documented. Not retrievable.
- Size: content script 9,862 bytes, shared script 1,144, options script 1,000, CSS 2,298; extension JavaScript totals 12,006 bytes. One content script, top frame, no background worker. [api] https://api.github.com/repos/dunkbing/steam-slop-filter/contents/extension/src and [code] manifest URL.
- Commit 1121076 (2026-10-20 19:36 UTC) says it stops endless rescans, which means a rescan loop existed on day one; nothing further is known. [api] commit list URL above.

## 7. Maintenance and responsiveness

- Commits, read 2026-10-21: 7, all by one author between 2026-10-20 15:47 and 19:36 UTC (3 h 49 min); none since. Messages: "init", "update" four times, "add privacy", and the rescan and badge fix. No release, tag, changelog or CI folder; one test script (1,625 bytes) and two fixtures. [api] commit list URL above and https://api.github.com/repos/dunkbing/steam-slop-filter/contents/
- Issues and pull requests: none ever. `state=all` returns 0 issues and 0 pull requests. No opened date, first maintainer response or closed date exists to report. PRIVACY.md sends questions to the issue tracker. [api] https://api.github.com/repos/dunkbing/steam-slop-filter/issues?state=all and https://api.github.com/repos/dunkbing/steam-slop-filter/pulls?state=all
- Responsiveness and survival of Steam changes: not measurable; the repo was under one day old at the read. The author runs many other projects (121 public repositories). [api] user URL above.

## 8. Reach and trust

- 4 stars, 0 forks, 0 subscribers, 1 contributor (2026-10-21). Hacker News search has 0 hits for the repo name and for the exact tool name (2026-10-21). A web search sweep returned nothing about it. Install count: not applicable (unpacked). [api] https://api.github.com/repos/dunkbing/steam-slop-filter and https://hn.algolia.com/api/v1/search?query=steam-slop-filter
- No store listing found. The AMO API answers 401 for the Gecko ID and the slug "steam-slop-filter", and 404 for invented IDs and slugs, which fits an AMO record that exists and is not public (inference; the record state is not readable). The Chrome Web Store host is closed to the built-in browser, and the earlier discovery sweep saw no listing. [api] https://addons.mozilla.org/api/v5/addons/addon/steam-slop-filter@dunkbing/ and [listing] docs/research/competitor-benchmark/rq1-discovery.md
- Trust signals: individual author, a short privacy file with an anonymous-install design, public server code, no license, no named server host, no retention period. Vote quality depends on who side-loads the tool, which is a small group (inference). [listing] PRIVACY.md URL above.

## 9. Packaging and distribution

- Chrome: Developer mode, Load unpacked, pick extension/. Firefox: about:debugging, Load Temporary Add-on, pick extension/manifest.json, then grant access to the store host. The extension folder holds icons, the manifest and a src folder; no build step shows. No update path is documented. [listing] README URL above and [api] https://api.github.com/repos/dunkbing/steam-slop-filter/contents/extension
- A Firefox temporary add-on stays until Firefox restarts; the person reloads it each session. [listing] https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/
- Why unpacked only: the author gives no reason. Visible facts: version 0.1.0, repo under one day old, no public store listing found, an AMO record that is not public (section 8). No userscript build, no Edge or Safari mention. [code] manifest URL and [listing] README URL.

## 10. Coverage and Restraint evidence

Supports Coverage:

- Votes are looked up by app ID. The signal then does not depend on Steam's page language or markup, and a store redesign would break only the part that places badges (inference from the design). [listing] PRIVACY.md URL
- The content script reaches any page on the store host, and the description names Next Fest, search and sales. [code] manifest URL
- Limit: a game with no votes has no verdict; with a small voter base most games fall below the 3-vote minimum (inference). A new release starts at zero.
- Limit: no documented list of surfaces; no multilingual UI; no survival record (one day of history).

Supports Restraint:

- Declares data collection in the Firefox manifest and ships a plain privacy file that lists what is sent and stored. [code] and [listing] URLs above.
- Permissions stay on the store host plus `storage`; the manifest has no background script. [code] manifest URL
- Limit: app IDs of viewed pages go to a non-Valve server; the host is unnamed; votes carry a durable install ID and an IP hash; no retention period. [listing] PRIVACY.md URL
- Limit: the label "slop" is a judgment that differs from "AI use reported"; 2 votes of 3 can flag a game; no unknown state is documented. [listing] README URL
- Limit: host_permissions is set for the store host, where our rule 3 allows none (content-script match only). [code] manifest URL

## 11. Lessons for our design

- Avoid sending app IDs to any host but Valve's: crowd votes force a server of our own, an install ID and an IP hash, which break rule 1; the idea would need its own ADR first.
- Match the plain privacy file that lists what is sent, what is stored and how to delete it, and the Firefox manifest declaration of data collection; avoid leaving the server host and the retention period unstated.
- Avoid verdicts from a vote tally and the word "slop"; keep three states and the wording "AI use reported", and keep a language-independent signal in mind, since app-ID keyed data does not break on the store language.

## 12. Not retrievable

- Server host name, endpoints, request batching, lookup cache, how the Steam disclosure is read, UI look and wording, vote values and the per-network cap: all live in source, config or running behavior, which the clean-room rule and the no-install rule keep closed.
- Vote data and voter count: the backend was not called; whether the public counts are readable without a key is unknown.
- Chrome Web Store state: the built-in browser refuses the host. AMO page: served behind a client challenge, not bypassed; the record state is inferred from API status codes only.
- Whether the deployed server runs the code in api/: no way to check from public metadata.
