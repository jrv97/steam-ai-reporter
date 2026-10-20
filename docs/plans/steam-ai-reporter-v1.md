---
title: AI Reporter for Steam v1 (MV3 extension + userscript)
status: active
issue: none
updated: 2026-10-20
---

# AI Reporter for Steam: MV3 extension and userscript from one core (v1)

**Ambiguities and the assumptions taken**
- Product name "AI Reporter for Steam" (`short_name` "AI Reporter"), slug `steam-ai-reporter`, Gecko ID `steam-ai-reporter@jdelavega.github.io`. The CSS and attribute prefix stays `sfs-` (internal, never shown to users). Wherever this plan writes `<slug>`, it means `steam-ai-reporter`.
- "Unknown" renders nothing, the same as "not disclosed". The only trace is a `data-sfs-state` attribute, kept for debugging.
- The allow-list is per app ID only. Developer and publisher allow-lists are on the roadmap.
- The repo is MIT licensed. No code is copied from any prior-art project; ideas are credited in the README (see "Prior art and credits").
- Default TTLs: disclosed 7 days, not disclosed 12 hours, unknown `gated` or `missing` 6 hours. `error` and `rate-limited` are never persisted.
- v1 lands on a single branch, `feat/steam-ai-reporter-v1`, with one Conventional Commit per step.
- steamcommunity.com is excluded. The wishlist is on the store host (`rq5-extension-constraints.md:33`), and spike S5 checks that old community wishlist URLs redirect there.
- Formatting at 100 columns applies to every file we own. Markdown and MDX are formatted for structure only; prose lines are not wrapped. Captured fixtures, the lockfile and `LICENSE` are not ours to reformat.

## Objective
Build a Chrome and Firefox MV3 extension and a Tampermonkey/Violentmonkey userscript, both driven by one framework-free TypeScript core. They mark every app-ID-bearing item on `store.steampowered.com` whose developer filled in Steam's AI content disclosure:
- a badge on capsules and rows
- a non-blocking banner on the app page that quotes the developer's text verbatim
- an opt-in dim or hide mode for lists
- a per-game allow-list for false flags

Detection calls `IStoreBrowseService/GetItems` with `include_extra_details`, batched. A `?l=english` HTML parse is the fallback. There are three states (disclosed, not disclosed, unknown) and a local cache. There is no remote code, and nothing is sent anywhere except Valve's own endpoints.

## Current state
- The repo is `jrv97/steam-ai-reporter` on GitHub (renamed from `steam-fuck-slop` on 2026-10-20; GitHub redirects the old URL, and the local folder keeps the old name). `main` tracks `origin/main` and has two commits: `chore: init` (the wf docs scaffold, `AGENTS.md` and the research) and `chore: enforce lf line endings`.
  - `AGENTS.md` holds only a "working knowledge (docs/)" section: where plans, research, journal, drafts and ADRs live. ADRs are MADR in `docs/adr/`, which does not exist yet.
  - `.gitattributes` sets `* text=auto eol=lf` and `docs/journal/*.md merge=union`.
  - `docs/drafts/`, `docs/journal/` and `docs/plans/` exist with `.gitkeep`. `docs/TASKS.md` is untracked through `.git/info/exclude`. `.claude/settings.local.json` is ignored by the user's global Git ignore.
  - There is no `.gitignore`, no CI and no code.
- The user's Steam Web API key is available as the environment variable `STEAM_API_KEY`. v1 makes no keyed calls; the key is for development scripts only (see invariant 16).
- The recommendations this plan implements are at `docs/research/steam-ai-disclosure.md:69-76`. The three follow-ups that note asks for (`:78-81`) become spikes in step 2.
- Detection evidence:
  - The request recipe and the "non-empty `content_survey_ai_notes`" rule: `rq2-data-surface.md:125-127`. The protobuf fields: `:99`.
  - First-hand verification: CORS from the store origin passes, 50 IDs came back in one call in about 1.3 s, the duplicate ID is confirmed, and a same-origin HTML fetch works (`rq2-data-surface.md:129-134`).
  - GetItems returned Call of Duty's notes (`rq2-data-surface.md:95`) even though its cookie-less HTML redirected to `/agecheck/` (`:65`). The API probably ignores the age gate. Adult-only apps were not tested (`:66`).
  - HTML fallback rules: `#game_area_content_descriptors` is duplicated (`:36`). Agecheck, login and home redirects mean unknown (`:62-68`). `?l=english` may stick as the user's language (`:70`).
  - Still open: the batch ceiling (`:101`, `:132`), whether the notes vary by language (`:139`), and how stable the endpoint is (`:107`).
- Extension constraints:
  - Content scripts can fetch same-origin and parse with `DOMParser` (`rq5-extension-constraints.md:23`).
  - Search infinite scroll and the React wishlist: `:89-98`.
  - Rate-limit mitigations: `:105-107`.
  - Chrome limited-use and remote-code rules: `:127-128`.
  - AMO source submission (reviewer environment Node 24.14.0, npm 11.9.0) and `data_collection_permissions`: `:135-136`.
  - Userscript `GM_*` semantics and WXT were not researched: `:63-75`.
- Release research: `docs/research/extension-release-pipeline.md`.
- Wording: show the developer's text, never say "uses AI" or "AI-free", and treat absence as neutral (`rq3-reliability.md:84`, `:94`). The January 2026 rewrite narrowed the scope (`rq1-policy.md:7`).
- Conventions adopted from the user's other repos: a root `mise.toml` (`C:/Users/jorge/Documents/dev/smithbox-helper/mise.toml:9-20`; this repo is one package, so no `[monorepo]` section), MADR ADRs in `.mdx` (`smithbox-helper/AGENTS.md:79`), and Conventional Commits (`C:/Users/jorge/Documents/dev/mdx2steam/AGENTS.md:23-25`). Git hooks run through mise, not prek (invariant 14).

