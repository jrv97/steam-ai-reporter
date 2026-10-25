# RQ5: What do Steam's fields miss, and how do other tools cover it?

Researched 2026-10-24. Every fetch went through a small summarising model; quoted values are what that model reported from the page. Tags: `verified from source` means the primary page, file or API response was fetched and the claim read from it; `search-summary` means a search result snippet only; `unverified` means no source was reached. Project rules (Valve hosts only at runtime, no seed lists) are not argued here; the note records facts about fields and datasets.

## Answer in short

- Steam stores the four kinds as developer-typed fields in the store item (`extra_details`): `anticheat` (with a `kernel_mode` flag), `drm_third_party_type`, `user_account_third_party` and `eula`. Valve says it checks anti-cheat declarations at release and will contact developers of existing games; nothing is detected from the game files. An absent key can mean "not declared" or "none", and the two cannot be told apart.
- Gaps seen first-hand on 2026-10-24: Elden Ring and Rainbow Six Siege have no `anticheat` key although AreWeAntiCheatYet lists Easy Anti-Cheat for Elden Ring and Valve's own Steam Deck report flags an unsupported anti-cheat for Siege; Battlefield 6, Call of Duty and PUBG say `kernel_mode` true with no vendor name; Marvel Rivals has an empty `anticheat` object; DOOM: The Dark Ages still carries a Denuvo string months after reports of its removal. The DRM and account fields are free text ("Denuvo Anti-Tamper" vs "Denuvo Anti-Tampering").
- The Steam Deck report (`ajaxgetdeckappcompatibilityreport?nAppID=<id>`) returns anti-cheat tokens only for tested apps with an unsupported result (seen: `UnsupportedAntiCheat_Other`, `UnsupportedAntiCheatConfiguration`). It says "does not work on Linux" and never "kernel-level"; an untested app returns category 0 with empty item arrays.
- Community data: AreWeAntiCheatYet (MIT, `games.json`, 469,569 bytes, 1,167 games, about 59 percent with a Steam ID, about 60 distinct anti-cheat spellings, no kernel field) and the GamingOnLinux anti-cheat table (271 games, Steam app IDs, no kernel field, no license shown) track Linux compatibility. PCGamingWiki (CC BY-NC-SA 3.0) has a `Middleware.Anticheat` string and `Availability.Uses_DRM`, but anonymous `cargoquery` returned `permissiondenied`. No Wikipedia list, no machine-readable Denuvo list and no launcher-requirement list was found; the Steam curator "Denuvo Watch" is the one maintained Denuvo tracker found.
- Kernel status is explicit only in Steam's own `kernel_mode` flag. Every community source requires deriving it from a vendor name. Easy Anti-Cheat, BattlEye, FACEIT and Vanguard are documented kernel drivers; Ricochet, nProtect GameGuard, XIGNCODE3 and Denuvo Anti-Cheat rest on press or vendor statements; Steam's data flags Javelin as kernel-level for Battlefield 6 while EA's page never says it.

## Findings

### 1. What Steam holds per kind (the declared fields)

The reverse-engineered `StoreItem_ExtraDetails` message defines, among others: `drm_third_party_type` (field 5, optional string), `drm_activation_limit` (6, string), `user_account_third_party` (7, string), `user_account_third_party_link_to_steam` (8, bool), `anticheat` (9, message) and `eula` (10, repeated message with `name` and `url`) (verified from source: https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/common.proto, read at offset 200000).

`StoreItem_ExtraDetails_Anticheat` has `kernel_mode` (1, bool), `uninstall_completely` (2, bool), `boot_protection` (3, bool), `boot_protection_name` (4, string), `name` (5, string) and `name_loc` (6, string) (verified from source: same URL). The type name is `Anticheat` with a lowercase c.

