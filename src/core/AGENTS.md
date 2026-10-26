# src/core

The platform-free heart of Tag Kit for Steam: detection, cache, scanning, placement, rendering and i18n. The root `AGENTS.md` rules apply here; this file adds what is specific to core. The reasons are in [ADR 0002 (single codebase and tooling)](../../docs/adr/0002-single-codebase-and-tooling.mdx).

## What core must not import

- No `chrome`, `browser` or `GM` names, no `@types/chrome`, no `gm.d.ts`. `tsconfig.core.json` sets `"types": []` and never includes the platform declarations, so such a reference fails the type check. Do not work around it with a local `declare`.
- Nothing from `src/platform/`. Dependencies point inward: platform imports core, never the reverse.
- Only DOM and web standards are available: `fetch`, `DOMParser`, `MutationObserver`, `Intl`, `WeakMap`, `URL`. Anything else comes in through a port.
- No `eval`, `new Function` or dynamic remote code. No direct `JSON.parse`: use `parseJson(text): unknown` from `json.ts`.
- No user-visible or logged string literals, and no catalog text in tests. Code holds `MessageKey`s and tests take expected text from `t(key, params)`; copy lives in `src/locales/` (rule 9, i18n from day 1), and `scripts/check_i18n.py` fails on a literal that repeats it. Allowed literals: identifiers, selectors, URLs, storage keys, CSS class names, detection constants such as the heading `AI Generated Content Disclosure`.
- No `any`, no type assertions other than `as const`, no non-null assertions, no `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` (rule 10, strict static typing). Untrusted input is `unknown` until a valibot schema turns it into a typed value.
- Valve hosts only, always `credentials: "omit"` (rule 1, privacy). Core never builds a request to another host.

## Ports

Core depends on small interfaces in `ports.ts`: `Http`, `KeyValueStore`, `Clock`, `Logger`, `SettingsSource`, `MessageCatalog` and `FileTransfer` (downloads and the file chooser, which the extension page and the userscript dialog both take from `src/platform/shared/file-transfer.ts`). A port is one capability, as narrow as its callers need (interface segregation). Core receives implementations from a composition root and never constructs a platform object itself.

The only shipped composition roots are the extension content script and the userscript `main.ts`. `src/platform/dev/inject.ts` is a dev-only root and is never packaged.

### Adding a port

1. Check first whether an existing port or a small extension of one covers the need (rule 11, SOLID and DRY). A new port is the last resort.
2. Define the interface in `ports.ts`: methods take and return plain, `readonly` data, and return `unknown` for anything read from outside. No platform types in signatures.
3. Write the contract test in `tests/contracts/<port>.contract.ts`: a suite that takes a factory and asserts the behavior every implementation must have, including edge cases and failure modes.
4. Provide the test double in `tests/helpers/` (memory store, fake HTTP, fixed clock) and run the contract suite against it.
5. Implement the port in each platform that needs it under `src/platform/`, and run the same suite against each implementation.
6. Wire it in the composition roots only. Core code receives it by parameter.

### The contract-test rule

Every implementation of a port passes the same shared contract suite, with no per-implementation exceptions. If an implementation cannot pass a case, either the contract is wrong (change it for all implementations) or the implementation is wrong. A new implementation is not done until its suite run is in the tests.

## Extending without editing