## Prior art and credits
Source: `docs/research/steam-ai-disclosure/rq4-prior-art.md`, plus the GetItems check in `rq2-data-surface.md` (main-thread verification). "(unv.)" marks third-party tracker or summary figures. The comparison is factual and neutral; the README's "Prior art and thanks" section credits each project whose ideas shaped ours.

### Where v1 differs
| | AI warning for Steam (seeeeew) | AI Content Filter (SoBloxsy) | Steam AI Games Indicator (Pierre-Demessence) | Obvious Steam AI | Augmented Steam | Ours, v1 |
|---|---|---|---|---|---|---|
| Detection | HTML heading; about 33 localized strings on the app page; per-app `?l=english` fetch for search | English heading only; per-app fetch, likely without `?l=english` (unv.) | `appids.json` seed (from SteamDB) plus per-app `?l=english` fetch | Page banner | None (issue 1913 open since 2024-04) | Batched GetItems `content_survey_ai_notes`, HTML fallback |
| Requests per 50-row search page | About 50 | Up to 50, lazy by viewport | 0 to 50, serial 1 s | n/a | n/a | 1 |
| Survives Steam retranslating the heading | No (Russian 2026-02, French 2026-09, Malay added) | English only | Yes | ? | n/a | Yes, the API field is language-independent |
| Surfaces | App, search | All store pages, English only | App, search, wishlist, home | App | None | Every app ID surface |
| Ships as | Extension and userscript (one file) | Extension | Userscript | Firefox extension | Extension | Extension (Chrome, Firefox) and userscript from one core |
| App page UX | Full-page modal, no options | Red banner | Banner | Banner | None | Non-blocking banner, verbatim text, collapsible |
| List modes | Blur or hide (search only) | Hide, highlight, text label | Badge plus hide filter | None | None | Badge, dim or hide (default off) |
| False-flag override | No (issue 12 open) | No | No | No | None | Per-game allow-list |
| Gated or error pages | Not documented | Not documented | `appHubAppName` guard before a negative | ? | None | Explicit unknown, never shown or cached as not disclosed |
| Freshness | 30 d positive, 7 d negative, reset on update | 7 d | Misses late disclosures below the seed list's max ID until a manual refresh (about quarterly) | ? | None | 7 d, 12 h, 6 h |
| Privacy and permissions | `storage` only | `storage`, service worker | Also fetches from `raw.githubusercontent.com` | Steam host access | Broad hosts plus its own server | `storage` only, Valve hosts only, cookie-less |
| License | MIT | Apache-2.0 | MIT | MPL-2.0, no source repo | GPL-3.0 | MIT |
| Users | About 5.5k Firefox, about 10k Chrome (unv.) | 80 Firefox, about 1k Chrome (unv.) | 2 stars | 0 | 64k Firefox | None yet |

Not covered in v1: a scope split (in-game, marketing only, dev only, live), the Steam desktop client, developer or publisher allow-lists, and undisclosed AI use (no tool sees it; only manual curators such as "No AI" do).

### What we learn from it
No code is copied. Every row below is an idea we reimplement from our own design and our own observations of Steam's pages.

| Credit | Idea | How it shows up in v1 | Step |
|---|---|---|---|
| seeeeew | Low-permission manifest (`storage`, no host permissions, Gecko `data_collection_permissions: none`) | Our manifest, enforced by `check_bundle.py` | 11 |
| seeeeew | Positive and negative TTL split, invalidation on extension update | `CACHE_SCHEMA` bump and our TTLs | 8 |
| seeeeew | A localized heading table | Roadmap; would be built from Steam's own translations | After v1 |
| seeeeew, issue 4 | An automated check for heading changes | `mise run canary` | 14 |
| Pierre-Demessence | Badging every surface, including wishlist and home capsules | Generic capsule scanner; selectors come from our own S5 survey | 2, 9, 13 |
| Pierre-Demessence | Guard against age gates before trusting a negative | `appHubAppName` and final-URL checks in the HTML parser | 6 |
| Pierre-Demessence | Serial requests with a delay | Throttle and circuit breaker | 7 |
| Pierre-Demessence | Hide option in the search sidebar | Roadmap | After v1 |
| SoBloxsy | Wishlist hide falls back to highlight | `hideable: false` falls back to dim | 9, 10 |
| Obvious Steam AI | Top-of-page banner | Non-blocking app page banner | 10 |
| Augmented Steam | Legacy versus React page handling, one module per feature | Architecture reference only | 4, 9 |
| Augmented Steam issue 1913 | Users want a dismissible banner like the DRM notice | Banner design | 10 |
| Augmented Steam VaporLens episode | AI-related defaults are contentious with this audience | List filter defaults to off | 8 |
| AI Transparency Index | Taxonomy (dev only, marketing only, in game, live) and negation rules | Roadmap classifier; no data reuse | After v1 |

Rejected sources: `appids.json` (derived from SteamDB) and SteamDB tag 1368160, because SteamDB's FAQ bans scraping and republishing; curator lists in v1.

## Architectural impact
The repo is greenfield, so this change creates the invariants. Step 1 writes them into the root `AGENTS.md`, so every session working in the repo sees them before any code exists.

