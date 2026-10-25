# src/core

The platform-free heart of AI Reporter for Steam: detection, cache, scanning, placement, rendering and i18n. The root `AGENTS.md` rules apply here; this file adds what is specific to core. The reasons are in [ADR 0002 (single codebase and tooling)](../../docs/adr/0002-single-codebase-and-tooling.mdx).

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
- A new tag kind is an id in `kinds/id.ts`, a `TagKind` definition (its verdict from a GetItems item, its catalog keys, its settings defaults) and an entry in `kinds/registry.ts`. The type checker names the other spots that list every kind (`perKind`, `kindsFromGetItems`); the detectors, the chain and the cache read the registry.
- A new message is a catalog key in `src/locales/`, never a literal in code or in a test.

## Style in this folder

- One module, one reason to change.
- `readonly` by default; discriminated unions with exhaustive `never` checks for states such as `Verdict`; branded types for domain IDs (`AppId`).
- A `Detector` answers with `KindVerdicts`, one `Verdict` per tag kind. Settings and the ignore list are stored per kind (`v2:settings`, `v2:allow`); `settings/migrate.ts` copies the `v1` keys to them the first time either is read; the `v1` keys stay.
- CSS classes and data attributes use the prefix `sar-` and `data-sar-*`; errors are `SarError` with a catalog-key `code`.
- Efficiency is a requirement (rule 13, efficiency): scan only added subtrees, batch DOM reads before writes, no per-node closures or listeners, `WeakSet` and `WeakMap` keyed by elements, bounded caches, no polling.
- Tests sit next to the module as `*.test.ts` and use the builders in `tests/helpers/`.
