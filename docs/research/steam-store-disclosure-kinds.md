# Steam store disclosure kinds

## Executive summary

Steam publishes all four disclosure kinds in `extra_details`, the object that `IStoreBrowseService/GetItems` returns when `include_extra_details` is set. The extension makes that request today, and the new kinds need no new host, permission or request. Kernel-level anti-cheat has an explicit flag (`kernel_mode`). Third-party DRM, EULA and third-party account or launcher are free text or links typed by the publisher, and no field names a launcher. Every kind is self-reported, and an absent key means "not declared", never "none". The page text is localized in every language checked, while `GetItems` values are language-neutral. Detection should read `GetItems` first, and the page only for what `GetItems` omits, such as custom anti-cheat names and the activation limit. The Oct 22 change was real but removed only the old reviews endpoint; nothing found touches these fields. Community datasets track Linux compatibility, carry no kernel field and live on non-Valve hosts. Every icon set checked allows commercial use, and Lucide and Phosphor fit best.

## Research questions

### RQ1: What does Steam record per kind, and who declares it?

Steam keeps all four kinds in one object, `extra_details`, which `IStoreBrowseService/GetItems` returns when `include_extra_details` is set. Anti-cheat is the only kind with a public Valve rule (a Steamworks post of 2024-10-30). Every kind is self-reported. Note: [rq1-declarations.md](steam-store-disclosure-kinds/rq1-declarations.md).

- The fields are `anticheat` (an object with `kernel_mode`, `uninstall_completely`, `boot_protection`, `boot_protection_name`, `name` and `name_loc`), `drm_third_party_type` and `drm_activation_limit` (strings), `user_account_third_party` (a string) with `user_account_third_party_link_to_steam` (a bool), and `eula` (a list of name and URL). Every field is optional: a missing key means "not recorded" and never "none".
- No field names a required launcher. It appears inside the DRM or account free text. The publisher types those values, and "Denuvo", "Denuvo Anti-tamper" and "Denuvo Anti-Tampering" all name one vendor. Plain text matching is fragile.
- Press reports the anti-cheat declaration as mandatory for new submissions with a client-side kernel-mode anti-cheat, and optional for other anti-cheat. Valve contacts partners of older games, with no deadline found. No public Valve rule or start date turned up for DRM, account or EULA.
- Nothing shows Valve inspecting binaries. Press says Valve checks that anti-cheat notices are present and correct. No penalty was found for any kind.
- Unverified: the original 2024-10-30 post (its body would not load, and everything about it comes from press), the second anti-cheat checkbox and its polarity, the rules and dates for DRM, account and EULA (partner pages sit behind a login), and the sources of the "RICOCHET" and activation-limit examples.

### RQ2: Where does each kind appear in data?

`GetItems` with `include_extra_details` carries all four kinds as typed fields in `store_items[].extra_details`, and any surface that batches IDs can read them with no new request. The app page and `appdetails` add detail that `GetItems` omits. 32 apps and one 63-ID batch were read. Note: [rq2-data-surface-by-kind.md](steam-store-disclosure-kinds/rq2-data-surface-by-kind.md).