- A new store surface is a new `Placement` entry in `scan/placements.ts`, with a fixture test. The scanner is not edited.
- A new list for the hidden results notice (`ui/hidden-notice.ts`) is a `ListPlacement` entry in `LIST_PLACEMENTS`, the selector of the element that holds its hosts, and optionally `after`, the store's own notice above the list that our bar follows when the page has it. The notice counts the marks below with one query per change and never scans.
- A new list for the package summary (`ui/package-summary.ts`) is a `ListPlacement` entry in `SUMMARY_PLACEMENTS`, in the same shape: the package page's included games today, a bundle page once a capture shows its markup. The summary is a `HostRenderer` beside the badges: it keeps each host's last view in a `WeakMap` and counts the marked hosts in the list once per batch of draws, so it follows verdicts, settings and the ignore lists through the capsule UI's draws and sends no request. `findList` and `placeAbove` in `scan/placements.ts` find and place both blocks.
- A host never grows past an element the store marks as an item (`data-ds-appid`). A link's host climbs to the lowest image ancestor and at most `MAX_JOIN_LEVELS` more, and stops at the first such element, so on a package page (`/sub/<id>/`, where nothing else names an app) the host is the included game's row and not the column around the package header.
- On an app page, the page's header capsule, purchase area and description name the page's app (`PAGE_PARTS` in `scan/candidates.ts`, by id). A host for another app never takes one in, which keeps a dim on a DLC's page to the glance box instead of the column. Another such part is another id there, and an app page region whose links are never capsules, such as the DLC bubble, is an entry in `SKIPPED`.
- A new detection source is a new `Detector` link in the chain. The chain and the scanner are not edited.
- A new message is a catalog key in `src/locales/`, never a literal in code or in a test. Name it by its key literal (`t("banner_undo")`), never by a key built from parts: each shipped bundle carries only the messages whose keys its code names (`scripts/gen_catalogs.py`, decision 58), and `scripts/check_bundle.py` fails on a key a bundle names but does not carry. Core code takes its catalogs from the composition root (`AppDeps.catalogs`); only tests and the dev bundle import `SHIPPED_CATALOGS`, which holds every message.

### A new tag kind

A kind is data. The detectors, the chain, the cache, the settings and the ignore list read the registry, so these are the steps, and the type checker names the ones that list every kind:

1. The definition, `kinds/<id>.ts`: a `KindDefinition` with its id, `fromGetItems` (and `fromAppPage` when the English page can answer), the `stored` schema built with `storedDisclosed`, the catalog keys of its heading and chip, its settings defaults and its cache TTLs. Its disclosed type extends `DisclosedBase<"<id>">`. Optional: `source: "valve"` for a fact Valve computes (the hover card then ends with "According to Valve", or with the kind's own line in `messages.source`, as Family Sharing's "According to the features Steam lists for this game"; only such a kind may derive a value from a list that lacks its category, under ADR 0016, as `kinds/family.ts` does), `sections` for a GetItems section it reads beyond `extra_details` and `categories` (see "Request sections" below), and `facets` for the values a person picks to tag (see "A kind with values" below).
2. One line in `KINDS` in `kinds/registry.ts`. The kind id, the verdict type, `perKind` and the settings defaults follow from it. `kindsFromGetItems`, the guards in `kinds/verdicts.ts` and the settings parser need no edit.
3. The catalog keys in `src/locales/en/` and `src/locales/es/`: `kind_<id>_heading` (Steam's own line for the kind, in each language), `kind_<id>_chip` and any detail line Steam shows. Each key carries a translator note.
4. A case in `kindDetails` (`ui/kind-details.ts`), which gives the hover card its lines under the heading (the banner shows only a kind's long developer text). The `switch` is exhaustive, so the type checker fails until it is there.
5. The per-kind rules in `ui/styles.css`: the badge switch, the dim and hide filters, their hover and focus rules and the hide rule list each kind by hand, because no selector joins an attribute on the root element with one on a host. `ui/styles.test.ts` fails for a kind they miss.
6. A fixture: a captured GetItems item of a game that declares the kind in `tests/fixtures/getitems/kinds.json`, and a captured app page when the kind has page-only detail (`scripts/capture_fixtures.py`, then the table in `tests/fixtures/README.md`).
7. A check in `scripts/canary.py` for the field the kind reads, so a change on Valve's side shows up before users see it.
8. The test helpers that list every kind: `FULL_DISCLOSED` and `disclosedKinds` in `tests/helpers/verdicts.ts` (typed, so the checker names them). Fixture-based tests take the captured verdicts from `tests/helpers/fixture-verdicts.ts`.
9. Tests next to the definition and in `kinds/registry.test.ts`; the settings form, the chips, the hover card and the banner pick the kind up without an edit.

### A kind with values (facets)

A kind can list `facets`, each an id and Steam's word for it (`FacetDefinition`); its disclosed verdict carries one as `facet` (a `v.picklist` field of its `storedDisclosed` schema). `compatKind` (`kinds/compat.ts`) builds the Steam Deck and Steam Machine kinds this way. `kinds.<id>.facets` holds the values the person picked; `parseKindSettings` takes the definition and keeps only known ids, once, in the kind's order. Every surface draws through `taggedView` (`kinds/facets.ts`), which reads an unpicked value as not disclosed and returns the same object when nothing changes: the capsule UI's `tagged` option and the app page's view call it, and nothing else reads `facet` for drawing. A change to the picked values redraws the hosts through `capsules.refresh()`. Chip text, the accessible name and the banner heading come from `kind_facet_chip` and `kind_facet_name` with the facet's word, unless the facet carries its own `chip` (Family Sharing): then the chip is that key and Steam's word alone names it (`facetName` in `ui/kind-details.ts`); the hover card puts the word under the heading through `kindDetails`, except Family Sharing's derived value, which shows its own line there.

### Request sections

`requestSections(kinds)` (`kinds/sections.ts`) is what the next GetItems request asks for: `basic_info`, and each section an enabled kind names in `sections`. The GetItems detector reads it once per detection; a kind whose section was left out is unknown `unrequested`, which is stored, never drawn, never transient and never expires on its own (`cache/ttl.ts`). Each answer records its sections (`KindVerdicts.sections`, stored with the entry), and a cache lookup that needs a section the entry lacks is a miss. When a kind that reads a new section turns on, `app.ts` calls `capsules.redetect` for the hosts whose answers lack it and `appPage.redetect()`; there is no timer. A new section is an entry in `SECTIONS` and its flag in `getitems.ts`.

### The DOM marks

Every attribute core writes on a store node starts with `data-sar-`. The scheme is per kind, so one setting change is one attribute write on the root element and no host is touched.

| Where                  | Attribute                   | Holds                                                                                                                                                                                                               |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each host              | `data-sar-appid`            | The app ID the host shows.                                                                                                                                                                                          |
| Each host with a kind  | `data-sar-kinds`            | The ids of the kinds tagged for the game (disclosed, with a picked value for a kind with facets, and not ignored), in registry order, separated by spaces. Absent when there is none. Rules match one id with `~=`. |
| Hosts that cannot hide | `data-sar-hideable="false"` | Hiding would break the list, so hide dims instead.                                                                                                                                                                  |
| The root element       | `data-sar-filter-<kind>`    | The kind's list filter that takes effect: `off`, `dim` or `hide`.                                                                                                                                                   |
| The root element       | `data-sar-reveal`           | Set while the hidden results notice shows what Hide removed, on this page only; never stored. The hide rules skip it and those hosts dim.                                                                           |
| The root element       | `--sar-kind-color-<kind>`   | The kind's custom color, a validated `#rrggbb`, in the root's `style`. Removed when unset.                                                                                                                          |
| A chip                 | `data-sar-kind`             | The id of the kind it shows. A hover card entry and a banner with one tag carry it too, so the color rules reach them.                                                                                              |

A host with several kinds takes the strongest filter without a rule for it: a hidden host ignores a dim, and a host that cannot hide dims for either mode. A kind the game is ignored for is left out of `data-sar-kinds` and gets no chip, so it counts as absent. For a DLC or a demo, "ignored for the game" includes its base or full game, and a game follows its developers and publishers: see "What an app is related to" below.

### What an app is related to

The banner adds a closed `details` per game that lists its creators, one row per name and role (`BannerView.creators`), and a note with Undo for each creator ignored for a tag the banner lists (`creatorNotes`). `BannerActions` gains `ignoreCreator` and `restoreCreator`; the app page wires them to `lists.creators[role]` and tells the capsule UI to draw again. The settings form draws its three ignore cards (games, developers, publishers) from one `AllowSpec` each.

`KindVerdicts` is one verdict per kind plus `Relations`, which no verdict reads and the ignore lists follow.

- `parent`: the DLC's base game or the demo's full game, a branded `AppId` read from GetItems `related_items.parent_appid` (`getitems.schema.ts`, droppable, so a missing or malformed value is no parent).
- `demo`: `true` when GetItems `type` is 1 (droppable too) and the item has a parent. Only a demo borrows from its parent; a DLC (`type` 4) does not.
- `creators`: the developers and publishers, from GetItems `basic_info` (the request sets `include_basic_info`). A `Creator` (`creator.ts`) holds Steam's name, the clan ID when Steam sends `creator_clan_account_id` (some creators have none), `key` and `keys`. The keys are `c:<clan id>` first when there is an ID, then `n:<name>` with the name exactly as Steam sends it, and Ignore stores `key`. The schema drops a bad entry or list on its own, `makeCreators` collapses repeats and keeps eight per role.

`withRelations` sets them, and they are stored with the cached verdict (`cache/stored.ts`; a change to what is stored bumps `CACHE_SCHEMA`). Ignoring is decided in one place, `isIgnored(ignored, id, kind, related)` in `ignored.ts`: true, for the kind or for all kinds, when the app or its parent is on the games list, when any developer's key is on the developer list, or when any publisher's key is on the publisher list. The roles stay apart, and a creator matches on any of its keys, so a name-keyed entry keeps matching after Steam adds a clan ID. The lists are `v2:allow` and the sibling keys `v2:allow-developers` and `v2:allow-publishers`, each an object per scope with `{ name, added }` entries, made by `createAllowList` and `createCreatorList` over one generic `createScopedList`. Every surface calls `isIgnored` with the verdicts it holds (the capsule UI's `isAllowed`, the app page's `suppressed` per kind); none reads the sets itself. No list of DLC is kept, and the ignored games list never holds a DLC the person did not ignore. A detector that cannot know a relation (the app page) leaves it out, and the app then behaves as if it had none.

### A demo's full game

`createFullGameDetector` (`detect/full-game.ts`) is the outermost detector in `app.ts`. It asks the cached stack for the IDs, then once more, in one call, for the full games of the answered demos it was not asked about, and merges per kind: the demo's own disclosure, else the game's, else unknown when the game is unknown, else the demo's own answer. A lent disclosure is the game's verdict with `fullGame: true` (on `AnyDisclosed`, read by no stored schema), so every surface draws it as a disclosure and the hover card and the banner add `kind_full_game` under its heading (`kind_full_game_valve` for a kind Valve states). The cache keeps each app's own verdicts and the merge runs on every read. One level only: the full game's own parent is never asked for.

## Style in this folder

- One module, one reason to change.
- `readonly` by default; discriminated unions with exhaustive `never` checks for states such as `Verdict`; branded types for domain IDs (`AppId`).
- A `Detector` answers with `KindVerdicts`, one `Verdict` per tag kind. Settings and the ignore lists are stored per kind (`v2:settings`, `v2:allow`, `v2:allow-developers`, `v2:allow-publishers`); `settings/migrate.ts` copies the `v1` keys to them the first time either is read; the `v1` keys stay.
- CSS classes and data attributes use the prefix `sar-` and `data-sar-*`; errors are `SarError` with a catalog-key `code`.
- A surface that detects once asks again after a transient answer (every kind unknown `error` or `rate-limited`, or disclosed beside them on a demo whose full game failed, with `unrequested` kinds left out: `isTransient` in `cache/ttl.ts`) through `createTransientRetry` in `detect/retry.ts`: one timer per round, past the longest breaker pause, two rounds per item at most. The capsule UI and the app page use it; a new surface uses it too, never a timer of its own.
- Efficiency is a requirement (rule 13, efficiency): scan only added subtrees, batch DOM reads before writes, no per-node closures or listeners, `WeakSet` and `WeakMap` keyed by elements, bounded caches, no polling.
- Tests sit next to the module as `*.test.ts` and use the builders in `tests/helpers/`.
- A backup (`backup/`) is read by the same schemas that read storage. A new setting or list reaches the file through `encodeSettings` or `encodeAllow`; a change to the file's shape bumps `BACKUP_VERSION` with an upgrade step in `UPGRADES`. An additive field inside `settings`, such as a kind's `facets`, keeps the version (decision 61): an older build drops it and keeps the rest.
