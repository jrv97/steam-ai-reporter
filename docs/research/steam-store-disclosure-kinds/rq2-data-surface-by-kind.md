# RQ2: Where does each non-AI disclosure kind appear in Steam's data?

Researched 2026-10-24. Scope: four kinds shown on Steam store pages: (1) kernel-level anti-cheat, (2) third-party DRM such as Denuvo, (3) a required third-party EULA, (4) a required third-party account or launcher. Facts only.

Method and tags. Every web read went through WebFetch, which hands the page to a small summarizing model; JSON values below are that model's transcription of the response, requested verbatim. "verified from source" means read first-hand from the cited URL or local fixture (items that matter were read two or three times, noted per claim). "search-summary" means seen only in a search result. "unverified" means a single indirect read or an inference. Citation labels (G-..., A-..., M-..., P-..., H-..., F-..., PROTO) each map to exactly one URL or file in the Sources list; the GetItems labels spell out the appids.

## Answer in short

- GetItems with `include_extra_details` carries all four kinds as typed fields in `store_items[].extra_details`: `drm_third_party_type` (free text), `user_account_third_party` (free text) with `user_account_third_party_link_to_steam` (bool), `eula[]` (`{name,url}`), and `anticheat` (`kernel_mode`, `uninstall_completely`, `boot_protection`, `boot_protection_name`, `name`, `name_loc`). A key is omitted when nothing is declared; no `false` or empty string was seen, and one empty object (`anticheat: {}`). Without `include_extra_details` the whole `extra_details` object is absent. 32 apps and a 63-ID batch were read.
- Denuvo is in both fields, on different apps: `drm_third_party_type` for anti-tamper DRM (9 apps, 5 spellings, for example "Denuvo Anti-tamper") and `anticheat.name` ("Denuvo", `name_loc` "#Store_AntiCheat_Type_denuvo") on ARC Raiders. No app showed both. Launchers and accounts are free text (12 distinct strings across 9 publishers). `anticheat.name` is a closed set of tokens (Easy Anti-Cheat, BattlEye, Denuvo, VAC seen); a custom anti-cheat leaves `name` out and the name appears only in the page HTML ("EA Javelin Anticheat", "NetEase Game Security").
- App page: DRM, account, EULA and kernel anti-cheat are `div.DRM_notice` children of `#category_block`; the anti-cheat one is `.anticheat_section.DRM_notice` with `.anticheat_name` and `.anticheat_uninstalls`; a non-kernel anti-cheat is `.anticheat_section.anticheat_nonkernel_notice` and is not a `.DRM_notice`. DRM and account blocks have no class other than `DRM_notice`; they differ only by their text prefix. The EULA block is `.DRM_notice[role=button]` with an `<a href=".../eula/<appid>_eula_<n>">`.
- appdetails has `drm_notice` and `ext_user_account_notice` (when declared) and nothing for anti-cheat or EULA. The DRM activation limit ("5 activations within 24 hours machine activation limit") is in appdetails and the HTML but in no GetItems field read.
- Batching: all GetItems fields are batchable by appid; 63 IDs in one request returned 63 items (35 with `success: 15` and no `extra_details`). The 50-ID figure is not a server limit at 63; the true maximum is above 63 and was not found (WebFetch rejected a 120-ID URL as invalid). Only the page or appdetails carry custom anti-cheat names, the activation limit, the rendered boot-protection sentence and the EA Play terms line.

## Findings

### 1. Per kind: which field carries it in each source

Summary table (all rows verified from source unless marked):

| Kind                             | GetItems `extra_details`                                                                                                  | App-page HTML                                                                                                                         | `/api/appdetails`                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Kernel-level anti-cheat          | `anticheat.kernel_mode: true`, plus `uninstall_completely`, `boot_protection`, `boot_protection_name`, `name`, `name_loc` | `.anticheat_section.DRM_notice`: "Uses Kernel Level Anti-Cheat", `.anticheat_name`, `.anticheat_uninstalls`; boot-protection sentence | no key                                                          |
| Non-kernel anti-cheat (adjacent) | `anticheat` object without `kernel_mode` (`{name,name_loc}` or `{}`)                                                      | `.anticheat_section.anticheat_nonkernel_notice`: "Uses Anti-Cheat Software." plus `.anticheat_name`                                   | no key                                                          |
| Third-party DRM                  | `drm_third_party_type` (string)                                                                                           | `.DRM_notice`: "Incorporates 3rd-party DRM: <text>" plus activation-limit text                                                        | `drm_notice` (string, may hold `<br>` and the activation limit) |
| Third-party EULA                 | `eula[]` of `{name,url}`                                                                                                  | `.DRM_notice[role=button]`: "Requires agreement to a 3rd-party EULA" plus `<a href>`                                                  | no key                                                          |
| Third-party account or launcher  | `user_account_third_party` (string), `user_account_third_party_link_to_steam` (bool)                                      | `.DRM_notice`: "Requires 3rd-Party Account: <text>" and "(Supports Linking to Steam Account)" when the flag is true                   | `ext_user_account_notice` (string; link text appended)          |

#### 1.1 GetItems extra_details, exact snippets

Request shape used for every read (keyless): `input_json={"ids":[{"appid":N}],"context":{"language":"english","country_code":"US"},"data_request":{"include_extra_details":true}}` against `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/`. (verified from source: G-3159330)

Assassin's Creed Shadows (3159330): Denuvo, Ubisoft account with link flag, EULA. `anticheat` and `content_survey_ai_notes` absent. Full `extra_details` key list: vetted, controller_wizard_complete, drm_third_party_type, user_account_third_party, user_account_third_party_link_to_steam, eula, section, legal_notice_bbcode, content_survey_notes, links_and_info, points_shop_eligible, system_requirements, has_community_hub. (verified from source: G-3159330)

```
"drm_third_party_type": "Denuvo Anti-tamper",
"user_account_third_party": "Ubisoft Account",
"user_account_third_party_link_to_steam": true,
"eula": [{"name": "Assassin's Creed Shadows EULA", "url": "https://store.steampowered.com//eula/3159330_eula_0"}]
```