- A key is omitted when nothing is declared. No `false` or empty string showed up; there was one empty object (`anticheat: {}`, Marvel Rivals). Without `include_extra_details` the whole `extra_details` object is absent. In the 63-ID batch, 35 items came back with `success: 15` and no `extra_details`. The existing detector chain already treats that case as unknown. A follow-up request on 2026-10-24 covered 13 apps in one batch, nine of them with no declaration of any kind: Animal Well, Hades, Stardew Valley, Celeste, Hollow Knight, Balatro, Terraria, Portal 2 and Half-Life 2. All nine returned `success: 1` with an `extra_details` object that lacks all four kinds. The Animal Well page has no `.DRM_notice`, `.anticheat_section` or `/eula/` link. An omitted key under a present `extra_details` therefore reads as "not reported".
- `anticheat` has three states in the data: `kernel_mode: true`; an `anticheat` object without `kernel_mode` (Counter-Strike 2 and Dota 2 carry a VAC `name` and `name_loc`, Marvel Rivals carries `{}`); and no `anticheat` key. `kernel_mode`, `uninstall_completely` and `boot_protection` are booleans. Only `true` ever appeared, and false looks omitted (an inference from protobuf defaults). `boot_protection_name` was only ever `secureboot_tpm2`.
- Denuvo shows up in two fields on different apps: `drm_third_party_type` (9 apps, 5 spellings, for example "Denuvo Anti-tamper") and `anticheat.name` (ARC Raiders, with the token `#Store_AntiCheat_Type_denuvo`). No app showed both.
- Launchers and accounts are free text: 12 distinct strings across 9 publishers, plus a bool that says whether the account links to Steam. `anticheat.name` is a closed set of tokens. A custom anti-cheat leaves `name` out, and its name ("EA Javelin Anticheat", "NetEase Game Security") appears only in the page HTML.
- On the page, DRM, account, EULA and kernel anti-cheat are `div.DRM_notice` children of `#category_block`. Kernel anti-cheat is `.anticheat_section.DRM_notice`, non-kernel anti-cheat is `.anticheat_section.anticheat_nonkernel_notice`, and the EULA block is `.DRM_notice[role=button]` with an `/eula/` link. The DRM and account blocks share one class and differ only by their text prefix.
- `appdetails` has `drm_notice` and `ext_user_account_notice` and nothing for anti-cheat or EULA. The DRM activation limit is in the page and `appdetails`, in no `GetItems` field read.
- A 63-ID request returned 63 items, which makes the 50-ID figure a project choice and not the server limit. The true ceiling stayed unknown, because the fetch tool rejected a 120-ID URL.
- Unverified: the protobuf field types, the boot-protection selector and other boot tokens, Vanguard, several single-read strings (such as "Denuvo Anti-Temper"), and why `GetItems` omits a custom anti-cheat name. The researcher also passed its fetch cap (about 46).

### RQ3: What changed around 2026-10-22?

The Oct 22 change is real, and it is narrower than "the store APIs". Valve announced on 2026-10-02 that it would disable `store.steampowered.com/appreviews/<appid>?json=1` on October 22, and it did. On 2026-10-24 that URL returns the store home page as HTML. The replacement is `api.steampowered.com/IUserReviewsService/GetAppReviews/v1/`, and it answers without a key. Nothing found changes `GetItems`, `appdetails` or the app page for the four disclosure kinds. Note: [rq3-oct-2026-changes.md](steam-store-disclosure-kinds/rq3-oct-2026-changes.md).

- The project does not call the reviews endpoint, and the removal does not touch it.
- In the protobuf tracker, the field numbers, names and scalar types of `anticheat`, `eula`, `drm_third_party_type` and `user_account_third_party` are identical at every October checkpoint read.
- One drift is live: `GetItems` now returns `extra_details.has_community_hub` (field 33, added to the protobuf on 2026-10-21). No fixture captured on 2026-10-20 has it. The project's `GetItems` schema (`getitems.schema.ts`) names only the fields it uses, so an extra key is harmless today.
- The announcement says the new endpoint needs a key and the docs say it does not. A keyless call worked on 2026-10-24.
- Unverified: live app-page markup (class names) was not compared with the fixtures, no baseline exists for `appdetails`, the Steam news, SteamDB changelist and Steamworks API changelog were not checked, and the protobuf comparisons come from summaries, not raw diffs.

### RQ4: How stable and localized are the signals?

Every notice string on the app page is localized. Text cannot serve as a detection key. `GetItems` returns language-neutral values for all four kinds. Note: [rq4-stability-localization.md](steam-store-disclosure-kinds/rq4-stability-localization.md).

- Seven store languages were checked on one app, and german and spanish also on a kernel anti-cheat app. Each notice string differs per language, and latam is a separate translation from spanish. The stable page hooks are `.anticheat_section` (with `DRM_notice` for kernel, `anticheat_nonkernel_notice` for non-kernel), `.anticheat_name`, `.anticheat_uninstalls` and `a[href*="/eula/"]`. `.DRM_notice` also holds the account line, the EULA line and the AI-service line. Its count says nothing per kind.
- `GetItems` `extra_details` stayed language-neutral under a german context for every field these kinds use. `anticheat.name_loc` is a token, and five were seen: vac, easyac, battleye, ace and denuvo. Only the content survey text and item names localize.
- `GetItems` is a subset of the page. The activation-limit line and custom anti-cheat names show on the page and are absent from `GetItems` for the apps tested. Older titles also keep anti-cheat names inside `drm_third_party_type`.
- Coverage: apps, DLC, demos and software return `extra_details`. Packages return none. A missing app and bundle 1 return `success: 15`. A delisted app stays `success: 1` with `unlisted: true`. Some mature apps redirect cookie-less page fetches to `/agecheck/` for some clients and adult-only apps go to login. `GetItems` was never gated.
- History: the anti-cheat declaration tool dates from 2024-10-30. The DRM, account and EULA notices are older, but the only evidence is a 2014 forum thread.
- Unverified: markup history (the Wayback Machine was blocked), the markup of the DRM and activation lines, region-restricted and valid-bundle behavior, and when the public protobuf gained `StoreItem_ExtraDetails` (it is absent through 2025-08-29). The researcher passed its fetch cap (about 60) and read element classes through a third-party selector API until it hit a rate limit.

