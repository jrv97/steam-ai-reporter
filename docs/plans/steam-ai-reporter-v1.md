---
title: AI Reporter for Steam v1 (MV3 extension + userscript)
status: active
issue: none
updated: 2026-10-20
---

# AI Reporter for Steam: MV3 extension and userscript from one core (v1)

**Ambiguities and the assumptions taken**

- Product name "AI Reporter for Steam" (`short_name` "AI Reporter"), slug `steam-ai-reporter`, Gecko ID `steam-ai-reporter@jdelavega.github.io`. The CSS and attribute prefix is `sar-` (internal, never shown to users). Wherever this plan writes `<slug>`, it means `steam-ai-reporter`.
- "Unknown" renders nothing, the same as "not disclosed". The only trace is a `data-sar-state` attribute, kept for debugging.
- The allow-list is per app ID only. Developer and publisher allow-lists are on the roadmap.
- The repo is MIT licensed. No code is copied from any prior-art project; ideas are credited in the README (see "Prior art and credits").
- Default TTLs: disclosed 7 days, not disclosed 12 hours, unknown `gated` or `missing` 6 hours. `error` and `rate-limited` are never persisted.
- Trunk-based: each step after step 1 lands as its own PR into `main`, from its own `<type>/<slug>` branch in its own worktree (a separate session per step where useful), squash-merged so `main` gets one Conventional Commit per step. After a merge, the step's session is archived and its worktree and branch removed; any open branch the merge left behind is rebased onto `main`.
- steamcommunity.com is excluded. The wishlist is on the store host (`rq5-extension-constraints.md:33`), and spike S5 confirmed that old community wishlist URLs redirect there (`rq6-verification-spikes.md`, S5).
- Formatting at 100 columns applies to every file we own. Markdown and MDX are formatted for structure only; prose lines are not wrapped. Captured fixtures, the lockfile and `LICENSE` are not ours to reformat.

## Objective

Build a Chrome and Firefox MV3 extension and a Tampermonkey/Violentmonkey userscript, both driven by one framework-free TypeScript core. They mark every app-ID-bearing item on `store.steampowered.com` whose developer filled in Steam's AI content disclosure:

- a badge on capsules and rows
- a non-blocking banner on the app page that quotes the developer's text verbatim
- an opt-in dim or hide mode for lists
- a per-game allow-list for false flags

Detection calls `IStoreBrowseService/GetItems` with `include_extra_details`, batched and in the page's language. A `?l=english` HTML parse is the fallback. There are three states (disclosed, not disclosed, unknown) and a local cache. There is no remote code, and nothing is sent anywhere except Valve's own endpoints.

## Current state

- The repo is `jrv97/steam-ai-reporter` on GitHub (renamed from `steam-fuck-slop` on 2026-10-20; GitHub redirects the old URL, and the local folder keeps the old name). `main` tracks `origin/main` and has two commits: `chore: init` (the wf docs scaffold, `AGENTS.md` and the research) and `chore: enforce lf line endings`.
  - `AGENTS.md` holds only a "working knowledge (docs/)" section: where plans, research, journal, drafts and ADRs live. ADRs are MADR in `docs/adr/`, which does not exist yet.
  - `.gitattributes` sets `* text=auto eol=lf` and `docs/journal/*.md merge=union`.
  - `docs/drafts/`, `docs/journal/` and `docs/plans/` exist with `.gitkeep`. `docs/TASKS.md` is untracked through `.git/info/exclude`. `.claude/settings.local.json` is ignored by the user's global Git ignore.
  - There is no `.gitignore`, no CI and no code.
- The user's Steam Web API key is available as the environment variable `STEAM_API_KEY`. v1 makes no keyed calls; the key is for development scripts only (see invariant 16).
- The recommendations this plan implements are at `docs/research/steam-ai-disclosure.md:69-76`. The three follow-ups that note asks for (`:78-81`) became the step 2 spikes, recorded in `rq6-verification-spikes.md` (S1 to S7) and `rq7-library-study.md` (S8).
- Detection evidence:
  - The request recipe and the "non-empty `content_survey_ai_notes`" rule: `rq2-data-surface.md:125-127`. The protobuf fields: `:99`.
  - First-hand verification: CORS from the store origin passes, 50 IDs came back in one call in about 1.3 s, the duplicate ID is confirmed, and a same-origin HTML fetch works (`rq2-data-surface.md:129-134`).
  - Batch ceiling (rq6 S1): the limit is the URL length, not an ID count. 250 IDs (6,886 characters) passed and 300 IDs (8,236 characters) failed. 30 back-to-back 50-ID calls all returned 200, so no 429 was seen. Error answers carry no CORS headers, so JavaScript sees a `TypeError` and never a status or `Retry-After`.
  - Item states (rq6 S2): the API ignores the age gate. Adult-only (339800), delisted and age-gated apps return `success: 1` with `extra_details` cookie-less. An invalid ID returns `success: 15`, `appid: 0` and no `extra_details`. Items come back in request order and duplicates are not merged. A 200 answer can still be a failure: `x-eresult: 8` with an empty `response` when `context` is missing.
  - Language (rq6 S2): the set of disclosing apps is the same in every language, but the notes come back in the developer's translation where one exists.
  - CORS and runtime (rq6 S3, S4): GetItems CORS is an allow-list of Valve origins, and `x-eresult` is exposed. A content script with no permissions reads GetItems in Chrome 155 and Firefox Nightly 160.
  - HTML fallback rules: `#game_area_content_descriptors` is duplicated (`rq2-data-surface.md:36`). Agecheck, login and home redirects mean unknown (`:62-68`). S7 confirmed the `/login/` and `/` redirects and that a cookie-less `?l=english` fetch cannot change the store language. No `/agecheck/` redirect was reproducible from the spike's region, and the AI block came first on every sampled app with both blocks.
  - Still open: how stable the endpoint is (`rq2-data-surface.md:107`) and where the real rate limit lies (S1 never reached it).
- Extension constraints:
  - Content scripts can fetch same-origin and parse with `DOMParser` (`rq5-extension-constraints.md:23`).
  - Search infinite scroll and the React wishlist: `:89-98`. Surface map, app link shapes, the `<html lang>` table and the store CSP: rq6 S5.
  - Rate-limit mitigations: `:105-107`.
  - Chrome limited-use and remote-code rules: `:127-128`.
  - AMO source submission (reviewer environment Node 24.14.0, npm 11.9.0) and `data_collection_permissions`: `:135-136`.
  - Userscript managers (rq6 S6): Tampermonkey 5.5 on Chrome and Firefox Nightly runs a plain `fetch` to GetItems without `@connect`, and the `GM.*` value calls, `GM_addStyle`, a plain `<style>`, `GM_addValueChangeListener` and the menu command all work. Violentmonkey was not tested.
  - Libraries and tooling: rq7 (S8), summarized in "Tooling decisions" below.
- Release research: `docs/research/extension-release-pipeline.md`.
- Wording: show the developer's text, never say "uses AI" or "AI-free", and treat absence as neutral (`rq3-reliability.md:84`, `:94`). The January 2026 rewrite narrowed the scope (`rq1-policy.md:7`).
- Conventions adopted from the user's other repos: a root `mise.toml` (`C:/Users/jorge/Documents/dev/smithbox-helper/mise.toml:9-20`; this repo is one package, so no `[monorepo]` section), MADR ADRs in `.mdx` (`smithbox-helper/AGENTS.md:79`), and Conventional Commits (`C:/Users/jorge/Documents/dev/mdx2steam/AGENTS.md:23-25`). Git hooks run through mise, not prek (invariant 14).

## Prior art and credits

Source: `docs/research/steam-ai-disclosure/rq4-prior-art.md`, plus the GetItems check in `rq2-data-surface.md` (main-thread verification). "(unv.)" marks third-party tracker or summary figures. The comparison is factual and neutral; the README's "Prior art and thanks" section credits each project whose ideas shaped ours.

### Where v1 differs

|                                          | AI warning for Steam (seeeeew)                                                                  | AI Content Filter (SoBloxsy)                                            | Steam AI Games Indicator (Pierre-Demessence)                                                  | Obvious Steam AI        | Augmented Steam                      | Ours, v1                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------ | --------------------------------------------------------- |
| Detection                                | HTML heading; about 33 localized strings on the app page; per-app `?l=english` fetch for search | English heading only; per-app fetch, likely without `?l=english` (unv.) | `appids.json` seed (from SteamDB) plus per-app `?l=english` fetch                             | Page banner             | None (issue 1913 open since 2024-04) | Batched GetItems `content_survey_ai_notes`, HTML fallback |
| Requests per 50-row search page          | About 50                                                                                        | Up to 50, lazy by viewport                                              | 0 to 50, serial 1 s                                                                           | n/a                     | n/a                                  | 1                                                         |
| Survives Steam retranslating the heading | No (Russian 2026-02, French 2026-09, Malay added)                                               | English only                                                            | Yes                                                                                           | ?                       | n/a                                  | Yes, the API field is language-independent                |
| Surfaces                                 | App, search                                                                                     | All store pages, English only                                           | App, search, wishlist, home                                                                   | App                     | None                                 | Every app ID surface                                      |
| Ships as                                 | Extension and userscript (one file)                                                             | Extension                                                               | Userscript                                                                                    | Firefox extension       | Extension                            | Extension (Chrome, Firefox) and userscript from one core  |
| App page UX                              | Full-page modal, no options                                                                     | Red banner                                                              | Banner                                                                                        | Banner                  | None                                 | Non-blocking banner, verbatim text, collapsible           |
| List modes                               | Blur or hide (search only)                                                                      | Hide, highlight, text label                                             | Badge plus hide filter                                                                        | None                    | None                                 | Badge, dim or hide (default off)                          |
| False-flag override                      | No (issue 12 open)                                                                              | No                                                                      | No                                                                                            | No                      | None                                 | Per-game allow-list                                       |
| Gated or error pages                     | Not documented                                                                                  | Not documented                                                          | `appHubAppName` guard before a negative                                                       | ?                       | None                                 | Explicit unknown, never shown or cached as not disclosed  |
| Freshness                                | 30 d positive, 7 d negative, reset on update                                                    | 7 d                                                                     | Misses late disclosures below the seed list's max ID until a manual refresh (about quarterly) | ?                       | None                                 | 7 d, 12 h, 6 h                                            |
| Privacy and permissions                  | `storage` only                                                                                  | `storage`, service worker                                               | Also fetches from `raw.githubusercontent.com`                                                 | Steam host access       | Broad hosts plus its own server      | `storage` only, Valve hosts only, cookie-less             |
| License                                  | MIT                                                                                             | Apache-2.0                                                              | MIT                                                                                           | MPL-2.0, no source repo | GPL-3.0                              | MIT                                                       |
| Users                                    | About 5.5k Firefox, about 10k Chrome (unv.)                                                     | 80 Firefox, about 1k Chrome (unv.)                                      | 2 stars                                                                                       | 0                       | 64k Firefox                          | None yet                                                  |

