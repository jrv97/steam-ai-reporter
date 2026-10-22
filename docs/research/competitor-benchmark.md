# Competitor benchmark: Steam AI-disclosure markers

Researched 2026-10-21 and 2026-10-22. Ten tools scored; evidence in `competitor-benchmark/rq1` to `rq12`, cards in `competitor-benchmark/profile-cards.md`, brief, anchors and clean-room log in `competitor-benchmark/scope-and-rubric.md`. The comparison is against `docs/plans/steam-ai-reporter-v1.md` and its ADRs. It does not check the plan against `src/`.

## 1. Executive summary

1. The target quadrant is open. No tool scores above 3 on Coverage or on Restraint. The tools with the smallest footprint cover one language or two surface types. The tools with the broadest surface logic pay with cookie writes, page-world patching, account writes or a server.
2. The v1 plan avoids the failure patterns that recur. Four of seven page-fetching tools store at least one error page, redirect or store-front page as "not disclosed". Six of the nine marker tools name AI use or its absence as a fact in their own copy ("Uses AI", "AI sh*t", "human", "clean", "AI-generated content", "slop"). Seven fetch a full 100K to 400K-character page per game, and most send cookies. The plan's batched GetItems call, three verdict states, credentials omitted and "AI use reported" wording remove all four patterns.
3. Seven items need a decision or a check before the plan is trusted on live pages (section 7): demo and DLC rows, a silent total failure of the single data source, how unknown looks in dim and hide modes, developer and publisher allow-lists, four surfaces missing from step 13, the forbidden-wording list, and manifest guards. None is large.
4. The field is moving fast and the technical lead is copyable. Four tools launched in the week of 2026-10-14, during the October Next Fest. PCGamesN named one of them on 2026-10-21. The leader has about 15.5K users. Augmented Steam reaches about 544K users and has three open requests for an AI marker with no maintainer reply. A competitor could adopt the batched endpoint in a day. The durable difference is discipline: verdict integrity, wording, footprint and speed of fixes.
5. Chrome Web Store figures are tracker-only. The built-in browser refuses the store, and Chrome blocks scripted reads of it for every extension (Claude in Chrome connected on 2026-10-22 and failed with "The extensions gallery cannot be scripted"). A screenshot route was proposed and declined. Chrome user counts and review text for four tools remain unverified.

## 2. Landscape and tension map

Coverage x Restraint, scored 1 to 5 from the cards. Points read (Coverage, Restraint).

| Restraint | Coverage 1             | Coverage 2                        | Coverage 3                                                           | Coverage 4  | Coverage 5 |
| --------- | ---------------------- | --------------------------------- | -------------------------------------------------------------------- | ----------- | ---------- |
| 5         |                        |                                   |                                                                      | plan target |            |
| 4         |                        |                                   |                                                                      |             |            |
| 3         |                        | AI Generated Content Filter (2,3) | AI warning for Steam (3,3); Slop-Inator (3,3)                        |             |            |
| 2         | Obvious Steam AI (1,2) |                                   | Steam AI Games Indicator (3,2); ceeprus (3,2); Steam AI Filter (3,2) |             |            |
| 1         |                        | Steam Slop Filter (2,1)           | Steam Hide AI (3,1)                                                  |             |            |

Augmented Steam has no AI feature and is not plotted.

The plan's own cell (4,5) is a design intent scored on the same anchors, not a result. It holds only if the checks in section 7 pass on live pages.

## 3. Tiers

Direct (eight tools): AI warning for Steam, AI Generated Content Filter for Steam, Steam AI Games Indicator, Obvious Steam AI, Slop-Inator, Steam AI Content Disclosure Badge (ceeprus), Steam Hide AI and Steam AI Filter. All read Steam's own disclosure section and show a marker. They differ in source, surfaces and manners. Three of them are under 8 days old (Slop-Inator, Steam Hide AI, Steam AI Filter). Three more (Steam AI Games Indicator, ceeprus, Obvious Steam AI) have no measurable users.

Adjacent (one tool): Steam Slop Filter. Its signal is a vote tally on the author's server. It competes for the same users and shares none of the method.

Aspirational (one tool): Augmented Steam. It sets the bar for reach, settings structure and maintenance records, and for how this audience reacts to defaults on AI-related features.

Substitutes, not scored: the SteamDB "AI Content Disclosed" tag, the AI Transparency Index and Steam curators. A Valve-native filter would remove the category. Press on 2026-10-20 says none exists.

## 4. Benchmark matrix