1. **Privacy.** App IDs leave the browser only for Valve hosts the user is already on: `api.steampowered.com` GetItems and `store.steampowered.com` app pages. Every such request uses `credentials: "omit"`. No analytics, no third-party hosts, no seed lists.
2. **No remote code.** No `eval`, `new Function`, remote scripts or remote selector logic. Bundles are not minified. A build check enforces this.
3. **Permissions.** `storage` plus content-script matches on `https://store.steampowered.com/*`. No `host_permissions` and no background, unless ADR 0003 decides otherwise.
4. **Semantics.** Three verdict states. Unknown is never recorded or shown as not disclosed. The wording is "Discloses AI use", never "uses AI" or "AI-free". The developer text is rendered verbatim through `textContent`.
5. **Core purity.** `src/core` uses only DOM and web standards and never names `chrome`, `browser` or `GM`. `tsconfig.core.json` sets `"types": []`, so any such reference fails the type check.
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
12. **Library check first.** Before building anything non-trivial, look for a library that does it and study it: size, types, maintenance, license, and whether we need it at all. The outcome is recorded in the relevant ADR or PR description. Spike S8 does this for v1.
13. **Efficiency: performance and memory.**
    - Network: one GetItems request per batch of up to 50 unseen app IDs; zero requests for cached verdicts.
    - CPU: after the initial pass, scan only `addedNodes` subtrees; batch DOM reads before writes in one `requestAnimationFrame`; dim and hide are CSS attribute selectors, not per-node style writes; no polling.
    - Memory: `WeakSet` and `WeakMap` keyed by elements; no per-node closures or listeners (one delegated listener per root); the in-memory verdict map is bounded (LRU, 2,000 entries); the observer disconnects on `pagehide`; daily storage sweep.
    - Budgets, enforced by `check_bundle.py` and tests: `content.js` at most 60 KB and the userscript at most 80 KB unminified; a 200-capsule fixture scan within a test budget; under 4 ms per mutation batch in a manual Chrome DevTools profile on a sale page (checklist).
14. **mise is the only toolchain manager and task runner.** Local development, Git hooks, CI and release pipelines all run `mise run <task>`. Every tool (Node, pnpm, Python, changie, web-ext, formatters, linters, gh) is pinned in `mise.toml`. Non-trivial logic lives in `scripts/` as `.sh` (short glue) or `.py` (anything with logic), each exposed only through a mise task. `package.json` holds dependencies and no scripts. The pre-commit hook runs `mise run precommit` and the pre-push hook runs `mise run prepush`.
15. **Formatting from day 1.** Line width 100 for every file we own: TypeScript, JSON, CSS, HTML, YAML, TOML, Python and shell. Markdown and MDX are formatted for structure only; prose is not wrapped. `precommit` formats the staged files we own and re-stages them; `prepush` and CI reject unformatted files. Excluded: `tests/fixtures/**`, `pnpm-lock.yaml`, `LICENSE`.
16. **Secrets.** `STEAM_API_KEY` is read only by development scripts (spikes, canary) and only from the environment. It is never committed, logged, written into fixtures or bundled; `check_bundle.py` fails if its value appears anywhere in `dist/` or `artifacts/`. Release secrets live in GitHub environments (step 15).

ADRs are warranted for five decisions. They are written in MADR `.mdx` in step 3:
- `0001` **Detection strategy**: GetItems as the primary source, a `?l=english` HTML fallback, no localized heading table, no seed lists, three states, and the TTL policy. The alternatives are real (per-app scraping, the localized DOM, SteamDB-derived lists), and the choice rests on an undocumented endpoint.
- `0002` **Single codebase and tooling**: a core plus two thin platform adapters, built with esbuild driven by `scripts/build.py`, and the S8 outcomes for linting, formatting, validation and test DOM.
- `0003` **Runtime topology**: content script only, or a background relay for `api.steampowered.com`. The Firefox spike decides it. A relay adds a host permission and a background lifecycle, so it gets its own record.
- `0004` **i18n**: catalog format, runtime and locale resolution. Options considered: `chrome.i18n` with `_locales` only (cannot run in the userscript or in core, and cannot follow the Steam page language at runtime), i18next (about 40 KB and its own key conventions), ICU MessageFormat through `@formatjs/intl-messageformat` (rich plurals and selects, one more dependency), and the chosen default: Chrome `messages.json` as the single authored format (the extension needs it for `__MSG_*__` manifest strings, and Crowdin and Weblate read it natively) plus a dependency-free core runtime of about 60 lines: `$placeholder$` substitution, plurals through `_one` and `_other` key suffixes resolved with `Intl.PluralRules`, and an English fallback.
- `0005` **Release pipeline**: changie fragments, unpadded CalVer, the release-bot app tag ruleset, nightly GitHub prereleases, prod promotion of the same artifacts to the stores on manual dispatch, and Chrome Web Store auth (OAuth refresh token or service account). Alternatives: manual store uploads (what most prior art does), rebuilding at prod time, and a signed beta channel (roadmap).

TTL numbers and placement rules are tunable constants and need no ADR. Copy changes are catalog edits.

### Tooling decisions
Defaults below; spike S8 confirms or replaces each one before step 4.

| Concern | Default | Alternatives S8 weighs |
|---|---|---|
| Bundling | esbuild CLI, driven by `scripts/build.py` | WXT plus vite-plugin-monkey; plain Vite (see below) |
| Type check | `tsc --noEmit` on both configs | TypeScript native preview (`tsgo`) for speed |
| Lint (TypeScript) | typescript-eslint `strictTypeChecked` and `stylisticTypeChecked` | oxlint with type-aware rules (faster); Biome (has no `no-unsafe-*` family) |
| Format | dprint (TypeScript, JSON, CSS, HTML, Markdown with `textWrap: maintain`, TOML, YAML), line width 100 | Biome plus Prettier; MDX support decides it |
| Runtime validation | valibot | zod 4 mini; hand-written type guards |
| Tests | vitest with happy-dom | jsdom (fidelity versus speed) |
| WebExtension types | `@types/chrome` | `chrome-types`; `webextension-polyfill` (likely unnecessary in MV3) |
| Userscript types | `@violentmonkey/types` | `@types/tampermonkey` |
| Python scripts | stdlib only; ruff (lint and format, line length 100); mypy `--strict` | none |
| Shell scripts | shellcheck and shfmt | none |
| Workflows | actionlint | zizmor in addition |
| Package manager | pnpm, installed by mise; `packageManager` in `package.json` matches | none (user decision) |

