# Competitor profile cards

Scored 2026-10-22 from the evidence notes `rq2` to `rq11`. Anchors, tiers and evidence rules are in `scope-and-rubric.md`. The argument built on these cards is `docs/research/competitor-benchmark.md`.

Source cells read "rq2 s7": note rq2, section 7. Scores run 1 to 5. "n/s" means not scoreable on the evidence read; "n/a" means the dimension does not apply. There is no composite score. Chrome figures come from trackers and stay unverified (see `scope-and-rubric.md`).

The score matrix and the Coverage x Restraint map are in the report, section 4 and section 2. Each tool's row of scores is repeated here only as the table in its own card.

---

## AI warning for Steam (seeeeew)

- Tier: Direct, market leader. Brand-less utility; one maintainer; MIT.
- Model: free; Firefox, Chrome and a userscript from one 16 KB script; Europe-based individual; no donation link (rq2 s1).
- Own words (README, asserted): it "will not add unrelated features" (rq2 s1).
- Evidence: Firefox read from the AMO API on 2026-10-21; Chrome from trackers only.

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                | Source     |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1 Detection   | 3     | App page matches a 30-language heading table; search forces English. Any response without the heading is cached as a 7-day negative (no status or gate check, inferred). Heading breaks: Russian 2026-02-25, Malay 2026-06-13, French 2026-09-24; the canary issue is open since 2026-05-05. | rq2 s2     |
| D2 Surfaces    | 2     | Manifest matches app pages and search only. Open requests: suggestions, curator feed, category and wishlist, sale pages.                                                                                                                                                                     | rq2 s3     |
| D3 UX control  | 2     | Full-viewport blur modal on every disclosed app page, no off switch, no remembered dismissal. Search blur is on by default; the sidebar offers blur, hide and show. Maintainer: the modal is "not a priority".                                                                               | rq2 s4, s7 |
| D4 Privacy     | 4     | `storage` only, no host permissions, no background, data collection "none". Fetches send default cookies (inferred). No privacy page.                                                                                                                                                        | rq2 s5     |
| D5 Efficiency  | 1     | One full store page per uncached row, all in parallel, no limit or gating. Cache never pruned; observer never disconnected.                                                                                                                                                                  | rq2 s6     |
| D6 Maintenance | 3     | Four issues ever closed, 1 minute to 24 hours. Feature requests wait 2 hours to 31 days. Silences of 85, 108 and 98 days. One author, no pull requests.                                                                                                                                      | rq2 s7     |
| D7 Reach       | 4     | Firefox 5,551 users, 32 ratings all 5 stars (2026-10-21). Chrome about 10K, 4.2 from 21 ratings (tracker). Positive press in 10+ outlets.                                                                                                                                                    | rq2 s8     |
| D8 Packaging   | 4     | AMO, Chrome and userscript; 14 tags; Firefox live 10 minutes after upload. English-only listings, no CI.                                                                                                                                                                                     | rq2 s9     |

- Coverage 3: the strongest language handling in the set, two surface types, three heading breaks in seven months.
- Restraint 3: the best permission footprint in the field; the modal without an off switch and false flags (upscaling, translation-only, "no AI" text) cost it.
- Quadrant: middle on both poles.

Read for us:

- Learn: the permission footprint, the one-line install prompt, fixes in hours, three channels from one source.
- Expose: the modal (Augmented Steam commenters call it "really ugly"), four open surface requests, no allow-list ("don't expect it too soon"), unknown mixed with clean.
- Threat: about 15.5K users and a press lead. It can fix the modal or adopt a batched source at any time.

## AI Generated Content Filter for Steam (SoBloxsy)

