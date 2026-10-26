# Plan: In-App Purchases, Steam Deck and Steam Machine status, Family Sharing, and reverse tagging

Status: draft, not for the repo. Read from the tip of `fix/dlc-page-header-host` (b892cba, decisions up to 56), extracted to `scratchpad/nk/tree`. Spanish strings are written with `\uXXXX` escapes here to keep this file ASCII; the catalogs hold the real characters.

Numbering: decisions 57 and 58 are reserved for the package and bundle summary and the demo work. The new-kinds decisions start at 59 and read "N, to be renumbered if the stack changes". The last ADR on the stack tip is 0013, which makes the new ADRs 0014 and 0015, numbered apart from the decisions.

## 1. What the code does today (the facts the plan builds on)

- Kinds are data. `KINDS` in `src/core/kinds/registry.ts` lists 7 definitions; `KindId`, `perKind`, settings defaults, the cache and the ignore lists derive from it. A `KindDefinition` has `fromGetItems(item, details, language)`, optional `fromAppPage`, a `stored` schema built with `storedDisclosed`, `messages { heading, chip }`, `defaults: KindSettings` and `ttl`.
- A verdict is `disclosed | not-disclosed | unknown` (`src/core/types.ts`). `UnknownReason` is `gated | missing | malformed | error | rate-limited`; only the first three are stored (`cache/ttl.ts`).
- `itemVerdicts` in `detect/getitems.ts` returns unknown `missing` for every kind when `extra_details` is absent, and calls each kind otherwise. `categories` arrives without any flag: the 2026-10-24 `kinds.json` capture (request with `include_extra_details` only) holds `categories.feature_categoryids`. Only `supported_player_categoryids` is in `CategoriesSchema` today.
- The request is fixed: `data_request: { include_extra_details: true, include_basic_info: true }` in `getItemsUrl`, and the same in `scripts/canary.py` and `scripts/capture_fixtures.py`. `planBatches` measures its overhead from `getItemsUrl([])`, which counts a new flag in the 4,000 character URL limit by construction.
- The cache stores `v1:a:<id>` as `{ time, kinds, parent?, developers?, publishers? }`. `decodeVerdicts` returns undefined when any registered kind is missing, which means a new kind refetches every cached app once even without a `CACHE_SCHEMA` bump. `isFresh` takes the shortest TTL over all kinds (AI not disclosed: 12 h is the floor today). `CACHE_SCHEMA` is 4.
- Settings: `kinds.<id> = { enabled, badge, banner, filter, color? }`, parsed per field with `v.fallback` against the kind's defaults (`kinds/kind-settings.ts`). A new kind needs no migration: an absent `kinds.<id>` takes its defaults. Backups carry the shape of `v2:settings` and are read by `parseSettings`.
- List filter: `applyKindSettings` writes `data-sar-filter-<id>` on the root; `createHostKindsRenderer` writes `data-sar-kinds` on hosts from verdicts and the ignore lists only; `styles.css` lists 5 rule groups per kind by hand and `shared.css` one color rule per kind; `styles.test.ts` fails for a missing kind. A badge switch change calls `capsules.refresh()`, which redraws hosts and writes only what changed.
- Hover card: one source line per card, `badge_card_declared` ("Declared by the developer on the store page"). The chip name is `$chip$: $heading$`, collapsed when chip equals heading (PvP). Banner region label `banner_region_label` is "Declared by the developer".
- Ignoring: `isIgnored(ignored, id, kind, related)` in `ignored.ts`, per kind or all kinds, with parent and creators.

## 2. Prerequisite: bundle budgets (measured)

Built on the stack tip in the scratch copy with the main checkout's `node_modules` through a symlink (`gen_i18n_keys.py`, `gen_catalogs.py`, `gen_styles.py`, `build.py`):

| Bundle | Size now | Budget | Headroom |
| --- | --- | --- | --- |
| `content.js` | 200,551 B | 200 KiB = 204,800 B | 4,249 B |
| `options.js` | 147,212 B | 150 KiB = 153,600 B | 6,388 B |
| userscript | 281,727 B | 284 KiB = 290,816 B | 9,089 B |

Where the bytes go: `shipped.gen.ts` (both catalogs, messages only) is 24,395 B in every bundle. Of it, about 14.0 KB are settings-only keys (`options_*`, backup, settings errors, `userscript_*`) that `content.js` never reads, and about 7.5 KB are page-only keys (`banner_*`, `notice_list_*`, `badge_card_*`, `kind_chip_*`, detail lines, breaker logs) that `options.js` never reads. A short `kind_*` entry costs 62 B per locale on average, about 130 B per key in each bundle. A kind module costs 0.9 to 1.4 KB (PvP 1,376 B). The per-kind CSS is about 410 B of selectors plus a 70 B color rule in each stylesheet that imports `shared.css`; `content.css` is outside the budget, the userscript carries all of it.

Estimated cost of the work (each PR re-measures):