### RQ5: What do Steam's fields miss, and how do other tools cover it?

Steam holds all four kinds as developer-typed fields, and Steam's own `kernel_mode` flag is the only explicit kernel marker anywhere. Nothing is detected from game files. An absent key cannot separate "not declared" from "none". The community datasets track Linux compatibility, carry no kernel field and live on non-Valve hosts. Note: [rq5-gaps-and-community-data.md](steam-store-disclosure-kinds/rq5-gaps-and-community-data.md).

- Gaps seen on 2026-10-24: Elden Ring and Rainbow Six Siege have no `anticheat` key, though AreWeAntiCheatYet lists Easy Anti-Cheat for Elden Ring and Valve's Steam Deck report flags an unsupported anti-cheat for Siege. Battlefield 6, Call of Duty and PUBG carry `kernel_mode: true` with no vendor name. Marvel Rivals has an empty `anticheat` object. DOOM: The Dark Ages still carries a Denuvo string months after reports of its removal.
- Steam has no store tag for any of the four kinds (446 tags checked). The one anti-cheat category, id 8, covers Valve's own VAC only.
- The Steam Deck report returns anti-cheat tokens only for tested apps with an unsupported result. It says "does not work on Linux" and never "kernel-level".
- AreWeAntiCheatYet is MIT licensed, with 1,167 games, about 59 percent with a Steam ID and about 60 spellings of vendor names. PCGamingWiki is CC BY-NC-SA 3.0 and has anti-cheat and DRM fields, but anonymous `cargoquery` was denied. No machine-readable Denuvo or launcher list turned up. The Steam curator "Denuvo Watch" is the one maintained Denuvo tracker found.
- Community sources need a vendor name to derive kernel status. Easy Anti-Cheat, BattlEye, FACEIT and Vanguard are documented kernel drivers. Ricochet, nProtect GameGuard, XIGNCODE3 and Denuvo Anti-Cheat rest on press or vendor statements.
- Unverified: Steam's full list of vendor tokens, SteamDB (it returned 403), PCGamingWiki row data, and kernel status for VAC, Hyperion and the East Asian vendors. The researcher used about 55 fetches, well over its cap.

### RQ6: Which icon set fits chip icons at 12 to 16 px?

All eleven candidate sets allow commercial use, and none has a copyleft, non-commercial or share-alike clause. Lucide covers every concept we need, with outline strokes only. Phosphor is the closest to solid glyphs for every concept but has no crossed swords. Note: [rq6-icon-sets.md](steam-store-disclosure-kinds/rq6-icon-sets.md).

- Licences: Lucide is ISC with a second MIT notice for icons derived from Feather (`lock` and `key` are among them). Tabler, Phosphor, Heroicons, Bootstrap Icons, Iconoir and Radix Icons are MIT. Material Symbols and Carbon are Apache 2.0. Font Awesome Free icons are CC BY 4.0, which makes attribution mandatory, and its sparkles, swords and shield-alert are Pro only. Remix Icon 4.9 ships a custom licence (January 2026) that bars distributing the icons as a standalone product or building a competing icon set, while its npm record still says Apache 2.0.
- Coverage of eight concepts (AI, kernel anti-cheat, anti-cheat, DRM, account, EULA, PvP, launcher): Lucide has all eight (`sparkles`, `shield-alert`, `shield`, `lock`, `user`, `scroll-text`, `swords`, `app-window`). Tabler has eight but no `scroll`. Phosphor and Heroicons have seven, because Phosphor offers a single `sword` and Heroicons has none.
- Weight: Lucide is outline only. Phosphor and Material Symbols come closest to a solid variant for every concept, and Heroicons has a dedicated 16 px solid set.
- Bundling: eight icons cost about 2 to 5 KB in any set. Lucide's modules are `[tag, attrs]` arrays and its `createElement` calls `createElementNS`, with no `innerHTML`. The other sets ship SVG files and need a build-time path extraction.
- Maintenance: Lucide 1.61.0 (2026-10-21) and Tabler 3.49.0 (2026-10-05) release often. Phosphor core 2.1.1 (2024-03) and Heroicons 2.2.0 (2024-11) have had no npm release for about two years, though their repos show 2026 commits.
- The researcher's ranking (judgment): Phosphor fill, Lucide, then Heroicons 16 solid, with Lucide first if an outline look is acceptable.
- Unverified: rendering at 12 to 16 px was not tested, byte sizes are estimates except Heroicons (3,534 B for seven icons), the Material sparkle icon is missing from the SVG package, and several names were read through the Iconify mirror. The researcher used about 150 fetches against a cap of 25.