Bundler alternatives already weighed:
- **WXT plus vite-plugin-monkey.** Two frameworks and two configs around one core, and a large transitive tree (Vite, Rollup, the WXT runtime, auto-import codegen) that AMO reviewers would have to rebuild. WXT's conventions leak into the core unless switched off, and its wins (HMR, manifest generation, a sources zip) are small for three entry points.
- **Plain Vite plus vite-plugin-monkey.** Content scripts must be IIFE, and Vite's library mode refuses multiple entries with the IIFE format, so this still needs several build configs.
- **esbuild (default).** One package with no JavaScript dependencies beyond its platform binary. It builds several IIFE entries, gives byte-stable output for the same inputs and version, and `build.py` stays readable for reviewers. Costs: a hand-written userscript header and manifest overlays, both covered by checks, and no HMR. esbuild watch plus `web-ext run` reloads Firefox; Chrome is reloaded by hand.

TypeScript compiler flags (`tsconfig.json`, shared by the core config): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`, `allowUnreachableCode: false`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck: false`.

Type-aware lint rules at `error`, beyond the presets: `no-explicit-any`, the `no-unsafe-*` family, `consistent-type-assertions` with `assertionStyle: "never"`, `no-non-null-assertion`, `ban-ts-comment`, `strict-boolean-expressions`, `switch-exhaustiveness-check`, `explicit-module-boundary-types`, `prefer-readonly`, `no-floating-promises`, `no-misused-promises`, and `no-restricted-syntax` selectors that forbid string literals flowing into `textContent`, `innerText`, `title`, `placeholder`, `aria-*`, `alert`, `console.*`, `new Error` and `new SfsError` (invariant 9). `JSON.parse` is wrapped once in `parseJson(text): unknown`; direct calls elsewhere are lint errors.

AMO build-from-source instructions become: install mise (one documented command), then `mise install` and `mise run build`. mise pins Node 24.14.0 and pnpm, so no corepack step is needed.

**Userscript header:**
- `@match https://store.steampowered.com/*`, `@noframes`, `@run-at document-idle`
- `@grant` for `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues`, `GM_addStyle` and `GM.registerMenuCommand`
- No `@connect`, provided spike S6 confirms that a plain `fetch` to GetItems works in both managers

## File operations
Nothing is deleted. `AGENTS.md` is extended (step 1); everything else is new. Layout:

```
README.md LICENSE THIRD_PARTY_NOTICES.md PRIVACY.md   (AGENTS.md exists, extended)
mise.toml package.json pnpm-lock.yaml .changie.yaml .changes/
tsconfig.json tsconfig.core.json eslint.config.ts dprint.json ruff.toml vitest.config.ts
.github/workflows/  ci.yml release-train.yml release-nightly.yml release-prod.yml
assets/icons/
posting/            saved posting collection for GetItems and app page requests
docs/adr/  docs/plans/  docs/store/  docs/testing/  docs/design/ (design session)
docs/research/steam-ai-disclosure/rq6-verification-spikes.md
docs/research/steam-ai-disclosure/rq7-library-study.md
scripts/            build.py gen_i18n_keys.py check_i18n.py check_text.py check_bundle.py
                    check_reproducible.sh package.sh calver.py canary.py capture_fixtures.py
                    changelog_gate.py precommit_format.sh release/*.py
src/core/  AGENTS.md types.ts ports.ts settings.ts app.ts json.ts errors.ts log.ts
  detect/  getitems.ts getitems.schema.ts app-page.ts throttle.ts detector.ts
  cache/   verdict-cache.ts lru.ts
  scan/    appid.ts scanner.ts placements.ts
  i18n/    catalog.ts t.ts locale.ts keys.gen.ts (generated)
  ui/      badge.ts banner.ts list-filter.ts settings-form.ts styles.css
src/locales/  en/messages.json   (authored source of truth, Chrome messages.json format)
src/platform/extension/   content.ts options.ts options.html ext.ts manifest.{base,chrome,firefox}.json
src/platform/userscript/  main.ts header.ts
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
- Create `posting/`: a saved `posting` collection with the GetItems request (store `Origin`, foreign `Origin`, `moz-extension://` `Origin`, German context) and an app page request, for spike S3 and later manual checks.
- Create `docs/research/steam-ai-disclosure/rq6-verification-spikes.md` and `rq7-library-study.md`.
- Create `docs/adr/0001-detect-disclosure-via-getitems.mdx`, `0002-single-codebase-and-tooling.mdx`, `0003-content-script-only-runtime.mdx`, `0004-i18n-message-catalogs.mdx`, `0005-release-pipeline.mdx`.
- Create `docs/testing/manual-checklist.mdx`: a matrix of surface by target by logged in or out, plus the performance profile row.
- Create `docs/store/listing.mdx`: Chrome and AMO listing copy, the single-purpose statement, permission justifications and privacy answers.
- Create `mise.toml`: tools (Node 24.14.0, pnpm, Python, changie, `npm:web-ext`, dprint, ruff, mypy, shellcheck, shfmt, actionlint, gh) and every task.
- Create `.changie.yaml` and `.changes/unreleased/`: kinds Added, Changed, Fixed and Removed.
- Create `package.json` and `pnpm-lock.yaml`: exact-pinned dependencies, no `scripts`.
- Create `tsconfig.json`, `tsconfig.core.json`, `eslint.config.ts`, `dprint.json`, `ruff.toml`, `vitest.config.ts`.
- Create `.github/workflows/*.yml`: each job installs mise with `jdx/mise-action` and runs exactly one mise task.
- Create `scripts/*`: as listed in the layout; each one is called only from a mise task.
- Create `src/**`, `tests/**`: the modules above, with `*.test.ts` next to each module.
- Create `assets/icons/`: from the design session (SVG source plus 16, 32, 48 and 128 px PNGs), with no Valve branding.

## Steps
1. **Branch, rules and plan.** The repo, remote and research commit already exist.
   - From an up-to-date `main`, run `git switch -c feat/steam-ai-reporter-v1`.
   - Add `.gitignore`, extend `AGENTS.md` with the sixteen invariants, and commit both with this plan as `docs: add v1 plan and project rules`.
   - **Proof:** the branch matches `^feat/[a-z0-9-]+$` and starts at `origin/main`. `git status` is clean. `docs/TASKS.md` and `.claude/settings.local.json` stay ignored.