Battlefield 6 (2807960): account, kernel anti-cheat with boot protection, EULA; no `drm_third_party_type`; `anticheat` has no `name`. Two reads (a single-app request and a two-app request) gave the same anti-cheat object, and a search of the second response for "Javelin" and "name_loc" found neither. (verified from source: G-2807960, G-I)

```
"user_account_third_party": "EA Account linking required",
"user_account_third_party_link_to_steam": true,
"anticheat": {"kernel_mode": true, "uninstall_completely": true, "boot_protection": true, "boot_protection_name": "secureboot_tpm2"},
"eula": [{"name": "Battlefield 6 EULA", "url": "https://store.steampowered.com//eula/2807960_eula_0"}]
```

(The EULA name in the source carries a trademark sign after "Battlefield"; dropped here to keep the note ASCII.)

Black Myth: Wukong (2358720): DRM and EULA only. (verified from source: G-2358720)

```
"drm_third_party_type": "Denuvo",
"eula": [{"name":"Black Myth: Wukong EULA","url":"https://store.steampowered.com//eula/2358720_eula_0"}]
```

Apex Legends (1172470): EA account, named anti-cheat, EULA with suffix `_eula_1`. (verified from source: G-1172470)

```
"user_account_third_party": "EA Account",
"user_account_third_party_link_to_steam": true,
"eula": [{"name":"Apex Legends EULA","url":"https://store.steampowered.com//eula/1172470_eula_1"}],
"anticheat": {"kernel_mode":true,"name":"Easy Anti-Cheat","name_loc":"#Store_AntiCheat_Type_easyac"}
```

ARC Raiders (1808500), byte-exact from the raw fixture captured 2026-10-20, and matching a fresh read: anti-cheat named Denuvo, no `drm_third_party_type`, no account. (verified from source: F-mixed-states, G-B)

```
"anticheat":{"kernel_mode":true,"name":"Denuvo","name_loc":"#Store_AntiCheat_Type_denuvo"}
```

Call of Duty (1938090), byte-exact from the fixture and matching a fresh read: Activision account, kernel anti-cheat with boot protection, no anti-cheat name. (verified from source: F-mixed-states, G-B)

```
"user_account_third_party":"Activision Account"
"user_account_third_party_link_to_steam":true
"anticheat":{"kernel_mode":true,"uninstall_completely":true,"boot_protection":true,"boot_protection_name":"secureboot_tpm2"}
```

Full per-app table (title; `drm_third_party_type`, `user_account_third_party` with link flag L, `anticheat`, `eula` count; "-" means key absent). All are fresh reads of 2026-10-24; the last column names the batch.

| appid   | Title                    | drm_third_party_type                                                                                  | user_account_third_party                                                   | anticheat                                                                                 | eula                           | Batch          |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ | -------------- |
| 3159330 | Assassin's Creed Shadows | Denuvo Anti-tamper                                                                                    | Ubisoft Account, L=true                                                    | -                                                                                         | 1                              | G-3159330      |
| 2807960 | Battlefield 6            | -                                                                                                     | EA Account linking required, L=true                                        | kernel, uninstall, boot secureboot_tpm2, no name                                          | 1                              | G-2807960, G-I |
| 2358720 | Black Myth: Wukong       | Denuvo                                                                                                | -                                                                          | -                                                                                         | 1                              | G-2358720      |
| 1172470 | Apex Legends             | -                                                                                                     | EA Account, L=true                                                         | kernel, EAC                                                                               | 1 (eula_1)                     | G-1172470      |
| 271590  | GTA V Legacy             | -                                                                                                     | Rockstar Games, L=true                                                     | kernel, BattlEye                                                                          | 1                              | G-A            |
| 1174180 | Red Dead Redemption 2    | -                                                                                                     | Rockstar Games, L=true                                                     | -                                                                                         | 1                              | G-A            |
| 1245620 | Elden Ring               | -                                                                                                     | -                                                                          | -                                                                                         | 2 (eula_0, "EULA (JP)" eula_1) | G-A            |
| 1808500 | ARC Raiders              | -                                                                                                     | -                                                                          | kernel, name Denuvo                                                                       | 1                              | G-B            |
| 1938090 | Call of Duty             | -                                                                                                     | Activision Account, L=true                                                 | kernel, uninstall, boot, no name                                                          | 1                              | G-B            |
| 2050650 | Resident Evil 4          | -                                                                                                     | -                                                                          | -                                                                                         | 1                              | G-B            |
| 359550  | Rainbow Six Siege        | -                                                                                                     | Ubisoft Connect launcher, L=true                                           | -                                                                                         | 1 (eula_1, http scheme)        | G-C, G-J       |
| 578080  | PUBG: Battlegrounds      | -                                                                                                     | -                                                                          | kernel, uninstall, no name                                                                | 1 (eula_1)                     | G-C, G-J       |
| 1085660 | Destiny 2                | -                                                                                                     | -                                                                          | kernel, BattlEye                                                                          | 1                              | G-C            |
| 2344520 | Diablo IV                | -                                                                                                     | Battle.net Account, L absent                                               | -                                                                                         | 1                              | G-D            |
| 2669320 | EA SPORTS FC 25          | EA online activation and EA app software installation and background use required. Denuvo Anti-tamper | EA Account, L absent                                                       | kernel only, no name                                                                      | 1                              | G-D, G-I       |
| 1240440 | Halo Infinite            | -                                                                                                     | Xbox Live, L absent                                                        | kernel, EAC                                                                               | -                              | G-D            |
| 2369390 | Far Cry 6                | Denuvo Anti-Temper (single read)                                                                      | Ubisoft Account, L=true                                                    | -                                                                                         | 1                              | G-E            |
| 1716740 | Starfield                | -                                                                                                     | -                                                                          | -                                                                                         | 1                              | G-E            |
| 1151340 | Fallout 76               | -                                                                                                     | Bethesda.net, L=true                                                       | -                                                                                         | -                              | G-E            |
| 782330  | DOOM Eternal             | -                                                                                                     | Bethesda.net, L=true                                                       | -                                                                                         | 1                              | G-E            |
| 397540  | Borderlands 3            | -                                                                                                     | -                                                                          | -                                                                                         | 1                              | G-F            |
| 1295660 | Civilization VII         | Denuvo Anti-tamper                                                                                    | 2K Account for Online Interactions (Not Required for Offline Play), L=true | -                                                                                         | 1                              | G-F, G-K       |
| 2878980 | NBA 2K25                 | Denuvo Anti-tamper                                                                                    | 2K Sports Account, L absent                                                | kernel, uninstall, EAC                                                                    | 1                              | G-F, G-K       |
| 1551360 | Forza Horizon 5          | -                                                                                                     | Xbox Live, L=true                                                          | -                                                                                         | 1                              | G-F            |
| 2357570 | Overwatch                | -                                                                                                     | Battle.net Account, L absent                                               | -                                                                                         | -                              | G-G            |
| 730     | Counter-Strike 2         | -                                                                                                     | -                                                                          | `{name: "VAC (Valve Anti-Cheat)", name_loc: "#Store_AntiCheat_Type_vac"}`, no kernel_mode | -                              | G-G            |
| 2767030 | Marvel Rivals            | -                                                                                                     | -                                                                          | `{}`                                                                                      | 1                              | G-G, G-J       |
| 990080  | Hogwarts Legacy          | Denuvo Anti-Tampering                                                                                 | -                                                                          | -                                                                                         | 1                              | G-G            |
| 2246340 | Monster Hunter Wilds     | Denuvo Anti-tamper                                                                                    | -                                                                          | -                                                                                         | 1                              | G-H            |
| 1364780 | Street Fighter 6         | Denuvo Anti-tamper                                                                                    | Capcom ID, L=true                                                          | -                                                                                         | 1                              | G-H            |
| 1145360 | Hades                    | -                                                                                                     | -                                                                          | -                                                                                         | -                              | G-H            |
| 413150  | Stardew Valley           | -                                                                                                     | -                                                                          | -                                                                                         | -                              | G-H            |

