# Tag Kit for Steam: gap analysis against prior art

Researched 2026-10-25. Method: shallow `git clone` of each public repo (read only, nothing copied), GitHub issue pages through WebFetch, the GetItems proto from `SteamDatabase/Protobufs`, and this repo's own research notes (`docs/research/steam-ai-disclosure/rq4-prior-art.md`, `docs/research/steam-store-disclosure-kinds/rq5-gaps-and-community-data.md`). AMO, the Chrome Web Store, `api.github.com` and `api.steampowered.com` were unreachable from this container, so install counts below come from rq4 (2026-10-20) and are marked as such. "Verified" means read in the repo files or issue pages cited; "unverified" means not confirmed from a primary source; "inference" is my reading.

Repo heads read: aiwarningforsteam `44bdc31` (2026-09-25), SteamAIGamesIndicator `c258435` (2026-09-20), AI-Content-Hider-for-Steam `3183f8c` (2026-08-22), slopinator `fe95e97` (2026-10-25), RyuuMeow/steam-ai-filter `85fbe14` (2026-10-21), AugmentedSteam `25f63f2` (2026-10-02, v5.0.0), Enhanced_Steam `7d4b116` (2019-03-18), SteamDatabase/BrowserExtension `c6c32a6` (2026-08-19, v4.37).

New since rq4: **Steam AI Filter (RyuuMeow/steam-ai-filter)**, MIT, v0.10.2. It is the most feature-rich AI-only competitor and is not in the README.

## 1. Feature matrix (verified facts only)

Key: TK = Tag Kit (us, `main` at `baf7a1a`). AW = AI warning for Steam (seeeeew, 1.1.2). SAGI = Steam AI Games Indicator (Pierre-Demessence, badge 2.1 and banner 1.1). ACF = AI Generated Content Filter for Steam (SoBloxsy, 3.4.1). SLOP = Slop-Inator (Dysnomia Studio). SAF = Steam AI Filter (RyuuMeow, 0.10.2). AS = Augmented Steam (5.0.0). SDB = SteamDB extension (4.37). Enhanced Steam ended in 2019 and is in the last row only.

| Capability | TK | AW | SAGI | ACF | SLOP | SAF | AS | SDB |
|---|---|---|---|---|---|---|---|---|
| Kinds | 7: AI, KLAC, Anti-Cheat, DRM, Account, EULA, PvP | AI | AI | AI | AI, split into 6 categories (art, code, marketing, sound, translation, voice) for 144 hand-curated games | AI, sorted into 7 categories by local keyword matching | 3rd-party DRM warning (keyword scan of DRM notice, legal and sysreq text) | none of these |
| Data source | batched GetItems `extra_details` | localized heading on app page; `/app/<id>?l=english` per search row | bundled `appids.json` (SteamDB-sourced) plus `/app/<id>/?l=english` | `/app/<id>/` (no language param), English string match | bundled curated JSON, a 65,581-ID "not updated since 2022-11-30" list, `/app/<id>/?l=english` | `/app/<id>/?l=english` | app page DOM text | n/a |
| Requests per unseen item | 1 per 50 | 1 | 1 (serial, 1 s) | 1 (when within 200px of the viewport) | 1, plus 1 for a DLC's parent | 1 (0.7 s, at most 2 at once) | 0 (app page only) | n/a |
| Non-Valve hosts at runtime | none | none | raw.githubusercontent.com | none | none | none | own server and ITAD (for other features) | steamdb.info |
| Cookies on lookups | omitted (`credentials: "omit"`) | default fetch, not omitted | GM_xmlhttpRequest default | default fetch | default fetch | `credentials: "include"` | n/a | n/a |
| Writes to the Steam account | no | no | no | no | no | yes: "Not interested" button and opt-in automatic ignoring (POST `/recommended/ignorerecommendation/` with sessionid) | no | no |
| Permissions | storage | storage | userscript, @connect store + raw.githubusercontent | storage + service worker | WXT build; web-accessible resources open to `*://*/*` and all extension IDs | storage, alarms, host_permissions store, service worker | host access steampowered, steamcommunity; optional ITAD | storage, host_permissions steamdb, steamcommunity, *.steampowered |
| Surfaces | search, wishlist, home, hubs, sale pages, dev/pub pages, queue, suggestions, DLC rows, app page | app page, search only (manifest matches) | tiles, search, wishlist, home capsules | all store pages incl. wishlist | app page, search rows, sale widgets | home, search, sale pages | app, sub, bundle pages | n/a |
| App page display | non-blocking banner, tag section under user tags, hover card | full-page modal | top banner | red banner | badges plus a sources list | (marks and lists; not checked) | warning above the purchase box | n/a |
| List modes | per kind Show / Dim / Hide | blur / hide (search) | hide (search) | text / highlight / hide | badges | off / mark / mask (click to unmask) / hide | none | n/a |
| In-page list control | no (popup and options only) | yes, in the search sidebar | yes, "Narrow by preferences" | no | no | mask buttons on each card | own search filters (reviews, EA, cart) | n/a |
| Per-game exception | yes, per kind and all tags; DLC follows (branch `feat/dlc-inherits-ignore`, not merged) | no (issue 12 planned) | no | no | no | "Allow this game" | excluded app list (internal) | n/a |
| Detection independent of store language | yes | localized table on app page; English fetch for rows | English fetch | no (English match on an unpinned-language page) | English fetch | English fetch | keywords in page text | n/a |
| Age gate guard before caching a negative | yes (unknown `gated`) | no (caches `false` from any answer) | yes (`appHubAppName`) | no (caches `false` from any answer) | no | (not checked) | n/a | n/a |
| UI languages | en, es | detection in about 33 languages; UI only partly translated (README) | en | en | en (issue 4 open) | en, zh-TW, zh-CN | many (Crowdin) | many (Crowdin) |
| Userscript | yes | yes (same file) | yes (only form) | no | no | no | no | no |
| Distribution | CWS, AMO pending, userscript | AMO (also Android), CWS, userscript | GitHub raw | CWS, AMO | CWS, AMO | GitHub release RAR or load unpacked, Chrome only | CWS, AMO, Edge | CWS, AMO (Android key), Edge |
| Code license | MIT | MIT | MIT | Apache-2.0 | MIT (data CC BY-SA 4.0) | MIT | GPL-3.0 | BSD-style |
| Firefox users (rq4, 2026-10-20) | n/a | 5,475 | n/a | 80 | (not read) | n/a | 64,156 | (not read) |