2. **Verification spikes, library study and fixtures.** Browser checks run in DevTools on a store page (or the built-in browser), or in throwaway extensions and userscripts kept outside the repo. `posting` only runs as an interactive TUI, so requests that need custom headers (S3) live in the saved `posting/` collection and the user runs them; an agent falls back to DevTools and records what it could not set. `rq6-verification-spikes.md` gets one section per spike: method, result, and the default the code takes.
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
   - If S3 or S4 showed that Firefox content scripts cannot read GetItems, ADR 0003 chooses a background relay (`background.scripts` for Firefox, `background.service_worker` for Chrome, `host_permissions: ["https://api.steampowered.com/*"]`), and invariant 3 is updated to match.
   - Commit `docs: add adrs for detection, tooling, runtime, i18n and release`.
   - **Proof:** each ADR lists the options considered and the consequences. The user reviews the ADRs before step 4.

4. **Toolchain, hooks, formatting and the i18n runtime.**
   - Create `mise.toml`, `package.json` (exact versions, no scripts), the lockfile, both tsconfigs, `eslint.config.ts`, `dprint.json`, `ruff.toml`, `vitest.config.ts` and `ci.yml`.
   - Write `scripts/build.py` (esbuild CLI for all three targets, manifest merge, userscript header banner, catalog copy, static assets), `check_text.py`, `check_bundle.py`, `check_reproducible.sh` and `precommit_format.sh`.
   - mise tasks: `setup` (`mise install`, `pnpm install --frozen-lockfile`, and the Git hooks through `mise generate git-pre-commit`), `fmt`, `fmt-check`, `lint` (ESLint, ruff, mypy, shellcheck, actionlint), `typecheck`, `test`, `build`, `lint-firefox` (`web-ext lint` on `dist/firefox`), `dev`, `run-firefox` (Firefox Nightly only), `run-chrome`, `check` (text, i18n, bundle), `check-reproducible`, `precommit`, `prepush`, and `ci`.
     - `precommit`: formats the staged files we own and re-stages them; if a file is only partly staged, it stops and asks for the file to be staged whole, so unstaged hunks are never committed. Then `check_text.py` and `check_i18n.py` on the staged files.
     - `prepush`: `fmt-check` (rejects unformatted files), `lint`, `typecheck`, `test`, `build`, `check`, and a branch-name check.
     - `ci`: everything `prepush` runs, plus `check-reproducible` and `lint-firefox`.
   - Commit `build: scaffold mise tasks, hooks, formatting and linting`.
   - **i18n runtime, before any feature code:**
     - `src/locales/en/messages.json` in Chrome `messages.json` format. Keys are snake_case and grouped by prefix (`badge_`, `banner_`, `options_`, `error_`, `warn_`, `notice_`, `ext_`, `userscript_`). Every message has a `description` for translators.
     - `scripts/gen_i18n_keys.py` (run by `build` and `typecheck`) generates `src/core/i18n/keys.gen.ts`: a `MessageKey` union and per-key placeholder types, so `t("missing_key")` or a wrong placeholder fails the type check. `build.py` copies catalogs to `_locales/<lang>/messages.json` for the extension and inlines them into the userscript bundle.
     - `t(key, params)`, `plural(baseKey, count, params)` and `createI18n(catalogs, locale)` live in core with no browser API. Locale resolution: the `locale` setting (default `auto`). On store pages `auto` follows the page's `<html lang>` (mapped from Steam's codes recorded in S5); elsewhere it follows `navigator.language`. Anything without a catalog falls back to English.
     - Errors are typed: `SfsError` carries a `code` that is a `MessageKey` plus typed params, never prose. The logger takes keys, so console output is catalog text with a `[sfs]` prefix.
     - `scripts/check_i18n.py`: every locale has the same keys and placeholders as English, no catalog key is unused, every message has a `description`. The literal-flow rules live in ESLint (`no-restricted-syntax`), so there is one AST check, not two.
     - Commit `feat(core): add i18n catalogs, typed keys and the message runtime`.
   - **Proof:** `mise run ci` passes with one smoke test. A deliberately unformatted file is reformatted by `precommit` and rejected by `prepush`. A test file using `any`, `as Foo` or `!` fails `lint`. `dist/chrome` loads unpacked with no manifest errors; `mise run lint-firefox` reports nothing. A fresh clone builds with `mise install` and `mise run build` alone. A test-only pseudo-locale `xx` proves fallback, plural and placeholder handling, and a hardcoded `textContent = "hi"` in a fixture file fails `lint`.

5. **Core types, ports, app ID extraction and the GetItems parser.**
   - Add `types.ts`, `ports.ts`, `json.ts` (`parseJson(text): unknown`), `errors.ts`, `log.ts`, `scan/appid.ts`, `detect/getitems.schema.ts` and `detect/getitems.ts`.
   - `getitems.schema.ts` validates the response (with the S8 library) into a typed `GetItemsResponse`; anything that fails validation is unknown `error` for the batch.
   - The parser maps each requested ID to a verdict:
     - **Disclosed:** the item is present, `success` is ok, and `extra_details.content_survey_ai_notes` is non-empty after trimming. The verdict keeps the notes, `ai_generation_service.name`, and the app `name` for the allow-list.
     - **Not disclosed:** `extra_details` is present but has no notes.
     - **Unknown `missing`:** the item is absent, unsuccessful, or has no `extra_details`.
     - **Unknown `error` for the whole batch:** a non-200 status, invalid JSON or a schema failure.
   - IDs are chunked at the S1 ceiling (default 50), and the encoded URL stays under the S1 length limit.
   - Contract suites in `tests/contracts/` for `KeyValueStore` and `Http`; the in-memory and fake implementations pass them.
   - Commit `feat(core): parse getitems disclosure verdicts`.
   - **Proof:** tests run over the S2 JSON fixtures and builder-made edge cases: whitespace-only notes, missing `extra_details`, wrong field types, duplicate IDs, comma-joined `data-ds-appid`, relative and absolute links, and steamcommunity links (ignored). `mise run typecheck` passes with `"types": []` for core.

   ```ts
   declare const appIdBrand: unique symbol;
   export type AppId = number & { readonly [appIdBrand]: true };

   export type Verdict =
     | { readonly state: "disclosed"; readonly notes: string; readonly service?: string;
         readonly name?: string; readonly source: "api" | "html" }
     | { readonly state: "not-disclosed"; readonly source: "api" | "html" }
     | { readonly state: "unknown";
         readonly reason: "gated" | "missing" | "error" | "rate-limited" };

   export interface Detector {
     detect(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, Verdict>>;
   }
   ```