Not covered in v1: a scope split (in-game, marketing only, dev only, live), the Steam desktop client, developer or publisher allow-lists, and undisclosed AI use (no tool sees it; only manual curators such as "No AI" do).

### What we learn from it

No code is copied. Every row below is an idea we reimplement from our own design and our own observations of Steam's pages.

| Credit                            | Idea                                                                                                | How it shows up in v1                                          | Step     |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| seeeeew                           | Low-permission manifest (`storage`, no host permissions, Gecko `data_collection_permissions: none`) | Our manifest, enforced by `check_bundle.py`                    | 11       |
| seeeeew                           | Positive and negative TTL split, invalidation on extension update                                   | `CACHE_SCHEMA` bump and our TTLs                               | 8        |
| seeeeew                           | A localized heading table                                                                           | Roadmap; would be built from Steam's own translations          | After v1 |
| seeeeew, issue 4                  | An automated check for heading changes                                                              | `mise run canary`                                              | 14       |
| Pierre-Demessence                 | Badging every surface, including wishlist and home capsules                                         | Generic capsule scanner; selectors come from our own S5 survey | 2, 9, 13 |
| Pierre-Demessence                 | Guard against age gates before trusting a negative                                                  | `appHubAppName` and final-URL checks in the HTML parser        | 6        |
| Pierre-Demessence                 | Serial requests with a delay                                                                        | Throttle and circuit breaker                                   | 7        |
| Pierre-Demessence                 | Hide option in the search sidebar                                                                   | Roadmap                                                        | After v1 |
| SoBloxsy                          | Wishlist hide falls back to highlight                                                               | `hideable: false` falls back to dim                            | 9, 10    |
| Obvious Steam AI                  | Top-of-page banner                                                                                  | Non-blocking app page banner                                   | 10       |
| Augmented Steam                   | Legacy versus React page handling, one module per feature                                           | Architecture reference only                                    | 4, 9     |
| Augmented Steam issue 1913        | Users want a dismissible banner like the DRM notice                                                 | Banner design                                                  | 10       |
| Augmented Steam VaporLens episode | AI-related defaults are contentious with this audience                                              | List filter defaults to off                                    | 8        |
| AI Transparency Index             | Taxonomy (dev only, marketing only, in game, live) and negation rules                               | Roadmap classifier; no data reuse                              | After v1 |

Rejected sources: `appids.json` (derived from SteamDB) and SteamDB tag 1368160, because SteamDB's FAQ bans scraping and republishing; curator lists in v1.

## Architectural impact

The repo is greenfield, so this change creates the invariants. Step 1 writes them into the root `AGENTS.md`, so every session working in the repo sees them before any code exists.

1. **Privacy.** App IDs leave the browser only for Valve hosts the user is already on: `api.steampowered.com` GetItems and `store.steampowered.com` app pages. Every such request uses `credentials: "omit"`. No analytics, no third-party hosts, no seed lists.
2. **No remote code.** No `eval`, `new Function`, remote scripts or remote selector logic. Bundles are not minified. A build check enforces this.
3. **Permissions.** `storage` plus content-script matches on `https://store.steampowered.com/*`. No `host_permissions` and no background script. ADR 0003 records this content-script-only runtime, which S3 and S4 settled.
4. **Semantics.** Three verdict states. Unknown is never recorded or shown as not disclosed. The wording is "Discloses AI use", never "uses AI" or "AI-free". The developer text is rendered verbatim through `textContent`.
5. **Core purity.** `src/core` uses only DOM and web standards and never names `chrome`, `browser` or `GM`. `tsconfig.core.json` sets `"types": []` and never includes `gm.d.ts`, so any such reference fails the type check.
6. **Originality and credit.** No code is copied from prior-art projects, and nothing from Augmented Steam (GPL-3.0) in any form. Ideas are credited in the README. `THIRD_PARTY_NOTICES.md` lists the licenses of bundled dependencies only.
7. **One version source.** The `package.json` version feeds both manifests and the userscript header.
8. **Repo hygiene.** Repo text is ASCII with normal capitalization and no em dashes (non-English catalogs excepted). Branches are `<type>/<slug>`. Commits follow Conventional Commits 1.0.0 with the qoomon types (`feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ops`, `chore`; CI changes are `build`) and carry no trailers.
9. **i18n from day 1.** Every user-visible or logged message (UI copy, errors, warnings, success notices, empty states, ARIA labels, tooltips, the manifest name and description, the userscript `@name` and `@description`) lives in a message catalog, keyed and typed. English is the only shipped locale in v1. Code holds keys, never copy. Allowed literals are identifiers, selectors, URLs, storage keys, CSS class names, and detection constants such as Steam's own `AI Generated Content Disclosure` heading (matched, never displayed). The developer's disclosure text is data, shown verbatim and never translated. Lint rules and `check_i18n.py` enforce this.
10. **Strict static typing.** No `any`, explicit or implicit, anywhere. `unknown` is the only type for untrusted input, and it becomes a typed value only through a validation schema. No type assertions other than `as const`, no non-null assertions, no `@ts-ignore` or `@ts-nocheck`. Branded types for domain IDs (`AppId`), discriminated unions with exhaustive `never` checks, `readonly` by default. Enforced by the compiler flags and type-aware lint rules in step 4.
11. **SOLID and DRY.**
    - Single responsibility: one module, one reason to change (parser, throttle, cache, scanner, placement, renderer, composition root).
    - Open/closed: new surfaces are new `Placement` entries and new detection sources are new `Detector` links; the scanner and the chain are not edited.
    - Liskov: every port implementation passes the same shared contract test suite (memory, extension and GM stores; fake and real HTTP).
    - Interface segregation: small ports (`Http`, `KeyValueStore`, `Clock`, `Logger`, `SettingsSource`, `MessageCatalog`).
    - Dependency inversion: core depends only on ports; `content.ts` and the userscript `main.ts` are the only shipped composition roots (the dev-only `src/platform/dev/inject.ts` is never packaged).
    - DRY: before writing new code, check whether existing code can be refactored to cover the case. One build script for all targets, one manifest base with overlays, one catalog source, one placement engine, shared contract tests.
12. **Library check first.** Before building anything non-trivial, look for a library that does it and study it: size, types, maintenance, license, and whether we need it at all. The outcome is recorded in the relevant ADR or PR description. Spike S8 did this for v1 (`rq7-library-study.md`).
13. **Efficiency: performance and memory.**
    - Network: one GetItems request per batch of up to 50 unseen app IDs; zero requests for cached verdicts.
    - CPU: after the initial pass, scan only `addedNodes` subtrees; batch DOM reads before writes in one `requestAnimationFrame`; dim and hide are CSS attribute selectors, not per-node style writes; no polling.
    - Memory: `WeakSet` and `WeakMap` keyed by elements; no per-node closures or listeners (one delegated listener per root); the in-memory verdict map is bounded (LRU, 2,000 entries); the observer disconnects on `pagehide`; daily storage sweep.
    - Budgets, enforced by `check_bundle.py` and tests: `content.js` at most 60 KB and the userscript at most 80 KB unminified; a 200-capsule fixture scan within a test budget; under 4 ms per mutation batch in a manual Chrome DevTools profile on a sale page (checklist).
14. **mise is the only toolchain manager and task runner.** Local development, Git hooks, CI and release pipelines all run `mise run <task>`. Every tool (Node, pnpm, Python, changie, web-ext, dprint, ruff, mypy, shellcheck, shfmt, actionlint, zizmor, gh) is pinned in `mise.toml`. JavaScript libraries that the build, lint and tests load from `node_modules` (esbuild, TypeScript, oxlint, valibot, vitest, happy-dom) are exact-pinned in `package.json` and the lockfile and installed by the mise-pinned pnpm (rq7 row 14). Non-trivial logic lives in `scripts/` as `.sh` (short glue) or `.py` (anything with logic), each exposed only through a mise task. `package.json` holds dependencies and no scripts. The pre-commit hook runs `mise run precommit` and the pre-push hook runs `mise run prepush`.
15. **Formatting from day 1.** Line width 100 for every file we own: TypeScript, JSON, CSS, HTML, YAML, TOML, Python and shell. Markdown and MDX are formatted for structure only; prose is not wrapped. `precommit` formats the staged files we own and re-stages them; `prepush` and CI reject unformatted files. Excluded: `tests/fixtures/**`, `pnpm-lock.yaml`, `LICENSE`.
16. **Secrets.** `STEAM_API_KEY` is read only by development scripts (spikes, canary) and only from the environment. It is never committed, logged, written into fixtures or bundled; `check_bundle.py` fails if its value appears anywhere in `dist/` or `artifacts/`. Release secrets live in GitHub environments (step 15).

ADRs are warranted for five decisions. They are written in MADR `.mdx` in step 3:

- `0001` **Detection strategy**: GetItems as the primary source, queried in the page's language, a `?l=english` HTML fallback, no localized heading table, no seed lists, three states, and the TTL policy. The alternatives are real (per-app scraping, the localized DOM, SteamDB-derived lists, English-only detection with an extra banner call in the store language), and the choice rests on an undocumented endpoint.
- `0002` **Single codebase and tooling**: a core plus two thin platform adapters, built with esbuild driven by `scripts/build.py`, and the S8 outcomes: TypeScript 7, oxlint with type-aware rules, dprint, valibot, vitest with happy-dom, `@types/chrome`, a hand-written `gm.d.ts`, and actionlint plus zizmor. It also settles whether to pin `uv` and commit `mise.lock` (rq7 row 14).
- `0003` **Runtime topology**: content script only. S3 showed that GetItems CORS admits Valve origins only, and S4 that a content script with no permissions reads GetItems in Chrome and Firefox, so there is no background script and no `host_permissions`. The rejected alternative, a background relay for `api.steampowered.com`, would add a host permission and a background lifecycle; the record keeps it with the evidence that made it unnecessary.
- `0004` **i18n**: catalog format, runtime and locale resolution. Options considered: `chrome.i18n` with `_locales` only (cannot run in the userscript or in core, and cannot follow the Steam page language at runtime), i18next (about 40 KB and its own key conventions), ICU MessageFormat through `@formatjs/intl-messageformat` (rich plurals and selects, one more dependency), and the chosen default: Chrome `messages.json` as the single authored format (the extension needs it for `__MSG_*__` manifest strings, and Crowdin and Weblate read it natively) plus a dependency-free core runtime of about 60 lines: `$placeholder$` substitution, plurals through `_one` and `_other` key suffixes resolved with `Intl.PluralRules`, and an English fallback.
- `0005` **Release pipeline**: changie fragments, unpadded CalVer, the release-bot app tag ruleset, nightly GitHub prereleases, prod promotion of the same artifacts to the stores on manual dispatch, and Chrome Web Store auth (OAuth refresh token or service account). Alternatives: manual store uploads (what most prior art does), rebuilding at prod time, and a signed beta channel (roadmap).

TTL numbers and placement rules are tunable constants and need no ADR. Copy changes are catalog edits.

### Tooling decisions

Decided by spike S8 on 2026-10-20 (`rq7-library-study.md`); ADR 0002 records them.