## Conclusions

What we now know.

- All four kinds sit in `extra_details` of the request the extension makes today (`GetItems` with `include_extra_details`). The new kinds need no new host, permission or request.
- Everything is developer-declared. Nothing is detected, and no source shows Valve checking binaries. Press reports Valve checking that anti-cheat notices are present and correct. A verdict can say "reported". It cannot say a game lacks the feature.
- Kernel-level anti-cheat has an explicit boolean, `anticheat.kernel_mode`. It can be true with no vendor name (Battlefield 6, Call of Duty, PUBG). No community source carries a kernel field.
- Third-party DRM, EULA and account or launcher are weaker. DRM and account are free text with spelling drift, `eula` is a list of name and URL, and no field names a launcher. Denuvo appears in two fields on different apps.
- A game that declares nothing still returns `extra_details`, with all four kinds absent (nine apps from 2004 to 2024, Animal Well among them). An item without `extra_details` is unknown.
- The page localizes every notice, while `GetItems` values are language-neutral. The extension sends the page's Steam language as `context.language` (`getitems.ts`), and these fields do not change with it. The stable page hooks are `.anticheat_section`, `.anticheat_name` and `a[href*="/eula/"]`. DRM and account blocks share one class and differ only by text. Only `GetItems` tells them apart.
- `GetItems` omits custom anti-cheat names and the activation limit. Both show on the page and in `appdetails`.
- The Oct 22 reviews change removed one old endpoint and is irrelevant to these fields. The only drift found is the new `has_community_hub` key.
- Only anti-cheat has a public Valve rule (2024-10-30). No public rule or start date turned up for DRM, account or EULA.
- Every icon set checked allows commercial use. Lucide covers all eight icon concepts, and its icon data builds SVG without `innerHTML`.

What stays open.

- Whether every app that declares nothing returns `extra_details`. Nine did, and the sample is small.
- The original 2024-10-30 post, and the Steamworks rules for DRM, account and EULA (partner pages sit behind a login).
- The `GetItems` batch ceiling above 63 IDs, live app-page markup against the fixtures, and an `appdetails` baseline.
- Boot-protection selectors and tokens, kernel status of VAC, Hyperion and the East Asian vendors, and why `GetItems` omits custom anti-cheat names.

## Recommendations

- Treat `GetItems` as the source for all four kinds. Parse the page only for what `GetItems` lacks, and key on classes and links, never on notice text.
- Capture fixtures before any code. The repo has no DRM or account notice fixture, none of the 2026-10-20 captures has `has_community_hub`, and there is nothing for packages, delisted apps or an app with no declarations. `scripts/capture_fixtures.py` is the tool.
- Widen the "declares nothing" check beyond the nine apps seen: sample about 30 apps across ages and publishers, plus a package and a delisted app, and keep them as fixtures. The three-state mapping for every new kind rests on it.
- Write an umbrella ADR for the scope change before code. It must say how rule 4 (semantics and wording) extends to the new kinds, and that free text from developers renders verbatim through `textContent`.
- Needs another `/wf:research`: the Steamworks partner-admin rules for DRM, account and EULA, which need a partner login the researchers lack. Also the batch ceiling, if the 50-ID budget ever matters.
- Icons: if the design session approves chip icons, use Lucide as an exact-pinned dependency and import only the icons we draw. Its outline style matches the new extension mark. Phosphor's fill weight sits closer to Steam's flat glyphs but has no crossed swords. Record the library check in the ADR (rule 12).
- Ship the licence notices in `THIRD_PARTY_NOTICES`: Lucide (ISC) with the Feather MIT notice, and Tabler (MIT) for the Steam outline the extension mark derives from.