6. **HTML fallback parser.**
   - `detect/app-page.ts` takes a `Document` and the final URL.
   - **Unknown `gated`:** the final URL is under `/agecheck/` or `/login/`, is not under `/app/<id>`, or the page has no `#appHubAppName`.
   - Otherwise it collects every `#game_area_content_descriptors` with `querySelectorAll`, keeps the block whose trimmed `h2` equals `AI Generated Content Disclosure`, and reads the notes from that block's `p > i`.
   - The network path fetches `/app/<id>/?l=english` with `credentials: "omit"`.
   - On the current app page, the same parser reads the live document as a zero-request fallback, but only when its `lang` is English (per S5).
   - Commit `feat(core): parse the english app page as a fallback`.
   - **Proof:** tests pass on the AI-first, mature-first, AI-only, no-block, agecheck, login and home-redirect fixtures. The heading string appearing inside a game's description does not match.

7. **Throttling, circuit breaker and chain detector.**
   - GetItems runs with one call in flight and 1 s spacing.
   - **429 or 5xx handling:** back off for `Retry-After` when it is readable (per S3), otherwise for 60 s plus up to 10 s of jitter; open a breaker persisted as `meta:breaker` so other tabs honor it; while it is open, verdicts are unknown `rate-limited` and nothing is sent.
   - **HTML fallback:** `ChainDetector` sends IDs that GetItems left as unknown `missing` to the HTML fallback, at most 10 per page view, one at a time, 1 s apart. A separate HTML breaker trips on the first 429.
   - In-flight requests are deduplicated by app ID.
   - Commit `feat(core): throttle detection and fall back to html`.
   - **Proof:** fake-timer tests show that 120 IDs produce calls of 50, 50 and 20; a 429 opens the breaker and no request goes out until it closes; the HTML budget holds; one ID requested twice in the same tick costs one request.

8. **Verdict cache, settings and allow-list.**
   - Storage keys: `v1:a:<appid>` (state, time, notes, service, name), `v1:settings`, `v1:allow` (app ID to name and date), `v1:meta`. Every value read from storage is validated; invalid or old-schema values are discarded, never cast.
   - TTLs follow the assumptions. `error` and `rate-limited` live in page memory only. The in-memory map is an LRU capped at 2,000 entries (`cache/lru.ts`).
   - A `CACHE_SCHEMA` bump clears all verdicts on start. An expiry sweep runs at most once a day.
   - Each scan batch reads with one `get` and writes with one `set`.
   - Settings and defaults: `badges` on, `banner` on, `listFilter` one of `off`, `dim`, `hide` (default `off`), `locale` `auto`.
   - Commit `feat(core): cache verdicts and store settings`.
   - **Proof:** tests with an in-memory store and a fixed clock cover every TTL edge, the schema reset, the sweep, invalid stored values, the LRU cap, and allow-list add and remove.

9. **Scanner and placements.**
   - **Candidates:** first `[data-ds-appid]` holding a single numeric ID (comma lists are packages and are skipped), then `a[href*="/app/"]` parsed as relative or store-host URLs.
   - **Capsule host:** the highest ancestor, at most 8 levels up, whose app links and `data-ds-appid` values all name the same app ID. The host must contain an `img`, so text links in descriptions are ignored.
   - **Skipped:** the global header, the footer, breadcrumbs, the app page's links to its own app, and every `sfs-` node.
   - **Observer:** one `MutationObserver` on `document.body` (`childList`, `subtree`), debounced at 200 ms with a 1 s maximum wait. It processes only `addedNodes` subtrees, ignores mutations made only of `sfs-` nodes, and disconnects on `pagehide`.
   - **Marking and repair:** hosts get `data-sfs-appid` and `data-sfs-state`; processed hosts live in a `WeakSet`. If a React re-render drops a host's badge, the badge is restored. Duplicate badges copied by carousel clones are removed.
   - **`placements.ts`:** a registry of `Placement` entries (open/closed): a generic rule (compact badge overlaid on the capsule image; the image container gets `position: relative` only if it computes to `static`), search rows (full badge beside the title), wishlist rows (badge beside the title, `hideable: false` if S5 shows virtualized rows), and per-surface entries from S5.
   - DOM reads happen before writes, batched in one `requestAnimationFrame`. No `:has()`, so happy-dom behaves like the browsers.
   - Commit `feat(core): find capsules by app id across store surfaces`.
   - **Proof:** per-surface fixture tests assert the exact mapping from app ID to host; a rescan adds nothing; appending 50 search rows triggers one debounced scan that touches only the new rows; replacing a host's subtree restores its badge; the 200-capsule fixture scans within the test budget.