- Tier: Direct. One maintainer; Apache-2.0; Chrome and Firefox; MV3 with a service worker (rq3 s1).
- Own words (README, asserted): "Take back control of your Steam browsing experience." (rq3 s1)

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                            | Source |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1 Detection   | 1     | English phrase test with no language parameter. Measured 2026-10-21 on app 5072580: a Spanish store returns a Spanish heading and no English phrase. The app banner never shows and list items cache "no disclosure" for 7 days. Status never read. Package rows judged on the first app (4 of 50 rows). | rq3 s2 |
| D2 Surfaces    | 3     | App page, search, home, tabs, wishlist (since 3.4.0). 94% of linked apps on the home page and 50 of 50 search rows carry the scanned attribute. Sale and Next Fest pages are not covered.                                                                                                                | rq3 s3 |
| D3 UX control  | 3     | Label by default; highlight and hide; a native-looking "Narrow by AI Usage" block that re-applies live. The popup reloads the tab; the app banner has no dismissal; no allow-list; English only.                                                                                                         | rq3 s4 |
| D4 Privacy     | 3     | `storage` only, no host permissions. A service worker in the repo manifest and a background script in the Firefox package, a web-accessible SVG that store pages can probe, default cookies, developer text spliced into an HTML string.                                                                 | rq3 s5 |
| D5 Efficiency  | 2     | One full page per unseen app (104K to 297K characters); 200 px lookahead; no batching, concurrency limit or backoff. Observers never disconnected; cache pruned only by a button.                                                                                                                        | rq3 s6 |
| D6 Maintenance | 2     | 17 commits in 4 of 12 months, a 138-day gap. Store build 3.4.2 shipped with no commit. The only issue (Next Fest, 2026-10-20) had no reply after 1.5 days.                                                                                                                                               | rq3 s7 |
| D7 Reach       | 2     | Firefox 81 users, 2 ratings. Chrome about 1K, 3.7 from 3 ratings (tracker). No press.                                                                                                                                                                                                                    | rq3 s8 |
| D8 Packaging   | 3     | AMO and Chrome; no releases or tags; version skew between stores and repo; English only.                                                                                                                                                                                                                 | rq3 s9 |

- Coverage 2: more surfaces than the leader, but detection fails outside English stores.
- Restraint 3: minimal manifest and a muted default label; errors cached as negatives, cookies sent, markup injection.
- Quadrant: low Coverage, middle Restraint.

Read for us:

- Learn: the sidebar block with live re-apply; the muted label as the quiet default.
- Expose: the English-only test, the Next Fest gap, cookie-bearing fetches.
- Threat: low reach today. Its scanner shows the feature set users will compare against.

## Steam AI Games Indicator (Pierre-Demessence)

- Tier: Direct. Two userscripts and a seed list; MIT; one maintainer (rq4 s1).

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                                                                                             | Source     |
| -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D1 Detection   | 2     | Since 2026-06-22 the badge script never checks an ID at or below the seed list's highest ID. 37.3% to 41.5% of later list additions sat below the previous maximum and stay unbadged until a manual refresh. Live checks force English and store negatives only from real pages. The banner is English only (issue "SteamBanner Not Working as intended", 1, unanswered). | rq4 s2, s7 |
| D2 Surfaces    | 4     | Ten tile surfaces: capsules, home, tab lists, search rows, React and older wishlist, personal calendar. Hide filter covers search only; the banner covers the app page only; bundles are not parsed.                                                                                                                                                                      | rq4 s3     |
| D3 UX control  | 3     | Red "Uses AI" pill; collapsing flag on rows; a search hide checkbox that is absent when signed out (measured). Banner not collapsible. No allow-list.                                                                                                                                                                                                                     | rq4 s4     |
| D4 Privacy     | 3     | Connects to raw.githubusercontent.com and the store; live checks probably carry cookies; seed list sourced from SteamDB's tag per its README; updates straight from the main branch.                                                                                                                                                                                      | rq4 s5, s7 |
| D5 Efficiency  | 3     | Serial queue, 1 s delay; the seed list avoids requests for listed IDs; expired entries pruned. No timeout or backoff; a 385 KB list loaded each page; observers never disconnected.                                                                                                                                                                                       | rq4 s6     |
| D6 Maintenance | 2     | 28 commits in three bursts (15, 7, 6), gaps of 198 and 88 days. The only issue never got a reply. Install links were unusable for 6.5 months.                                                                                                                                                                                                                             | rq4 s7     |
| D7 Reach       | 1     | No install counts, 2 stars, no press.                                                                                                                                                                                                                                                                                                                                     | rq4 s8     |
| D8 Packaging   | 2     | Two scripts, raw GitHub URLs, auto-update from main, no releases. Greasemonkey 4 likely incompatible (inference).                                                                                                                                                                                                                                                         | rq4 s9     |

- Coverage 3: the most tile surfaces after ceeprus and Steam AI Filter; the closed-world rule drops a third of additions.
- Restraint 2: "Uses AI" overclaims; unknown and not disclosed both show nothing; a SteamDB-derived third-party list.
- Quadrant: middle Coverage, low Restraint.

Read for us:

- Learn: one table entry per surface (our rule 11 uses the same pattern); wishlist, home and calendar from day one.
- Expose: the closed-world shortcut, the English-only banner, the unmaintained issue.
- Threat: none by reach. The seed-list story is the cautionary case for any seeded design.

## Obvious Steam AI (GothicMess)

- Tier: Direct, floor of the field. Firefox-only banner add-on; MPL-2.0; anonymous author with one add-on (rq5 s1).
- Own words (listing, asserted): a banner reading "AI sh*t in this game" (rq5 s1).
- Code unread: AMO's source viewer was refused and the XPI download was out of bounds (rq5 s12).

| Dimension      | Score | Justification                                                                                                                                                               | Source |
| -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1 Detection   | n/s   | Matching logic, language handling and misses are unknown.                                                                                                                   | rq5 s2 |
| D2 Surfaces    | 1     | The listing claims one banner at the top of the store page.                                                                                                                 | rq5 s3 |
| D3 UX control  | 2     | One banner; with no `storage` permission, the extension API cannot hold a setting or a remembered dismissal.                                                                | rq5 s4 |
| D4 Privacy     | 4     | No permissions at all and one content script matched to the store host (package manifest read 2026-10-22), data collection "none", 13,653 bytes. Outbound requests unknown. | rq5 s5 |
| D5 Efficiency  | n/s   | Requests per page unknown; the single content script is 990 bytes.                                                                                                          | rq5 s6 |
| D6 Maintenance | 1     | One version, uploaded 2025-12-19, never updated in 10 months; no repository, email or issue channel.                                                                        | rq5 s7 |
| D7 Reach       | 1     | 0 daily users, 0 ratings, no press (2026-10-21).                                                                                                                            | rq5 s8 |
| D8 Packaging   | 2     | AMO only; no description, screenshots, source link or privacy text.                                                                                                         | rq5 s9 |

- Coverage 1: one surface claimed, no language scope.
- Restraint 2: the smallest footprint in the set, a verdict-style banner and no user control.
- Quadrant: low on both.

Read for us:

- Learn: a listing with no description, screenshots or source link earned zero users in ten months.
- Expose: nothing technical.
- Threat: none.

## Slop-Inator (Dysnomia)

- Tier: Direct. Launched 2026-10-17, seven days old at the read; MIT for code and CC BY-SA 4.0 for data per the README, with no LICENSE file; one author (rq7 s1).
- Own words (AMO, asserted): an extension "to show the Generative AI usage on public apps" (rq7 s9).
- Evidence: Firefox read from AMO; Chrome from trackers and the store update check.

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                                                                          | Source |
| -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| D1 Detection   | 2     | English page fetch for every app outside a bundled list; plain substring test over the whole page. A bundled list of 65,629 IDs ("no build update since 2022-11-30") shows green "human" on five categories; 116 curated all-human entries rest on one Bluesky starter pack. No "not disclosed" state; failures, gates and silence all show "unknown". | rq7 s2 |
| D2 Surfaces    | 3     | App pages, DLC, demo and soundtrack pages via the parent app, search rows, sale pages (experimental). No home, wishlist or tag pages.                                                                                                                                                                                                                  | rq7 s3 |
| D3 UX control  | 2     | Five category icons with a source panel; non-blocking. No settings, no hide or dim, no storage, no override except a pull request to the data file.                                                                                                                                                                                                    | rq7 s4 |
| D4 Privacy     | 4     | Store host only, no `storage`, data collection "none", no backend. Icon files readable by any site and a background stub, both confirmed in the Firefox package (manifest version 2); default cookies (inferred).                                                                                                                                      | rq7 s5 |
| D5 Efficiency  | 1     | One full page per row per view, no persistent cache, a second fetch for DLC and demo parents. A one-second polling timer is never cleared. 535 KB package.                                                                                                                                                                                             | rq7 s6 |
| D6 Maintenance | n/s   | Seven days old; self-filed issues closed within a day; no outside report.                                                                                                                                                                                                                                                                              | rq7 s7 |
| D7 Reach       | 2     | Firefox 4 daily users, 0 ratings. One PCGamesN article on 2026-10-21. Chrome 0 users (tracker, stale).                                                                                                                                                                                                                                                 | rq7 s8 |
| D8 Packaging   | 4     | Chrome Web Store and AMO plus release zips; the Firefox build is manifest version 2; a tag push builds and submits both stores; a sources zip. Listing English only; license asserted in README text.                                                                                                                                                  | rq7 s9 |