| Slice | content.js | options.js | userscript |
| --- | --- | --- | --- |
| A. catalog split | -13.0 KB | -7.0 KB | +0.3 KB |
| B. In-App Purchases | +1.5 KB | +1.4 KB | +2.3 KB |
| C. sections, facets, Deck, Machine | +7.0 KB | +7.0 KB | +10.0 KB |
| D. Family Sharing | +1.8 KB | +1.6 KB | +2.4 KB |
| End state | about 197.9 KB | about 150.2 KB | about 296.7 KB |

Conclusion: without the split, slice C breaks `content.js` and `options.js`. Slice B alone fits. The split must land before C. The userscript ships both catalogs and every stylesheet, and its budget rises in C whatever happens: propose 304 KiB with the measured number, as decisions 53 and 54 did.

### Slice A design: one catalog per surface

- `scripts/catalogs.py` gets one table that assigns each key to `page`, `settings` or `shared` (by prefix, with a short list of exceptions such as `error_allow_list_save`, which the banner uses). `gen_catalogs.py` writes `shipped-page.gen.ts` and `shipped-settings.gen.ts` (shared keys in both); `gen_i18n_keys.py` writes `PageMessageKey` and `SettingsMessageKey` unions.
- `createI18n` and `MessageCatalog` take the key union as a type parameter. `settings-form.ts` and `backup-card.ts` take `MessageCatalog<SettingsMessageKey>`; the page UI takes `MessageCatalog<PageMessageKey>`. A key used on the wrong surface fails the type check, which beats a runtime fallback.
- Roots: `content.ts` imports the page catalog, `options.ts` the settings catalog, the userscript merges both. `AppDeps.catalogs` keeps its default.
- Tests: a table test that every catalog key sits in exactly one group or in shared; the existing `shipped.test.ts` and `check_i18n.py` run per file. No restating tests.
- Library check: none needed (a code generator over our JSON).
- Decision 59 (to be renumbered if the stack changes). Effort M.

## 3. The general model: kinds, facets and the three states

A kind keeps one stored verdict per app. A faceted kind's disclosed verdict carries one `facet`, the Steam value it reports. A facet is a value a person can choose to tag. For facet `f` of kind `k`:

- disclosed when the verdict of `k` is disclosed with `facet === f`;
- not disclosed when the verdict is disclosed with another facet, or not disclosed;
- unknown when the verdict is unknown.

That is rule 4 per facet, derived, with nothing extra stored. Kinds without facets (the current 7, and In-App Purchases) keep working unchanged.

A game is tagged for a kind when its verdict is disclosed, its facet is one the person chose (`kinds.<id>.facets`), and the game is not ignored for the kind. Everything that draws or filters reads "tagged": chips, the tag section, the hover card entry, the banner entry, `data-sar-kinds`. An untagged facet renders exactly like not disclosed (principle 2, nothing for absence). The ignore list still wins over everything.

### Separate registry entries per facet versus one kind with facets

| | A: one registry entry per facet (`deck-unsupported`, `deck-verified`, ...) | B: one kind with facets (chosen) |
| --- | --- | --- |
| New kinds for Deck, Machine, Family | 8 (3 + 3 + 2) | 3 |
| Settings cards (popup today: 7) | 16 with IAP | 11 with IAP |
| Stored per cached app | 8 entries, about 40 B each when not disclosed: about 320 B more per app, about 1.6 MB for 5,000 cached apps | 3 entries, about 120 B |
| PAGE_CSS (userscript, `content.css`) | 8 x about 480 B = about 3.8 KB | 3 x about 480 B = about 1.4 KB |
| Catalog | a heading and chip per facet | a heading per kind, a shared word per value, one chip pattern |
| Ignore scopes | per facet ("Ignore for this tag" on Deck Unsupported only) | per kind, which matches how a person thinks about it |
| New mechanism | none | facet list on the definition, `facets` setting, tagged view, chip per facet |
| Settings change | root attribute only | a facet change redraws hosts, like the badge switch does today |

Recommendation: B. The registry's cost per entry (a card, a stored entry per app, 5 CSS rule groups, a color rule, a scope) is paid per kind, and A multiplies it by the facet count to avoid about 1.5 KB of facet code. B keeps `data-sar-kinds` and `data-sar-filter-<kind>` as they are: a host carries `deck` only when its facet is chosen, and the Show, Dim, Hide filter then acts on chosen values only, since a filter matches what `data-sar-kinds` holds. The one cost is that a facet change touches hosts, which amends principle 7 and decision 12 for this setting only: `capsules.refresh()` walks marked hosts and writes only changed attributes, the path the badge switch takes today.

Rejected variant B2: facet tokens on hosts (`deck-unsupported`) with per-facet root filters. It keeps principle 7 for the filter but needs 9 facet entries in the hand-listed CSS (about 4.3 KB) and still redraws chips on a facet change.

### Data model (TypeScript shape, abbreviated)