Enhanced Steam: GPL-3.0, last commit 2019-03-18, README says its API servers went offline on 2019-02-01. Features were price history, owned/wishlist highlighting and wishlist sorting. It has no tagging of the kinds we cover. Augmented Steam continues it.

Sources: https://github.com/seeeeew/aiwarningforsteam (`manifest.json`, `aiwarningforsteam.user.js` lines 294-432, README); https://github.com/Pierre-Demessence/SteamAIGamesIndicator (README, `steamAIBadge.user.js` header and lines 283, 553-561); https://github.com/SoBloxsy/AI-Content-Hider-for-Steam (`manifest.json`, `content.js` lines 7, 60-75, 349-358, `popup.html` lines 164-196); https://github.com/Dysnomia-Studio/slopinator (README, `wxt.config.ts`, `entrypoints/content.ts` lines 1-120, `data/games/*.json`, `tools/GenerateNotUpdatedAppsList/Program.cs`); https://github.com/RyuuMeow/steam-ai-filter (`README.en.md`, `extension/manifest.json`, `extension/lookup.js` line 196, `extension/ignore.js` lines 34, 218, 241); https://github.com/IsThereAnyDeal/AugmentedSteam (README, `changelog.yml`, `src/localization/en.json`, file names under `src/js/Content/Features/Store/`); https://github.com/SteamDatabase/BrowserExtension (README, `manifest.json`, `_locales/en/messages.json`); https://github.com/jshackles/Enhanced_Steam (README).

## 2. Ranked capability gaps

Demand evidence is from public issues. "Rule" means AGENTS.md rules; "D" means `docs/design/decisions.mdx` decisions.

**1. Ignore by developer or publisher.**
- User value: high. It fixes false flags that repeat across a whole catalog. ARTDINK's upscaling notes are the example in AW issue 12, which the owner accepted on 2026-09-25 (https://github.com/seeeeew/aiwarningforsteam/issues/12). AS issue 1822 has been open since 2024 with 3 supporters (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/1822).
- Effort: M.
- Risk: names are not unique. Key the entry on `creator_clan_account_id`, which GetItems returns under `basic_info.developers/publishers` when `include_basic_info` is set (verified in the proto, `StoreItem_BasicInfo_CreatorHomeLink`). The extra payload for 50 items is unmeasured.
- Rules: compatible. It is the same request (rule 1) and adds no request (rule 13). It needs a new `AllowScope` dimension and a settings migration (rule 11).
- Smallest slice: an "Ignore this developer" control in the app page banner, all kinds, keyed by clan ID and listed under its own group in the ignored list. Lists apply it from the same GetItems answer.