| Concern            | Decision                                                                                                                                                                                                                                                                                                                                                                 | Alternatives weighed in S8                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bundling           | esbuild 0.28 CLI, driven by `scripts/build.py`, one call per target; `--banner:js` only on the userscript call                                                                                                                                                                                                                                                           | WXT plus vite-plugin-monkey; plain Vite (see below)                                                                                                          |
| Type check         | TypeScript 7 (`typescript@7.0.x`), `tsc --noEmit` on both configs; scripts test for a non-zero exit, not for a specific code; every tsconfig lists its `types`, since TypeScript 7 defaults them to `[]`                                                                                                                                                                 | TypeScript 6 `tsc` (about 2.3x slower, same diagnostics)                                                                                                     |
| Lint (TypeScript)  | oxlint 1.89 with type-aware rules (oxlint-tsgolint), every rule named in `.oxlintrc.json`, plus our own `jsPlugins` rule `lint/restricted-syntax.mjs` for the literal-flow selectors                                                                                                                                                                                     | typescript-eslint `strictTypeChecked` and `stylisticTypeChecked` (caps `typescript` below 6.1; the fallback, see below); Biome (has no `no-unsafe-*` family) |
| Format             | dprint 0.64 with seven plugins (`npm:@dprint/typescript`, `npm:@dprint/json`, `npm:@dprint/markdown` with `textWrap: maintain`, `npm:@dprint/toml`, `npm:dprint-plugin-malva` for CSS, `npm:dprint-plugin-markup` for HTML, `npm:dprint-plugin-yaml`), line width 100, and `"markdown": { "associations": ["**/*.{md,mdx}"] }`, without which `.mdx` is silently skipped | Biome plus Prettier (Biome formats no Markdown, YAML or TOML; Prettier's MDX parser turned `2 * 3 * 4` into `2 _ 3 _ 4`)                                     |
| Runtime validation | valibot 1.5: `v.exactOptional` rather than `v.optional`, `v.readonly()` on every nested object, per-item validation of `store_items`                                                                                                                                                                                                                                     | zod 4 mini (37.3 KB unminified for the GetItems schema versus 10.8 KB); hand-written type guards (the fallback if the size budget fails)                     |
| Tests              | vitest 5 with happy-dom; jsdom per file only as a cross-check where a happy-dom divergence is suspected                                                                                                                                                                                                                                                                  | jsdom as the default (lacks `innerText`, observers, `popover`, `dialog`)                                                                                     |
| WebExtension types | `@types/chrome` 0.3.x, no polyfill                                                                                                                                                                                                                                                                                                                                       | `chrome-types` (types storage values as `any`); `webextension-polyfill` (38 KB unminified, no release since 2024)                                            |
| Userscript types   | a hand-written `src/platform/userscript/gm.d.ts` for exactly the granted APIs, with non-generic signatures and `unknown` returns                                                                                                                                                                                                                                         | `@violentmonkey/types`, `@types/tampermonkey` (neither compiles under the flags below; both make `GM.getValue<T>` an unchecked assertion)                    |
| Python scripts     | stdlib only; ruff (lint and format, line length 100); mypy `--strict`                                                                                                                                                                                                                                                                                                    | none                                                                                                                                                         |
| Shell scripts      | shellcheck and shfmt (`-i 2 -ci`; shfmt has no line width, so 100 columns is a review rule)                                                                                                                                                                                                                                                                              | none                                                                                                                                                         |
| Workflows          | actionlint plus zizmor (`zizmor --offline` in `lint`, so `prepush` needs no GitHub token)                                                                                                                                                                                                                                                                                | actionlint alone                                                                                                                                             |
| Package manager    | pnpm 12, installed by mise; `packageManager` in `package.json` matches, `pmOnFail: error` in `pnpm-workspace.yaml`, and `check_versions.py` fails when the two pins drift                                                                                                                                                                                                | none (user decision)                                                                                                                                         |

Bundler alternatives already weighed:

- **WXT plus vite-plugin-monkey.** Two frameworks and two configs around one core, and a large transitive tree (Vite, Rollup, the WXT runtime, auto-import codegen) that AMO reviewers would have to rebuild. WXT's conventions leak into the core unless switched off, and its wins (HMR, manifest generation, a sources zip) are small for three entry points.
- **Plain Vite plus vite-plugin-monkey.** Content scripts must be IIFE, and Vite's library mode refuses multiple entries with the IIFE format, so this still needs several build configs.
- **esbuild (default).** One package with no JavaScript dependencies beyond its platform binary. It builds several IIFE entries, gives byte-stable output for the same inputs and version, and `build.py` stays readable for reviewers. Costs: a hand-written userscript header and manifest overlays, both covered by checks, and no HMR. esbuild watch plus `web-ext run` reloads Firefox; Chrome is reloaded by hand.

TypeScript compiler flags (`tsconfig.json`, shared by the core config): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`, `allowUnreachableCode: false`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck: false`. TypeScript 7 already defaults to `strict` and `"types": []`; the configs still set both explicitly. The extension config lists `"types": ["chrome"]`, and `gm.d.ts` is reached only from the configs that cover `src/platform/userscript/`.

Lint rules at `error` in `.oxlintrc.json`. oxlint has no presets, so every rule is named, under the `typescript` scope where typescript-eslint has it (for example `typescript/no-explicit-any`) and under the `eslint` scope otherwise:

- `no-explicit-any`; the `no-unsafe-*` family (`no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`, `no-unsafe-argument`); `consistent-type-assertions` with `assertionStyle: "never"`; `no-non-null-assertion`; `ban-ts-comment` with `"ts-expect-error": true` as well, because its default allows a described `@ts-expect-error`.
- `strict-boolean-expressions`, `switch-exhaustiveness-check`, `explicit-module-boundary-types`, `prefer-readonly`, `no-floating-promises`, `no-misused-promises`.
- The oxlint equivalents of typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked` rules. All exist except `no-unsafe-enum-assignment`, which our enum-free code does not need.
- oxlint has no `no-restricted-syntax`, so `lint/restricted-syntax.mjs` (about 12 lines of our own, loaded through `jsPlugins`, run by Node at lint time and never bundled) turns ESQuery selectors into reports. The selectors forbid string literals flowing into `textContent`, `innerText`, `title`, `placeholder`, `aria-*`, `alert`, `console.*`, `new Error` and `new SarError` (invariant 9). `JSON.parse` is wrapped once in `parseJson(text): unknown`; the same rule flags direct calls elsewhere. The file is lint configuration, not task logic, so it lives in `lint/` and not in `scripts/` (invariant 14).

typescript-eslint stays the reference: where an oxlint rule behaves differently, its documentation is the spec. If the alpha JS plugin API proves flaky, the fallback is typescript-eslint with the documented alias pair (`typescript` as `npm:@typescript/typescript6`, `@typescript/native` as `npm:typescript@7`), so the type check still runs on TypeScript 7.

AMO build-from-source instructions become: install mise (one documented command), then `mise install` and `mise run build`. mise pins Node 24.14.0 and pnpm, so no corepack step is needed. Node stays at 24.14.0, the AMO reviewer environment (`rq5-extension-constraints.md:135-136`), although 24.22.0 is the latest 24.x release (rq7 row 14).

**Userscript header:**

- `@match https://store.steampowered.com/*`, `@noframes`, `@run-at document-idle`
- `@grant` for `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues`, `GM_addStyle`, `GM.registerMenuCommand` and `GM_addValueChangeListener` (step 12 uses it for live settings)
- No `@connect`: S6 showed that a plain `fetch` to GetItems works without it in Tampermonkey on Chrome and Firefox Nightly. Violentmonkey was not tested; the manual checklist covers it (step 12)

## File operations

Nothing is deleted. `AGENTS.md` is extended (step 1); everything else is new. Layout:

```
README.md LICENSE THIRD_PARTY_NOTICES.md PRIVACY.md   (AGENTS.md exists, extended)
mise.toml package.json pnpm-lock.yaml pnpm-workspace.yaml .changie.yaml .changes/
tsconfig.json tsconfig.core.json .oxlintrc.json dprint.json ruff.toml vitest.config.ts
lint/               restricted-syntax.mjs   (our oxlint jsPlugins rule, never bundled)
.github/workflows/  ci.yml release-train.yml release-nightly.yml release-prod.yml
assets/icons/
posting/            saved posting collection for GetItems and app page requests (step 2)
docs/adr/  docs/plans/  docs/store/  docs/testing/  docs/design/ (design session)
docs/research/steam-ai-disclosure/rq6-verification-spikes.md   (step 2)
docs/research/steam-ai-disclosure/rq7-library-study.md         (step 2)
scripts/            build.py gen_i18n_keys.py check_i18n.py check_text.py check_bundle.py
                    check_versions.py check_reproducible.sh package.sh calver.py canary.py
                    capture_fixtures.py changelog_gate.py precommit_format.sh release/*.py
src/core/  AGENTS.md types.ts ports.ts settings.ts app.ts json.ts errors.ts log.ts
  detect/  getitems.ts getitems.schema.ts app-page.ts throttle.ts detector.ts
  cache/   verdict-cache.ts lru.ts
  scan/    appid.ts scanner.ts placements.ts
  i18n/    catalog.ts t.ts locale.ts keys.gen.ts (generated)
  ui/      badge.ts banner.ts list-filter.ts settings-form.ts styles.css
src/locales/  en/messages.json   (authored source of truth, Chrome messages.json format)
src/platform/extension/   content.ts options.ts options.html ext.ts manifest.{base,chrome,firefox}.json
src/platform/userscript/  main.ts header.ts gm.d.ts
src/platform/dev/         inject.ts   (dev-only injection root, never packaged)
tests/contracts/  key-value-store.contract.ts http.contract.ts
tests/fixtures/   getitems/*.json app-page/*.html surfaces/<surface>/*.html README.md
tests/helpers/    memory store, fake HTTP, fixed clock, GetItems builder
dist/ artifacts/ (gitignored)
```

- `.gitignore` (created in step 1): add `mise.local.toml` in step 4.
- Modify `AGENTS.md`: keep the "working knowledge (docs/)" section; add the sixteen invariants, the task list, a folder map, and commit and branch rules.
- Create `src/core/AGENTS.md`: what core must not import, how a port is added, and the contract-test rule.
- Create `README.md`: what it does, how to install, a short development section (the browsers, `mise.local.toml`, the run tasks), how AMO reviewers build from source (OS, mise, `mise install`, `mise run build`), "Prior art and thanks", and the unaffiliated-with-Valve notice.
- Create `LICENSE`: MIT.
- Create `THIRD_PARTY_NOTICES.md`: licenses of bundled runtime dependencies (for example valibot), generated from the lockfile by `build.py`.
- Create `PRIVACY.md`: nothing is collected; what is stored locally; which app IDs go, cookie-less, to which Valve endpoint.
- Create `posting/`: a saved `posting` collection with the GetItems request (store `Origin`, foreign `Origin`, `moz-extension://` `Origin`, German context) and an app page request, for spike S3 and later manual checks. Done in step 2.
- Create `docs/research/steam-ai-disclosure/rq6-verification-spikes.md` and `rq7-library-study.md`. Done in step 2, together with `tests/fixtures/`.
- Create `docs/adr/0001-detect-disclosure-via-getitems.mdx`, `0002-single-codebase-and-tooling.mdx`, `0003-content-script-only-runtime.mdx`, `0004-i18n-message-catalogs.mdx`, `0005-release-pipeline.mdx`.
- Create `docs/testing/manual-checklist.mdx`: a matrix of surface by target by logged in or out, plus the performance profile row.
- Create `docs/store/listing.mdx`: Chrome and AMO listing copy, the single-purpose statement, permission justifications and privacy answers.
- Create `mise.toml`: tools (Node 24.14.0, pnpm, Python, changie, `"npm:web-ext"`, dprint, ruff, `"pypi:mypy"`, shellcheck, shfmt, actionlint, zizmor, gh) and every task. web-ext and mypy are not in the mise registry, so they carry explicit backend prefixes (rq7 row 14).
- Create `.changie.yaml` and `.changes/unreleased/`: kinds Added, Changed, Fixed and Removed.
- Create `package.json` and `pnpm-lock.yaml`: exact-pinned dependencies, no `scripts`. Create `pnpm-workspace.yaml` with `pmOnFail: error`, so a `packageManager` that differs from the mise pin fails instead of pnpm silently downloading and running a second version (rq7 row 12).
- Create `tsconfig.json`, `tsconfig.core.json`, `.oxlintrc.json`, `lint/restricted-syntax.mjs`, `dprint.json`, `ruff.toml`, `vitest.config.ts`.
- Create `.github/workflows/*.yml`: each job installs mise with `jdx/mise-action` and runs exactly one mise task.
- Create `scripts/*`: as listed in the layout; each one is called only from a mise task.
- Create `src/**`, `tests/**`: the modules above, with `*.test.ts` next to each module.
- Create `assets/icons/`: from the design session (SVG source plus 16, 32, 48 and 128 px PNGs), with no Valve branding.

## Steps

1. **Branch, rules and plan.** Done 2026-10-20 on `feat/steam-ai-reporter-v1`, which merges into `main` as the first PR. The repo, remote and research commit already existed.
   - From an up-to-date `main`, run `git switch -c feat/steam-ai-reporter-v1`.
   - Add `.gitignore`, extend `AGENTS.md` with the sixteen invariants, and commit both with this plan as `docs: add v1 plan and project rules`.
   - **Proof:** the branch matches `^feat/[a-z0-9-]+$` and starts at `origin/main`. `git status` is clean. `docs/TASKS.md` and `.claude/settings.local.json` stay ignored.

2. **Verification spikes, library study and fixtures.** Done 2026-10-20 in [PR #2](https://github.com/jrv97/steam-ai-reporter/pull/2) (branch `docs/step-2-spikes`). Results: `rq6-verification-spikes.md` (S1 to S7) and `rq7-library-study.md` (S8); fixtures are listed in `tests/fixtures/README.md`. The spike list below is kept as the record of what was asked; the plan sections after it carry the defaults the spikes chose.
   - Not tested, defaults taken: an actual 429 (S1 never reached one), Violentmonkey (S6), the `/agecheck/` redirect and a mature-first page (S7; both fixtures are synthetic), the home React rows, the discovery queue overlay and publisher pages (S5). Violentmonkey and the untested surfaces go on the manual checklist; the 429 and age gate paths rely on the breaker and the final-URL guard.

   Browser checks run in DevTools on a store page (or the built-in browser), or in throwaway extensions and userscripts kept outside the repo. `posting` only runs as an interactive TUI, so requests that need custom headers (S3) live in the saved `posting/` collection and the user runs them; an agent falls back to DevTools and records what it could not set. `rq6-verification-spikes.md` gets one section per spike: method, result, and the default the code takes.
   - **S1, batch ceiling and 429.** From a store page console, call GetItems with 50, 100, 200 and 400 IDs. Record status, items returned, URL length and latency. Then send sequential 50-ID calls with no delay, up to 30 calls or the first 429. Record the status and whether `Retry-After` can be read from JavaScript. Run S1 last and stop at the first 429, because a 429 can block the IP for hours (`rq5-extension-constraints.md:105`). Default if unclear: 50 IDs per call, one call in flight, 1 s spacing.
   - **S2, age gate and item states.** Call GetItems without cookies for 1938090 (violence gate), 339800 (adult only), 99999999 (invalid ID) and a delisted app. Record `success`, `visible`, and whether `extra_details` is present. Repeat 5072580 with `context.language` set to German to see whether the notes change.
   - **S3, CORS headers.** Using the `posting/` collection, send GetItems with `Origin` set to the store origin, to `https://example.com`, and to a `moz-extension://` origin. Record `access-control-allow-origin` and `access-control-expose-headers`.
   - **S4, extension fetch.** A minimal MV3 content script on the store calls GetItems with plain `fetch`, in Chrome and in Firefox 140+. In Firefox, also try `content.fetch`. Record whether each succeeds and which `Origin` is sent.
   - **S5, surface map.** Visit each surface logged in and logged out: app page, search (with infinite scroll), wishlist, home carousels, discovery queue (`/explore`), a tag hub and a category hub, a sale page, the search suggestions popup, a developer or publisher page, and an old steamcommunity.com wishlist URL. For each, record: classic or React rendering; whether capsules carry `data-ds-appid` or only `/app/<id>` links; which element is the capsule; on the app page, where the banner anchors (`#game_area_purchase` or the top of `.game_description_column`); the `<html lang>` value; and the `content-security-policy` header. Save sanitized capsule-container HTML under `tests/fixtures/surfaces/`, with scripts, account names, avatars and Steam IDs stripped. Selectors are derived from these observations, not from prior-art code.
   - **S6, userscript managers.** In Tampermonkey and Violentmonkey, on Chrome and Firefox, test: a plain `fetch` to GetItems with no `@connect`; the `GM.*` value calls; `GM_addStyle` under Steam's CSP; `GM.registerMenuCommand`; `GM_addValueChangeListener`; and Violentmonkey's `@inject-into` fallback.
   - **S7, HTML fallback.** Check that `fetch('/app/413150/?l=english', {credentials: "omit"})` returns the full page and leaves the store language unchanged. Capture `?l=english` HTML for 5072580 (AI block first), 1808500 (AI block only), 413150 (no block), and the agecheck, login and home-redirect responses. Look for an app whose mature block comes before the AI block; if none turns up, derive one from 5072580 and label it synthetic in `tests/fixtures/README.md`.
   - **S8, library and tooling study.** For each row of the tooling table, compare the default with its alternatives on size, type quality, speed, maintenance and license, with a small proof where it matters (for example: valibot versus zod mini bundle bytes for the GetItems schema; dprint's MDX support; typescript-eslint versus oxlint type-aware run time on a sample; `mise generate git-pre-commit` flags for the pre-commit and pre-push hooks). Record results in `rq7-library-study.md`.
   - Commit `docs(research): record spikes and the library study`.
   - **Proof:** every known unknown has a result, or an explicit "could not test" plus the default taken. The fixtures that steps 5 and 6 need exist. S3 and S4 pick an ADR 0003 option. Every tooling row has a decision.

3. **ADRs and repo docs.**
   - Write ADRs 0001 to 0005 in MADR. 0001, 0002 and 0003 rest on the spike and study results; 0004 and 0005 record decisions already taken in review.
   - Write `src/core/AGENTS.md`, a `README.md` skeleton (with "Prior art and thanks" and the unaffiliated notice), `LICENSE` and `PRIVACY.md`.
   - ADR 0003 records the content-script-only runtime that S3 and S4 settled; invariant 3 stands as written.
   - ADR 0001 records the page-language decision for GetItems (step 10).
   - Commit `docs: add adrs for detection, tooling, runtime, i18n and release`.
   - **Proof:** each ADR lists the options considered and the consequences. The user reviews the ADRs before step 4.

4. **Toolchain, hooks, formatting and the i18n runtime.**
   - Create `mise.toml`, `package.json` (exact versions, no scripts), the lockfile, `pnpm-workspace.yaml`, both tsconfigs, `.oxlintrc.json`, `lint/restricted-syntax.mjs`, `dprint.json`, `ruff.toml`, `vitest.config.ts` and `ci.yml`.
   - Write `scripts/build.py` (one esbuild call per target: extension Chrome, extension Firefox, userscript; the userscript header goes in through `--banner:js` on the userscript call only; manifest merge, catalog copy, static assets), `check_text.py`, `check_bundle.py` (also asserts the userscript header is present in the userscript and absent from the extension bundles), `check_versions.py` (the `mise.toml` pnpm pin equals `packageManager`), `check_reproducible.sh` and `precommit_format.sh`.
   - mise tasks: `setup` (`mise install`, `pnpm install --frozen-lockfile`, then `hooks`), `hooks` (`mise generate git-pre-commit --write --task=precommit` and `mise generate git-pre-commit --write --hook=pre-push --task=prepush`, since `.git/hooks` is not versioned), `fmt`, `fmt-check`, `lint` (oxlint type-aware, ruff, mypy, shellcheck, actionlint, `zizmor --offline`), `typecheck`, `test`, `build`, `lint-firefox` (`web-ext lint` on `dist/firefox`), `dev`, `run-firefox` (Firefox Nightly only), `run-chrome`, `check` (text, i18n, bundle, versions), `check-reproducible`, `precommit`, `prepush`, and `ci`.
     - Tasks call scripts (`run = "python scripts/..."`, `run = "bash scripts/..."`). mise runs inline task strings with `cmd /c` on Windows, so any task that keeps inline shell sets `shell = "bash -c"` (rq7 row 13).
     - `precommit`: formats the staged files we own and re-stages them; if a file is only partly staged, it stops and asks for the file to be staged whole, so unstaged hunks are never committed. Then `check_text.py` and `check_i18n.py` on the staged files. `precommit_format.sh` reads the staged list from `git diff --cached --name-only -z --diff-filter=ACMR`, not from the hook's `STAGED` variable, which splits paths with spaces.
     - `prepush`: `fmt-check` (rejects unformatted files), `lint`, `typecheck`, `test`, `build`, `check`, and a branch-name check.
     - `ci`: everything `prepush` runs, plus `check-reproducible` and `lint-firefox`.
   - **Changelog fragments** (moved up from step 15, so every later PR is gated): `.changie.yaml` with kinds Added, Changed, Fixed and Removed, and `.changes/unreleased/`. Task `change-new` wraps `changie new`. `changelog_gate.py` (CI job `changelog-fragment`) fails a PR that changes `src/` without a new `.changes/unreleased/*.yaml`, unless the PR carries the `no-changelog-fragment` label; it also checks that each new fragment names a known kind and has a body.
   - Commit `build: scaffold mise toolchain, hooks, formatting, linting, ci and changie`.
   - **i18n runtime, before any feature code:**
     - `src/locales/en/messages.json` in Chrome `messages.json` format. Keys are snake_case and grouped by prefix (`badge_`, `banner_`, `options_`, `error_`, `warn_`, `notice_`, `ext_`, `userscript_`). Every message has a `description` for translators.
     - `scripts/gen_i18n_keys.py` (run by `build` and `typecheck`) generates `src/core/i18n/keys.gen.ts`: a `MessageKey` union and per-key placeholder types, so `t("missing_key")` or a wrong placeholder fails the type check. `build.py` copies catalogs to `_locales/<lang>/messages.json` for the extension and inlines them into the userscript bundle.
     - `t(key, params)`, `plural(baseKey, count, params)` and `createI18n(catalogs, locale)` live in core with no browser API. Locale resolution: the `locale` setting (default `auto`). On store pages `auto` follows the page's `<html lang>`, mapped through the table recorded in S5 (for example `en` is `english`, `es-419` is `latam`, `pt-br` is `brazilian`, `zh-cn` is `schinese`); elsewhere it follows `navigator.language`. Anything without a catalog falls back to English. The same table, read in reverse, gives GetItems its `context.language` (step 5), so one module in core owns it.
     - Errors are typed: `SarError` carries a `code` that is a `MessageKey` plus typed params, never prose. The logger takes keys, so console output is catalog text with a `[sar]` prefix.
     - `scripts/check_i18n.py`: every locale has the same keys and placeholders as English, no catalog key is unused, every message has a `description`. The literal-flow rules live in the oxlint rule `lint/restricted-syntax.mjs`, so there is one AST check, not two.
     - Commit `feat(core): add i18n catalogs, typed keys and the message runtime`.
   - **Proof:** `mise run ci` passes with one smoke test. A deliberately unformatted file is reformatted by `precommit` and rejected by `prepush`. A test file using `any`, `as Foo`, `!` or `@ts-expect-error` fails `lint`. `mise run setup` writes both Git hooks, and a `packageManager` that differs from the mise pnpm pin fails `pnpm install` and `check`. `dist/chrome` loads unpacked with no manifest errors; `mise run lint-firefox` reports nothing. A fresh clone builds with `mise install` and `mise run build` alone. A PR touching `src/` without a fragment fails the changelog gate and passes with the label. A test-only pseudo-locale `xx` proves fallback, plural and placeholder handling, and a hardcoded `textContent = "hi"` in a fixture file fails `lint`.

5. **Core types, ports, app ID extraction and the GetItems parser.**
   - Add `types.ts`, `ports.ts`, `json.ts` (`parseJson(text): unknown`), `errors.ts`, `log.ts`, `scan/appid.ts`, `detect/getitems.schema.ts` and `detect/getitems.ts`.
   - `scan/appid.ts` accepts a `data-ds-appid` holding a single numeric ID, and an `a[href]` that resolves to `store.steampowered.com` with a path matching `^/app/(\d+)(?:[/?#]|$)`, so `/app/<id>` counts with or without a trailing slash, slug, query or hash (S5: React links have no trailing slash).
   - `getitems.schema.ts` validates the response with valibot into a typed `GetItemsResponse`: `v.exactOptional` for optional fields and `v.readonly()` on every nested object, so verdict data is deep readonly. The envelope is validated as a whole; each entry of `store_items` is validated on its own, so one malformed item does not discard the batch (S8 showed that a single bad item rejects a whole-response schema).
   - Each request sets `context.language` to the page's Steam language (step 10), through the locale table in step 4; a page language outside the table falls back to `english`.
   - The parser maps each requested ID to a verdict, keyed by the item's `id` (the requested ID), never by `appid`, which is `0` for invalid items (S2):
     - **Disclosed:** `success === 1` and `extra_details.content_survey_ai_notes` is non-empty after trimming whitespace, including `U+200B`. The verdict keeps the notes, the language they came in, `ai_generation_service.name`, and the app `name` for the allow-list.
     - **Not disclosed:** `success === 1` and `extra_details` is present but has no notes.
     - **Unknown `missing`:** the item is absent, `success` is not `1` (an invalid ID returns `15`), or it has no `extra_details`.
     - **Unknown `error` for one ID:** its entry fails the item schema.
     - **Unknown `error` for the whole batch:** a non-200 status, invalid JSON, an envelope schema failure, an `x-eresult` header that is present and not `1`, or a missing `store_items` although IDs were sent (S2). A `TypeError` from `fetch` is not parsed here; step 7 treats it like a 429.
   - IDs are deduped before a batch is built, because GetItems does not merge duplicates (S2). Batches hold at most 50 IDs, and a batch whose encoded URL would exceed 4,000 characters is split further (S1 found the server limit between 6,886 and 8,236 characters).
   - Contract suites in `tests/contracts/` for `KeyValueStore` and `Http`; the in-memory and fake implementations pass them.
   - Commit `feat(core): parse getitems disclosure verdicts`.
   - **Proof:** tests run over the S2 JSON fixtures (`mixed-states.json`, `german-context.json`, `search-roguelike-50.json`, `empty-response.json`) and builder-made edge cases: whitespace-only and `U+200B`-only notes, `\r\n` in notes, missing `extra_details`, `success: 15` with `appid: 0`, wrong field types, one malformed item in an otherwise valid batch, `x-eresult: 8`, a missing `store_items`, duplicate IDs (sent once), a batch split by the URL guard, comma-joined `data-ds-appid`, relative and absolute links with and without a trailing slash, and steamcommunity links (ignored). `mise run typecheck` passes with `"types": []` for core.

   ```ts
   declare const appIdBrand: unique symbol;
   export type AppId = number & { readonly [appIdBrand]: true; };

   export type Verdict =
     | {
       readonly state: "disclosed";
       readonly notes: string;
       readonly language: string;
       readonly service?: string;
       readonly name?: string;
       readonly source: "api" | "html";
     }
     | { readonly state: "not-disclosed"; readonly source: "api" | "html"; }
     | {
       readonly state: "unknown";
       readonly reason: "gated" | "missing" | "error" | "rate-limited";
     };

   export interface Detector {
     detect(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, Verdict>>;
   }
   ```

6. **HTML fallback parser.**
   - `detect/app-page.ts` takes a `Document` and the final URL.
   - **Unknown `gated`:** the final URL is under `/agecheck/` or `/login/`, is not under `/app/<id>`, or the page has no `#appHubAppName`.
   - Otherwise it collects every `#game_area_content_descriptors` with `querySelectorAll`, keeps the block whose trimmed `h2` equals `AI Generated Content Disclosure`, and reads the notes from that block's `p > i`, trimmed. `textContent` keeps the line breaks, because each `<br>` is followed by a newline in the source (S7).
   - The network path fetches `/app/<id>/?l=english` with `credentials: "omit"`. S7 showed that this returns the full page and cannot change the store language. Fallback notes are therefore English, with `language: "english"`.
   - On the current app page, the same parser reads the live document as a zero-request fallback, but only when its `lang` is `en`. S7 showed that the selectors still match after Steam's autocollapse script wraps the block.
   - S7 confirmed the `/login/` redirect (adult-only 339800) and the `/` redirect (invalid ID). No `/agecheck/` redirect was reproducible from the spike's region, and the AI block came first on every sampled app, so the agecheck and mature-first fixtures are synthetic and labelled so in `tests/fixtures/README.md`. The guard does not depend on any one redirect path.
   - Commit `feat(core): parse the english app page as a fallback`.
   - **Proof:** tests pass on the AI-first, mature-first (synthetic), AI-only, no-block, agecheck (synthetic), login and home-redirect fixtures, on the 4618750 line-break fixture, and on the live-DOM fixture with the autocollapse wrapper. The heading string appearing inside a game's description does not match.

7. **Throttling, circuit breaker and chain detector.**
   - GetItems runs with one call in flight and 1 s spacing. S1 saw 30 back-to-back calls succeed, so these are safety margins for the user's own browsing on the same IP, not measured limits.
   - **Error handling:** a 429 or 5xx status, or a `TypeError` from `fetch`, backs off for 60 s plus up to 10 s of jitter. A `TypeError` counts like a 429 because Steam's error answers carry no CORS headers, so a rate limit reaches JavaScript as a `TypeError` with no status (S1). `Retry-After` is not readable cross-origin, so the backoff is always this fixed one. The backoff opens a breaker persisted as `v1:breaker` (the HTML breaker as `v1:breaker:html`), so other tabs honor it; while it is open, verdicts are unknown `rate-limited` and nothing is sent.
   - **HTML fallback:** `ChainDetector` sends IDs that GetItems left as unknown `missing` to the HTML fallback, at most 10 per page view, one at a time, 1 s apart. A separate HTML breaker trips on the first 429.
   - In-flight requests are deduplicated by app ID.
   - Commit `feat(core): throttle detection and fall back to html`.
   - **Proof:** fake-timer tests show that 120 IDs produce calls of 50, 50 and 20; a 429 and a `TypeError` each open the breaker, and no request goes out until it closes; the HTML budget holds; one ID requested twice in the same tick costs one request.

8. **Verdict cache, settings and allow-list.**
   - Storage keys: `v1:a:<appid>` (state, time, notes, the language of the notes, service, name), `v1:settings`, `v1:allow` (app ID to name and date), `v1:meta`. Every value read from storage is validated; invalid or old-schema values are discarded, never cast.
   - TTLs follow the assumptions. `error` and `rate-limited` live in page memory only. The in-memory map is an LRU capped at 2,000 entries (`cache/lru.ts`).
   - A `CACHE_SCHEMA` bump clears all verdicts on start. An expiry sweep runs at most once a day.
   - Each scan batch reads with one `get` and writes with one `set`.
   - Settings and defaults: `badges` on, `banner` on, `listFilter` one of `off`, `dim`, `hide` (default `off`), `locale` `auto` (resolved through the S5 `<html lang>` table, step 4).
   - Commit `feat(core): cache verdicts and store settings`.
   - **Proof:** tests with an in-memory store and a fixed clock cover every TTL edge, the schema reset, the sweep, invalid stored values, the LRU cap, and allow-list add and remove.

9. **Scanner and placements.**
   - **Candidates:** first `[data-ds-appid]` holding a single numeric ID (comma lists are packages and are skipped), then `a[href*="/app/"]` parsed by `scan/appid.ts` (step 5). Classic surfaces carry `data-ds-appid`; React surfaces (tag, category, specials, developer, wishlist, search suggestions) carry only links (S5).
   - **Capsule host:** a `data-ds-appid` element is its own host, because Steam puts the attribute on the capsule itself (this also covers DLC rows without an image). For links, S5 compared three rules on the tag hub and chose this one:
     1. Start from the lowest ancestor of the candidate (the candidate included, at most 8 levels up) that contains an `img` or an element with an inline `background-image`, and whose app links and `data-ds-appid` values all name the same app ID. The home main carousel capsule has no `img`, only a CSS background, so both count as an image, and so does Steam's lazy-background marker `data-background-image-url`, because the style it later sets is an attribute change the observer does not see. A candidate with no such ancestor (text links in descriptions, navigation links) gets no host.
     2. Climb at most 3 more levels while every app link and `data-ds-appid` inside still names that app. This joins carousel capsules whose image link and title block are siblings, without climbing into a section-sized container.
     3. Drop a host nested inside another host of the same app.
   - **Skipped:** the footer, breadcrumbs, the app page's links to its own app, and every `sar-` node. The global header root (`[data-featuretarget="store-menu-v7"]`) is not skipped, because it holds the search suggestions popup (S5); its navigation links carry no image, so the host rule drops them.
   - **Observer:** one `MutationObserver` on `document.body` (`childList`, `subtree`), debounced at 200 ms with a 1 s maximum wait. It processes only `addedNodes` subtrees, ignores mutations made only of `sar-` nodes, and disconnects on `pagehide`.
   - **Marking and repair:** hosts get `data-sar-appid`, `data-sar-state` (`pending` until the verdict is known) and, for placements that must not hide, `data-sar-hideable="false"`; processed hosts live in a `WeakSet`. If a React re-render drops a host's badge, the badge is restored. Duplicate badges copied by carousel clones are removed.
   - **`placements.ts`:** a registry of `Placement` entries (open/closed): a generic rule (compact badge overlaid on the capsule image; the image container gets `position: relative` only if it computes to `static`), search rows (full badge beside the title), wishlist rows (badge beside the title, `hideable: false`, because S5 found the wishlist virtualized), and per-surface entries from S5.
   - DOM reads happen before writes, batched in one `requestAnimationFrame`. No `:has()`, so happy-dom behaves like the browsers.
   - Commit `feat(core): find capsules by app id across store surfaces`.
   - **Proof:** per-surface fixture tests assert the exact mapping from app ID to host; the tag hub fixture gives one host per capsule and no section-sized host; the home carousel capsule with a `background-image` gets a host; search suggestion results inside the header root get hosts and the header's navigation links do not; a rescan adds nothing; appending 50 search rows triggers one debounced scan that touches only the new rows; replacing a host's subtree restores its badge; the 200-capsule fixture scans within the test budget.

10. **UI and composition root.**
    - Visual tokens and component specs (badge, compact badge, banner, dim and hide states, options page, allow-list, icons) come from the design session (`docs/design/tokens.css`). If they are not ready, `styles.css` ships placeholder `--sar-*` custom properties, so swapping them in later touches no logic. Injected UI may reference the page's own `"Motiva Sans"` font by name; no Valve logo, icon or font file is bundled.
    - Every string comes from the catalog: `badge_full` ("Discloses AI use"), `badge_compact` ("AI disclosed"), the banner heading, the ignore and undo labels, the unaffiliated line and the options copy. Layouts allow about 40% longer translations; badge text truncates and keeps the full message in `title`.
    - `badge.ts` sets a `title` with the first 200 characters of the notes.
    - Display language (user decision 2026-10-20, after S2): GetItems runs in the page's language, so badge tooltips and the banner show the developer's own translation where one exists, with no extra banner call. Detection does not change, because the set of disclosing apps is the same in every language (S2). The cached verdict keeps the language its notes came in; when it differs from the page's, the banner re-fetches that one app, and badge tooltips keep the cached text until the entry expires. The HTML fallback still fetches `?l=english`, because it matches the English heading, so its notes stay English.
    - `banner.ts` places the banner at the top of `.game_description_column`, before `#game_area_purchase`, which S5 found first in that column on released, coming-soon and demo pages. It renders the notes verbatim with `textContent` and `white-space: pre-line`, after normalizing `\r\n` to `\n` (S2), collapsed after a few lines; shows a named AI service as plain text, with no link; offers "ignore this game"; for allow-listed games shows only a one-line "ignored, undo" note.
    - `list-filter.ts` toggles one attribute on the host; CSS does the dimming or hiding, falling back to dim where `hideable` is false.
    - `settings-form.ts` mounts the settings and the allow-list into any root element, with one delegated listener.
    - `app.ts` wires settings, scanner, cache, detector and renderers, and re-renders on `SettingsSource.subscribe`.
    - Commit `feat(core): render badges, banner and list filter`.
    - **Proof:** notes containing `<img onerror>` render as plain text; not disclosed and unknown render nothing; allow-listed games show only the undo line on the app page and nothing in lists; a test fails if any catalog message contains "uses AI", "AI-free" or "no AI"; an integration test runs `start()` on the search fixture with a fixture-backed fake HTTP and asserts the badges, then hide mode, then the allow-list.

11. **Extension target.**
    - `ext.ts` picks `"browser" in globalThis ? globalThis.browser : globalThis.chrome`, typed by `@types/chrome` 0.3.x, which keeps storage values `unknown`. The shorter `globalThis.browser ?? globalThis.chrome` fails `no-unnecessary-condition`, because `@types/chrome` declares `browser` as always present (S8). It never passes the type argument of `storage.local.get<T>()`, since that is an unchecked assertion; results stay `unknown` until valibot parses them.
    - `content.ts` (composition root) builds ports over `storage.local`, `storage.onChanged` and `fetch`, then calls `start()`. The extension store adapter passes the `KeyValueStore` contract suite against a typed fake.
    - `options.html` and `options.ts` mount the settings form, a privacy summary, the unaffiliated notice and the version. The same page serves as the action popup. `options.html` carries no copy: elements hold `data-i18n="<key>"` and `options.ts` fills them through `t()`.
    - **Base manifest:** `manifest_version: 3`; `permissions: ["storage"]`; one content script (`matches: ["https://store.steampowered.com/*"]`, `content.js`, `content.css`, `run_at: "document_idle"`); `options_ui`, `action` and icons; `default_locale: "en"`, with `name`, `description` and `action.default_title` as `__MSG_ext_name__`, `__MSG_ext_description__` and `__MSG_ext_action_title__`, plus `short_name` as `__MSG_ext_short_name__`.
    - **Firefox overlay:** `browser_specific_settings.gecko` with the ID, `strict_min_version: "140.0"`, and `data_collection_permissions: {required: ["none"]}`.
    - Commit `feat(extension): ship the chrome and firefox content script and options page`.
    - **Proof:** `check_bundle.py` asserts permissions are exactly `["storage"]`, matches are exactly the store pattern, no `host_permissions` and no `background` key (ADR 0003), Gecko keys only in Firefox, no userscript header in the extension bundles, every `__MSG_*__` resolves, no `eval(` or `new Function`, no HTTP URL outside the two Valve hosts, the size budgets hold, and `STEAM_API_KEY`'s value appears nowhere. `mise run lint-firefox` is clean. The app page and search rows of the manual checklist pass in Chrome and Firefox.

12. **Userscript target.**
    - `main.ts` (composition root) builds ports over `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues` and plain `fetch`. The GM store adapter passes the `KeyValueStore` contract suite.
    - S6 verified Tampermonkey 5.5 on Chrome 155 and Firefox Nightly 160: plain `fetch` to GetItems works with no `@connect`, so there is no `GM.xmlHttpRequest` path. Violentmonkey was not tested; it stays on the manual checklist, and a failure there reopens the `@connect` question for that manager only. Steam's CSP allows inline scripts (S5), so Violentmonkey's default page injection should not need its `@inject-into` fallback.
    - The GM API types come from `gm.d.ts`, which declares exactly the granted APIs with non-generic signatures: `GM.getValue(name: string): Promise<unknown>`, `GM.setValue(name: string, value: JsonValue): Promise<void>` with our own recursive JSON type, `GM.deleteValue`, `GM.listValues(): Promise<readonly string[]>`, `GM_addStyle(css: string): HTMLStyleElement`, `GM.registerMenuCommand` and `GM_addValueChangeListener`. Storage reads stay `unknown` until valibot parses them. The signatures follow the Tampermonkey and Violentmonkey documentation; no declaration text is copied.
    - CSS goes in through `GM_addStyle`, falling back to a `<style>` element. Both apply under Steam's CSP, which has no `style-src` (S5, S6).
    - `GM.registerMenuCommand` opens the settings form in a dialog. Settings apply live where `GM_addValueChangeListener` exists, and on the next page load otherwise.
    - `header.ts` renders the metadata block from `package.json` and the catalogs: `@name` and `@description` from English, plus `@name:<lang>` and `@description:<lang>` for every other shipped locale. The build writes `.user.js` and `.meta.js`.
    - Commit `feat(userscript): ship the tampermonkey and violentmonkey build`.
    - **Proof:** a check parses the header: no `@connect`, and every `GM` name in the bundle has a matching `@grant`. The app page and search rows of the checklist pass in both managers, on Chrome and Firefox Nightly; for Violentmonkey this is the first run, since S6 could not test it.

13. **Remaining surfaces.**
    - Add `Placement` entries against the S5 fixtures for the wishlist, home carousels, discovery queue, tag and category hubs, sale pages, search suggestions and developer pages, one fixture test per surface. No scanner edits (invariant 11).
    - The wishlist is virtualized (S5): with 602 items only 16 to 28 rows are mounted, and scrolled-out rows are unmounted, not reused. Its placement is `hideable: false`, and repair after remounting goes through the normal added-subtree scan. Rows also expose the app ID as `data-rfd-draggable-id="WishlistItem-<appid>-0"`, a second source next to the links if they ever disappear.
    - Category hubs and `/specials` share the tag hub's React template, so the tag hub fixture covers them. The home React rows, the discovery queue overlay and publisher pages have no fixture (S5) and are checked by hand.
    - Commit `feat(core): place badges on wishlist, home, queue, hub and sale capsules`.
    - **Proof:** every cell of the manual checklist is filled in, including the sale page performance profile. Each failure either becomes a fixture and gets fixed, or is listed as a known gap in the README.

14. **Release packaging and live canary.**
    - `scripts/package.sh` writes to `artifacts/`: `<slug>-chrome-<version>.zip`, `<slug>-firefox-<version>.zip`, `<slug>.user.js` and `<slug>.meta.js` (fixed names, so `releases/latest/download/` URLs stay stable), and `<slug>-source-<version>.zip` (a `git archive` of the tag, including the lockfile).
    - The README's build-from-source section gives the OS, the mise install command, `mise install` and `mise run build`.
    - `docs/store/listing.mdx` holds the listing text (including one line saying the extension only reads Steam's own disclosures and sends no reports anywhere, since "Reporter" could suggest otherwise), the single-purpose statement, the permission justifications, the unaffiliated notice, and the privacy answers (app IDs go cookie-less to Valve's own API; nothing goes to the developer or any third party).
    - `scripts/canary.py` checks 5072580, 1808500 and 413150 through GetItems, plus one `?l=english` page.
    - Tasks `package`, `canary` and `capture-fixtures` (refreshes the public fixtures).
    - Commit `build: package store zips, the userscript and the amo source archive`.
    - **Proof:** the source zip, unpacked in a clean `ubuntu:24.04` container and built with mise alone, produces a `dist/firefox` identical to the local one; `mise run check-reproducible` passes in CI; `mise run canary` passes.

15. **Release pipeline.** Decided 2026-10-20 (`docs/research/extension-release-pipeline.md`); recorded in ADR 0005. It follows the user's monorepo release train, adapted to the store rules. Workflows stay thin: each job sets up mise and runs one `release:*` task; the logic lives in `scripts/release/*.py`.
    - **Fragments:** changie and the changelog gate land in step 4; this step batches the fragments into releases.
    - **Version:** unpadded CalVer `YYYY.M.D`, with `.N` (from 1) for a same-day recut. The same string is the Git tag, the manifest `version` and the userscript `@version`. `calver.py` computes the next version from the UTC date and the existing tags. `package.json` always holds the last released version; feature PRs never touch it.
    - **Train (`release-train.yml`, task `release:train`):** runs at 00:00 UTC and on manual dispatch (with a `dry_run` input). It dispatches CI on `main` and finds the newest green commit. It skips when no commit is green, a release PR is already open, or nothing landed since the last tag. If fragments exist, the release-bot GitHub app opens a batch PR (`changie batch <version>`, `changie merge`, `package.json` version) that auto-merges once the required checks pass. There is no merge queue, because the repo is on a personal account. If branch protection requires a review, `github-actions[bot]` approves (repository setting "Allow GitHub Actions to create and approve pull requests"). No fragments means no release.
    - **Tag and dispatch:** when the batch PR merges, a job creates the tag on the merge commit as the release-bot app (a tag ruleset admits only that app; app-created events can trigger workflows, `GITHUB_TOKEN` ones cannot) and dispatches `release-nightly.yml` with the tag.
    - **Nightly (`release-nightly.yml`, task `release:nightly`):** validates that the tag is CalVer and sits on `origin/main`, and that CI passed for that SHA. Builds once with the frozen lockfile, runs `check-reproducible`, packages, and creates a GitHub **prerelease** with that version's changelog section as notes and every artifact attached. Nothing goes to any store. A prerelease does not move `releases/latest`, so userscript users do not update yet.
    - **Prod (`release-prod.yml`, task `release:prod`):** manual dispatch with a `tag` input, run from the tag ref. It re-validates, downloads the prerelease assets and promotes the same artifacts, with no rebuild:
      - Environment `chrome-web-store`: upload and publish through Chrome Web Store API v2 (`chrome-webstore-upload-cli` v4, which needs `PUBLISHER_ID`). ADR 0005 picks OAuth refresh token or service account.
      - Environment `amo`: `web-ext sign --channel listed` on the unpacked Firefox zip, with `--upload-source-code` for the source zip and the changelog section as release notes through `--amo-metadata`.
      - Both environments require the user's approval. Secrets: `CWS_*` and `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` per environment; `RELEASE_BOT_APP_ID` and `RELEASE_BOT_PRIVATE_KEY` at repo level for `actions/create-github-app-token`. The release-bot app belongs to the user's organization; it is set to installable on any account and installed on `jrv97/steam-ai-reporter`.
      - Finally it marks the GitHub release as latest. That moves `releases/latest/download/<slug>.meta.js`, so userscript users update.
    - **Userscript URLs:** `@updateURL` and `@downloadURL` point at `https://github.com/jrv97/steam-ai-reporter/releases/latest/download/<slug>.meta.js` and `.user.js`.
    - Commits: `build: compute calver release versions`, `build(release): add the nightly release train`, `build(release): promote tagged releases to the stores`.
    - **Proof:** `calver.py` tests (never zero-padded, recut increments `.N`, at most four segments, each at most 65535); `release-train.yml` with `dry_run: true` reports the version it would cut and opens nothing; the first real nightly produces a prerelease with all five assets and correct notes; the first prod dispatch is watched by hand (both store submissions accepted, the release flips to latest, and a userscript installed from the previous release offers the update).

## Testing strategy

- **Unit tests** (vitest, Node or happy-dom): the parsers over captured fixtures, schema validation, app ID extraction, cache TTL and schema logic with a fixed clock, the LRU, throttle and breaker with fake timers (`vi.useFakeTimers` with `requestAnimationFrame` in `toFake`), settings and the allow-list. A file switches to jsdom (`// @vitest-environment jsdom`) only as a cross-check where a happy-dom divergence is suspected. No unit test asserts layout, since neither DOM implements it.
- **Contract tests** (`tests/contracts/`): one suite per port, run against every implementation (memory, extension fake, GM fake, fake HTTP).
- **Integration tests** in happy-dom: `start()` runs against the surface fixtures with a fixture-backed fake `Http`, an in-memory `KeyValueStore` and a fixed `Clock`. Mutation tests cover infinite scroll, React re-renders, carousel clones and unmounted then remounted wishlist rows.
- **Builders** in `tests/helpers/`: `memoryStore()`, `fakeHttp(routes)` (keyed by URL pattern, returning a fixture body, a status and a final URL), `fixedClock(t)`, and `getItemsResponse(items)` for synthetic edge cases.
- **Fixtures** are sanitized and dated in `tests/fixtures/README.md`. `mise run capture-fixtures` refreshes the public ones. Logged-in surfaces are captured by hand.
- **Static checks:** formatting (`fmt-check`, dprint including `.mdx`), oxlint type-aware lint (no `any`, no assertions, literal-flow rules), `typecheck` on both configs with TypeScript 7, ruff and mypy `--strict` on scripts, shellcheck, actionlint, zizmor, and the pnpm pin check.
- **Build checks** (`check_bundle.py`): manifest shape, permissions, Gecko keys, `__MSG_*__` resolution, no remote code, URL allowlist, userscript grants, size budgets, no secret values, and `check_reproducible.sh`.
- **i18n checks:** catalog parity and placeholders, descriptions, unused keys, forbidden wording across all catalogs, and the pseudo-locale for fallback and plurals.
- **Performance:** the scan budget test in CI, with a budget calibrated on happy-dom; the manual sale page profile in the checklist.
- **Manual:** `docs/testing/manual-checklist.mdx`, run before each release on Chrome, Firefox, Tampermonkey and Violentmonkey, logged in and out. It also covers what step 2 could not test: Violentmonkey, the home React rows, the discovery queue overlay and publisher pages.
- **Live:** `mise run canary` before each release, optionally also as a weekly scheduled job. It stays out of `mise run ci`, so CI never depends on Steam being up. There is no automated browser end-to-end test against live Steam in v1.

## Development and debugging loop

Browsers on the development machine:

- **Firefox Nightly** is the only Firefox used for testing. The user's regular Firefox is reserved for personal use: no task, script or test ever launches it, installs into it or touches its profiles.
- **Chrome** (regular release) is used only for this project, so loading the unpacked extension into its normal profile is fine.
- The **built-in browser** of the Claude desktop app cannot load extensions; agents use it for injection smoke tests (layer 2).

Machine-specific paths live in `mise.local.toml` (gitignored), read by the tasks as environment variables:

- `SAR_FIREFOX_BIN`: the Firefox Nightly executable.
- `SAR_FIREFOX_PROFILE`: a dedicated, persistent Nightly profile for this project (outside the repo), so the Steam login survives restarts.
- `SAR_CHROME_BIN` and `SAR_CHROME_PROFILE`: Chrome and a dedicated profile for `run-chrome`.

`mise run setup` fails with a clear message when `SAR_FIREFOX_BIN` is missing, rather than falling back to whatever Firefox is on the `PATH`.

Layers, fastest first:

1. **Tests.** Most debugging happens in vitest with happy-dom against captured fixtures. A bug seen on a live page becomes a new fixture first, then a fix.
2. **Injection smoke test in the built-in browser (agents).** `build` also emits `dist/dev/inject.js` from `src/platform/dev/inject.ts`: the core wired to an in-memory `KeyValueStore`, plain `fetch` and verbose logging. An agent pastes it into a live store page through the browser's JavaScript tool and checks badge placement on search, wishlist, sale and home pages, console output, and `performance.now()` scan timings. It does not exercise extension APIs. `dist/dev/` is never packaged; `check_bundle.py` asserts it is absent from `artifacts/`.
3. **Real extension.**
   - `mise run dev`: esbuild watch for all targets.
   - `mise run run-firefox`: `web-ext run` with `--firefox=$SAR_FIREFOX_BIN`, `--firefox-profile=$SAR_FIREFOX_PROFILE` and `--keep-profile-changes`, opening the store. It loads `dist/firefox` as a temporary add-on and reloads it on every rebuild.
   - `mise run run-chrome`: `web-ext run --target chromium` with the Chrome binary and its dedicated profile, also auto-reloading.
   - Dogfooding in the user's Chrome: `chrome://extensions`, Developer mode, "Load unpacked", pick `dist/chrome`; after a rebuild, press the extension's reload icon. With Claude in Chrome connected there, an agent can read the page and its console while the user browses.
   - Where things show: content-script logs in the page console (in Chrome, pick the extension in the console's context menu); the options page through right-click, Inspect; Firefox add-on internals through `about:debugging`; badge state as `data-sar-appid` and `data-sar-state` in the Elements panel.
   - Logged-in surfaces (wishlist, recommendations) need the user signed in to Steam in the dedicated Nightly profile and in Chrome.
4. **Userscript.** Tampermonkey and Violentmonkey are installed in Firefox Nightly and Chrome only. During development the managers load `dist/steam-ai-reporter.user.js` from disk (Violentmonkey's local-file tracking, or a Tampermonkey `@require file://` stub; S6 did not cover local-file loading, so step 12 settles which works). The managers need "Allow access to file URLs" in Chrome.
5. **Performance and memory.** On a sale page: the DevTools Performance panel for scan batches (budget: under 4 ms per batch) and a Memory heap snapshot after scrolling, checked for detached `sar-` nodes.
6. **Before a release.** The manual checklist (surface by target by logged in or out) and `mise run canary`.

A `settings.debug` flag (off by default, toggled on the options page) turns on verbose logging through the same catalog-keyed logger, so debug output follows invariant 9 too.

## Roadmap (after v1)

Release and distribution:

- A signed beta channel: nightlies signed on AMO unlisted under a separate beta add-on ID, plus a separate Chrome Web Store beta listing, so testers auto-update.
- A Greasy Fork mirror of the userscript through webhook sync (it rewrites update URLs and forbids minified code; our bundle is unminified).
- An Edge Add-ons listing, Chrome Web Store staged or partial rollout once the extension passes 10,000 weekly users, and localized store listings.

Product:

- Classifying disclosure text (in-game, marketing only, dev only, live, negations), using the AI Transparency Index taxonomy as a reference.
- A localized heading table for zero-request reads on localized app pages, built from Steam's own translations.
- A search sidebar filter, per-surface toggles and a hidden-games counter.
- Developer and publisher allow-lists, `storage.sync`, and allow-list import and export.
- Packages, bundles and subs (`data-ds-packageid`, comma-joined `data-ds-appid`).
- An opt-in "community suspects" hint from curators.
- Non-English catalogs, a translation platform (Crowdin or Weblate) and right-to-left layouts. The i18n pipeline is ready; only catalogs are missing.
- More targets: the Steam desktop client, Firefox for Android, Safari and Greasemonkey 4.
- Automated end-to-end tests against live Steam.

## Not planned

- Seed lists and remote databases (SteamDB, `appids.json`, AI Transparency Index data): licensing.
- A server-side "report a false flag" endpoint or any server of our own: it would break the privacy invariant.
- Keyed Steam Web API calls in shipped code (`STEAM_API_KEY` stays in development scripts).
- steamcommunity.com: S5 found that the old community wishlist URL redirects to the store wishlist, so no community match is needed.

## Risks and open questions

**Risks:**

- **GetItems can change or lose `include_extra_details` without notice** (`rq2-data-surface.md:107`). Mitigation: the HTML fallback, a canary before every release, and the userscript as the fast-fix channel while store reviews are pending.
- **Rate limits are per IP** and shared with the user's own browsing. S1 saw no 429 in 30 back-to-back calls over a VPN exit IP, so where the limit lies, and whether residential IPs or other regions differ, is unknown. Mitigation: batching, spacing, the persisted breaker and a small HTML budget.
- **GetItems error answers are unreadable cross-origin** (S1): a 429, an over-long URL and most other failures reach JavaScript as the same `TypeError`, with no status and no `Retry-After`. Mitigation: every `TypeError` opens the breaker with the fixed backoff, and the 4,000-character URL guard keeps over-long requests from happening. The cost is a 60 s pause after an ordinary network failure too.
- **React surfaces change with Steam deploys.** Mitigation: link-based host climbing with no hashed class names, fixture tests, and few per-surface rules.
- **Heavy pages (sales, home) may cause observer storms.** Mitigation: debounce with a maximum wait, `addedNodes`-only processing, `WeakSet` markers, and the scan budget.
- **Hide mode can break carousels and virtualized lists.** Mitigation: `hideable: false` falls back to dim.
- **Dim and hide can flash briefly**, because the script runs at `document_idle`. Accepted for v1.
- **False flags ("we do NOT use AI") and stale positives** (up to 7 days after a disclosure is removed). Mitigation: verbatim text and the allow-list.
- **An AMO reviewer may count cookie-less app ID lookups to Valve as transmitting browsing activity**, despite `required: ["none"]`. `PRIVACY.md` and the listing must explain the flow.
- **AMO reviewers must install mise** to rebuild from source. Mitigation: a one-command install in the README and a pinned `mise.toml`; if a reviewer objects, ADR 0002 documents the fallback (the same `build.py` run with a stock Python and pnpm).
- **oxlint JS plugins are alpha** (S8), and the literal-flow rule for invariant 9 depends on that API staying compatible with ESLint's `create(context)` and selector keys. Mitigation: the rule is about 12 lines and is exercised by the step 4 proof; the documented fallback is typescript-eslint with the TypeScript 6 alias pair (ADR 0002).
- **dprint parses MDX as CommonMark** (S8), so complex JSX in docs could be reformatted badly. Mitigation: keep JSX blocks in docs simple; `fmt-check` in `prepush` shows any change.
- **Spike results come from one browser, one region and one day** (rq6 caveats). The `/agecheck/` redirect was not reproducible and the AI block always came first, so those two fixtures are synthetic. Mitigation: the HTML parser guards on the final URL and `#appHubAppName` rather than on any one redirect, and the canary re-checks live pages before each release.
- **Adult-only app pages redirect to sign-in cookie-less** (S3, S7), so the HTML fallback returns unknown `gated` for them. GetItems answers for them (S2), so this matters only when the API path fails.
- **Violentmonkey is untested** (S6). Steam's CSP allows inline scripts, so its default page injection should work. Mitigation: the manual checklist covers it before the first release.
- **Naming:** "for Steam" is descriptive use, the pattern other listed extensions use; the repo was renamed to `steam-ai-reporter`, so listings can link to it. "Reporter" may suggest the extension files reports; the listing and options page say it does not.

**Decided during review (2026-10-20):**

- Scope approved as is; pnpm; MIT; changie fragments.
- i18n from day 1 with every message in catalogs (English only in v1). The `auto` locale follows the Steam page language.
- GetItems runs in the page's language (decided after S2): badge tooltips and the banner show the developer's own translation, with no extra banner call. This replaces the earlier choice of English detection plus a banner call in the store language. The HTML fallback stays on `?l=english`.
- Step 2 outcomes adopted: the content-script-only runtime (ADR 0003), TypeScript 7, oxlint with type-aware rules, a hand-written `gm.d.ts`, zizmor next to actionlint, and dprint with an `.mdx` association; the other S8 rows confirmed their defaults.
- Release pipeline in step 15: GitHub prerelease nightlies, unpadded CalVer everywhere, the user's release-bot app (installable on any account), no merge queue (auto-merge with required checks), the userscript on GitHub release assets; beta channel and Greasy Fork on the roadmap.
- Proper capitalization in docs, including the research notes; strict static typing with no `any`; SOLID and DRY; library check before non-trivial work; efficiency budgets; mise as the only toolchain and task runner (scripts in `.sh` or `.py`, hooks `precommit` and `prepush`); formatting at line width 100 on every owned file from day 1, with Markdown and MDX prose exempt from wrapping; `STEAM_API_KEY` for development only.
- No code copied from prior art; ideas credited in the README.
- Name "AI Reporter for Steam", slug `steam-ai-reporter`, Gecko ID `steam-ai-reporter@jdelavega.github.io` (permanent after the first AMO upload).
- TTLs and budgets use the common defaults: disclosed 7 days, not disclosed 12 hours, unknown 6 hours, at most 10 HTML fallback fetches per page view.

**Open questions for the user:**
None.