D1 detection, D2 surfaces, D3 UX control, D4 privacy, D5 efficiency, D6 maintenance, D7 reach, D8 packaging. Anchors are in `competitor-benchmark/scope-and-rubric.md`. Each cell's justification and source is in `competitor-benchmark/profile-cards.md`. "n/s" is not scoreable on the evidence; "n/a" does not apply. There is no composite column.

| Tool                         | D1 Detection | D2 Surfaces | D3 UX control | D4 Privacy | D5 Efficiency | D6 Maintenance | D7 Reach | D8 Packaging | Coverage | Restraint |
| ---------------------------- | ------------ | ----------- | ------------- | ---------- | ------------- | -------------- | -------- | ------------ | -------- | --------- |
| AI warning for Steam         | 3            | 2           | 2             | 4          | 1             | 3              | 4        | 4            | 3        | 3         |
| AI Generated Content Filter  | 1            | 3           | 3             | 3          | 2             | 2              | 2        | 3            | 2        | 3         |
| Steam AI Games Indicator     | 2            | 4           | 3             | 3          | 3             | 2              | 1        | 2            | 3        | 2         |
| Obvious Steam AI             | n/s          | 1           | 2             | 4          | n/s           | 1              | 1        | 2            | 1        | 2         |
| Slop-Inator                  | 2            | 3           | 2             | 4          | 1             | n/s            | 2        | 4            | 3        | 3         |
| ceeprus badge                | 3            | 4           | 4             | 2          | 3             | 2              | 1        | 2            | 3        | 2         |
| Steam Hide AI                | 3            | 3           | 4             | 2          | 3             | n/s            | 1        | 2            | 3        | 1         |
| Steam AI Filter              | 4            | 4           | 3             | 2          | 4             | n/s            | 2        | 1            | 3        | 2         |
| Steam Slop Filter            | 1            | 2           | 2             | 1          | n/s           | n/s            | 1        | 1            | 2        | 1         |
| Augmented Steam (reference)  | n/a          | n/a         | n/a           | 3          | 3             | 3              | 5        | 4            | n/a      | n/a       |
| AI Reporter v1 plan (intent) | 5            | 4           | 4             | 5          | 5             | n/s            | n/s      | 4            | 4        | 5         |

Where the field leads the plan's intent: reach (the leader scores 4, Augmented Steam 5) and a track record of fixes (the leader repairs breakage within hours). Where the plan's intent leads: the best field score is 4 for detection, 4 for efficiency, 4 for privacy (three tools) and 3 for Restraint.

Patterns across the columns:

- D4 and D3 move against D2. The three tools with a 4 on surfaces (Steam AI Games Indicator, ceeprus, Steam AI Filter) score 2 or 3 on privacy.
- D5 stays low everywhere: no tool uses a batched source. The best score (4) belongs to a tool that still downloads a full page per game, with a careful shared queue.
- D7 follows press, not quality. The leader's Chrome reach went from about 2K to about 4K (PCGamesN, 2026-06-16) to about 10K (trackers, 2026-10-21). The link to Next Fest coverage is an inference from timing. The two tools with the most careful engineering (Steam AI Filter, ceeprus) have no store listing and almost no users.

## 5. Deep dives

AI warning for Steam (the leader). One 16 KB script serves Firefox, Chrome and the userscript. It holds the best permission footprint in the field (`storage` only) and fixes heading breaks within hours: four issues ever closed, from one minute to 24 hours. Its weak points are its own copy of the market's complaints. The modal has no off switch and the maintainer calls changing that "not a priority". Search detection stores any response without the heading as a 7-day negative. A heading-check issue has been open since 2026-05-05, and French broke on 2026-09-24. Learn from its footprint, its install prompt and its fix speed. Avoid its modal and its error handling. (rq2 s2, s4, s7)

Steam AI Filter (RyuuMeow). The best engineering of the new tools. List lookups force English, check the page's identity before saying "not found", abort on redirects, keep three states with "unavailable" never shown as clean, and fire a canary when the heading appears outside the expected structure. Its shared queue honors Retry-After across tabs. The same tool writes to the signed-in Steam account's ignore list, includes credentials on every request, holds host access and a background worker, and makes Mask the default mode. It is 31 hours old, Chrome-only and installed unpacked from an archive. Learn from its resilience checks and per-card unmask. Avoid its permissions, defaults and account writes. (rq10 s2, s5)