There is no Steam store tag for any of the four kinds. The tag list returned 446 tags; a name search for cheat, kernel, DRM, Denuvo, EULA, launcher, account and always online matched only "Online Co-Op" (3843) (verified from source: https://api.steampowered.com/IStoreService/GetTagList/v1/?language=english). The one anti-cheat store category is id 8, "Valve Anti-Cheat enabled", seen on Counter-Strike 2 (verified from source: https://store.steampowered.com/api/appdetails?appids=730&filters=categories&l=english). That category covers Valve's own VAC only.

### 2. Valve's anti-cheat declaration rule

- Valve announced it in a Steamworks group post titled "New Tool for Describing Anti-Cheat in Games" (verified from source for the title only; the fetch returned navigation text without the body: https://steamcommunity.com/groups/steamworks/announcements/detail/4547038620960934857).
- GamingOnLinux, 2024-10-30: developers must list kernel-level anti-cheat on the store page; disclosure is mandatory only for kernel-level anti-cheat and optional for other client-side or server-side anti-cheat; existing games are covered; Valve will check games during the release process for present and accurate notices; older games that leave components after uninstall will be noted (verified from source: https://www.gamingonlinux.com/2024/10/steam-games-will-now-need-to-fully-disclose-kernel-level-anti-cheat-on-store-pages/).
- PCGamesN, 2024-10-31: the flag sits next to the existing DRM and third-party launcher notices; kernel-level shows in gold and other anti-cheat in blue in Valve's images; Valve will review older games with missing data; no effective date given ("soon") (verified from source: https://www.pcgamesn.com/valve/kernel-anti-cheat-flags).
- Search coverage adds a pre-populated vendor list with custom entries, two checkboxes (kernel-level integration, residual files after uninstall) and an exemption for server-side systems with no client software (search-summary: https://www.gamingonlinux.com/2024/10/steam-games-will-now-need-to-fully-disclose-kernel-level-anti-cheat-on-store-pages/page=1/).
- The Steamworks store editing doc lists an "Anti-Cheat Declaration" field under Basic Info ("Share anti-cheat information about your game") and says nothing about kernel level, boot protection, DRM, EULA or accounts (verified from source: https://partner.steamgames.com/doc/store/editing).
- No source found describes Valve verifying a declaration beyond that release-process check, and none reports a penalty for a wrong one (unverified).

### 3. Gaps between what Steam declares and what ships (documented cases)

All Steam values below come from `IStoreBrowseService/GetItems` with `include_extra_details`, read on 2026-10-24 through the summariser. Where a case matters it was read twice (single-app and batch). The proto fields are `optional`; a missing key means unset.

Anti-cheat missing or incomplete:

- Elden Ring (1245620): the `extra_details` key list has `eula` and no `anticheat` (verified from source, read twice: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A1245620%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D). AreWeAntiCheatYet lists the game as Supported with Easy Anti-Cheat and Steam ID 1245620 (verified from source: https://areweanticheatyet.com/game/elden-ring). Easy Anti-Cheat loads a kernel driver per a 2024 academic study (section 8), but neither source says the driver is active in this game.
- Rainbow Six Siege (359550): no `anticheat` key, only `user_account_third_party` "Ubisoft Connect launcher" (verified from source, read twice: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A359550%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D). Valve's own Deck report for the same app carries `#SteamDeckVerified_TestResult_UnsupportedAntiCheatConfiguration` (verified from source: https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=359550). Two Valve surfaces therefore disagree. A search snippet says BattlEye protects Siege (search-summary: https://alternativeto.net/software/battleye).
- Battlefield 6 (2807960), Call of Duty (1938090) and PUBG (578080): `kernel_mode` true with no `name` and no `name_loc`. Battlefield 6 and Call of Duty also carry `boot_protection` true and `boot_protection_name` "secureboot_tpm2" (verified from source, single batch read: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A1808500%7D%2C%7B%22appid%22%3A1245620%7D%2C%7B%22appid%22%3A1172470%7D%2C%7B%22appid%22%3A2807960%7D%2C%7B%22appid%22%3A730%7D%2C%7B%22appid%22%3A578080%7D%2C%7B%22appid%22%3A359550%7D%2C%7B%22appid%22%3A1085660%7D%2C%7B%22appid%22%3A2767030%7D%2C%7B%22appid%22%3A381210%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D; Call of Duty comes from the second batch below). The vendor name is optional in practice; Javelin and Ricochet do not appear by name in Steam's data for these games.
- Marvel Rivals (2767030): `anticheat` is the empty object `{}` (verified from source, same batch URL). AreWeAntiCheatYet lists NetEase Game Security for the same Steam ID (verified from source: https://areweanticheatyet.com/game/marvel-rivals).
- On Counter-Strike 2 (VAC) the `kernel_mode` key is unset (verified from source, same batch URL). A consumer cannot tell "not kernel" from "not declared".

Third-party DRM:

- DOOM: The Dark Ages (3017860) returned `drm_third_party_type` "Denuvo Anti-Tamper" on 2026-10-24 (verified from source, second batch: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A1771300%7D%2C%7B%22appid%22%3A3017860%7D%2C%7B%22appid%22%3A2515020%7D%2C%7B%22appid%22%3A1778820%7D%2C%7B%22appid%22%3A990080%7D%2C%7B%22appid%22%3A2050650%7D%2C%7B%22appid%22%3A1938090%7D%2C%7B%22appid%22%3A553850%7D%2C%7B%22appid%22%3A1174180%7D%2C%7B%22appid%22%3A271590%7D%2C%7B%22appid%22%3A2215430%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D). GamingOnLinux reported on 2026-07-13 that Steam forum and Reddit reports say Denuvo was removed while the store page "still" states it, and that the Digimon Story Time Stranger page was corrected (verified from source: https://www.gamingonlinux.com/2026/07/doom-the-dark-ages-and-digimon-story-time-stranger-have-denuvo-drm-removed/). Whether Denuvo is present in the shipped build today was not established.
- Hogwarts Legacy (990080) returned "Denuvo Anti-Tampering", a different string from DOOM's "Denuvo Anti-Tamper" (verified from source, second batch URL above). The field is free text; matching needs normalisation.
- Final Fantasy XVI (2515020) has no DRM string, consistent with the Denuvo removal GamingOnLinux reported in March 2025 (verified from source for the empty field, second batch URL; the 2025 report was seen as a search result only: https://www.gamingonlinux.com/2025/03/final-fantasy-xvi-removed-denuvo-anti-tamper/page=1/).
- Older undisclosed cases, all from search summaries: Denuvo found in Sword Art Online Fatal Bullet, NieR: Automata and Code Vein without a store-page mention, the notice sitting in the EULA instead, and a reverse case where Persona 5 Strikers listed Denuvo although the downloadable build lacked it. Which DSOGaming article covers which game is not known (search-summary: https://www.dsogaming.com/?p=151436, one of several DSOGaming results). A claim that Kingdom Come: Deliverance 2 lacked a Denuvo label at launch came from an article that returned HTTP 403 on fetch (search-summary: https://itc.ua/en/news/kingdom-come-deliverance-2-will-get-denuvo-list-on-steam). The Steam value for that app is empty today (verified from source, second batch URL), which does not show whether it ever had Denuvo.

Third-party account or launcher:

- The field is free text with no vocabulary: "EA Account" (Apex Legends, 1172470), "EA Account linking required" (Battlefield 6), "Activision Account" (Call of Duty), "PlayStation Network" (HELLDIVERS 2, 553850), "Rockstar Games" (Red Dead Redemption 2, 1174180, and GTA V Legacy, 271590), "Ubisoft Connect launcher" (Siege) and "PlayStation Network (Online Multiplayer, PlayStation overlay)" (Ghost of Tsushima, 2215430). `user_account_third_party_link_to_steam` was true for all of them (verified from source, batch URLs above).
- The text can carry an "optional" scope (the Ghost of Tsushima string names online multiplayer and the overlay); a non-empty value does not mean the account is required to play (verified from source for the string, second batch URL; the interpretation is mine).
- Forum users name games that gained a launcher or account after release (GTA V, Stellaris, DOOM Eternal's Bethesda account) and say some store pages omit the notice (search-summary: https://steamcommunity.com/discussions/forum/10/601901188455074095/). No documented, dated case of Valve correcting a missing third-party account label was found (unverified).
- Destiny 2 (1085660) returned no `user_account_third_party` (verified from source, first batch URL). Whether it should have one was not checked.

EULA:

- `eula` is a repeated name and URL, hosted at `store.steampowered.com/eula/<appid>_eula_<n>`: Elden Ring has two (English and JP), ARC Raiders one (verified from source, GetItems reads above). Counter-Strike 2 has none (verified from source, first batch URL). The proto has no flag for "third-party" EULA; whether an entry is a third-party license (for example a vendor's anti-cheat or middleware EULA) must be read from the document text. No dataset of third-party EULA presence was found (unverified).

### 4. Steam's own anti-cheat compatibility signal: the Deck report

- Endpoint `https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=<id>` returns JSON with `appid`, `resolved_category`, `resolved_items[]` (each `display_type` and `loc_token`), and parallel `steamos_*`, `machine_*` and `frame_*` pairs (verified from source: https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=1172470).
- Apex Legends (1172470): category 1 with `#SteamDeckVerified_TestResult_UnsupportedAntiCheat_Other`, and the matching `#SteamOS_...` and `#SteamMachine_...` tokens; the `frame_*` pair held `#SteamFrame_TestResult_UnsupportedAntiCheatConfiguration` (verified from source, URL above).
- Rainbow Six Siege (359550): category 1 with `#SteamDeckVerified_TestResult_UnsupportedAntiCheatConfiguration` (verified from source: https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=359550).
- Battlefield 6 (2807960): category 1 with `#SteamDeckVerified_TestResult_SteamOSDoesNotSupport`, which is not an anti-cheat token, while Steam's store data for the app says kernel anti-cheat with Secure Boot (verified from source: https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=2807960).
- Elden Ring (1245620): category 3, four Deck test items (controller, glyphs, text legibility, performance) and no anti-cheat item, though Easy Anti-Cheat is listed for it elsewhere (verified from source: https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=1245620).
- Untested app (5072580): all four `*_resolved_category` values 0 and empty item arrays (verified from source: https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=5072580).
- Coverage rule: the report exists only for apps Valve has tested; it names a result for Linux-based Valve devices and carries no vendor and no "kernel-level" wording. Valve's Deck doc says some anti-cheat providers are currently unsupported and that an unsupported provider yields the Unsupported category (verified from source: https://partner.steamgames.com/doc/steamdeck/compat). The page did not use the word kernel (verified negative, same URL). Valve's Proton statement that kernel-space anti-cheat is unsupported was not located (unverified).
- "One app per call" is the observed usage (every call above took one `nAppID`); whether the endpoint accepts a list is unverified.
- Category numbers seen: 0, 1 and 3 for the main category, and 2 for `steamos_resolved_category` on Elden Ring. The usual mapping (0 unknown, 1 unsupported, 2 playable, 3 verified) fits these values and no page read states it (unverified).

### 5. AreWeAntiCheatYet

- Repository `AreWeAntiCheatYet/AreWeAntiCheatYet`, default branch `master`, created 2021-10-09, pushed 2026-10-24T13:22:19Z, 511 stars, description "A comprehensive and crowd-sourced list of games using anti-cheats and their compatibility with GNU/Linux or Wine" (verified from source: https://api.github.com/repos/AreWeAntiCheatYet/AreWeAntiCheatYet). License MIT, copyright Starz0r and Curve, 2021 (verified from source: https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/master/LICENSE). The LICENSE is repo-wide; no separate data license was seen (unverified).
- Format and size: `games.json` at the repo root, a JSON array of objects, 469,569 bytes (verified from source: https://api.github.com/repos/AreWeAntiCheatYet/AreWeAntiCheatYet/contents/). Keys: `url`, `name`, `logo`, `native`, `status`, `reference`, `anticheats` (array of strings), `notes` (array of text and link pairs), `updates` (array of name, date, reference), `storeIds` (object), `slug`, `dateChanged` (verified from source: https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/master/games.json).
- Hosting and cadence: raw JSON on raw.githubusercontent.com; the site is a Next.js app (`next.config.js` in the repo listing) rebuilt on each commit, with an RSS feed at https://areweanticheatyet.com/feed.rss; changes arrive through GitHub issues (verified from source: https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/master/README.md). The repo was pushed to on the day it was read.
- Size: 1,167 games on the front page: Supported 196, Running 278, Planned 2, Broken 638, Denied 53 (verified from source: https://areweanticheatyet.com/). Reading the whole file in five chunks gave 179, 230, 280, 284 and 190 complete entries, 1,163 in total, which matches within the partial entries at chunk edges (manual tallies by the summariser; verified from source: https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/master/games.json, offsets 0 to 400000).
- Steam app ID coverage: `storeIds` is an object keyed by store; the Steam value is a string app ID (`"steam": "976730"`), Epic is `{namespace, slug}`, and some entries are empty. Counting entries with a non-empty Steam value in each chunk gave 152, 154, 173, 129 and 79, about 687 of 1,163 or 59 percent (manual tallies, treat as plus or minus a few; same URL). The status field holds Linux/Proton compatibility and the file has no kernel field.
- Kernel status: not stored. The only anti-cheat information is the vendor string in `anticheats`; kernel status has to be derived from the name (verified from source: key list above).
- The file also records games from other stores; a Steam-scoped consumer would filter on `storeIds.steam` (verified from source: same URL).

### 6. GamingOnLinux anti-cheat table, PCGamingWiki and other datasets

GamingOnLinux anti-cheat table (https://www.gamingonlinux.com/anticheat/):

- Lists 271 games "with some form of anti-cheat". Columns are Game Title, Compatibility (Works, Broken, Single Player Only, Steam Deck / SteamOS only, Reports Needed), Developer and Anti-Cheat Used. Entries link to an item page carrying the Steam app ID. Per-entry "Updated" timestamps fall in October 2026. There is an RSS feed and a "Report Changes" link for user submissions. No kernel field, no API or export and no license were shown (verified from source for the first 100,000 of 120,438 characters: https://www.gamingonlinux.com/anticheat/).
- Vendor filter pages exist, for example Bellring Anti-Cheat with one game and no kernel flag (verified from source: https://www.gamingonlinux.com/anticheat/vendor/bellring-anti-cheat/). Search snippets of older snapshots counted 226 and 231 games; the table grows over time (search-summary: https://www.gamingonlinux.com/anticheat/).

PCGamingWiki (PCGW):

- License: CC BY-NC-SA 3.0 per the Wikipedia infobox; about 48,000 content pages in October 2022; the Wikipedia article says nothing about an API (verified from source: https://en.wikipedia.org/wiki/PCGamingWiki).
- Cargo tables listed by the API: AI, API, Audio, Availability, Cloud, Company, Controller, Engine, GFWL, Game, GameData, GameEngine, Input, L10n, Middleware, Mods, Multiplayer, SafeDisc, Software, StarForce, StoreFeature, StoreKeys, Tags, VR, Video, XDG, `_pageData` and some internal PCGW_* tables (verified from source: https://www.pcgamingwiki.com/w/api.php?action=cargotables&format=json).
- Relevant fields: `Game.Steam_AppID` (string, list with comma delimiter), `Middleware.Anticheat` (string) and `Middleware.Removed_Anticheat`, `Availability.Uses_DRM`, `Availability.Removed_DRM` and one DRM field per store such as `Steam_DRM` (verified from source: https://www.pcgamingwiki.com/w/api.php?action=cargofields&table=Game&format=json, and the same URL with `table=Middleware` and `table=Availability`). None of the three tables read has a field for a third-party launcher or account, a EULA or kernel mode; other tables were not read.
- Access: anonymous `cargoquery` calls returned `{"error":{"code":"permissiondenied","info":"You don't have permission to run arbitrary Cargo queries."}}` for four different queries on 2026-10-24, while `cargotables` and `cargofields` answered (verified from source: https://www.pcgamingwiki.com/w/api.php?action=cargoquery&tables=Middleware&fields=_pageName%3DPage%2CAnticheat&where=Anticheat%20IS%20NOT%20NULL&limit=5&format=json). A PCGW forum post reports the same message for logged-out visitors and names the groups that can run such queries (search-summary: https://community.pcgamingwiki.com/topic/5740-list-of-games-that-support-xinput-compatible-controllers-page-is-broken/). The api.php help page cites a usage-etiquette document that was not retrieved (verified from source: https://www.pcgamingwiki.com/w/api.php). Other PCGW pages returned HTTP 403 to the fetcher.
- Row counts, update cadence and Steam app ID coverage: not found (unverified). A community thread says editors sometimes record a store's DRM option without validating it, and that PCGW records "DRM-free*" by hand (search-summary: https://community.pcgamingwiki.com/topic/6230-drm-listing-question).

SteamDB:

- SteamDB change logs reportedly record when a game adds or removes a third-party DRM line, for example a Resident Evil 3 entry "Removed 3rd-Party DRM - Denuvo Anti-tamper" (search-summary: https://www.pcgamesn.com/resident-evil-3/denuvo). The SteamDB pages needed to confirm an anti-cheat or DRM listing, a search or a tag could not be read (the AI-disclosure research recorded HTTP 403 for steamdb.info). No SteamDB anti-cheat list was found (unverified).

Wikipedia:

- The Denuvo article names about 27 protected titles in prose, with no table and no app IDs, and was last edited 2026-10-16 (verified from source: https://en.wikipedia.org/wiki/Denuvo). It records Denuvo Anti-Cheat as announced in March 2019 and first used by DOOM Eternal in May 2020, and does not say whether it is a kernel driver (verified from source, same URL). No Wikipedia list of games by anti-cheat or by DRM was found (unverified; only this article and the PCGW and GameGuard articles were read).

Denuvo trackers:

- Steam curator "Denuvo Watch" (https://store.steampowered.com/curator/26095454) reads as tracking Denuvo Anti-Tamper games on Steam, with 51,934 followers, review-type filters (148 Informational, 293 Not Recommended; the Recommended count was unreadable) and two lists of games that had Denuvo removed; the newest entry date shows no year (verified from source: https://store.steampowered.com/curator/26095454). A 2023 forum thread calls it "Denuvo Games" (search-summary: https://steamcommunity.com/discussions/forum/0/4030223299342092022). Whether a machine-readable endpoint for curator lists exists was not checked (unverified).
- gamestatus.info answered with an Anubis bot-protection page; its content is unknown (verified from source for the block: https://gamestatus.info/). CrackWatch (a 2020 article) and a pinned list on r/crackwatch are named in secondary posts, with a warning that the list colour-codes "Denuvo removed" and "cracked" alike (search-summary: https://gigazine.net/news/20200917-crackwatch/ and https://lemmy.linuxuserspace.show/comment/812316). Current status of both is unverified. One unsourced comment puts 229 Denuvo releases since 2020, fewer than 30 cracked and 119 with Denuvo removed (search-summary, unreliable: https://lemmy.linuxuserspace.show/comment/812316).
- No GitHub JSON of Denuvo games with Steam IDs turned up in the search (unverified).

Launcher or account requirement lists:

- No maintained list of games that require an EA app, Ubisoft Connect, Rockstar or PSN account was found; the search returned PCGW's DRM-free lists (the inverse) and forum threads (search-summary: https://steamcommunity.com/discussions/forum/10/601901188455074095/). Steam's own `user_account_third_party` is the only per-app source found.

### 7. Vendor-name coverage: Steam's field versus the community lists

Steam side:

- `anticheat.name` is an optional string and `name_loc` a localisation token (section 1). Tokens observed in the 21 apps sampled: `#Store_AntiCheat_Type_easyac` (Apex Legends, Dead by Daylight, HELLDIVERS 2) with name "Easy Anti-Cheat"; `#Store_AntiCheat_Type_battleye` (Destiny 2, GTA V Legacy) with name "BattlEye"; `#Store_AntiCheat_Type_vac` (Counter-Strike 2) with name "VAC (Valve Anti-Cheat)"; and `#Store_AntiCheat_Type_denuvo` (ARC Raiders) with name "Denuvo" and `kernel_mode` true (verified from source, reads in section 3; the ARC Raiders record was read twice with the same result: https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A1808500%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D).
- The full pre-populated list of Steam vendor tokens was not found. Searches for the `Store_AntiCheat_Type_` strings returned nothing, and the Steamworks docs name no vendors (verified negative for https://partner.steamgames.com/doc/store/editing and https://partner.steamgames.com/doc/features/anticheat). Tokens for Vanguard, Javelin, Ricochet, FACEIT, nProtect and XIGNCODE3 were not seen; the games that use Javelin and Ricochet carry no name at all (section 3).

Community side, distinct names:

- AreWeAntiCheatYet `anticheats` strings, merged from the five chunk reads (summariser tallies, about 60 spellings; verified from source: https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/master/games.json): Easy Anti-Cheat, BattlEye, Vanguard, Hyperion, Arbiter, FairFight, EA anticheat, Zakynthos, UNCHEATER/Uncheater, VAC/Valve Anti-Cheat, XIGNCODE3, PunkBuster/Punkbuster, Treyarch Anti-Cheat, FACEIT, ESEA, NEAC Protect, miHoYo Protect, nProtect GameGuard, RICOCHET/Ricochet, Denuvo Anti-Cheat, EQU8, Anti-Cheat Expert, Nexon Game Security, Mail.ru Anti-Cheat, SARD, X-Trap, Saberclaw, EMAC LAB, Warden, Crackproof/CrackProof, WFSDrv, AhnLab HackShield, AnyBrain, NetEase Yidun, NetEase Anti-Cheat Expert, NetEase Game Security, KSophon, GuardenAC, IronShield, Tavern, ESL Wire, Esportal, MY.GAMES Anti-Cheat, Proxima Game Anti Cheat, Seasun Protect, VIOLET, Active Anticheat, 4game Guard / Frost Security, Arkos, TenProtect, Fredaikis Anti-Cheat, RedKard, SCUE4, Packman, GuardingPearSoftware's Anti Cheat Pro, ROO In-House Anti-Cheat, PlayStation Overlay, Anti-Cheat Solution, Cheat Blocker, R6 ShieldGuard, Enforcer, and "Unknown (Custom)" / "Custom (Unknown)". Case and spelling variants exist; exact-match lookups would miss entries.
- "Javelin" does not appear in the AreWeAntiCheatYet strings read; EA's system is stored as "EA anticheat" (verified from source: the Battlefield 2042 entry in the first chunk of the same file). Ricochet, Vanguard, FACEIT, nProtect GameGuard, XIGNCODE3 and Denuvo Anti-Cheat do appear.
- GamingOnLinux table vendor names: Easy Anti-Cheat, BattlEye, RICOCHET Anti-Cheat, Vanguard, Anti-Cheat Expert (ACE), Valve Anti-Cheat (VAC), EA Javelin Anticheat, PunkBuster, XIGNCODE3, nProtect GameGuard, Denuvo Anti-Cheat, NEAC Protect, Nexon Game Security, Treyarch Anti-Cheat, Hyperion, miHoYo Protect, GamersFirst Anti-Cheat, Bellring Anti-Cheat, Defense Matrix, RedKard, Ironshield, Arbiter, Broken Arrow Anti-Cheat System, Uncheater, EXens, NetEase Yidun, plus "Unknown" (verified from source for the first 100,000 characters: https://www.gamingonlinux.com/anticheat/). This list names Javelin and AreWeAntiCheatYet does not.
- PCGW `Middleware.Anticheat` is a plain string field; sample values were not retrieved because `cargoquery` is blocked (section 6).

### 8. Which vendors are kernel-mode, and how that is known

Kernel-mode status per vendor, with the strength of the evidence:

- BattlEye: loads the kernel driver BEDaisy.sys, mandatory on server and client, started with the game (verified from source: https://arxiv.org/html/2408.00500v1). Steam: `kernel_mode` true on Destiny 2 and GTA V Legacy (verified from source, batch URLs in section 3).
- Easy Anti-Cheat: loads a kernel driver (unnamed in the paper), started with the game (verified from source: https://arxiv.org/html/2408.00500v1). A search snippet of unclear origin says EAC runs in user space under Wine or Proton on Linux (unverified). Steam: `kernel_mode` true on Apex Legends, Dead by Daylight and HELLDIVERS 2 (verified from source, batch URLs).
- FACEIT Anti-Cheat: kernel driver FACEIT.sys, loads at boot, needs TPM 2.0, DEP and Secure Boot (verified from source: https://arxiv.org/html/2408.00500v1). No Steam token seen.
- Vanguard (Riot): kernel driver vgk.sys, loads at boot, the game refuses to start without it (verified from source: https://arxiv.org/html/2408.00500v1). Steam coverage not checked (unverified).
- Javelin (EA): EA's Secure Boot page (2025-08-04) calls Javelin customizable, says Secure Boot is required for Battlefield 6 on PC and lists kernel-level cheats among threats, but does not say Javelin runs in the kernel (verified from source: https://www.ea.com/games/battlefield/battlefield-6/news/secure-boot-information). A German report calls it kernel-based (search-summary: https://www.igorslab.de/battlefield-6s-anti-cheat-javelin-hat-bereits-330-000-cheater-gebannt-und-begruendet-die-pflicht-von-secure-boot/). Steam's Battlefield 6 record says `kernel_mode` true (verified from source, first batch URL).
- Ricochet (Activision): Activision announced a PC kernel-level driver in October 2021, first for Warzone, running only while a Call of Duty game plays (search-summary: https://www.thesixthaxis.com/2021/10/14/cod-vanguard-warzone-ricochet-anti-cheat-revealed-with-controversial-kernel-level-pc-driver/). Activision's support page says Ricochet moved to a unified security platform with Modern Warfare II; the current driver state was not confirmed (search-summary: https://support.activision.com/content/atvi/support/web/en/articles/ricochet-overview.html). Steam's Call of Duty record says `kernel_mode` true with Secure Boot and TPM 2.0 (verified from source, second batch URL).
- nProtect GameGuard: Wikipedia says it "uses rootkits" and cites a driver file npptnt2.sys tied to a privilege-escalation flaw; the article does not use the words kernel mode (verified from source: https://en.wikipedia.org/wiki/GameGuard). Treat as kernel-driver based (inference).
- XIGNCODE3 (Wellbia): a CVE record for a privilege-escalation flaw in the xhunter1.sys kernel driver, and a game-specific test that saw the driver start with the game and stop after exit (search-summary: https://vulnerability.circl.lu/vuln/cve-2026-3609 and https://trovesaurus.com/xigncode3).
- Denuvo Anti-Cheat: Denuvo's own Q&A argues kernel-mode drivers are needed and says Denuvo follows Microsoft's guidance (search-summary: https://irdeto.com/denuvo/qa-about-denuvo-anti-cheat-and-windows-kernel-mode-drivers). Steam's ARC Raiders record says name "Denuvo" with `kernel_mode` true (verified from source, ARC Raiders read in section 7). No independent analysis of the driver was found.
- VAC: Valve's anti-cheat; the Steam record for Counter-Strike 2 has name and token and no `kernel_mode` key (verified from source, first batch URL). No source read states VAC is user-mode (unverified).
- Hyperion, PunkBuster, FairFight, ESEA, Treyarch Anti-Cheat, miHoYo Protect, NetEase Game Security, Anti-Cheat Expert and EQU8: kernel status not researched (unverified).

Two limits shape any vendor-to-kernel map. The academic paper studies four systems only and records that a kernel driver may start at boot or with the game (verified from source: https://arxiv.org/html/2408.00500v1). A vendor can ship user-mode and kernel-mode variants, and a game can run the vendor in a reduced mode, so a vendor name proves less than Steam's per-game `kernel_mode` flag (inference).

## Caveats and version notes

- Fetch method: pages were summarised by a small model. Values from the `GetItems` JSON (Steam `anticheat`, DRM and account strings) are what the model reported. The Elden Ring, Rainbow Six Siege and ARC Raiders records were each read twice with matching results; the other apps were read once in two batches. Re-read raw JSON with a shell request or devtools before relying on any single string.
- All Steam values were read on 2026-10-24 for the US store in English. Per-country, per-language and per-login variation was not tested. Whether `name_loc` resolves to a different display string by language is unverified.
- The Steamworks announcement body, SteamDB, gamestatus.info and most PCGW pages were not readable (navigation only, HTTP 403 or bot protection). Claims that rest on them are marked.
- AreWeAntiCheatYet counts are manual tallies across five reads of one 469,569-byte file; entries split across chunk boundaries were skipped. The site and file change daily.
- The sample of 21 Steam apps is small and picked by recognisable names; it shows that gaps exist and gives no estimate of their rate.
- Valve's wording is "check" for declarations; no page read documents enforcement or a penalty for a wrong declaration.
- Dates: Valve's anti-cheat rule is from 2024-10-30; the Steam, AreWeAntiCheatYet, GamingOnLinux and PCGW readings are from 2026-10-24. Changes around 2026-10-22 (RQ3) were not examined here.
- The sources behind the search-summary tags were not opened.

Not answered:

- The full list of vendor tokens in Steam's pre-populated anti-cheat picker: no page or localisation file found.
- PCGW row counts and anti-cheat or DRM values: anonymous `cargoquery` is blocked.
- SteamDB's own DRM or anti-cheat data: pages returned 403.
- Any machine-readable Denuvo or launcher-requirement list: none found.
- Kernel status for VAC, Hyperion, PunkBuster, FairFight and the East Asian vendors: not researched.
- Valve's Proton or Deck statement on kernel anti-cheat: the Deck doc fetched does not contain it.

## Sources

- https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/common.proto: reverse-engineered proto; `StoreItem_ExtraDetails`, `Anticheat`, `Eula` fields.
- https://api.steampowered.com/IStoreBrowseService/GetItems/v1 (URLs inline): store item JSON with `include_extra_details`; first-hand field values for 21 apps.
- https://api.steampowered.com/IStoreService/GetTagList/v1/?language=english: Steam tag list (446), no anti-cheat, DRM or account tag.
- https://store.steampowered.com/api/appdetails?appids=730&filters=categories&l=english: category 8, "Valve Anti-Cheat enabled".
- https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=1172470 (also 359550, 2807960, 1245620, 5072580): Steam Deck compatibility report JSON.
- https://partner.steamgames.com/doc/steamdeck/compat: Valve Deck compatibility doc; anti-cheat and the Unsupported category.
- https://partner.steamgames.com/doc/store/editing: Steamworks store editing doc, "Anti-Cheat Declaration" field.
- https://partner.steamgames.com/doc/features/anticheat: Steamworks anti-cheat page, names no vendors.
- https://steamcommunity.com/groups/steamworks/announcements/detail/4547038620960934857: Valve's anti-cheat declaration post (title only readable).
- https://www.gamingonlinux.com/2024/10/steam-games-will-now-need-to-fully-disclose-kernel-level-anti-cheat-on-store-pages/: coverage of the 2024-10-30 rule.
- https://www.pcgamesn.com/valve/kernel-anti-cheat-flags: coverage of the rule; display colours.
- https://www.gamingonlinux.com/2026/07/doom-the-dark-ages-and-digimon-story-time-stranger-have-denuvo-drm-removed/: 2026-07-13, stale Denuvo label on DOOM: The Dark Ages.
- https://www.gamingonlinux.com/2025/03/final-fantasy-xvi-removed-denuvo-anti-tamper/page=1/: FFXVI Denuvo removal (search result only).
- https://www.dsogaming.com/?p=151436 and https://itc.ua/en/news/kingdom-come-deliverance-2-will-get-denuvo-list-on-steam: undisclosed-Denuvo claims (search snippets; itc.ua returned 403).
- https://api.github.com/repos/AreWeAntiCheatYet/AreWeAntiCheatYet and .../contents/: repo metadata, file sizes.
- https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/master/games.json, .../LICENSE, .../README.md: the dataset, license and contribution flow.
- https://areweanticheatyet.com/ , /game/elden-ring , /game/marvel-rivals : site counts and per-game pages; /feed.rss named in the README.
- https://www.gamingonlinux.com/anticheat/ and .../vendor/bellring-anti-cheat/: GamingOnLinux anti-cheat table and vendor view.
- https://www.pcgamingwiki.com/w/api.php (actions cargotables, cargofields, cargoquery): PCGW API modules, tables, fields, access error.
- https://en.wikipedia.org/wiki/PCGamingWiki: PCGW license and size.
- https://community.pcgamingwiki.com/topic/5740-list-of-games-that-support-xinput-compatible-controllers-page-is-broken/ and .../topic/6230-drm-listing-question: PCGW forum posts on the query permission and DRM listing (search snippets).
- https://en.wikipedia.org/wiki/Denuvo: Denuvo article; no game list.
- https://store.steampowered.com/curator/26095454: Steam curator "Denuvo Watch".
- https://gamestatus.info/ : blocked by Anubis.
- https://gigazine.net/news/20200917-crackwatch/ , https://lemmy.linuxuserspace.show/comment/812316 , https://steamcommunity.com/discussions/forum/0/4030223299342092022 : crack-status trackers and curator mentions (search snippets).
- https://www.pcgamesn.com/resident-evil-3/denuvo : Denuvo removal as shown in SteamDB changelogs (search snippet).
- https://steamcommunity.com/discussions/forum/10/601901188455074095/ : forum thread on the "Requires 3rd-Party Account" label (search snippet).
- https://arxiv.org/html/2408.00500v1 : Dorner and Klausner, kernel-level anti-cheat study; BattlEye, EAC, FACEIT, Vanguard drivers.
- https://www.ea.com/games/battlefield/battlefield-6/news/secure-boot-information : EA Secure Boot and Javelin statement, 2025-08-04.
- https://www.igorslab.de/battlefield-6s-anti-cheat-javelin-hat-bereits-330-000-cheater-gebannt-und-begruendet-die-pflicht-von-secure-boot/ : Javelin described as kernel-based (search snippet).
- https://www.thesixthaxis.com/2021/10/14/cod-vanguard-warzone-ricochet-anti-cheat-revealed-with-controversial-kernel-level-pc-driver/ and https://support.activision.com/content/atvi/support/web/en/articles/ricochet-overview.html : Ricochet kernel driver (search snippets).
- https://en.wikipedia.org/wiki/GameGuard : nProtect GameGuard, rootkit-like behaviour.
- https://vulnerability.circl.lu/vuln/cve-2026-3609 and https://trovesaurus.com/xigncode3 : XIGNCODE3 kernel driver (search snippets).
- https://irdeto.com/denuvo/qa-about-denuvo-anti-cheat-and-windows-kernel-mode-drivers : Denuvo Anti-Cheat kernel-mode Q&A (search snippet).
- https://alternativeto.net/software/battleye : BattlEye use in Siege (search snippet).
- docs/research/steam-ai-disclosure/rq2-data-surface.md (local): earlier GetItems reads and proto notes.