```ts
// kinds/kind.ts
export interface FacetDefinition<F extends string> {
  readonly id: F;
  /** Steam's word for the value, shown as the hover card line and in settings. */
  readonly word: BareMessageKey;
}
export interface KindDefinition<D extends DisclosedBase> {
  // ...as today, plus:
  /** Who states the fact: the developer, or Valve for what Valve computes. */
  readonly source: "developer" | "valve";
  /** GetItems sections the kind reads besides `extra_details` and `categories`. */
  readonly sections?: readonly Section[];
  /** The values a person can choose to tag; absent for a kind with one value. */
  readonly facets?: readonly FacetDefinition<FacetOf<D>>[];
}
```

- A faceted disclosed type has `readonly facet: F` in its `storedDisclosed` fields (`v.picklist` of the ids); the stored entry is `{ "state": "disclosed", "kind": "deck", "source": "api", "facet": "unsupported" }`.
- `kinds/facets.ts`: `isTagged(kind, verdict, settings)` and `taggedView(verdicts, settings): KindVerdicts`, which maps an unchosen facet to `NOT_DISCLOSED.api` for drawing only and returns the same object when nothing changes (no allocation for kinds without facets). Called in one place per surface: the capsule UI's draw, the app page's banner and tag section input, the hover card binding.
- `kindDetails` gains a case per new kind; a faceted kind returns `[message(facet.word)]` plus any line the facet adds (Family's unlisted line).

### Settings schema

```ts
// kinds.<id> for a faceted kind; other kinds unchanged
{ enabled: false, badge: true, banner: true, filter: "off", facets: ["unsupported"] }
```

- `KindSettings` gains `readonly facets?: readonly string[]`, present only for faceted kinds. `parseKindSettings(kind, stored)` takes the definition (today it takes `defaults`); for a faceted kind the field is `v.fallback(v.pipe(v.array(v.unknown()), v.transform(keepKnownIds)), defaults.facets)`, where `keepKnownIds` drops unknown or repeated ids and orders by the definition. A non-array falls back to the default; an empty array is kept and means nothing is tagged.
- `encodeKindSettings` writes `facets` for faceted kinds only; `mergeKindSettings`, `wholePatch` and the backup pass it through. No `migrate.ts` change: absent kinds take defaults. Backup format stays version 1: the field is additive inside `settings`, an older reader drops it and keeps the rest (record that in the decision, since decision 54 says a shape change bumps `BACKUP_VERSION`).
- Defaults: every new kind starts with `enabled: false`, like PvP (decision 47), badge and banner on, filter off. Facet defaults: Deck and Machine `["unsupported"]`, Family `["unsupported"]`. The person who turns a status kind on gets the warning use case first and can add Verified or Playable.
- `effectiveSettings` stays as is; a faceted kind with no chosen facet tags nothing, the same as off.

### UI (no redesign; the tabs move is a separate backlog item)

- Settings card of a faceted kind: one more fieldset, above the badge switch, labelled `options_facets_label`, with one checkbox per facet labelled with Steam's word (Verified, Playable, Unsupported; Family Sharing, Family Sharing not Available). `data-sar-setting="facets"` joins `FIELDS`. Shown on the page, in the popup and in the userscript dialog, since the choice decides what the tag means. Help text `options_facets_help`.
- Chip text per facet: a status chip is `kind_compat_chip` = "$device$ $value$" with a short device word (Deck, Machine) and Steam's value word: "Deck Unsupported", "Machine Playable". Family: "Family Sharing" and "Family Sharing not Available". The accessible name of a faceted chip is `kind_facet_name` = "$heading$: $value$" ("Steam Deck Compatibility: Unsupported"), replacing `$chip$: $heading$`, which would read "Deck Unsupported: Steam Deck Compatibility".
- Color: one custom color per kind, shared by its facets (`--sar-kind-color-deck`); `data-sar-kind="deck"` on chips and entries, one more hand-listed rule per kind in `shared.css`. No per-facet color (open question).
- Hover card entry: Steam's heading as the title, Steam's value word as the line, then the source lines (section 5).
- Banner: the entry heading for a faceted kind is `kind_facet_name` ("Steam Deck Compatibility: Unsupported"). "Ignore for this tag" ignores the kind, every facet. The region label for several entries becomes `badge_tags_title` ("Tag Kit tags for this product") when any entry comes from Valve, since "Declared by the developer" would be false for it; all-developer banners keep it.
- Tag section on app pages: one chip per tagged kind with its facet chip text, in registry order, as today.
- Ignore list: `isIgnored` unchanged, per kind, with parent and creators. Ignoring Valve as developer also ignores Valve's games for Deck. An ignored facet never shows a "not supported" note in its place.

## 4. The kinds

### 4.1 In-App Purchases (`iap`), slice B

- Data: `categories.feature_categoryids` contains 35 (`#category_in-app_purchases`, computed 0, declared by the developer in Steamworks).
- States: list absent: unknown `missing`; field malformed: unknown `malformed`; 35 present: disclosed; list present without 35 (empty included): not disclosed. Same shape as PvP.
- No facets, `source: "developer"`, TTL `WEEK_TTL`, defaults off (35 is on about half of the captured games: 730, 1174180, 1808500, 3751950, 2807960).
- Schema: `CategoriesSchema` gains `feature_categoryids: v.exactOptional(list(v.number()))`; `MAX_LIST_LENGTH` 50 covers the 18 to 20 seen.
- Catalog: `kind_iap_heading` "In-App Purchases" (Steam's category name, verified in the store's English strings, key `category_in-app_purchases`); `kind_iap_chip` "In-App Purchases" (same as heading, like PvP; the badge collapses the name). Spanish: unverified; the store renders category names server-side and SteamTracking holds only the English store strings. Candidate "Compras dentro de la aplicaci\u00f3n"; verify on `/app/730/?l=spanish` `#category_block` before merging.
- Decision 60 (to be renumbered if the stack changes). Effort S.

### 4.2 Steam Deck Compatibility (`deck`) and Steam Machine Compatibility (`machine`), slice C

- Data: `platforms.steam_deck_compat_category` and `platforms.steam_machine_compat_category` (needs `include_platforms`). Enum: 0 Unknown, 1 Unsupported, 2 Playable, 3 Verified. Live: Machine differs from Deck (RDR2: Deck 2, Machine 2; ARC Raiders: Deck 2, Machine 3); unreleased games return 0.
- One parser, `kinds/compat.ts`: `compatKind(id, field, messages)` returns a `KindDefinition` with facets `verified`, `playable`, `unsupported`, `source: "valve"`, `sections: ["platforms"]`.
- States: section not requested: unknown `unrequested` (new reason, section 6); `platforms` absent in a requested answer: unknown `missing`; field not an integer in 0..3: unknown `malformed` (a new Valve value shows up in the canary before users see it); 0: not disclosed (Valve has no rating; our copy never shows it, and it is never shown as Unsupported); 1, 2, 3: disclosed with facet unsupported, playable, verified.
- TTL: disclosed 7 days, not disclosed 12 hours (equal to today's floor: the entry refreshes no more often than now).
- Catalog (Steam's words, verified in SteamTracking `shared_english.json`/`shared_spanish.json` and `steamui_*`):

| Key | English | Spanish (Spain) | Source |
| --- | --- | --- | --- |
| `kind_deck_heading` | Steam Deck Compatibility | Compatibilidad con Steam Deck | `GamePerformanceStats_Header`, `DeckVerified_CompatibilitySection_Title` (Steam uses a no-break space; we use a plain one, as the es catalog has none) |
| `kind_machine_heading` | Steam Machine Compatibility | Compatibilidad con Steam Machine | `SteamMachine_CompatibilitySection_Title` |
| `kind_compat_verified` | Verified | Verificado | `SteamDeckVerified_Category_Verified` |
| `kind_compat_playable` | Playable | Jugable | `SteamDeckVerified_Category_Playable` |
| `kind_compat_unsupported` | Unsupported | No compatible | `SteamDeckVerified_Category_Unsupported` |
| `kind_deck_short` | Deck | Deck | our short form, for chips only |
| `kind_machine_short` | Machine | Machine | our short form; Steam has none (open question) |
| `kind_compat_chip` | $device$ $value$ | $device$: $value$ | pattern ("Deck Unsupported", "Deck: No compatible") |
| `kind_facet_name` | $heading$: $value$ | $heading$: $value$ | accessible name and banner heading |

  Steam shares the category words between Deck and Machine (the `SteamDeckVerified_Category_*` keys); confirm on one live Machine section in each language.
- Decisions 61 (facets) and 62 (Deck and Machine), to be renumbered if the stack changes. Effort L for the slice.

### 4.3 Steam Frame and SteamOS: recommend no, for now

Same parser, zero request cost (the fields come in the same `platforms` block), one registry line and three catalog keys each, about 2.5 KB in `content.js` and one more settings card. Against: Frame is a VR headset and its rating is "Steam Frame Standalone Compatibility" (ES "Compatibilidad con Steam Frame (ejecuci\u00f3n nativa)", verified), a narrow audience; SteamOS uses other words (Compatible, Unsupported, Unknown, ES "Compatible", "Incompatible", "Sin determinar") with no Verified or Playable, and Steam Machine runs SteamOS, which covers the main case. Revisit on request; the design adds them without new mechanism.

### 4.4 Family Sharing (`family`), slice D

- Data: `categories.feature_categoryids` contains 62 (`#category_family_sharing`, computed 1: Steam derives it, no developer declares it). No negative field exists in GetItems; the client's "Family Sharing not Available" is per user and owned games only.
- Evidence for the derived negative: 7 live items (Cyberpunk, ARC Raiders, Hades, ReBlade list 62; RDR2, AC Black Flag Resynced, CS2 do not) and the 2026-10-24 `kinds.json`: every paid game there lists 62 except Battlefield 6 (2807960), AC Black Flag Resynced (3751950) and 271590; every free game (730, 570, 1172470) lacks it; the package 320795 lists it.
- States:
  - `categories` malformed: unknown `malformed`;
  - `feature_categoryids` absent or empty (the demo 4513800): unknown `missing`;
  - 62 present: disclosed, facet `supported`;
  - non-empty list without 62 and `is_free` not true and `type` 0 (a game): disclosed, facet `unsupported`;
  - non-empty list without 62 on a free game or another item type: not disclosed. Free games are never shareable, which would put the chip on every free-to-play game; DLC follow their base game in Steam Families. `is_free` and `type` are top-level item fields in the base request; both go in the schema as droppable.
- `source: "valve"`, TTL `WEEK_TTL`, defaults off with `facets: ["unsupported"]`.
- Catalog:

| Key | English | Spanish (Spain) | Source |
| --- | --- | --- | --- |
| `kind_family_heading` | Family Sharing | Pr\u00e9stamo familiar | `AppDetails_Feature_FamilySharing`, `FilterElement_FamilySharing` (client) |
| `kind_family_supported` | Family Sharing | Pr\u00e9stamo familiar | same word, the facet's line and chip |
| `kind_family_unsupported` | Family Sharing not Available | Pr\u00e9stamo familiar no disponible | `DisplayStatus_Compact_OwnerLocked` (client); Steam's capitalization kept, as for "Requires 3rd-Party Account" |
| `kind_family_unlisted` | Family Sharing is not in the features Steam lists for this game. | El pr\u00e9stamo familiar no figura entre las caracter\u00edsticas que Steam indica para este juego. | our copy, hover card line under the unsupported facet |

  The unlisted line states a fact about Steam's data and nothing about the game, which is how rule 4 copy discipline reads for a derived value. Rejected chip "No Family Sharing": our own words and a bare negative, the pattern rule 4 bans for absent keys. Steam's sentence "This game does not support Steam Family sharing" (`FamilyGroup_GameExcluded`) is too long for a chip and states the fact more strongly than our derivation supports.
- Decision 64 (to be renumbered if the stack changes). Effort M.

## 5. Source line (hover card and banner)

- `KindDefinition.source`: `developer` for the 7 current kinds and IAP (categories 35, 49, 36, 47, 37 are developer-declared, computed 0); `valve` for Deck, Machine and Family Sharing (Valve's testing; category 62 computed 1).
- Hover card: the closing lines follow the entries the card lists: `badge_card_declared` when at least one entry is from the developer, `badge_card_valve` when at least one is from Valve, both when mixed, in that order. Built once per fill, as today.
- Strings: `badge_card_valve` EN "According to Valve", ES "Seg\u00fan Valve". Steam's own phrasing for ratings is "Valve's testing indicates..." / "...las pruebas de compatibilidad con Steam Machine realizadas por Valve", which supports naming Valve. The same line for Family Sharing: Valve computes category 62, and the unlisted line says the negative is read from Steam's list.
- Rule 4 checks: none of the new strings says "uses AI", "AI-free" or "no AI", which `check_i18n.py` and `tests/catalog-wording.test.ts` enforce. No string renders not disclosed or unknown. Recommend adding to both checks a guard that no catalog line starts with "No " followed by a kind heading (catches a future "No Family Sharing"); it is cheap and keeps the discipline mechanical.
- README line 30 and `components.mdx` "Voice and copy" change from "a line naming the developer as the source" to "a line naming the source: the developer, or Valve for the ratings and Family Sharing". Decision 63 (to be renumbered if the stack changes).

## 6. Request sections and the cache (ADR 0014, slice C)

- `Section = "basic_info" | "platforms"`. `extra_details` is always requested (rule 4 rests on it); `categories` needs no flag.
- `requiredSections(settings, need)`: `platforms` when an enabled kind declares it; `basic_info` as today (always) in this stack. One function, read at request time: a settings change applies to the next batch.
- `getItemsUrl(ids, language, sections)` adds `include_platforms: true` and `include_basic_info: true` from the set. Still one request per batch of up to 50 unseen IDs. URL: the flag adds about 35 encoded characters to the overhead; a full batch of 50 seven-digit IDs is about 1,900 characters, far under 4,000, and `planBatches` counts the overhead from the URL as before.
- Payload: about 175 B per item for `platforms`, about 8.8 KB per 50-item batch before compression, only for people who turn on a status kind.
- `itemVerdicts`: a kind whose section was not requested gets the new `UNKNOWN.unrequested`. It is stored, which lets the rest of the entry cache, never rendered, excluded from `isFresh` (TTL infinite) and from `isTransient`.
- Stored shape: `{ time, sections: ["basic_info", "platforms"], kinds, parent?, developers?, publishers? }`. `StoredAppSchema` gains `sections: v.array(v.picklist(SECTIONS))`; an entry without it is invalid and refetched. `CACHE_SCHEMA` 4 to 5 resets the cache on the next start (the new kinds would invalidate every entry anyway).
- Cache lookup: `VerdictCache.lookup(ids, needed)` is a hit only when `entry.sections` covers `needed`. Turning a platform kind off keeps every entry valid (a superset); turning one on makes entries without `platforms` misses.
- Enabling later: the settings subscriber in `app.ts` sees a new required section and calls `capsules.redetect(lacking)`, which sends the hosts whose verdicts lack the section through `detect` again (cache misses, batched by 50, the throttle and breaker as usual), and the app page asks once for its app. Until the answer, those hosts hold unknown `unrequested` and show nothing; never Unsupported. A rule-13 check: one request per 50 such hosts, triggered by an event, no timer.
- Optional slice E (perf, decision 65): request `basic_info` only on app pages and when a creator list is non-empty, using the same coverage check (an ignore from the banner then refetches entries lacking creators once). ADR 0013 records the `basic_info` size as unmeasured; it carries `short_description` and is likely larger than `platforms`. Measure with one live batch with and without the flag first.
- Canary (`scripts/canary.py`): the GetItems call asks for `include_platforms` (still one request). Checks: each sample item has a `platforms` object whose four compat fields are integers in 0..3 when present; across the sample some app has a Deck value 3 and some app has a Machine value other than 0 (no single game is pinned to a rating); `feature_categoryids` is a list of integers; some app lists 35; some app lists 62 and some paid game with a non-empty list lacks it; every `is_free: true` sample item lacks 62 (the rule D relies on). Add 1145360 (Hades) and 1091500 to `SAMPLE`.
- Fixture capture (`scripts/capture_fixtures.py`): the `kinds` request adds `include_platforms`; `trim_item` keeps `platforms` as served (about 175 B). Add to `KIND_APPS`: 1091500, 1174180, 3489340 (coming soon, all zeros), 4513800 (demo, no feature list). README table rows updated; the hand-trimmed `creators.json` and `dlc-parent.json` stay. A DLC with `platforms` (5201760) is captured to settle open question 9.

## 7. ADRs, rule 4 and decisions

- ADR 0014, "GetItems sections follow the enabled kinds" (amends ADR 0001): the flag-set policy (`extra_details` always; `platforms` when a platform kind is on; `basic_info` as today, gating deferred to slice E), the stored `sections`, coverage-based cache hits, `unrequested`, the refetch on enable, payload and URL numbers. Alternatives: always request `platforms` (8.8 KB per batch for everyone, simplest cache); a second request for platform kinds only (breaks one request per batch); separate cache keys per section (two reads per app).
- ADR 0015, "Kinds Valve computes, and one derived negative" (amends ADR 0010's "Every field is declared by the developer" and ADR 0009's source line): Deck and Machine ratings are Valve's, named "According to Valve"; Unknown (0) is not disclosed and never shown; Family Sharing's supported value is Valve-computed and its unsupported value is derived from a computed category's absence under the conditions in 4.4. Alternatives: no negatives at all; the negative only from the signed-in client (needs credentials, against rule 1); community data (rule 1).
- Rule 4 needs an edit: today it says an item with `extra_details` and no key for a kind is not reported, which the Family negative contradicts. Proposed text:

  > 4. **Semantics.** Three verdict states: disclosed, not disclosed, unknown. Unknown is never stored or shown as not disclosed. An item without `extra_details`, or without a section a kind reads, is unknown; an item with them and no key for a kind is not reported, unless an ADR derives a value from a field Steam computes for every item (ADR 0015). Neither state renders as "none", "DRM-free" or "no anti-cheat". A tag uses Steam's own words for its kind and names its source: the developer, or Valve for what Valve computes. Our own copy never says "uses AI", "AI-free" or "no AI", and states nothing about a game beyond Steam's words and data. The developer's own text is rendered verbatim through `textContent`.

- `src/core/AGENTS.md`: "A new tag kind" gains `source`, optional `sections` and `facets`; "The DOM marks" says `data-sar-kinds` holds the kinds that are tagged (disclosed, a chosen facet, not ignored).
- Decisions (each "to be renumbered if the stack changes"): 59 catalog split per surface; 60 In-App Purchases; 61 faceted kinds and filters on chosen values (amends principle 7 and decision 12 for the facet setting); 62 Steam Deck and Steam Machine status (defaults, Unknown never shown, short device words, Frame and SteamOS deferred); 63 the source line per entry and the banner region label (amends decisions 35 and 43); 64 Family Sharing; 65 optional `basic_info` gating.

## 8. Tests (rule 17)

Builders first, in `tests/helpers/`:
- `getitems.ts`: `storeItem` takes `features` (feature list), `platforms` and `isFree`/`type` overrides; a `platformsBlock({ deck, machine })` factory with the captured shape.
- `verdicts.ts`: `FULL_DISCLOSED` and `disclosedKinds` gain `iap`, `deck`, `machine`, `family` (typed, the checker names them); `facetVerdict(kind, facet)`.
- `settings.ts`: `withFacets(settings, id, facets)`.

Tables (`it.each` over builder output), one idea each:
- Deck and Machine `fromGetItems`: 0 not disclosed; 1, 2, 3 their facets; 7 and "3" malformed; `platforms` absent when requested unknown `missing`; not requested unknown `unrequested`; the unreleased item (all zeros) not disclosed.
- Rendering: with facets `["unsupported"]`, values 0, 2, 3 and unknown draw no chip and no `data-sar-kinds` token; value 1 draws "Deck Unsupported". This is the "Unknown is never Unsupported" guard, through the public renderer.
- Family: 62 present, non-empty without 62 (paid game), the same on a free game, the same on a DLC, empty list, missing list, the demo fixture, malformed categories.
- IAP: 35 present, absent from a list, empty list, missing list, malformed.
- Settings: `facets` missing, non-array, unknown id, repeated id, empty array; round trip through `encodeSettings` and a backup file.
- Request: enabled kinds to `data_request` keys (include_platforms only with Deck or Machine on); `planBatches` stays under 4,000 for 50 maximal IDs with every flag.
- Cache: `sections` round trip; coverage hit and miss table; `unrequested` ignored by `isFresh` and `isTransient`; `CACHE_SCHEMA` 5 resets.
- Capsules: turning Deck on sends one detect for the hosts lacking `platforms` and draws nothing until it answers.
- Hover card: source lines for developer-only, Valve-only and mixed cards; the Family unlisted line.
- `styles.test.ts` and `registry.test.ts` cover the new kinds through `KIND_IDS` with no edit. The detector contract suite (`tests/contracts/detector.contract.ts`) runs against the GetItems detector with platform kinds on and off.
- Fixture tests take verdicts from `fixture-verdicts.ts` over the refreshed `kinds.json`. No test restates another (for example no second chip test per facet once the table covers it).

## 9. Stack order

| PR | Commits (Conventional Commits) | Decision | Effort | Depends on |
| --- | --- | --- | --- | --- |
| A | `refactor(i18n): ship one catalog per surface`; `docs(design): record the catalog split as decision 59` | 59 | M | none |
| B | `feat(kinds): tag In-App Purchases from Steam's features`; `test(fixtures): ...`; `docs(design): ... decision 60` | 60 | S | none (fits today's headroom) |
| C | `docs(adr): request GetItems sections from the enabled kinds (0014)`; `docs(adr): kinds Valve computes and one derived negative (0015)` with the rule 4 edit; `feat(detect): request sections from enabled kinds and record them in the cache`; `feat(kinds): let a kind tag chosen values`; `feat(ui): name Valve as the source of its ratings`; `feat(kinds): tag Steam Deck Compatibility`; `feat(kinds): tag Steam Machine Compatibility`; `build: raise the userscript budget with the measured size`; `docs(design): decisions 61 to 63` | 61, 62, 63 | L | A |
| D | `feat(kinds): tag Family Sharing and Family Sharing not Available`; `ops(canary): check Family Sharing presence and absence`; `docs(design): decision 64` | 64 | M | C (facets, ADR 0015) |
| E (optional) | `perf(detect): ask for basic_info only where creators matter` | 65 | M | C, a payload measurement |

A and B ship independently and in either order. Each commit leaves `mise run ci` green: the sections commit lands with no platform kind registered, the facet commit with a test-only faceted kind built in `tests/helpers/`, and each kind commit adds its own catalog keys, fixture rows and canary check.

## 10. Risks and open questions for the maintainer

1. Defaults: all four kinds off, facets `["unsupported"]` for the status kinds and Family. Should IAP start on? (Recommend off: it is on about half of paid and all big free games.)
2. Should Valve's Unknown (0) ever be a facet? Recommend no: nearly every small or unreleased game is 0, and the word clashes with our own unknown.
3. Chip words: "Deck Unsupported" and "Machine Unsupported" use our short device words; Steam has no short form for Machine. Alternatives: "SM", or the full "Steam Machine" (long on compact badges).
4. Family chip: Steam's "Family Sharing not Available" (28 characters, compact badges will truncate) versus shorter own words (rejected above on rule 4 grounds).
5. Family scope: exclude free games and non-game items from the negative (recommended), or tag them too.
6. Steam Frame and SteamOS: recommend out of scope now.
7. Independent sets for chips and filter (for example chip on Verified, hide on Unsupported). The plan uses one chosen set per kind; a second set doubles the settings and the UI.
8. Banner default for status kinds: Steam's own page shows Deck compatibility on app pages; keep the banner entry on (consistent) or start it off.
9. DLC rows: do DLC carry their own Deck rating, or 0? Capture 5201760 with `include_platforms` before C; if DLC return 0 nothing shows, if they return the base game's rating the chips repeat on every DLC row.
10. Per-facet colors: out of scope; one color per kind.
11. IAP Spanish wording is unverified; check the live Spanish store page.
12. Rule 4 wording above, and whether ADR 0015 should split into two records (Valve-computed, derived negative).
13. README credit for prior art showing Deck status on store pages: the maintainer names the projects. Rule 6 holds: the parser reads Valve's GetItems fields; no code from other extensions, nothing from GPL projects such as Augmented Steam.
14. Slice E: gate `basic_info` after measuring it, or leave it.

## 11. Manual verification (Chromium and Firefox Nightly, dev profiles only)

1. `mise run build`; load `dist/chromium` unpacked in Chromium and the Gecko zip in Firefox Nightly's dedicated profile; install the userscript in Violentmonkey on one of them.
2. Defaults: the four new cards show Off; no `include_platforms` in the GetItems URL (devtools Network) on `/search/?term=roguelike`.
3. Turn Steam Deck Compatibility on: the next GetItems request carries `include_platforms`; rows already on screen are asked again once in batches of up to 50; a Deck-Unsupported game shows "Deck Unsupported", Verified and Playable games show nothing.
4. Tick Verified: Verified games gain "Deck Verified"; untick: they lose it with no reload.
5. Filter Hide with only Unsupported ticked: only Unsupported games leave the list; the hidden results line counts them; Show them dims them back.
6. Hover a chip: title "Steam Deck Compatibility", line "Unsupported", last line "According to Valve"; on a game with AI and Deck both lines appear.
7. App page of a Deck-Unsupported game: banner entry "Steam Deck Compatibility: Unsupported", tag section chip, Ignore for this tag removes both, Undo restores.
8. Coming-soon game (3489340): no Deck or Machine chip with every facet ticked.
9. Family Sharing on, Unsupported ticked: RDR2 (1174180) and Battlefield 6 (2807960) show "Family Sharing not Available"; CS2 (730, free) and a demo show nothing; hover shows the unlisted line and "According to Valve".
10. In-App Purchases on: CS2 and ARC Raiders show the chip; Hades does not.
11. Custom color on Deck: chips, hover title and single-entry banner wash take it.
12. Switch the store to Spanish (`?l=spanish`): "Deck: No compatible", "Compatibilidad con Steam Deck", "Seg\u00fan Valve", "Pr\u00e9stamo familiar no disponible"; compact badges truncate cleanly at 184 px.
13. Backup: download with facets set, restore into a fresh profile, facets come back.
14. Turn Deck off and on again within the TTL: no new request (entries keep `platforms`).
15. Run `mise run canary` once before the release.

## 12. README feature line (draft)

- Tags In-App Purchases and Family Sharing from Steam's feature list, and Steam Deck and Steam Machine compatibility as Valve rates it (Verified, Playable, Unsupported). These tags start switched off. Each lets you pick which values to tag, for example only Unsupported, and its list filter acts on those values only.

The "What it does" list also gains the source line change from section 5, and the kinds list (README lines 36 to 44) gains four entries in Steam's words.

## Maintainer answers (2026-10-26)
- Source line wording: 'According to Valve' (Deck, Machine, Family Sharing); Spanish 'Segun Valve' (with accent in the catalog).
- Reverse tagging wanted for Deck, Machine and Family Sharing (Unsupported facet).
- IAP default: OFF.
- Chips and filter share ONE set of ticked facets per kind (kinds.<id>.facets).
- Family Sharing negative skips free games and non-game items (type != 0): rule: non-empty feature list, no 62, not free, type 0.
- Chips: SHORT chip text; Steam's full wording in the hover card. Backlog item: let users customize the chip text for the different size tiers.
- Steam Frame and SteamOS: not now.
- Stack order (maintainer): current stack first (search bar, gap 9 = decision 57, gap 10 = decision 58), then A catalog split (59), B IAP (60), C status kinds (61 to 63), D Family Sharing (64), optional E. Numbers are renumbered when the stack changes.
- Still open (agent questions 2, 3, 7, 8, 9, 10, 11): Valve Unknown never a facet (recommended no); 'Machine' as the short chip word; banner entry for status kinds default; capture a DLC with include_platforms (5201760) before slice C; split ADR 0015 in two or not; README credits; optional slice E.

## Live DLC capture with include_platforms (maintainer, 2026-10-26): answers open question 8
- 5201760 ARC Raiders - Frozen Trail Collector Set: type 4, parent 1808500, platforms deck 0, steamos 0, frame 0, machine 0; feature_categoryids [22,35,15] (no 62, although the parent lists 62); has its own content_survey_ai_notes.
- 4210150 ARC Raiders - The Bonecrown Set: type 4, parent 1808500, platforms all 0; feature_categoryids [22,35,15]; own AI notes.
- 2778580 ELDEN RING Shadow of the Erdtree: type 4, parent 1245620, platforms deck 2 (Playable), steamos 2, frame 0, machine 0; feature_categoryids [22,29,23,62] (lists 62).
Conclusions: DLC carry their OWN platform ratings, which are 0 (Unknown) for cosmetic DLC and a real value for large expansions; no inheritance from the parent is needed or wanted (0 stays not disclosed). Family Sharing absence on DLC (ARC DLC lack 62 while the parent has it) confirms the rule to skip non-game items (type != 0), otherwise those DLC would get a false 'not supported' flag. Machine can be 0 while Deck is 2 (Elden DLC).

## Maintainer answers (2026-10-26, round 2)
- IAP chip text 'IAP' / 'Compras' ok; chips will become user-customizable later (backlog).
- PvP empty player list behavior: leave as is.
- Steam Frame and SteamOS: out for now, backlog.
- Machine chip word: 'Steam Machine' for now.
- Banner line (banner setting default) for Deck, Steam Machine, Family Sharing: OFF (chips and the tag section only; the per-kind banner switch can turn it on).
- Root AGENTS.md first line now lists In-App Purchases (commit on feat/iap-kind).