ceeprus (Steam AI Content Disclosure Badge). The widest generic surface logic: any app link that wraps an image, discovery cards, hover popups, sale-widget lines and tab previews, behind one header control with four modes and keyboard reach. Its error discipline is the most detailed written down: 429, 503, age gates, login redirects, timeouts and oversize pages store nothing. It also writes a one-day birth-date cookie that lifts the user's own age gates, edits the recently-viewed cookie, replaces fetch and XHR inside the page and rewrites Steam's responses. A single audit commit fixed nine silent failures, and the Arabic heading is missing (measured). It copied the leader's heading list under MIT and later removed the credit comment. Learn from the surface list and the failure rules. Avoid the page-world code and cookie writes. (rq8 s2 to s5, s7)

Steam Hide AI and Steam Slop Filter. Two answers to the demand for undisclosed AI use: a crowd report list behind Steam sign-in (Hide AI) and anonymous votes (Slop Filter). Slop Filter sends the app IDs of every game on a viewed page to the author's server, and its votes carry an install ID and a hashed IP. Hide AI sends app IDs when a signed-in user files a report, with a SteamID64 token and a hashed IP, and syncs daily while signed in. Neither states a retention period. Steam Hide AI's keyword classifier gave an empty, lucky, mis-scoped or mis-categorized result on 4 of 9 live disclosures. Learn from the demand and from a plain PRIVACY.md file. Avoid the method. (rq9 s2, s5; rq11 s5)

Augmented Steam. It has no marker, and its record shows what this audience expects. Issue 1913 has been open since 2024-04-25 with 12 thumbs-up. The only maintainer reply is from April 2024 and that maintainer has been inactive since 2025-03. Users ask for the developer's text, a dismissible banner like the DRM warning, no modal and no blur. The VaporLens episode is the evidence on defaults: shipped on by default on 2025-12-11, it moved the Firefox average from 4.72 to 4.03 and the 1-star share from 3.5% to 19.7%. The remedy was a collapsed default, its own AI settings group, a kill switch and an explainer. Learn from the remedy. (rq6 s2, s4, s8)

## 6. White-space and threats

White-space. The open cell is the one in the corner: broad coverage with a small footprint. It is open for a reason the cards show. Everyone who covers more surfaces fetches a full page per game, because nobody uses the batched source. The page fetch brings cookie-bearing requests, throttling code and language handling with it. A batched, language-independent source removes that dependency. The plan's design sits there if it holds on live pages.

The claim has limits. The batched endpoint is undocumented and single-sourced (plan risk; `steam-ai-disclosure/rq2-data-surface.md`). The advantage is copyable; the ceeprus script grew about 10.7 times in four months (rq8 s1). The cell stays defensible only through discipline that competitors skip: no negative from an unexpected response, neutral wording, a small manifest and fast repairs.

Threats, in order of weight:

1. The leader fixes its modal or adopts a batched source. It has the users and the press, and its maintainer answers bugs within hours.
2. Augmented Steam ships a marker. One release reaches about 544K users. Its active maintainer has never commented on the request, which lowers the odds without removing them.
3. Steam AI Filter publishes a store build. Its engineering is ahead of every store-listed tool.
4. A Valve-native filter or tag. Press on 2026-10-20 says none exists, and a thread of 224 comments shows the demand.
5. Crowd and curated data (Slop-Inator, Steam Hide AI, Steam Slop Filter) answers a need a disclosure-only tool cannot: undisclosed use. If one gains trust, the disclosure marker looks incomplete.
6. A break in the single data source with no telemetry to notice it (section 7, item 3).
7. A false flag that reaches press. Every tool in the set flags disclosures that say "no AI" or cover upscaling and translation. The name "Reporter" can read as a tool that files reports, which the plan notes.

## 7. What to get right

Status is relative to the v1 plan and its ADRs, not to the code. "Covered" means the plan names the behavior. "Partial" means the plan names part of it. "Gap" means the plan is silent. "Decide" means the plan took a position that the evidence questions.

### 1. Store "not disclosed" only from a response of the expected shape

Four of seven page-fetching tools cache an error page, a redirect or the store front as a 7-day negative: AI warning for Steam (rq2 s2), AI Generated Content Filter (rq3 s2), ceeprus (rq8 s2, measured) and Steam Hide AI (rq9 s2, measured). The plan (steps 5 and 6) requires a success flag plus `extra_details` from GetItems, treats an invalid ID as unknown, and checks the final URL and the app-name element on the HTML path. Status: covered. Keep a store-front-redirect fixture as a named regression test.

### 2. Detection that ignores the store language

A Spanish store returns no English phrase (rq3 s2, measured). Arabic is missing from a 28-string list (rq8 s2, measured). The leader had three heading breaks in seven months (rq2 s2). The plan reads the GetItems notes field and forces English on the HTML fallback. Status: covered.