10. **UI and composition root.**
    - Visual tokens and component specs (badge, compact badge, banner, dim and hide states, options page, allow-list, icons) come from the design session (`docs/design/tokens.css`). If they are not ready, `styles.css` ships placeholder `--sfs-*` custom properties, so swapping them in later touches no logic. Injected UI may reference the page's own `"Motiva Sans"` font by name; no Valve logo, icon or font file is bundled.
    - Every string comes from the catalog: `badge_full` ("Discloses AI use"), `badge_compact` ("AI disclosed"), the banner heading, the ignore and undo labels, the unaffiliated line and the options copy. Layouts allow about 40% longer translations; badge text truncates and keeps the full message in `title`.
    - `badge.ts` sets a `title` with the first 200 characters of the notes.
    - Display language: detection always uses English. If S2 shows that `content_survey_ai_notes` varies with `context.language`, the app page banner makes one extra GetItems call for that app in the store language and caches it per app ID and language. Badge tooltips keep the cached detection text, so lists cost no extra requests.
    - `banner.ts` renders the notes verbatim with `textContent` and `white-space: pre-line`, collapsed after a few lines; shows a named AI service as plain text, with no link; offers "ignore this game"; for allow-listed games shows only a one-line "ignored, undo" note.
    - `list-filter.ts` toggles one attribute on the host; CSS does the dimming or hiding, falling back to dim where `hideable` is false.
    - `settings-form.ts` mounts the settings and the allow-list into any root element, with one delegated listener.
    - `app.ts` wires settings, scanner, cache, detector and renderers, and re-renders on `SettingsSource.subscribe`.
    - Commit `feat(core): render badges, banner and list filter`.
    - **Proof:** notes containing `<img onerror>` render as plain text; not disclosed and unknown render nothing; allow-listed games show only the undo line on the app page and nothing in lists; a test fails if any catalog message contains "uses AI", "AI-free" or "no AI"; an integration test runs `start()` on the search fixture with a fixture-backed fake HTTP and asserts the badges, then hide mode, then the allow-list.

11. **Extension target.**
    - `ext.ts` uses `globalThis.browser ?? globalThis.chrome`, typed through the S8 choice.
    - `content.ts` (composition root) builds ports over `storage.local`, `storage.onChanged` and `fetch`, then calls `start()`. The extension store adapter passes the `KeyValueStore` contract suite against a typed fake.
    - `options.html` and `options.ts` mount the settings form, a privacy summary, the unaffiliated notice and the version. The same page serves as the action popup. `options.html` carries no copy: elements hold `data-i18n="<key>"` and `options.ts` fills them through `t()`.
    - **Base manifest:** `manifest_version: 3`; `permissions: ["storage"]`; one content script (`matches: ["https://store.steampowered.com/*"]`, `content.js`, `content.css`, `run_at: "document_idle"`); `options_ui`, `action` and icons; `default_locale: "en"`, with `name`, `description` and `action.default_title` as `__MSG_ext_name__`, `__MSG_ext_description__` and `__MSG_ext_action_title__`, plus `short_name` as `__MSG_ext_short_name__`.
    - **Firefox overlay:** `browser_specific_settings.gecko` with the ID, `strict_min_version: "140.0"`, and `data_collection_permissions: {required: ["none"]}`.
    - Commit `feat(extension): ship the chrome and firefox content script and options page`.
    - **Proof:** `check_bundle.py` asserts permissions are exactly `["storage"]`, matches are exactly the store pattern, no `host_permissions` (unless ADR 0003 chose the relay), Gecko keys only in Firefox, every `__MSG_*__` resolves, no `eval(` or `new Function`, no HTTP URL outside the two Valve hosts, the size budgets hold, and `STEAM_API_KEY`'s value appears nowhere. `mise run lint-firefox` is clean. The app page and search rows of the manual checklist pass in Chrome and Firefox.

12. **Userscript target.**
    - `main.ts` (composition root) builds ports over `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues` and plain `fetch`. It uses `GM.xmlHttpRequest` with `@connect api.steampowered.com` only for a manager that failed in S6. The GM store adapter passes the `KeyValueStore` contract suite.
    - CSS goes in through `GM_addStyle`, falling back to a `<style>` element.
    - `GM.registerMenuCommand` opens the settings form in a dialog. Settings apply live where `GM_addValueChangeListener` exists, and on the next page load otherwise.
    - `header.ts` renders the metadata block from `package.json` and the catalogs: `@name` and `@description` from English, plus `@name:<lang>` and `@description:<lang>` for every other shipped locale. The build writes `.user.js` and `.meta.js`.
    - Commit `feat(userscript): ship the tampermonkey and violentmonkey build`.
    - **Proof:** a check parses the header: no `@connect` (unless S6 required one), and every `GM` name in the bundle has a matching `@grant`. The app page and search rows of the checklist pass in both managers, on Chrome and Firefox.

13. **Remaining surfaces.**
    - Add `Placement` entries against the S5 fixtures for the wishlist, home carousels, discovery queue, tag and category hubs, sale pages, search suggestions and developer pages, one fixture test per surface. No scanner edits (invariant 11).
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
    - **Fragments:** `.changie.yaml` with kinds Added, Changed, Fixed and Removed. Task `change-new` wraps `changie new`. `changelog_gate.py` (CI job `changelog-fragment`) fails a PR that changes `src/` without a new `.changes/unreleased/*.yaml`, unless the PR carries the `no-changelog-fragment` label. A `changelog-lint` step validates fragments.
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
    - Commits: `build(ci): gate prs on changie fragments`, `build: compute calver release versions`, `build(release): add the nightly release train`, `build(release): promote tagged releases to the stores`.
    - **Proof:** `calver.py` tests (never zero-padded, recut increments `.N`, at most four segments, each at most 65535); a PR touching `src/` without a fragment fails and passes with the label; `release-train.yml` with `dry_run: true` reports the version it would cut and opens nothing; the first real nightly produces a prerelease with all five assets and correct notes; the first prod dispatch is watched by hand (both store submissions accepted, the release flips to latest, and a userscript installed from the previous release offers the update).

