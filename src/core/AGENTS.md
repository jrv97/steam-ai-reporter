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

Core depends on small interfaces in `ports.ts`: `Http`, `KeyValueStore`, `Clock`, `Logger`, `SettingsSource` and `MessageCatalog`. A port is one capability, as narrow as its callers need (interface segregation). Core receives implementations from a composition root and never constructs a platform object itself.

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
- A new detection source is a new `Detector` link in the chain. The chain and the scanner are not edited.
- A new message is a catalog key in `src/locales/`, never a literal in code or in a test.

### A new tag kind

A kind is data. The detectors, the chain, the cache, the settings and the ignore list read the registry, so these are the steps, and the type checker names the ones that list every kind:

1. The definition, `kinds/<id>.ts`: a `KindDefinition` with its id, `fromGetItems` (and `fromAppPage` when the English page can answer), the `stored` schema built with `storedDisclosed`, the catalog keys of its heading and chip, its settings defaults and its cache TTLs. Its disclosed type extends `DisclosedBase<"<id>">`.
2. One line in `KINDS` in `kinds/registry.ts`. The kind id, the verdict type, `perKind` and the settings defaults follow from it. `kindsFromGetItems`, the guards in `kinds/verdicts.ts` and the settings parser need no edit.
3. The catalog keys in `src/locales/en/` and `src/locales/es/`: `kind_<id>_heading` (Steam's own line for the kind, in each language), `kind_<id>_chip` and any detail line Steam shows. Each key carries a translator note.
4. A case in `kindDetails` (`ui/kind-details.ts`), which gives the hover card its lines under the heading (the banner shows only a kind's long developer text). The `switch` is exhaustive, so the type checker fails until it is there.
5. The per-kind rules in `ui/styles.css`: the badge switch, the dim and hide filters, their hover and focus rules and the hide rule list each kind by hand, because no selector joins an attribute on the root element with one on a host. `ui/styles.test.ts` fails for a kind they miss.
6. A fixture: a captured GetItems item of a game that declares the kind in `tests/fixtures/getitems/kinds.json`, and a captured app page when the kind has page-only detail (`scripts/capture_fixtures.py`, then the table in `tests/fixtures/README.md`).
7. A check in `scripts/canary.py` for the field the kind reads, so a change on Valve's side shows up before users see it.
8. The test helpers that list every kind: `FULL_DISCLOSED` and `disclosedKinds` in `tests/helpers/verdicts.ts` (typed, so the checker names them). Fixture-based tests take the captured verdicts from `tests/helpers/fixture-verdicts.ts`.
9. Tests next to the definition and in `kinds/registry.test.ts`; the settings form, the chips, the hover card and the banner pick the kind up without an edit.

### The DOM marks

Every attribute core writes on a store node starts with `data-sar-`. The scheme is per kind, so one setting change is one attribute write on the root element and no host is touched.

| Where                       | Attribute                   | Holds                                                                                                                                                                  |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each host                   | `data-sar-appid`            | The app ID the host shows.                                                                                                                                             |
| Each host with a kind       | `data-sar-kinds`            | The ids of the kinds that are disclosed and not ignored for the game, in registry order, separated by spaces. Absent when there is none. Rules match one id with `~=`. |
| Hosts that cannot hide      | `data-sar-hideable="false"` | Hiding would break the list, so hide dims instead.                                                                                                                     |
| The root element            | `data-sar-filter-<kind>`    | The kind's list filter that takes effect: `off`, `dim` or `hide`.                                                                                                      |
| A chip, and the summary row | `data-sar-kind`             | The id of the kind it shows.                                                                                                                                           |

A host with several kinds takes the strongest filter without a rule for it: a hidden host ignores a dim, and a host that cannot hide dims for either mode. A kind the game is ignored for is left out of `data-sar-kinds` and gets no chip, so it counts as absent.

## Style in this folder

- One module, one reason to change.
- `readonly` by default; discriminated unions with exhaustive `never` checks for states such as `Verdict`; branded types for domain IDs (`AppId`).
- A `Detector` answers with `KindVerdicts`, one `Verdict` per tag kind. Settings and the ignore list are stored per kind (`v2:settings`, `v2:allow`); `settings/migrate.ts` copies the `v1` keys to them the first time either is read; the `v1` keys stay.
- CSS classes and data attributes use the prefix `sar-` and `data-sar-*`; errors are `SarError` with a catalog-key `code`.
- Efficiency is a requirement (rule 13, efficiency): scan only added subtrees, batch DOM reads before writes, no per-node closures or listeners, `WeakSet` and `WeakMap` keyed by elements, bounded caches, no polling.
- Tests sit next to the module as `*.test.ts` and use the builders in `tests/helpers/`.
