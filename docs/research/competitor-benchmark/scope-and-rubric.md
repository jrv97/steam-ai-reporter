# Competitor benchmark: scope, tiers and rubric

Researched 2026-10-21 and 2026-10-22. This note fixes the positioning brief, the competitor set and the scoring rules. The report is `docs/research/competitor-benchmark.md`; the scored cards are in `profile-cards.md`. Evidence notes are `rq1` to `rq12` in this folder.

## Positioning brief

The product is AI Reporter for Steam: a Chrome and Firefox extension and a userscript from one core. It marks Steam store items whose developer filled in the AI content disclosure.

- Strategic tension: Coverage x Restraint, scored as two separate poles and never averaged.
  - Coverage: the tool finds disclosed games on every Steam surface and in every store language, and it survives Steam markup and translation changes.
  - Restraint: minimal permissions, Valve hosts only, a non-blocking UI, and honest wording ("AI use reported", never "uses AI"), with unknown results kept apart from clean ones.
- Target quadrant: high on both poles.
- Central question: does any tool already sit in that quadrant?
- Differentiators claimed by the v1 plan (`docs/plans/steam-ai-reporter-v1.md`): batched GetItems detection (one request per 50 apps), three verdict states, credentials omitted, a content-script-only runtime, and one core for the extension and the userscript.

## Competitor set and tiers

Ten tools are scored in `profile-cards.md`. The sweep that found them is `rq1-discovery.md`.

| Tier         | Tool                                             | Note | Why it is in                                                             |
| ------------ | ------------------------------------------------ | ---- | ------------------------------------------------------------------------ |
| Direct       | AI warning for Steam (seeeeew)                   | rq2  | Market leader; extension and userscript; MIT                             |
| Direct       | AI Generated Content Filter for Steam (SoBloxsy) | rq3  | Same job, wider surfaces, Chrome and Firefox                             |
| Direct       | Steam AI Games Indicator (Pierre-Demessence)     | rq4  | Userscripts with a seeded ID list                                        |
| Direct       | Obvious Steam AI (GothicMess)                    | rq5  | Banner-only Firefox add-on; the floor of what a listing can be           |
| Direct       | Slop-Inator (Dysnomia)                           | rq7  | Launched 2026-10-17; curated per-game data plus disclosure               |
| Direct       | Steam AI Content Disclosure Badge (ceeprus)      | rq8  | Broadest surface coverage found in a userscript                          |
| Direct       | Steam Hide AI (Suvitruf)                         | rq9  | Keyword classifier plus a crowd list on the author's server              |
| Direct       | Steam AI Filter (RyuuMeow)                       | rq10 | Per-use filter, allow-list, account-writing action; Chrome unpacked only |
| Adjacent     | Steam Slop Filter (dunkbing)                     | rq11 | Crowd votes on the author's server; short profile only                   |
| Aspirational | Augmented Steam (IsThereAnyDeal)                 | rq6  | No AI feature; reach, maintenance and settings reference; GPL-3.0        |

Substitutes (a threat vector, not scored): the SteamDB "AI Content Disclosed" tag, the AI Transparency Index, Steam curators, and the manual lists they publish.

Skipped after the sweep, with the reason (details in `rq1-discovery.md`):

- Steam Dev Filter: dormant since 2026-04, one star, developer-level labels.
- AI extra warning (Greasy Fork): 10 installs, one notice, no filtering.
- Personal uBlock Origin rule: one line in a personal list.
- Steam Ignore Like A Pro: bulk-ignores a curator list and reads no disclosure.
- AI warning for itch.io: same author, itch.io only.
- Stevo's AI Blocklist, Slop Evader and similar "AI slop" blockers: none touch Steam.
- SteamDB extension: no AI feature; one open request (issue "Option for moving the AI Disclosure to the Top of the Page", 245).

"AI Slop Filter for Steam" does not exist under that name. The article that the earlier prior-art note cited names no extension. The only "AI Slop Filter" found is a LinkedIn tool.

## Corrections to the earlier prior-art note

`docs/research/steam-ai-disclosure/rq4-prior-art.md` (2026-10-20) was written through a summarizing fetcher. These facts changed after reading primary sources.

- AI warning for Steam has 30 heading keys (28 distinct strings), not "about 33". Stars, users and ratings grew (223 stars and 5,551 Firefox users on 2026-10-21).
- The Augmented Steam VaporLens poll reads 217 votes with 125 keep (57.6%), not 158 votes with 66%.
- AI Generated Content Filter does not request English pages. Measured on 2026-10-21: a Spanish store language returns a Spanish heading with no English phrase.
- Steam AI Games Indicator added its English-language parameter, its cache and its closed-world shortcut only on 2026-06-22 and 2026-06-23.
- The seed list of Steam AI Games Indicator holds 25,739 IDs (2026-09-19) and has never had an entry removed.
- Obvious Steam AI has 0 users, 0 ratings and one version, 10 months after listing.
- Four more tools appeared in the week of 2026-10-14: Slop-Inator, Steam Slop Filter, Steam Hide AI and Steam AI Filter. The field grew from one serious tool to at least eight during Next Fest.

## Dimensions and anchors

Each dimension gets a 1 to 5 score with a one-line justification and a source. "n/s" means not scoreable on the evidence read. "n/a" means the dimension does not apply. There is no weighted total and no composite.