(verified from source: the batch labels in the last column; items read in two requests agreed.)

#### 1.2 App-page HTML: selectors and text actually observed

Raw structure, from a fixture captured 2026-10-20 (ARC Raiders, `?l=english`, cookie-less). The two blocks sit directly inside `#category_block`, after `div.game_area_features_list_ctn` and the controller-support placeholder. Whitespace was collapsed by the fixture sanitizer. (verified from source: F-1808500-page)

```
<div class="block responsive_apppage_details_left" id="category_block">
  <div class="game_area_features_list_ctn">...</div>
  <div data-featuretarget="store-sidebar-controller-support-info"></div>
  <div class="anticheat_section DRM_notice">
    <div>Uses Kernel Level Anti-Cheat</div>
    <div class="anticheat_name">Denuvo<span class="anticheat_uninstalls"> - Requires manual removal after game uninstall</span></div>
  </div>
  <div class="DRM_notice" role="button">
    <div>Requires agreement to a 3rd-party EULA</div>
    <div><a href="https://store.steampowered.com//eula/1808500_eula_0">ARC Raiders EULA</a></div>
  </div>
</div>
```

The same container holds a `DRM_notice` for the AI-content service on the AI sample: `<div class="DRM_notice">Connects to 3rd-Party Service for AI Content Generation:&nbsp;<a href="https://openai.com/api/">OpenAI API</a></div>`. (verified from source: F-5072580-page)

DRM and account blocks, read by CSS selector on `.DRM_notice` (class attribute and text). Both carry only the class `DRM_notice`; the first words are the only discriminator. (verified from source: M-2878980, M-1295660, M-1240440)

- NBA 2K25 (2878980) class list `["DRM_notice", "anticheat_section DRM_notice"]` plus the EULA block; texts: "Incorporates 3rd-party DRM: Denuvo Anti-tamper5 Activations per 24 hours machine activation limit", "Requires 3rd-Party Account: 2K Sports Account", "Uses Kernel Level Anti-Cheat Easy Anti-Cheat", "Requires agreement to a 3rd-party EULA NBA 2K25 EULA". The concatenated "Anti-tamper5" shows the activation limit is a separate element (line break or tag) after the DRM text; its markup was not read. (verified from source: M-2878980)
- Civilization VII (1295660) class list `["DRM_notice"]`; texts: "Incorporates 3rd-party DRM: Denuvo Anti-tamper5 activations within 24 hours machine activation limit", "Requires 3rd-Party Account: 2K Account for Online Interactions (Not Required for Offline Play) (Supports Linki..." (cut by the 110-character limit; full string in appdetails below), "Requires agreement to a 3rd-party EULA Sid Meier's Civilization VII EULA". `role` attribute list: `["button"]` (one element, the EULA block); link list: the `/eula/1295660_eula_0` URL. (verified from source: M-1295660)
- Halo Infinite (1240440): "Requires 3rd-Party Account: Xbox Live" (plain `DRM_notice`) and "Uses Kernel Level Anti-Cheat Easy Anti-Cheat - Requires manual removal after game uninstall" (`anticheat_section DRM_notice`); no `<a>` inside any `.DRM_notice` and no EULA block, matching the absent `eula` in GetItems. (verified from source: M-1240440)
- EA SPORTS FC 25 (2669320): six `.DRM_notice` blocks: DRM "Incorporates 3rd-party DRM: EA online activation and EA app software installation and background use...", account "Requires 3rd-Party Account: EA Account", anti-cheat "Uses Kernel Level Anti-Cheat EA Javelin Anticheat - Requires manual removal after game uninstall", EULA "Requires agreement to a 3rd-party EULA EA SPORTS FC 25 EULA", "EA Play subscription requires acceptance of EA Play Terms", "Steam refunds will consider EA account playtime". `.anticheat_name` text: "EA Javelin Anticheat - Requires manual removal after game uninstall". Links inside `.DRM_notice a`: `https://store.steampowered.com//eula/2669320_eula_0` and `https://store.steampowered.com//eula/1289670_eula_0` (the EA Play terms link, a different appid). (verified from source: M-2669320)
- The link flag renders as appended text: the Battlefield 6 page line reads "Requires 3rd-Party Account: EA Account linking required (Supports Linking to Steam Account)", from the plain store page (markdown conversion, so no selectors). (verified from source: P-2807960)