## Testing strategy
- **Unit tests** (vitest, Node or happy-dom): the parsers over captured fixtures, schema validation, app ID extraction, cache TTL and schema logic with a fixed clock, the LRU, throttle and breaker with fake timers, settings and the allow-list.
- **Contract tests** (`tests/contracts/`): one suite per port, run against every implementation (memory, extension fake, GM fake, fake HTTP).
- **Integration tests** in happy-dom: `start()` runs against the surface fixtures with a fixture-backed fake `Http`, an in-memory `KeyValueStore` and a fixed `Clock`. Mutation tests cover infinite scroll, React re-renders and carousel clones.
- **Builders** in `tests/helpers/`: `memoryStore()`, `fakeHttp(routes)` (keyed by URL pattern, returning a fixture body, a status and a final URL), `fixedClock(t)`, and `getItemsResponse(items)` for synthetic edge cases.
- **Fixtures** are sanitized and dated in `tests/fixtures/README.md`. `mise run capture-fixtures` refreshes the public ones. Logged-in surfaces are captured by hand.
- **Static checks:** formatting (`fmt-check`), type-aware lint (no `any`, no assertions, literal-flow rules), `typecheck` on both configs, ruff and mypy `--strict` on scripts, shellcheck, actionlint.
- **Build checks** (`check_bundle.py`): manifest shape, permissions, Gecko keys, `__MSG_*__` resolution, no remote code, URL allowlist, userscript grants, size budgets, no secret values, and `check_reproducible.sh`.
- **i18n checks:** catalog parity and placeholders, descriptions, unused keys, forbidden wording across all catalogs, and the pseudo-locale for fallback and plurals.
- **Performance:** the scan budget test in CI; the manual sale page profile in the checklist.
- **Manual:** `docs/testing/manual-checklist.mdx`, run before each release on Chrome, Firefox, Tampermonkey and Violentmonkey, logged in and out.
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
   - Where things show: content-script logs in the page console (in Chrome, pick the extension in the console's context menu); the options page through right-click, Inspect; Firefox add-on internals through `about:debugging`; badge state as `data-sfs-appid` and `data-sfs-state` in the Elements panel.
   - Logged-in surfaces (wishlist, recommendations) need the user signed in to Steam in the dedicated Nightly profile and in Chrome.
4. **Userscript.** Tampermonkey and Violentmonkey are installed in Firefox Nightly and Chrome only. During development the managers load `dist/steam-ai-reporter.user.js` from disk (Violentmonkey's local-file tracking, or a Tampermonkey `@require file://` stub; S6 confirms which works). The managers need "Allow access to file URLs" in Chrome.
5. **Performance and memory.** On a sale page: the DevTools Performance panel for scan batches (budget: under 4 ms per batch) and a Memory heap snapshot after scrolling, checked for detached `sfs-` nodes.
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
- steamcommunity.com, unless a surface there turns out to carry store capsules (S5 checks).

## Risks and open questions
**Risks:**
- **GetItems can change or lose `include_extra_details` without notice** (`rq2-data-surface.md:107`). Mitigation: the HTML fallback, a canary before every release, and the userscript as the fast-fix channel while store reviews are pending.
- **Rate limits are per IP** and shared with the user's own browsing, and S1 can itself trigger a block. Mitigation: batching, spacing, the persisted breaker, a small HTML budget, and running S1 last.
- **Firefox content-script fetch may fail CORS** (S3, S4). Mitigation: the ADR 0003 relay. It costs a host permission and a background script, which must persist its queue state (`rq5-extension-constraints.md:50-52`).
- **`Retry-After` is probably unreadable cross-origin** unless the server exposes it. Backoff then uses a fixed delay.
- **React surfaces change with Steam deploys.** Mitigation: link-based host climbing with no hashed class names, fixture tests, and few per-surface rules.
- **Heavy pages (sales, home) may cause observer storms.** Mitigation: debounce with a maximum wait, `addedNodes`-only processing, `WeakSet` markers, and the scan budget.
- **Hide mode can break carousels and virtualized lists.** Mitigation: `hideable: false` falls back to dim.
- **Dim and hide can flash briefly**, because the script runs at `document_idle`. Accepted for v1.
- **False flags ("we do NOT use AI") and stale positives** (up to 7 days after a disclosure is removed). Mitigation: verbatim text and the allow-list.
- **An AMO reviewer may count cookie-less app ID lookups to Valve as transmitting browsing activity**, despite `required: ["none"]`. `PRIVACY.md` and the listing must explain the flow.
- **AMO reviewers must install mise** to rebuild from source. Mitigation: a one-command install in the README and a pinned `mise.toml`; if a reviewer objects, ADR 0002 documents the fallback (the same `build.py` run with a stock Python and pnpm).
- **Strict lint may be costly on third-party types** (`skipLibCheck: false`, `no-unsafe-*`). Mitigation: typed wrappers at the boundary (`ext.ts`, GM adapter); S8 measures it.
- **Steam's CSP may block an injected `<style>`** in managers without `GM_addStyle` (S5, S6).
- **Adult-only apps may stay unknown** when both the API and the cookie-less fallback are gated. v1 shows nothing for them.
- **Naming:** "for Steam" is descriptive use, the pattern other listed extensions use; the repo was renamed to `steam-ai-reporter`, so listings can link to it. "Reporter" may suggest the extension files reports; the listing and options page say it does not.

**Decided during review (2026-10-20):**
- Scope approved as is; pnpm; MIT; changie fragments.
- i18n from day 1 with every message in catalogs (English only in v1). The `auto` locale follows the Steam page language. If the notes vary by language, the banner shows them in the store language while detection stays on English.
- Release pipeline in step 15: GitHub prerelease nightlies, unpadded CalVer everywhere, the user's release-bot app (installable on any account), no merge queue (auto-merge with required checks), the userscript on GitHub release assets; beta channel and Greasy Fork on the roadmap.
- Proper capitalization in docs, including the research notes; strict static typing with no `any`; SOLID and DRY; library check before non-trivial work; efficiency budgets; mise as the only toolchain and task runner (scripts in `.sh` or `.py`, hooks `precommit` and `prepush`); formatting at line width 100 on every owned file from day 1, with Markdown and MDX prose exempt from wrapping; `STEAM_API_KEY` for development only.
- No code copied from prior art; ideas credited in the README.
- Name "AI Reporter for Steam", slug `steam-ai-reporter`, Gecko ID `steam-ai-reporter@jdelavega.github.io` (permanent after the first AMO upload).
- TTLs and budgets use the common defaults: disclosed 7 days, not disclosed 12 hours, unknown 6 hours, at most 10 HTML fallback fetches per page view.

**Open questions for the user:**
None.