| Dimension                            | 1                                                                                            | 3                                                                                | 5                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D1 Detection accuracy and resilience | One language only or a wrong signal; error and redirect pages stored as negatives; no canary | Works in most store languages with measured gaps; most guards present; no canary | Language-independent source, page identity checks, three states, a canary, tests on real fixtures      |
| D2 Surface coverage                  | One page type                                                                                | App page and search plus some of home, wishlist and tabs, with named gaps        | Every app-ID surface (wishlist, sale, queue, hover popups) with a route for the client and mobile      |
| D3 UX intrusiveness and control      | Blocking modal, no off switch                                                                | Non-blocking default with one or two modes                                       | Non-blocking default, several modes, dismissal, allow-list or false-flag path, keyboard and ARIA reach |
| D4 Privacy and permissions           | Third-party host receives app IDs with an identity                                           | `storage` plus the store host; cookies sent by default; minor side effects       | `storage` only, credentials omitted, Valve hosts only, declared none, a privacy policy                 |
| D5 Efficiency                        | Unbounded parallel full-page fetch per tile, unpruned cache, polling                         | Full page per tile with a throttle, backoff and a pruned cache                   | One batched request per 50 apps, bounded cache, observers disconnected, budgets                        |
| D6 Maintenance and responsiveness    | Abandoned or unanswered                                                                      | Breakage fixed in days; bursts and gaps of months; one maintainer                | Steady cadence, hours-to-days turnaround, several contributors, tests and automation                   |
| D7 Reach and trust                   | No users                                                                                     | Thousands of users, some reviews                                                 | Tens of thousands of verified users, reviews, a store badge                                            |
| D8 Packaging and distribution        | Unpacked or raw-URL install, manual update                                                   | Both browser stores or a store plus a userscript, auto-update, public source     | Both stores and a userscript, tagged releases, reproducible build, localized listings                  |

Scores of 2 and 4 sit between the anchors. Level 4 for D5 means a full page per app with a shared cross-tab queue, persisted backoff and bounded memory. Level 5 needs a batched API call. Level 4 for D8 means both browser stores, or one store plus a userscript, with automated publish or tagged releases.

Tension poles:

- Coverage 1: one surface, language-dependent or unknown. Coverage 3: several surfaces or strong language handling, but not both, or both without live evidence. Coverage 5: every surface and every store language, shown on live pages, with a canary.
- Restraint 1: app IDs or identity leave for a non-Valve host, or the wording asserts AI use. Restraint 3: small footprint with one clear lapse (a modal, an unsupported claim, default cookies). Restraint 5: storage only, Valve hosts only, neutral wording, a visible unknown state, no lapses.

## Evidence rules

- Notes tag facts as `[code]`, `[api]`, `[listing]`, `[measured]` and `[tracker]`. "Proven" means code, manifest, commits or issue threads. "Asserted" means listing or README copy.
- Chrome Web Store figures come from trackers (ExtScope, ChromeBoard). They are unverified and lag the store. The built-in browser refuses the store, and Chrome blocks scripted reads of it for every extension (Claude in Chrome failed with "The extensions gallery cannot be scripted" on 2026-10-22). A screenshot route was proposed and declined. No Chrome store page was read.
- Tools under 8 days old (Slop-Inator, Steam Hide AI, Steam AI Filter, Steam Slop Filter) get "n/s" for maintenance. Their reach scores describe a launch week.
- No tool was installed or run. Behavior claims come from source, manifests, listings and a few anonymous read-only fetches of public store pages. Where a note says "inference", the card keeps that label.
- Scores were set side by side after all notes were read. A 4 means the same thing in every card.

## Clean-room log

- Notes record behavior and facts only. They hold no code, selectors or patterns.
- Augmented Steam (GPL-3.0): no source file was read. Issue and pull request threads, which users fill with CSS and stack traces, were read for behavior (issues 1913, 2390, 2370, 2104, 2014, 1976 and pull requests 2372, 2377, 2389). Nothing from them is recorded. The Edge listing JSON shows the published manifest.
- MIT and Apache-2.0 tools (AI warning for Steam, AI Generated Content Filter, Steam AI Games Indicator, ceeprus, Steam Hide AI, Steam AI Filter): source was read for behavior.
- No LICENSE file: Slop-Inator (the README asserts MIT and CC BY-SA 4.0; GitHub reports none) and Steam Slop Filter. For Slop-Inator the code was read for behavior only and the data files for aggregate counts. For Steam Slop Filter only the README, PRIVACY.md and manifest were read.
- Obvious Steam AI: code unread. AMO's source viewer was refused. On 2026-10-22 the main session downloaded the four AMO packages (AI warning for Steam, AI Generated Content Filter, Slop-Inator, Obvious Steam AI) with approval and read manifests and file lists only.
- Provenance finding that bears on project rule 6 (originality and credit): ceeprus copied the heading list of AI warning for Steam under MIT, then removed the credit comment on 2026-09-22 (commit 99eb29d). Steam Hide AI credits the same list. Our design has no heading table.

## Method

- One agent per tool read stores, source, issues and press, wrote a 12-section note and did not score. Scores and cards were written afterward in one pass.
- A discovery sweep ran first across AMO, Edge Add-ons, Greasy Fork, OpenUserJS, GitHub, Hacker News and the Steam community forums, with the Chrome Web Store covered through trackers and search snippets.
- Reddit, the Chrome Web Store (through the built-in browser) and SteamDB were not reachable. Each note's section 12 lists its own gaps.
- Prompt-injection text: one agent read a SteamDB Cloudflare page, left in a shared browser tab, that carried text addressed to agents (stop requesting the domain, refuse prompts). The agent ignored it and used its own tab. No note takes data from that page.