Anti-cheat block variants. Kernel: `.anticheat_section.DRM_notice`, first child "Uses Kernel Level Anti-Cheat". Non-kernel: class `anticheat_section anticheat_nonkernel_notice`, first child "Uses Anti-Cheat Software.", then `<div class="anticheat_name">NetEase Game Security<span class="anticheat_uninstalls"></span></div>` (Marvel Rivals, verbatim excerpt) or "VAC (Valve Anti-Cheat)" (Counter-Strike 2). Counter-Strike 2 had no `.DRM_notice` at all; Marvel Rivals had one, the EULA block. (verified from source: M-2767030, M-2767030-sec, M-730, M-730-sec)

Mapping between GetItems and the rendered anti-cheat block (inferred from consistent pairs, no counterexample among the apps named):

- `kernel_mode: true` goes with `.anticheat_section.DRM_notice` and the "Uses Kernel Level Anti-Cheat" line; no `kernel_mode` goes with `.anticheat_nonkernel_notice` (Counter-Strike 2, Marvel Rivals). (verified from source: G-G, M-730-sec, M-2767030-sec; the mapping itself is an inference)
- `uninstall_completely` absent goes with the suffix " - Requires manual removal after game uninstall" inside `.anticheat_uninstalls` (ARC Raiders, Halo Infinite, EA FC 25); `uninstall_completely: true` goes with no suffix (NBA 2K25 page text; Battlefield 6 page lines). (inferred from G-B, G-D, G-F, M-1240440, M-2669320, M-2878980, P-2807960)
- `boot_protection: true` with `boot_protection_name: "secureboot_tpm2"` goes with the page line "Boot Protection - Requires both Secure Boot & TPM 2.0" (Battlefield 6, one page read; Call of Duty's page was not readable cookie-less from the fetch location). (verified from source: G-2807960, P-2807960)
- The boot-protection line's selector or class was not captured (markdown read only): unverified.

Whether the same blocks appear elsewhere on the page (for example near the purchase area) was not checked: unverified.

#### 1.3 /api/appdetails

Request: `https://store.steampowered.com/api/appdetails?appids=<id>&cc=us&l=english`. (verified from source: A-2669320, A-1295660, A-1808500)

- EA SPORTS FC 25 (2669320): top-level `data` keys include `legal_notice`, `drm_notice`, `ext_user_account_notice`. `drm_notice` is "EA online activation and EA app software installation and background use required. Denuvo Anti-tamper", identical to GetItems `drm_third_party_type` for the same app. `ext_user_account_notice` is "EA Account " (trailing space). `legal_notice` begins "Internet connection; EA Account; Steam Account; acceptance of the EA User Agreement (terms.ea.com); and download & insta". No key containing "anticheat" or "eula". (verified from source: A-2669320, G-D)
- Civilization VII (1295660): `drm_notice` is "Denuvo Anti-tamper<br>5 activations within 24 hours machine activation limit" (a `<br>` inside the string, activation limit included) and `ext_user_account_notice` is "2K Account for Online Interactions (Not Required for Offline Play) (Supports Linking to Steam Account)". The link flag becomes appended text; there is no separate link key (`ext_user_account_link`, a name guessed in the brief, is absent). (verified from source: A-1295660)
- ARC Raiders (1808500), which has a kernel anti-cheat and an EULA in GetItems: no `drm_notice`, no `ext_user_account_notice`, no anti-cheat or EULA key; `legal_notice` present. (verified from source: A-1808500)
- `categories` descriptions for EA FC 25 and ARC Raiders list player-mode and feature entries (Single-player, Multi-player, Online PvP, Steam Achievements, In-App Purchases and so on) and have no DRM, anti-cheat, account or EULA entry. (verified from source: A-2669320, A-1808500)

### 2. Representation: enum, free text or link flag; distinct values observed

#### 2.1 Denuvo

Denuvo appears in two different fields on different apps. No app read had both. (verified from source: G-sets in section 1.1)

- `drm_third_party_type` (free text): 9 apps, 5 distinct strings: "Denuvo Anti-tamper" (Assassin's Creed Shadows, Civilization VII, NBA 2K25, Monster Hunter Wilds, Street Fighter 6), "Denuvo" (Black Myth: Wukong), "Denuvo Anti-Temper" (Far Cry 6, single read, may be a transcription slip), "Denuvo Anti-Tampering" (Hogwarts Legacy), and a long string "EA online activation and EA app software installation and background use required. Denuvo Anti-tamper" (EA SPORTS FC 25, three reads). The spelling variation shows the field is typed text, not an enum. (verified from source: G-3159330, G-2358720, G-D, G-E, G-F, G-G, G-H, G-I)
- `anticheat.name`: "Denuvo" with `name_loc` "#Store_AntiCheat_Type_denuvo" on ARC Raiders; the page shows `.anticheat_name` "Denuvo". (verified from source: F-mixed-states, F-1808500-page)
- Denuvo is therefore not one field: DRM-type Denuvo is `drm_third_party_type`; anti-cheat-type Denuvo is `anticheat.name`. A text search of `drm_third_party_type` for "Denuvo" misses the ARC Raiders anti-cheat entry, and a search of `anticheat.name` misses all nine anti-tamper apps. (verified from source: G-B, G-F)
- EA FC 25 has a composite `drm_third_party_type` that bundles EA's own activation and app requirement with Denuvo in one string. (verified from source: G-D, G-I, A-2669320)

#### 2.2 Launchers and accounts

`user_account_third_party` is free text; `user_account_third_party_link_to_steam` is a separate bool, omitted when false. The 12 distinct strings read (9 publishers): "Ubisoft Account" (AC Shadows, Far Cry 6), "Ubisoft Connect launcher" (Rainbow Six Siege), "EA Account" (Apex Legends, EA FC 25), "EA Account linking required" (Battlefield 6), "Rockstar Games" (GTA V Legacy, RDR2), "Activision Account" (Call of Duty), "Battle.net Account" (Diablo IV, Overwatch), "Xbox Live" (Halo Infinite, Forza Horizon 5), "Bethesda.net" (Fallout 76, DOOM Eternal), "2K Account for Online Interactions (Not Required for Offline Play)" (Civilization VII), "2K Sports Account" (NBA 2K25), "Capcom ID" (Street Fighter 6). (verified from source: G-sets in section 1.1)

- One publisher can have several strings: EA ("EA Account", "EA Account linking required"), 2K (two strings), Ubisoft ("Ubisoft Account", "Ubisoft Connect launcher"). The same string repeats across games of one publisher ("Xbox Live", "Battle.net Account", "Bethesda.net", "Rockstar Games"). The field is not an enum and carries no launcher or store identifier. (verified from source: G-sets in section 1.1)
- The link flag is `true` on 13 of the 18 apps with an account string and omitted on the other 5 (Diablo IV, Overwatch, Halo Infinite, EA FC 25, NBA 2K25); no explicit `false` appeared in any response. (verified from source: G-sets in section 1.1; counts from the table)
- The account string is not translated in a `german` context: `user_account_third_party` stays "Activision Account" in the German-context fixture (language `german`, country `DE`). (verified from source: F-german-context)
- Call of Duty is "Activision Account", not "Battle.net". Battle.net strings were seen only on Diablo IV and Overwatch. (verified from source: F-mixed-states, G-D, G-G)
- The page prefix "Requires 3rd-Party Account:" is page text; the JSON field holds only the name, for example "Rockstar Games" with no launcher name. (verified from source: M-1240440, G-A)

#### 2.3 Anti-cheat

`anticheat` is a nested object. `kernel_mode`, `uninstall_completely`, `boot_protection` are bool flags (omitted when false). `boot_protection_name` is a token-like string ("secureboot_tpm2", the only value seen). `name` is human text and `name_loc` is a Steam localization token ("#Store_AntiCheat_Type_<id>"). (verified from source: G-sets in section 1.1)

- Tokens seen: easyac ("Easy Anti-Cheat"), battleye ("BattlEye"), denuvo ("Denuvo"), vac ("VAC (Valve Anti-Cheat)"). Vanguard was not seen: no Riot title was tested and none is known to be on Steam (unverified, general knowledge).
- Custom or unnamed anti-cheat: `name` and `name_loc` are omitted while the page still names the anti-cheat. EA SPORTS FC 25 (JSON `{"kernel_mode":true}`) and Battlefield 6 (JSON with no `name`) both render "EA Javelin Anticheat"; Marvel Rivals (JSON `{}`) renders "NetEase Game Security". PUBG (`{"kernel_mode":true,"uninstall_completely":true}`) and Call of Duty also have no `name` in JSON; their page names were not readable. In every GetItems response read, "Javelin" and "NetEase" never occurred. (verified from source: G-I, G-J, M-2669320, P-2807960, M-2767030)
- A working reading of the three cases is that `name` and `name_loc` carry only the closed token set and a custom name is rendered from a source GetItems does not expose; that reading is an inference (unverified).
- Presence of the `anticheat` key does not mean kernel level: Counter-Strike 2 (`{name, name_loc}` without `kernel_mode`) and Marvel Rivals (`{}`) show the non-kernel block. (verified from source: G-G, M-730-sec, M-2767030-sec)
- `anticheat: {}` is the only empty-object value seen; it was read twice (two different requests) for Marvel Rivals. (verified from source: G-G, G-J)

#### 2.4 EULA

`eula` is a repeated `{name, url}`. Observed URL forms: `https://store.steampowered.com//eula/<appid>_eula_<n>` (note the double slash), with n = 0 on most apps and n = 1 on Apex Legends, PUBG and Rainbow Six Siege (the Siege entry also uses `http://`, one read). Elden Ring has two entries (`_eula_0` "ELDEN RING EULA", `_eula_1` "ELDEN RING EULA (JP)"). (verified from source: G-1172470, G-A, G-C; the Siege scheme is a single read)

- EULA presence is common without any other kind: Starfield, Borderlands 3, Elden Ring, Resident Evil 4, Hogwarts Legacy, Monster Hunter Wilds and Marvel Rivals have `eula` and no account or DRM string. (verified from source: G-A, G-B, G-E, G-F, G-G, G-H)
- The page link set can be larger than `eula[]`: EA FC 25 shows a second `/eula/1289670_eula_0` link under "EA Play subscription requires acceptance of EA Play Terms" while `eula[]` holds one entry; Battlefield 6 shows the same EA Play line with a one-entry `eula[]`. The JSON source of the EA Play line was not found in the responses read. (verified from source: M-2669320, P-2807960, G-D, G-I)
- The related `refund_checks_ea_playtime` key (present on EA FC 25) matches the page line "Steam refunds will consider EA account playtime"; the match is inferred. (verified from source: G-D for the key, M-2669320 for the line)

### 3. Absent vs false vs empty; known vs unknown

GetItems, a game with no declaration. The item has `success: 1` and an `extra_details` object but none of the kind keys: Stardew Valley `extra_details` holds `vetted, press_review, partner_awards_bbcode, links_and_info, points_shop_eligible, metacritic, system_requirements, has_community_hub` (and the raw fixture, `vetted, points_shop_eligible, metacritic`). Hades is the same. (verified from source: G-H, F-mixed-states)

- Absent is the normal "not declared" form. In all responses (32 apps), `false` never appeared for `user_account_third_party_link_to_steam`, `kernel_mode`, `uninstall_completely` or `boot_protection`, and no empty-string `drm_third_party_type` or empty `eula` array appeared. A false bool is represented by omission (5 account strings lack the link flag; the mechanism is an inference from proto3 default handling, unverified). (verified from source: G-sets in section 1.1)
- Empty object: `anticheat: {}` (Marvel Rivals) is a present-but-empty value and the only one read; the page shows an anti-cheat name for it. (verified from source: G-G, G-J, M-2767030)
- Without `include_extra_details`: the item has no `extra_details` key and no occurrence of Denuvo, anticheat, anti-cheat, Javelin, EULA, "EA Account", "user_account" or "drm" anywhere (EA FC 25 request with `include_basic_info`, `include_assets`, `include_release`, `include_platforms`, `include_links`, `include_full_description`, `include_tag_count` 20, `include_ratings`; 19 item keys). (verified from source: G-noextra)
- Unknown vs nothing, GetItems: `success` separates them. `success: 1` with `extra_details` is a known record. `success: 15`, `visible: false`, `name: ""` and no `extra_details` appears for invalid or non-store IDs: 35 of 63 sequential IDs (10 to 630 step 10) and ID 99999999. A delisted app (50300, Spec Ops: The Line) returns `success: 1`, `unlisted: true` and `extra_details`. An adult-only app (339800) returned `success: 1` with the mature text in `content_survey_notes` (per the fixture README). (verified from source: G-63, F-mixed-states, F-fixtures-README)
- Inside a `success: 1` record nothing separates "developer declared nothing" from "not applicable" from "field not exposed". Observed cases where the page has information the JSON lacks: custom anti-cheat names (section 2.3), the DRM activation limit (section 4), the EA Play terms line (section 2.4). Rainbow Six Siege and Elden Ring have no `anticheat` key; whether either game ships an anti-cheat was not checked here (both are commonly reported to use one: unverified). (verified from source for the key absence: G-C, G-A)
- Age gate: GetItems returned `extra_details` for the mature apps tested (Call of Duty, Battlefield 6, GTA V, Wukong, Assassin's Creed Shadows) with no cookie or login. The app-page route differs: the microlink fetcher (cookie-less, location unknown, `prerender=false`) was redirected to `https://store.steampowered.com/agecheck/app/<id>/` for 3159330, 2807960, 271590, 2358720 and 1938090 and returned null for `.DRM_notice` and `#appHubAppName` (578080, PUBG, returned the same nulls; the gate there is presumed). The same fetcher got full pages for 2669320, 1240440, 1295660, 2878980, 730 and 2767030, and WebFetch itself read the Battlefield 6 page. Captured from an EU location on 2026-10-20, no app redirected cookie-less (1938090, 271590, 1245620 and others served the full page). The gate therefore depends on the client, and an empty `.DRM_notice` result on a gated fetch does not mean "nothing declared". (verified from source: M-gated, M-2669320, P-2807960, F-fixtures-README)
- appdetails, no declaration: ARC Raiders has neither `drm_notice` nor `ext_user_account_notice`; the keys are omitted, not null or empty. appdetails behavior for unknown IDs was not re-tested (unverified). (verified from source: A-1808500)
- App page, no declaration: no `.DRM_notice` element at all (Counter-Strike 2). The earlier AI-disclosure note established that a page with no `#appHubAppName` is not a store page (gate, login or invalid ID), so such a response is unknown (local note, not re-read: F-prior-rq2).

### 4. Batchable data vs full-page-only data; the batch ceiling

Batchable through GetItems (one request, any appids, no cookie): `drm_third_party_type`, `user_account_third_party`, `user_account_third_party_link_to_steam`, `eula[]` (names and URLs), and the whole `anticheat` object. Any surface that yields appids (search rows with `data-ds-appid`, wishlist rows, capsules, tag hubs, Next Fest cards) can be resolved this way; the surfaces themselves carry none of the kinds. The hover popup for EA FC 25 lists title, release date, review summary and user tags and mentions no DRM, account, anti-cheat or EULA (checked for this one app); search rows carry `data-ds-*` attributes for appid, tag IDs and descriptor IDs and no kind (earlier note); appdetails categories have no entry (section 1.3). (verified from source: H-2669320, A-2669320, F-prior-rq2)

Only on the full app page or appdetails, not in any GetItems field read:

- Custom anti-cheat names: "EA Javelin Anticheat" (EA FC 25, Battlefield 6), "NetEase Game Security" (Marvel Rivals). (verified from source: M-2669320, P-2807960, M-2767030)
- DRM activation limit: "5 Activations per 24 hours machine activation limit" (NBA 2K25 page) and "5 activations within 24 hours machine activation limit" (Civilization VII page and appdetails `drm_notice`, `<br>` separated). GetItems `drm_third_party_type` for both is just "Denuvo Anti-tamper"; the response had no "activation" substring and no `drm_activation_limit` key, read twice for each app. The differing wording between the two apps suggests the limit is developer text, not a fixed template (inference). (verified from source: M-2878980, M-1295660, A-1295660, G-F, G-K)
- The rendered boot-protection sentence ("Boot Protection - Requires both Secure Boot & TPM 2.0"); GetItems carries only the token `secureboot_tpm2`. (verified from source: P-2807960, G-2807960)
- The EA Play terms line and its EULA link (section 2.4).
- appdetails `legal_notice` prose: account and EULA requirements in publisher text, for example EA FC 25's "acceptance of the EA User Agreement". GetItems has a similarly named `legal_notice_bbcode` key in `extra_details` of several apps (AC Shadows, Wukong, Apex); its content was read only as a description by the summarizer. (verified from source: A-2669320, G-3159330, G-2358720, G-1172470)

Batch ceiling with `include_extra_details`: a request with 63 appids (10 to 630 step 10) returned 63 `store_items` in a single response: 28 with `success: 1` and `extra_details`, 35 with `success: 15` and no `extra_details`; no error, truncation or message field at the top level. The local fixture from 2026-10-20 holds a 50-ID response with 50 items in request order. A 120-ID URL (about 4.3 KB) failed in WebFetch with "Invalid URL" before any request reached Steam, so the real ceiling above 63 is unknown. The project's 50 is therefore not a limit observed on the server at 63. (verified from source: G-63, F-search-roguelike-50; the URL failure is a tool limit)

### 5. Every StoreItem_ExtraDetails field related to these kinds

Source: `webui/common.proto` in SteamDatabase/Protobufs, read at two character offsets (150000 and 200000) by the summarizing model, which listed names and field numbers and agreed across both reads; types were not reported by either read except where the JSON shows them. (verified from source: PROTO)

Directly the four kinds:

- `drm_third_party_type` = 5 (string in JSON)
- `drm_activation_limit` = 6 (type not reported by the read; never seen in a GetItems response)
- `user_account_third_party` = 7 (string in JSON)
- `user_account_third_party_link_to_steam` = 8 (bool in JSON)
- `anticheat` = 9, message `StoreItem_ExtraDetails_Anticheat`: `kernel_mode` = 1, `uninstall_completely` = 2, `boot_protection` = 3, `boot_protection_name` = 4, `name` = 5, `name_loc` = 6
- `eula` = 10 (repeated), message `StoreItem_ExtraDetails_Eula`: `name` = 1, `url` = 2

Adjacent, same notice family on the page:

- `ai_generation_service` = 11, message `StoreItem_ExtraDetails_AIGeneratedContentService`: `name` = 1, `url` = 2 (renders as a `.DRM_notice` "Connects to 3rd-Party Service for AI Content Generation")
- `refund_checks_ea_playtime` = 12 (seen as a key on EA FC 25; the page line "Steam refunds will consider EA account playtime" is inferred to be its rendering)

Possible carriers of related legal or account prose, content not read as structured data:

- `section` = 13 (repeated `StoreItem_ExtraDetails_PageSection`: `label` = 1, `content_bbcode` = 2, `banner` = 3 enum), present on many apps
- `legal_notice_bbcode` = 14
- `links_and_info` = 22, message `StoreItem_ExtraDetails_LinksAndInfo`: includes `privacy_policy_url` = 5 and `available_documents` = 6 (repeated enum)

Not related: `steam_award`, `vetted`, `no_mouse_keyboard_support`, `controller_wizard_complete`, `interactive_elements`, `content_survey_notes`, `content_survey_ai_notes` (AI), `press_review`, `partner_awards_bbcode`, `early_access`, `season_pass`, `item_store_eligible`, `points_shop_eligible`, `metacritic`, `cast_and_crew`, `system_requirements`, `running_time_minutes`, `episode`, `seasons`, `video_extras_note`, `has_community_hub`.

The request flag `include_extra_details` is field 18 of `StoreBrowseItemDataRequest` per the earlier AI-disclosure note, not re-read here. (verified from source in the earlier note: F-prior-rq2)

## Caveats and version notes

- All reads were made on 2026-10-24, after the 2026-10-22 date named in this topic's RQ3; nothing here shows what the data looked like before. Local fixtures are from 2026-10-20 and agree with the fresh reads for ARC Raiders and Call of Duty (byte-exact JSON), so no change between those two dates was seen for those two apps.
- Summarizer risk: values are the helper model's transcription. Cross-reads agree for Battlefield 6, EA FC 25, Marvel Rivals, PUBG, Rainbow Six Siege, NBA 2K25, Civilization VII and the fixture-backed apps. Single reads: "Denuvo Anti-Temper" (Far Cry 6), the Rainbow Six Siege `http://` EULA scheme, Wukong's and Hogwarts Legacy's DRM strings, and every HTML read through microlink. Treat single-read strings as unverified in spelling.
- The microlink fetches went through the third-party service api.microlink.io from a location not shown; its age-gate behavior differs from the EU captures in the local fixtures. Page structure for gated apps (Assassin's Creed Shadows, GTA V, Call of Duty, Wukong) therefore comes from other apps and from the plain-text read of Battlefield 6.
- Not tested: the `language` effect on `name`, `name_loc` and `drm_third_party_type` (only the account string was seen untranslated in a German fixture); boot-protection tokens other than `secureboot_tpm2`; Riot Vanguard, ESEA or other anti-cheats; an app with Denuvo anti-tamper plus an anti-cheat in the same record; wishlist, discovery queue and other logged-in surfaces; appdetails for gated apps; field types in the proto; the markup of the activation-limit text; the JSON source of the EA Play line.
- Lead checks (second-hand claims from the brief): `drm_third_party_type` as free text "Denuvo Anti-tamper" confirmed, with four other spellings; `user_account_third_party_link_to_steam` is a bool, confirmed; Call of Duty's string is "Activision Account", not Battle.net; Elden Ring has no `anticheat` key (confirmed absent in JSON; the game's actual anti-cheat was not checked); `.DRM_notice` is the generic class and the anti-cheat block is `.anticheat_section.DRM_notice` for kernel mode only; appdetails has `drm_notice` and `ext_user_account_notice` and no anti-cheat or EULA (confirmed on three apps); the Battlefield 6 "EA Javelin Anticheat" gap is confirmed and also affects EA FC 25 and Marvel Rivals ("NetEase Game Security").
- The 120-ID batch test was blocked by the tool's URL length, not by Steam, so "no ceiling at 50" is bounded at 63.

## Sources

GetItems (all keyless GET). Each URL is `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=` plus the percent-encoded JSON `{"ids":[<items>],"context":{"language":"english","country_code":"US"},"data_request":{"include_extra_details":true}}`, each item being `{"appid":N}`. Concretely: prefix `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=%7B%22ids%22%3A%5B`, items `%7B%22appid%22%3AN%7D` joined by `%2C`, suffix `%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D`. Labels and appids:

- G-3159330, G-2807960, G-2358720, G-1172470: single-app requests for Assassin's Creed Shadows, Battlefield 6, Black Myth: Wukong, Apex Legends. Example full URL: https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A3159330%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_extra_details%22%3Atrue%7D%7D
- G-A: appids 271590, 1174180, 1245620 (GTA V Legacy, RDR2, Elden Ring).
- G-B: appids 1808500, 1938090, 2050650 (ARC Raiders, Call of Duty, Resident Evil 4).
- G-C: appids 359550, 578080, 1085660 (Rainbow Six Siege, PUBG, Destiny 2).
- G-D: appids 2344520, 2669320, 1240440 (Diablo IV, EA FC 25, Halo Infinite).
- G-E: appids 2369390, 1716740, 1151340, 782330 (Far Cry 6, Starfield, Fallout 76, DOOM Eternal).
- G-F: appids 397540, 1295660, 2878980, 1551360 (Borderlands 3, Civilization VII, NBA 2K25, Forza Horizon 5).
- G-G: appids 2357570, 730, 2767030, 990080 (Overwatch, Counter-Strike 2, Marvel Rivals, Hogwarts Legacy).
- G-H: appids 2246340, 1364780, 1145360, 413150 (Monster Hunter Wilds, Street Fighter 6, Hades, Stardew Valley).
- G-I: appids 2669320, 2807960 (second read of the two EA records, with a prompt that searched for "Javelin" and "name_loc").
- G-J: appids 2767030, 359550, 578080 (second read of Marvel Rivals, Rainbow Six Siege, PUBG).
- G-K: appids 2878980, 1295660 (second read, with a search for "activation").
- G-63: 63 appids, 10 to 630 step 10, one request (about 1.9 KB URL): batch-ceiling test. A 120-ID variant returned "Invalid URL" in WebFetch.
- G-noextra: https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=%7B%22ids%22%3A%5B%7B%22appid%22%3A2669320%7D%5D%2C%22context%22%3A%7B%22language%22%3A%22english%22%2C%22country_code%22%3A%22US%22%7D%2C%22data_request%22%3A%7B%22include_basic_info%22%3Atrue%2C%22include_assets%22%3Atrue%2C%22include_release%22%3Atrue%2C%22include_platforms%22%3Atrue%2C%22include_links%22%3Atrue%2C%22include_full_description%22%3Atrue%2C%22include_tag_count%22%3A20%2C%22include_ratings%22%3Atrue%7D%7D : EA FC 25 without `include_extra_details`.

appdetails:

- A-2669320: https://store.steampowered.com/api/appdetails?appids=2669320&cc=us&l=english : `drm_notice`, `ext_user_account_notice`, `legal_notice`, categories.
- A-1295660: https://store.steampowered.com/api/appdetails?appids=1295660&cc=us&l=english : Civilization VII `drm_notice` with activation limit, account text with link text.
- A-1808500: https://store.steampowered.com/api/appdetails?appids=1808500&cc=us&l=english : ARC Raiders, no kind keys.

App-page HTML by selector via api.microlink.io (`meta=false&prerender=false`, `?l=english`): base `https://api.microlink.io/?url=https%3A%2F%2Fstore.steampowered.com%2Fapp%2F<N>%2F%3Fl%3Denglish&meta=false&prerender=false` plus `&data.<k>.selectorAll=<css>&data.<k>.attr=<attr>`:

- M-2669320: N=2669320; selectors `.DRM_notice` (class, text), `.anticheat_name` (text), `.DRM_notice a` (href). Used for the EA FC 25 block list and Javelin.
- M-1240440: N=1240440; same selectors. Used for Halo Infinite.
- M-1295660, M-2878980: N=1295660 and N=2878980; selectors `.DRM_notice` (class, text, role), `.anticheat_name`, `.DRM_notice a`.
- M-730, M-2767030: N=730 and N=2767030; selectors `.DRM_notice` (class, text), `.anticheat_name`, `#appHubAppName`.
- M-730-sec, M-2767030-sec: N=730 and N=2767030; selector `.anticheat_section` (html, class).
- M-gated: N=3159330, 2807960, 271590, 1938090, 2358720, 578080; selector `.DRM_notice` (html) and `#appHubAppName`; the first five were redirected to `/agecheck/app/<N>/` or returned the title only, all returned null selectors.

Plain store pages and popups:

- P-2807960: https://store.steampowered.com/app/2807960/Battlefield_6/ : feature-area lines for Battlefield 6 (account with link text, anti-cheat, Javelin, boot protection, EULA, EA Play).
- H-2669320: https://store.steampowered.com/apphoverpublic/2669320?l=english&cc=us : hover popup for EA FC 25, no kind text.

Protobuf:

- PROTO: https://raw.githubusercontent.com/SteamDatabase/Protobufs/master/webui/common.proto : `StoreItem_ExtraDetails` and nested messages; read at offsets 150000 and 200000; a first read from offset 0 (first 100000 characters) did not reach the message.

Local files (raw captures of 2026-10-20 unless noted):

- F-mixed-states: tests/fixtures/getitems/mixed-states.json : byte-exact `anticheat` and account fields for ARC Raiders and Call of Duty; `success` and `unlisted` states for 339800, 99999999, 50300.
- F-german-context: tests/fixtures/getitems/german-context.json : `user_account_third_party` unchanged under `german`.
- F-search-roguelike-50: tests/fixtures/getitems/search-roguelike-50.json : 50-ID batch, 50 items in request order (extra_details trimmed to AI keys).
- F-1808500-page: tests/fixtures/app-page/1808500-ai-only.html : raw `#category_block` with `.anticheat_section.DRM_notice` and the EULA `.DRM_notice[role=button]`.
- F-5072580-page: tests/fixtures/app-page/5072580-ai-first.html : `.DRM_notice` for the AI service.
- F-fixtures-README: tests/fixtures/README.md : capture location, adult-only `success: 1` state, and the no-agecheck observation.
- F-prior-rq2: docs/research/steam-ai-disclosure/rq2-data-surface.md : earlier RQ2 note (search rows, hover popup for the AI sample, `include_extra_details` = field 18, unknown-state guard); not re-read for this note beyond the cited points.