### 3. Notice a silent total failure of the one data source

No tool reads GetItems and no break record exists. Step 5 marks a game "not disclosed" when `extra_details` is present and the notes are empty. If Valve renamed the notes field and kept `extra_details`, every game would read as clean and nothing would show. This is an inference from the plan's rules, not an observed event. The leader's heading-check issue sat open for 4.5 months before French broke (rq2 s2). The plan runs a canary before each release, optionally weekly, outside CI. Status: gap. Make the scheduled canary required, with a failure notice to the maintainer. Consider an in-page cross-check: on an app page the live heading is ground truth against the API verdict.

### 4. Wording that never asserts AI use or absence

Copy in the field: "Uses AI" (rq4 s2), "AI sh*t in this game" (rq5 s1), "This game uses AI-generated content" (rq9 s2), a mask reading "AI-generated content" (rq10 s4), "human" and "clean" (rq7 s2), "slop" (rq11 s2). Rule 4 applies, and a plan test fails on "uses AI", "AI-free" and "no AI". Status: partial. Extend the forbidden list (for example slop, clean, human, AI-generated content).

### 5. The developer's text, whole and as plain text

ceeprus caps tooltips at 400 characters (rq8 s2). Two tools splice text or names into HTML strings (rq3 s2, rq2 s5). A long disclosure breaks the leader's modal (issue 2, rq2 s4). The plan uses `textContent` with pre-line wrapping, collapses after a few lines, and shows a hover card on badges. Status: covered in design. Add a fixture with a multi-thousand-character disclosure for the banner and the hover card.

### 6. A small footprint, written as invariants

ceeprus writes cookies and patches fetch and XHR (rq8 s5). Steam AI Filter writes to the Steam account and includes credentials (rq10 s5). Two tools expose icon files to web pages, Slop-Inator to every page and AI Generated Content Filter to store pages (rq3 s5, rq7 s5; both confirmed in the Firefox packages). Rules 1 to 3 hold, and the bundle check asserts permissions, matches and no background key. Status: partial. No rule names cookie writes, page-world injection or account-writing actions, and the bundle check does not look at `web_accessible_resources`. Add both. A rule change needs an ADR first.

### 7. Non-blocking by default, with a real off switch

Complaints about the modal come from four sources (rq12). The leader's maintainer ranks the fix "not a priority". The plan has a collapsible banner, badge and banner toggles, and a list filter that is off by default. Status: covered.

### 8. An override for false flags

The most requested control: issues 12, 6 and 11 at the leader, Chrome reviews and Augmented Steam commenters ask for it, and three new tools built one (rq12). The plan ships an app-ID allow-list in v1, puts developer and publisher lists on the roadmap and has no report channel. Status: decide. Check whether the GetItems request can also return developer and publisher names (not tested in the notes read). If it can, move the developer allow-list up.

### 9. Surfaces in current demand

Sale and Next Fest pages (rq2 s3, rq3 s3), hover popups and tab previews (rq8 s3) and the curator review feed (rq2 s3). Step 13 lists wishlist, home carousels, discovery queue, hubs, sale pages, search suggestions and developer pages. Status: partial. Hover popups, expanded sale-widget lines, tab previews and the curator feed are missing from the step list. Placement entries make them cheap once fixtures exist.

### 10. Demo, DLC and soundtrack rows

Slop-Inator copies the parent app's flag to these pages (rq7 s2). ceeprus fixed duplicate hide buttons on them (rq8 s7). Next Fest tiles are demos, and about 1,700 of 8,700 carried a disclosure in June 2026 (`steam-ai-disclosure/rq3-reliability.md`). The plan does not cover them; spike 5 checked demo pages for banner anchoring only. Status: gap. Run GetItems on demo and DLC IDs of disclosed games before trusting Next Fest tiles.

### 11. What unknown looks like in dim and hide modes

ceeprus marks unverified games with an "AI?" chip in blur and hide modes (rq8 s4). Steam AI Filter never shows "unavailable" as clean (rq10 s2). Steam Hide AI shows a "checking" hint (rq9 s4). The plan assumes unknown renders nothing, the same as not disclosed. Status: decide. In dim or hide mode a game that failed to check looks the same as a clean game.

### 12. A fast repair path while stores review

AMO review took 3 days for Slop-Inator (rq7 s7) and up to 10 for Augmented Steam (rq6 s7). ceeprus auto-update was dead for 22 days (rq8 s7). The install links of Steam AI Games Indicator were broken for 6.5 months (rq4 s7). The plan serves the userscript from `releases/latest` and proves the update path end to end in step 15. Status: covered. Keep the update-path proof as a release gate.