- Coverage 3: language-neutral fetch and per-category data on three surface types; gaps on home and wishlist.
- Restraint 3: small footprint and a source link per verdict; "human" and "clean" claims that the sources cannot support.
- Quadrant: middle on both poles.

Read for us:

- Learn: a source link for every verdict and a visible route to correct it; parent inheritance for DLC and demos.
- Expose: green "human" from a build date; one full page per row; polling.
- Threat: it has press attention now. Curated data can speak to undisclosed use, which a disclosure-only tool cannot.

## Steam AI Content Disclosure Badge (ceeprus)

- Tier: Direct. A userscript in a personal monorepo (13 scripts); MIT; one author; the README calls the repo "fast vibecoded stuff, not for your use" (rq8 s1).

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                                                            | Source |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1 Detection   | 3     | 28 localized headings copied from the leader's list. Arabic is missing (measured 2026-10-21): Arabic-store users get no badges, cached clean for 7 days. A redirect to the store front is stored as a negative (measured). Otherwise strong: 429, 503, age gates, login redirects, timeouts and oversize pages store nothing. No canary. | rq8 s2 |
| D2 Surfaces    | 4     | Generic scanner: any app link wrapping an image, the app-ID attribute, discovery cards, hover popups, sale-widget lines, tab previews; app-page chip. Whole store host except checkout, login and account. Wishlist unverified; runtime never tested.                                                                                    | rq8 s3 |
| D3 UX control  | 4     | A header eye cycles skip, badge, blur and hide; a personal hide list with export and import; keyboard and ARIA reach; reduced motion; corner chips pass clicks. No verdict override; English only; tooltip capped at 400 characters.                                                                                                     | rq8 s4 |
| D4 Privacy     | 2     | Store host only, but it writes cookies (a one-day blanket birth date that also lifts the user's own age gates; edits the recently-viewed cookie), sends Steam cookies, and injects a page-world script that replaces fetch and XHR and rewrites Steam's responses. Updates from main.                                                    | rq8 s5 |
| D5 Efficiency  | 3     | Three concurrent reads, 15 s abort, Retry-After and doubling backoff, newest-first queue. Still a full page per tile (about 180K characters); the author reports about 120 requests per page and 429 responses. Observer never disconnected.                                                                                             | rq8 s6 |
| D6 Maintenance | 2     | 45 commits from 2026-06-20 to 2026-10-07 (34 in September), a 42-day gap. Auto-update was dead for 22 days after launch. One audit commit fixed nine silent failures. No tests in the repo; 0 issues ever.                                                                                                                               | rq8 s7 |
| D7 Reach       | 1     | No install counter, 2 stars, not on Greasy Fork, no press.                                                                                                                                                                                                                                                                               | rq8 s8 |
| D8 Packaging   | 2     | Raw GitHub URL with auto-update from main; Violentmonkey named; Greasemonkey 4 likely incompatible.                                                                                                                                                                                                                                      | rq8 s9 |

- Coverage 3: the widest generic scanner, a language-list gap and a redirect hole, no runtime test.
- Restraint 2: neutral wording and no analytics, offset by cookie writes, cookie-bearing fetches and page-world patching.
- Quadrant: middle Coverage, low Restraint.

Read for us:

- Learn: the error-discipline list; an "AI?" chip for unverified games in filter modes; its surface list (hover popups, sale widgets, discovery cards, tab previews).
- Expose: the Arabic gap, the cookie writes, the patched page world, the removed credit comment.
- Threat: it shows what power users want. A personal repo with no support path.

## Steam Hide AI (Suvitruf)

- Tier: Direct. A userscript, 0.2.0; MIT; one author; the repo was 81 minutes old at the read; source is built privately (rq9 s1, s7).

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                                                                                               | Source |
| -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1 Detection   | 3     | App page reads its own DOM with 30 headings; listings force English; age gates and 429 or 403 become unknown or backoff. An invalid ID redirects to the store home with HTTP 200 and would be cached "clean" for 7 days (measured). Unknown entries refetch on every visit. Keyword classifier on 9 live texts: 5 right, 1 empty, 1 lucky, 1 scope error, 1 wrong category. | rq9 s2 |
| D2 Surfaces    | 3     | Generic scanner on every store page; the app page does not scan other capsules. Wishlist and home rest on code reading; day-zero project.                                                                                                                                                                                                                                   | rq9 s3 |
| D3 UX control  | 4     | Placeholder with a "Show" link by default; banner; optional full-page overlay; three hide styles; always and never lists; extra keywords; settings export without the token. English and Russian only; no single-visit dismissal.                                                                                                                                           | rq9 s4 |
| D4 Privacy     | 2     | Reports go to the author's server with a SteamID64 bearer token and a hashed IP; retention not stated; server code private. The community list downloads from GitHub on every store page even with the feature off. Nine grants; Steam cookies on fetches.                                                                                                                  | rq9 s5 |
| D5 Efficiency  | 3     | Two parallel requests, 300 ms spacing, backoff from 30 s to 10 min, deduplication, viewport gating. No timeout on store fetches; no cache cap; observers never disconnected.                                                                                                                                                                                                | rq9 s6 |
| D6 Maintenance | n/s   | Six commits in 81 minutes; no issue, release or history.                                                                                                                                                                                                                                                                                                                    | rq9 s7 |
| D7 Reach       | 1     | Day zero: no stars, no listing, no press.                                                                                                                                                                                                                                                                                                                                   | rq9 s8 |
| D8 Packaging   | 2     | Raw master-branch URL; private build pipeline; no releases.                                                                                                                                                                                                                                                                                                                 | rq9 s9 |

- Coverage 3: forced-English listing fetches and a generic scanner, no runtime evidence.
- Restraint 1: the banner says "This game uses AI-generated content" for disclosed and crowd-reported games alike; app IDs and an account identity go to a non-Valve host; self-declared crowd reports.
- Quadrant: middle Coverage, lowest Restraint.

Read for us:

- Learn: the placeholder with a "Show" link, the never-hide list and the settings export.
- Expose: classifier errors on real disclosures, the crowd list's claim that a game "uses AI", the unstated retention.
- Threat: the only tool that tries to cover undisclosed AI use. Its list is empty today.

## Steam AI Filter (RyuuMeow)

- Tier: Direct. A Chrome extension loaded unpacked from a release archive; MIT; one author; 31 commits in 31 hours at the read (rq10 s1, s7).

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                                                                                                                                                          | Source  |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D1 Detection   | 4     | List lookups force English (measured: English heading with a Spanish header). Checks canonical ID, name, description and closing tags before "not found". Redirects abort. Three states, with "unavailable" never shown as "not found". A canary fires if the heading appears outside the expected structure. Gaps: the detail page needs an English or Chinese heading; classifier untested on real texts; no live-Steam test record. | rq10 s2 |
| D2 Surfaces    | 4     | Generic card discovery plus layouts for search rows, home capsules, tab rows, wishlist rows, Next Fest cards and carousels. Tested with synthetic responses only; Chrome desktop only.                                                                                                                                                                                                                                                 | rq10 s3 |
| D3 UX control  | 3     | Off, Mark, Mask and Hide on a slider; per-card unmask; allow-list by app ID; keyboard and reduced motion. Mask is the default on first install and masked cards capture clicks. No developer allow-list.                                                                                                                                                                                                                               | rq10 s4 |
| D4 Privacy     | 2     | `storage`, `alarms`, host permission and a service worker. Credentials included on every request. An optional automatic "not interested" action writes to the signed-in account's ignore list with a session token parsed from the home page. Valve host only; no remote code.                                                                                                                                                         | rq10 s5 |
| D5 Efficiency  | 4     | 0.7 s spacing, two in flight shared across tabs, Retry-After persisted, hidden tabs silent, 500-entry cache, weak maps, teardown on invalidation. Still a full page per app (100K to 300K characters).                                                                                                                                                                                                                                 | rq10 s6 |
| D6 Maintenance | n/s   | 31 commits in 31 hours, CI on every push, 47 test files; no outside issue.                                                                                                                                                                                                                                                                                                                                                             | rq10 s7 |
| D7 Reach       | 2     | 9 stars and 93 release downloads in one day; no store listing.                                                                                                                                                                                                                                                                                                                                                                         | rq10 s8 |
| D8 Packaging   | 1     | Unpacked install from a RAR; manual update; no Firefox build. Tagged releases with a CI package comparison.                                                                                                                                                                                                                                                                                                                            | rq10 s9 |

- Coverage 3: the best resilience engineering in the field, held back by missing live evidence and a Chrome-only build.
- Restraint 2: three-state verdicts and a "does not prove" icon text, offset by account writes, credentials included, host access and a default Mask.
- Quadrant: middle Coverage, low Restraint.

Read for us:

- Learn: forced English, identity checks, the canary and tests on gate, redirect and truncated pages; per-card unmask; serialized settings with rollback.
- Expose: Mask by default, account writes, host permissions.
- Threat: the best engineering among the new tools. A store build would put it in front of the same audience.

## Steam Slop Filter (dunkbing)

- Tier: Adjacent, short profile. Chrome and Firefox, unpacked only; no license; crowd votes on the author's server; the repo was under one day old (rq11 s1).

| Dimension      | Score | Justification                                                                                                                                                                                            | Source  |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D1 Detection   | 1     | A game flags at 3 votes and 60% slop; 2 of 3 votes flag it on defaults. "Slop" is undefined; no unknown state; how the disclosure switch reads pages is undocumented.                                    | rq11 s2 |
| D2 Surfaces    | 2     | Matches all store pages; the description names Next Fest, search and sale pages; no documented list.                                                                                                     | rq11 s3 |
| D3 UX control  | 2     | Dim or hide, vote badges. Look and wording unobserved.                                                                                                                                                   | rq11 s4 |
| D4 Privacy     | 1     | App IDs of every game shown on a viewed page go to an unnamed author-run server. Votes carry a random install ID and a salted IP hash; no retention period. Firefox manifest declares "websiteActivity". | rq11 s5 |
| D5 Efficiency  | n/s   | Not measured.                                                                                                                                                                                            | rq11 s6 |
| D6 Maintenance | n/s   | Seven commits in 3 h 49 min.                                                                                                                                                                             | rq11 s7 |
| D7 Reach       | 1     | 4 stars; no listing; no press.                                                                                                                                                                           | rq11 s8 |
| D8 Packaging   | 1     | Unpacked only; no update path; no reason given.                                                                                                                                                          | rq11 s9 |

- Coverage 2: vote counts key on app IDs and ignore store language, but unvoted games have no verdict.
- Restraint 1: IDs leave for a non-Valve host and the label is "slop".
- Quadrant: low on both.

Read for us:

- Learn: a plain PRIVACY.md that lists what is sent, what is stored and how to delete it.
- Expose: the privacy cost and the vote threshold.
- Threat: low.

## Augmented Steam (IsThereAnyDeal), reference

- Tier: Aspirational. No AI-disclosure feature. GPL-3.0; a company behind it; Chrome, Edge and Firefox; about 544K users across stores (mixed sources) (rq6 s1, s8).
- Why it is on the list: the audience a disclosure marker would reach, and the best public record of what a mature Steam extension decides and why. Not scored for D1 to D3 or the tension poles.

| Dimension      | Score | Justification                                                                                                                                                                                                                                                                                      | Source |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D4 Privacy     | 3     | MV3 with `storage`, `contextMenus`, `webRequest` and (Chromium) `offscreen`; three host patterns and 196 content-script patterns. The ITAD backend receives game IDs and currency, with no telemetry. The privacy text omits VaporLens. A security report (issue 2390) had no reply after 33 days. | rq6 s5 |
| D5 Efficiency  | 3     | 18.2 MB Firefox package; Steam throttling forced card-price changes; a fixed CPU spike from an ITAD sync; no budgets published.                                                                                                                                                                    | rq6 s6 |
| D6 Maintenance | 3     | 15 releases in 12 months, 9 tied to Steam-side changes. Fix lag 0 to 21 days typically; 44, 104 and 134+ days for three breaks. The maintainer wrote 90% of the commits. Bug median time to close 14.4 days.                                                                                       | rq6 s7 |
| D7 Reach       | 5     | Firefox 64,147 users, 4.64 from 549 ratings, Recommended; Edge 79,660 and Featured; Chrome about 400K (tracker).                                                                                                                                                                                   | rq6 s8 |
| D8 Packaging   | 4     | Three stores, MV3, 29 UI languages, in-extension changelog. Firefox review took up to 10 days.                                                                                                                                                                                                     | rq6 s9 |

Read for us:

- Learn: three requests for an AI marker (issue 1913 since 2024-04-25, 2362, 2408 on 2026-10-21) draw no maintainer reply; users want the developer's text, a dismissible banner like the DRM warning, no modal and no blur.
- VaporLens (default-on LLM summaries, v4.5.0, 2025-12-11) moved the Firefox average from 4.72 to 4.03 and the 1-star share from 3.5% to 19.7%. The fix was a collapsed default, its own AI/LLM settings group, a kill switch and an explainer.
- Threat: one feature release would put a disclosure marker in front of 544K users. Its single maintainer has not engaged with the request in 29 months.