**2. In-page list controls on search.**
- User value: medium-high. People find and use the toggle where they browse, and Hide stays reversible.
- Effort: S to M.
- Prior art: AW puts blur/hide in the search sidebar (`user.js` 341-383). SAGI adds "Hide items with AI disclosure" to "Narrow by preferences". AW issue 8 (https://github.com/seeeeew/aiwarningforsteam/issues/8) asks to control the filter in place.
- Risk: churn in the search sidebar markup. It is a classic page and fairly stable (inference).
- Rules: compatible. Copy goes in the catalog (rule 9). A root attribute and CSS do the work (rule 13, D12).
- Smallest slice: one line at the top of search results, "Tag Kit hid N results. Show them", that sets a page-scoped attribute suspending Hide. Nothing is stored. A sidebar checkbox can follow.

**3. Highlight as a fourth list mode.**
- User value: medium-high for people who want to see a game and still notice the tag on dense grids.
- Effort: S.
- Prior art and demand: ACF ships a highlight mode ("Red border + banner"). AW issue 18 (owner: "planning to add more display options", https://github.com/seeeeew/aiwarningforsteam/issues/18). AS issue 914 asks for a user-colored border for DRM games and has been open since 2020 (https://github.com/IsThereAnyDeal/AugmentedSteam/issues/914).
- Risk: an outline drawn over varied art. Open question 8 already proposes a tinted outline.
- Rules: compatible. It is a CSS attribute selector on `--sar-kind-color-<id>`. It amends D10 (Show, Dim, Hide) and D11 with a design record, not an ADR.
- Smallest slice: the enum value `highlight` and one rule per kind using the existing color property.

**4. Backup and restore.**
- User value: medium. It protects a curated ignored list and lets it move between the extension and the userscript.
- Effort: M.
- State: D28 designs this, but the catalog has no backup or export keys, so it is not built (verified in `src/locales/en/messages.json`).
- Rules: compatible.
- Smallest slice: export a JSON file and restore it after a preview, on the options page only, merging the game lists as D28 says.

**5. More UI languages.**
- User value: high for reach. Only en and es ship. AW detects in about 33 languages, and SAF ships en, zh-TW and zh-CN.
- Effort: M per locale. Rule 4 requires Steam's own line per kind in each language, so capture it from localized store pages and check it with the canary.
- Rules: compatible (rule 9).
- Smallest slice: one high-traffic locale, such as zh-CN, de or pt-BR, with Steam's lines captured from fixtures.

**6. User text filters inside a kind.**
- Examples: tag DRM only when its text names a word the user types, such as "Denuvo"; exempt some anti-cheat vendors.
- User value: medium-high for DRM-averse users. Evidence: AS issue 2270 (Denuvo Anti-Cheat warning) and issue 1818 (Capcom Enigma); the "Denuvo Watch" curator has 51,934 followers (rq5).
- Effort: M.
- Risk: the DRM and account fields are free text, for example "Denuvo Anti-Tamper" vs "Denuvo Anti-Tampering" (rq5).
- Rules: for DRM, account and anti-cheat it is a filter the user writes, and display stays in Steam's words, so it is likely compatible but needs a design record. For AI notes, exempting texts that mention "upscaling" or "translation" touches rule 4 and D8 (nothing interprets the notes), so it needs an ADR.
- Smallest slice: an optional "only when the text contains" field for the DRM kind.

**7. Touch support on Firefox for Android.**
- User value: medium. `gecko_android` is declared, but the hover card opens only by pointer rest or focus (verified in `src/core/ui/hover-card.ts`). A tap on a chip inside a store link follows the link, so the card cannot be reached on touch (inference, not device-tested). SLOP issue 15 asks for mobile badges.
- Effort: S to M.
- Risk: catching taps inside store links.
- Rules: one delegated listener keeps rule 13.
- Smallest slice: a tap on a chip opens the card and blocks the navigation for that tap only.

**8. "No longer declared" history.**
- Examples: Denuvo removed, AI disclosure removed.
- User value: medium-high for DRM and AI watchers. Evidence: curators keep "removed the AI disclosure" lists (rq4); GamingOnLinux covers Denuvo removals and stale labels (rq5); SLOP issue 12 asked to warn about AI in earlier versions.
- Effort: M to L.
- Risk: storage growth, and a stale label read as "DRM-free".
- Rules: conflicts. It adds a display state beyond rule 4's three and must never read as "none". It needs bounded storage (rule 13). ADR required.
- Smallest slice: the app page banner only. When a stored disclosed verdict for a kind is now not reported, show Steam's line with "listed until <date>" for a fixed window.

**9. Package and bundle page summary.**
- User value: low-medium. AS shows "One or more titles in this package use 3rd-party DRM". Branch `fix/package-page-host` already badges the included rows.
- Effort: S to M. GetItems takes `packageid`/`bundleid` with `include_included_items`, which returns `included_appids` (verified in the proto).
- Rules: compatible.
- Smallest slice: a banner on `/sub/` and `/bundle/` that lists the kinds carried by any included app.

**10. Demos show the full game's tags.**
- Relevance: the README's own Next Fest use case.
- User value: potentially high, unknown in practice. SLOP closed its issue 8 by having demos, soundtracks and DLC follow the base game. The proto has `related_items.parent_appid`, `demo_appid` and `standalone_demo_appid`.
- Unverified: whether a demo's GetItems item carries `parent_appid` or its own `extra_details`, and how often demo IDs appear on surfaces. The fixtures hold no demo item.
- Effort: spike S, then M.
- Rules: rule 4 wording ("declared for the full game") needs a design record. ADR if inherited verdicts are stored.
- Smallest slice: a spike that captures 10 Next Fest demo IDs through `capture-fixtures`.

**11. Steam desktop client notes.**
- User value: medium. AW issue 3 has 12 comments. Users installed the CWS extension inside the client on Windows, Linux and Steam Deck (https://github.com/seeeeew/aiwarningforsteam/issues/3).
- Effort: S, docs only.
- Risk: it reads as official support. The AW owner declined a guide for that reason.
- Rules: compatible.
- Smallest slice: test once, then add a README line under Known gaps: "works, unsupported".

**12. Edge Add-ons listing.**
- User value: low, since Edge installs from the CWS. AS and SDB both list on Edge.
- Effort: S to M.
- Rules: amend ADR 0005.

**13. More Steam-declared kinds from the same response.**
- Candidates: the In-App Purchases category (35 appears in rq2's `feature_categoryids`; the name mapping is unverified), `no_mouse_keyboard_support`, and `steam_deck_compat_category` (`include_platforms`).
- User value: demand unverified in any source read.
- Rules: ADR 0009 and the plan put "tags beyond the seven" out of scope, so ADR required. Low priority.

## 3. Ideas worth credit in the README prior-art section

Credit only what is adopted. Issue requests are credited as requests, not as projects.

- AW and SAGI: a list toggle inside Steam's own search filter block (gap 2).
- ACF: highlight as a list mode (gap 3). It is already credited for the hide-to-highlight fallback.
- RyuuMeow/steam-ai-filter, new and unlisted: click to reveal one hidden card, and an exception button on the card itself. If neither is adopted, list it "for comparison" like Slop-Inator. It is the closest feature competitor.
- AW issue 12 (JomSpoons) and AS issue 1822 (alidan): developer and publisher scope (gap 1).
- AS issue 914 (GlassedSilver): DRM highlighting in lists. The AS maintainer called it blocked by per-page fetches, and batched GetItems removes that block.
- Slop-Inator: DLC, demos and soundtracks following the base game (its closed issue 8). Branch `feat/dlc-inherits-ignore` does the same for ignore. If that idea came from Slop-Inator, the README line "It shaped no part of this project" must change. If it did not, keep the line.
- Doc mismatch to fix: the "Ideas credited" section of `docs/design/decisions.mdx` credits Obvious Steam AI (the dismissible banner) and the SteamDB extension (a block in the summary box), and the README names neither. The SteamDB credit was for the summary row that D50 removed, so it can go. The Obvious Steam AI credit still applies to the banner.

## 4. Positioning: what competitors do badly that we already avoid

- **Per-row page fetches vs one batched call.** AW, SAGI, ACF, SLOP and SAF fetch one store page per unseen game. The AS maintainer declined DRM list highlighting for exactly this cost (issue 914). We tag lists for 7 kinds with 1 request per 50 games.
- **Localized heading tables break.** AW broke in Russian (issue 1) and French (issue 13), needed Malay added (issue 5), and has an open canary request (issue 4). We read language-neutral fields and canary the shape.
- **Negatives cached from gated pages.** AW and ACF cache "no disclosure" from any answer (verified code), so an age gate or redirect becomes a false negative for 7 days. We keep `unknown` and never store it as not disclosed.
- **Language bugs.** ACF matches an English string on a page fetched without `?l=english`, so non-English store users likely get misses (inference from code).
- **Cookies and account writes.** SAF sends lookups with `credentials: "include"` and can auto-ignore games on the user's account (its own README warns about Subscriber Agreement and ban risk). AW, ACF and SLOP use the default fetch credentials. We omit cookies and never touch the account.
- **Third-party lists.** SAGI fetches a SteamDB-sourced list from GitHub every 24 h, and SteamDB's FAQ forbids republishing its data (rq4). It also never checks IDs below its highest listed ID. SLOP ships CC BY-SA hand-curated data for 144 games.
- **Judging copy.** SAGI says "Uses AI", ACF "[AI CONTENT USED]", SLOP shows "human" badges inferred from a game not updated since 2022-11-30, and SAF shows a green check when nothing matched. We use Steam's words, name the developer as the source, and show nothing for not reported.
- **Blocking modal.** AW issues 2 (long text pushes Close off screen) and 20 (the popup disappears, users want an always-visible element) and the AS 1913 comments (users want a banner like the DRM notice). Our non-blocking banner plus the tag section under user tags already answers issue 20.
- **Coverage.** AW runs only on app and search pages (manifest), with open asks for category pages, wishlist (issue 10), sale pages (issue 15) and suggestions (issue 7). We cover all of them. AW also has no settings (issue 8).
- **Permissions.** We ask for `storage` only. SAF asks for host_permissions and alarms and runs a service worker, ACF runs a service worker, and SDB and AS take host access. SLOP exposes web-accessible resources to every site and extension (`wxt.config.ts`), which lets sites fingerprint it.
- **Breadth.** Every AI competitor is single-kind. AS covers DRM only, by keyword, on app and sub pages. No tool found tags KLAC, anti-cheat, account, EULA or PvP in lists, and a search for an anti-cheat badge extension found none.
- **Distribution.** SAF installs as a RAR or load-unpacked build, Chrome only. SAGI installs from GitHub raw only.

## 5. What to deliberately not build

- **Steam account actions** (Steam's Ignore from our UI, auto-ignore). Demand is real (AW issues 6, 11, 21; SAF ships it). It needs a session ID and cookies, which breaks rule 1 (`credentials: "omit"`) and D9, and carries Subscriber Agreement risk. Keep our button next to Steam's own.
- **Seed lists and community datasets** (SteamDB tag, SAGI's `appids.json`, SLOP data, AreWeAntiCheatYet, PCGamingWiki, ProtonDB). These break rule 1 and add license risk: SteamDB forbids republishing, SLOP data is share-alike, and PCGamingWiki is NC-SA with `cargoquery` blocked for anonymous users (rq5).
- **Keyword categories shown as labels** (SAF's art, music, voice and so on). They paraphrase and rate the developer's text against rule 4 and D8, and SAF itself warns of false matches. A user-written filter is a different thing (gap 6) and needs an ADR for AI.
- **"Human-made" or "AI-free" inference** from update dates (SLOP) and green "no match" checks (SAF). Both break rule 4.
- **Heuristic detection of undeclared AI or DRM** (AS issue 1955 asks to scan EULAs for Denuvo; AS scans page text by keyword). Rule 4 limits tags to what the developer declared.
- **LLM summaries.** AS's VaporLens drew a backlash and an AI kill switch (AS `changelog.yml` 4.5.1 and 4.6.0). It contradicts the product's audience.
- **Blur and modal UIs.** These are the main complaint against AW.
- **steamcommunity.com surfaces**, such as curator reviews in the activity feed (AW issue 9). They break rule 3 (one content-script match) and rule 1. Revisit only by ADR.
- **ProtonDB and Deck badges, prices, ITAD.** Out of scope. ProtonDB is a third-party host, and Steam already shows Deck status.
- **Outbound buttons with the app ID** (SteamDB, PCGamingWiki, AreWeAntiCheatYet). Under a strict reading of rule 1, the app ID leaves for a third-party host on click. An ADR is needed if wanted, and the value is low.

## Open items and limits

- Install counts and reviews come from rq4 (AMO and the CWS are unreachable here). Chrome counts are unverified.
- The SAF app page display and its credential behavior on other paths were not traced further. "AI Slop Filter for Steam" (heuristic) was not found on GitHub, so it is unverified.
- Gap 10 (demos) and the payload of gap 1 (`include_basic_info`) need a live GetItems probe, which this container cannot make.