### 13. Defaults on anything AI-adjacent

After VaporLens shipped on by default, the Firefox average fell 0.7 points and the 1-star share rose 5.6-fold (rq6 s8; timing, not proof of cause). The plan keeps the list filter off by default; the badges are the product. Status: covered. Keep any future classifier or data feature off by default, in its own settings group with an explainer.

### 14. Say what the tool cannot see

Press repeats that undisclosed AI is not caught, and three tools answer with data we cannot use (rq12). The plan has the wording rule and one listing line. Status: partial. The first sentence of the listing and README should say that no badge proves nothing about AI use.

### 15. Cheap reach routes

Only the leader declares Firefox for Android (rq2 s3). Augmented Steam issue 1964 has 11 thumbs-up and no reply. Users run extensions in the Steam client through Extendium (rq2 s3, rq3 s3). The plan lists these on the roadmap. Status: optional. Declare Firefox for Android; test the Chrome build under Extendium.

## 8. Recommendations

Sequenced by effort against impact. None of them moves the Coverage x Restraint position the plan claims; item R3 adds a visible state and needs a look at clutter.

Now, small and before more users arrive:

- R1. Spike: GetItems for demo, DLC and soundtrack IDs of known disclosed games (item 10). Raises Coverage on the surface the press watches this month.
- R2. Make the scheduled canary required, and decide on the in-page cross-check (item 3). Protects both poles.
- R3. Decide whether unknown shows a marker in dim and hide modes (item 11). Raises Restraint by keeping unknown apart from clean, at the cost of one more mark.
- R4. Three guards in one change: the wider forbidden-wording list, the long-disclosure fixture and a `web_accessible_resources` check (items 4, 5 and 6). Restraint.

Next, after the first store push:

- R5. Developer and publisher allow-lists, after checking which fields GetItems returns (item 8). Restraint.
- R6. Placements for hover popups, the curator feed and tab previews, from fixtures (item 9). Coverage. Keep every placement DOM-only.
- R7. Declare Firefox for Android and test the Chrome build under Extendium (item 15). Coverage.

Not now:

- Keyword classification of disclosure text, crowd lists, curated per-game data and account-writing actions. The evidence is 4 of 9 live disclosures misread or left empty by one classifier, a privacy rule these methods break and a trust cost the market has not priced. Each would need an ADR first. The roadmap's classifier idea should wait for a measured set of real disclosures.
- Official Steam client support. The routes users take work without us, and the leader's maintainer chose not to document them.

## 9. Questions for the team session

- Is the corner really open, or does Steam AI Filter enter it once it ships to a store?
- Which Direct competitor is the sharpest threat in the next 12 months, and what is the counter: the leader's reach, or Steam AI Filter's engineering?
- Does the product answer the demand for undisclosed AI use at all, given what the existing answers cost in privacy?
- Should unknown show a mark in dim and hide modes (R3)?
- Does the developer allow-list move ahead of the first store push (R5)?

## 10. Sources and gaps

- Per-tool evidence: `competitor-benchmark/rq2` to `rq11`. Sweep: `rq1`. Themes: `rq12`. Method, tiers, anchors, corrections to the earlier prior-art note and the clean-room log: `competitor-benchmark/scope-and-rubric.md`.
- Chrome Web Store: not read from the store itself. Chrome user counts, ratings and review text for AI warning for Steam, AI Generated Content Filter, Augmented Steam and Slop-Inator come from trackers and are unverified.
- Firefox packages: the AMO packages of AI warning for Steam, AI Generated Content Filter, Slop-Inator and Obvious Steam AI were downloaded on 2026-10-22 and their manifests and file lists read. Hashes match AMO. Code was not read from them. Chrome packages were not downloaded.
- Obvious Steam AI: the manifest shows no permissions and one 990-byte content script; the code is unread. Detection, surfaces and efficiency for it are not scored.
- Day-old tools (Slop-Inator, Steam Hide AI, Steam AI Filter, Steam Slop Filter): maintenance not scored; reach describes a launch week.
- No tool was installed or run. Behavior comes from source, manifests, listings and a few anonymous fetches of public store pages.
- Reddit and SteamDB were unreachable. Reddit threads, including the one with more than 8,800 upvotes that press cites, were not read.
- Section 7 compares against the plan and its ADRs. The plan text predates later pull requests (for example the single "AI use reported" label, the hover card on badges and the Spanish catalog), so some listed gaps may be settled. Whether `src/` implements each item was not checked.
