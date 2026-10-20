# RQ7: Library and tooling study for v1

Spike S8, 2026-10-20. Scope: one decision per row of the tooling table in `docs/plans/steam-ai-reporter-v1.md` ("Tooling decisions"), plus the mise backend for every pinned tool. All proofs ran on Windows 11 (16 cores, Node 24.20.0, Git for Windows 2.55.0, mise 2026.10.15) in a scratch folder outside the repo; versions are those on npm and in mise on 2026-10-20.

## Answer in short

| Row | Decision | Why (one line) |
|---|---|---|
| 1. Bundling | Keep esbuild 0.28.2 driven by `build.py`, one call per target | Multi-entry IIFE with `--banner:js` and no minification proven in one call; the banner applies to all entries of a call |
| 2. Type check | Change to TypeScript 7.0.2 `tsc --noEmit` | TS 7 is GA (2026-07-08) and npm `latest`; 2.3x faster here, same diagnostics; it has no JS API, which only matters to typescript-eslint |
| 3. Lint (TypeScript) | Change to oxlint 1.89 type-aware (tsgolint) plus a 12-line own JS plugin rule for restricted syntax | Every required rule incl. `assertionStyle: "never"`; about 5x faster; runs on TS 7, while typescript-eslint caps `typescript` at `<6.1` |
| 4. Format | Keep dprint 0.64 with 7 plugins, add `markdown.associations` for `.mdx` | dprint skips `.mdx` by default but formats it safely with the association; Prettier corrupted `2 * 3 * 4`; Biome formats no Markdown, YAML or TOML |
| 5. Runtime validation | Keep valibot 1.5.0 | 10.8 KB unminified for the GetItems schema versus 37.3 KB for zod mini; exact optional types; strips unknown keys |
| 6. Tests | Keep vitest 5.0.5 with happy-dom 21.0.3 | Both DOMs pass the needed APIs; happy-dom starts faster and has `innerText`, observers, `popover`, `dialog` that jsdom 30 lacks |
| 7. WebExtension types | Keep `@types/chrome` 0.3.5, no polyfill | Storage values typed `unknown` (chrome-types uses `any`); declares Chrome 148's `browser`; the polyfill is 38 KB and stale |
| 8. Userscript types | Change to a hand-written `gm.d.ts` for the granted APIs | Neither package compiles with `skipLibCheck: false` plus `exactOptionalPropertyTypes`; both make `GM.getValue<T>` an unchecked assertion |
| 9. Python scripts | Keep: ruff 0.17.1, mypy 2.4.0 `--strict`, stdlib only | Both install on Windows through mise (`aqua:` and `pypi:`) |
| 10. Shell scripts | Keep: shellcheck 0.11.0, shfmt 3.14.1 | Both `aqua:`, both ran on Windows |
| 11. Workflows | Change to actionlint 1.7.12 plus zizmor 1.31.1 | zizmor audits the secret-holding release workflows; one native `aqua:` binary |
| 12. Package manager | Keep pnpm 12.14.0 from mise, `packageManager` equal to it, add `pmOnFail: error` | Without it pnpm 12 silently downloads and runs the `packageManager` version outside mise (proven) |
| 13. Git hooks | Keep `mise generate git-pre-commit --write --task=precommit` and `--hook=pre-push --task=prepush` | Hooks work from Git Bash and PowerShell and block on failure; mise runs inline tasks with `cmd /c` on Windows |
| 14. mise backends | All pinned tools install on Windows; prefixes needed for `npm:web-ext` and `pypi:mypy` | Proven by `mise exec` installs; libraries (esbuild, TS, oxlint, valibot, vitest) stay pnpm devDependencies |

## 1. Bundling

Options: esbuild CLI driven by `scripts/build.py` (default); WXT plus vite-plugin-monkey; plain Vite plus vite-plugin-monkey. The plan already weighs the framework options, so this section only confirms the default.

Evidence:
- esbuild 0.28.2 (published 2026-08-08, MIT) is the current release on npm [npm-esbuild]. The npm package is a 147 KB wrapper plus one platform binary package (`@esbuild/win32-x64` is 11.7 MB unpacked) and has no JavaScript dependencies. WXT 0.21.4 (2026-08-11) is still pre-1.0; Vite 8.3.4 and vite-plugin-monkey 8.1.1 are current [npm registry, queried 2026-10-20].
- Proof (scratch `s8/val`): one CLI invocation `esbuild src/a.ts src/b.ts --bundle --format=iife --outdir=out1 --banner:js=<header> --target=es2022` emitted `a.js` and `b.js`, each an unminified IIFE that starts with the three-line `// ==UserScript==` banner. Build time 15 ms.
- Two findings for `build.py`. First, `--banner` applies to every entry of an invocation, so the userscript (which needs the header) and the extension entries (which must not carry it) are two invocations, or one JavaScript API call per target. Second, an entry file with no `import` or `export` is wrapped in esbuild's `__commonJS` helper (the proof's `a.ts` grew to 480 bytes); composition roots always import, so this only bites trivial entries.
- npm 11.19 (observed in the scratch installs) and pnpm 10+ block dependency install scripts by default. esbuild still works without its postinstall step because the wrapper resolves the platform package (proof: the scratch install skipped the postinstall and the CLI ran).

Decision: keep esbuild 0.28.x, driven by `scripts/build.py`, as an npm devDependency pinned in `package.json` (the build invokes `node_modules/.bin/esbuild`).

Consequences for the plan: `build.py` runs one esbuild call per target (extension Chrome, extension Firefox, userscript) and passes `--banner:js` only on the userscript call. No minify flag anywhere; the bundle check can assert the banner is present on the userscript and absent elsewhere.

## 2. Type check

Options: `tsc --noEmit` from the `typescript` package (default); the native compiler (`tsgo`, now TypeScript 7).

Evidence:
- TypeScript 7.0 (the Go port) is generally available: 7.0.2 was published 2026-07-08 and is the npm `latest` tag; 7.1 nightlies ship under `next` [npm-typescript] [ts7-blog]. The old `@typescript/native-preview` package stopped at `7.0.0-dev.20260707.2`, the day before GA [npm registry].
- TypeScript 7.0 ships no programmatic API; a new API is planned for 7.1. Tools that import `typescript` (typescript-eslint, editor plugins for embedded languages) must keep using 6.0. Microsoft ships `@typescript/typescript6` (6.0.2, binary `tsc6`) and documents an alias layout: `"typescript": "npm:@typescript/typescript6@^6.0.2"` plus `"@typescript/native": "npm:typescript@^7.0.2"` [ts7-blog].
- The announcement describes `--build` (with `--builders`), a rebuilt `--watch` and parallel project-reference builds, and lists no declaration-emit gap; v1 needs none of these because both configs run with `noEmit`. TypeScript 7 turns options deprecated in 6.0 into errors (`target: es5`, `baseUrl`, `moduleResolution: node`, AMD/UMD modules) and changes defaults: `strict: true`, `module: esnext`, `types: []`, `rootDir: ./`, `noUncheckedSideEffectImports: true` [ts7-blog]. None of the plan's flags is removed; the plan already sets `"types": []` on the core config.
- typescript-eslint 8.72.0 (2026-10-19) declares the peer range `typescript >=4.8.4 <6.1.0` [npm registry, `npm view typescript-eslint peerDependencies`], so a project that runs typescript-eslint must have TypeScript 6.0 resolvable as `typescript`.
- Proof (scratch `s8/lint`, 81 files with the plan's strict flags and `skipLibCheck: false`, 16 cores, Windows 11): `tsc` 6.0.3 took 838 to 856 ms; `tsc` 7.0.2 took 369 to 380 ms (three runs each). Both reported the same 120 errors. Exit codes differ when there are errors (6.0 exits 2, 7.0 exits 1), so scripts must test for non-zero, not for a specific code.

Decision: type-check with TypeScript 7 (`tsc --noEmit -p tsconfig.json` and `-p tsconfig.core.json`). Which package provides `typescript` depends on row 3: with oxlint (recommended) the repo needs only `typescript@7.0.x`; if typescript-eslint is kept, use the documented alias pair so `typescript` is 6.0 for the linter and `@typescript/native` provides the TS 7 `tsc`.

Consequences for the plan: the "Type check" row changes from "`tsc --noEmit`, `tsgo` as an alternative" to "TypeScript 7 `tsc --noEmit`". At v1 size the speed gain is small in absolute terms (under half a second), so the real reason is that TS 7 is now the supported line and the oxlint type-aware engine is built on it. Because TS 7 defaults `types` to `[]`, the extension, userscript and test configs must list their ambient packages explicitly (`"types": ["chrome"]` and so on); the core config already does.

## 3. Lint (TypeScript)

Options: typescript-eslint `strictTypeChecked` plus `stylisticTypeChecked` on ESLint (default); oxlint with type-aware rules (oxlint-tsgolint); Biome.

Evidence (versions queried on npm 2026-10-20):
- typescript-eslint 8.72.0 (2026-10-19) on ESLint 10.13.0 (2026-10-16), MIT. Requires TypeScript `<6.1.0` (row 2).
- oxlint 1.89.0 (2026-10-19) with oxlint-tsgolint 7.0.2004 (2026-10-10), MIT. Type-aware linting is powered by typescript-go, requires TypeScript 7 semantics (legacy options such as `baseUrl` unsupported), and covers 59 of 61 typescript-eslint type-aware rules; rules take the same options as their typescript-eslint equivalents [oxc-type-aware]. Binaries ship for win32-x64, win32-arm64, linux-x64, linux-arm64, darwin [npm registry].
- oxlint JS plugins (ESLint v9+ compatible API, `jsPlugins` key, selectors supported) are alpha, and JS plugin rules cannot use type information [oxc-js-plugins].
- Biome 2.5.15 (2026-09-30, MIT or Apache-2.0): `biome explain` shows no `no-unsafe-*` family, no `noRestrictedSyntax` and no assertion-style rule; `useExhaustiveSwitchCases`, `noFloatingPromises`, `noMisusedPromises`, `useStrictBooleanExpressions` and `useExplicitType` are nursery rules backed by Biome's own inference, not the TypeScript checker. Biome fails the critical requirement.

Rule coverage for the plan's list (checked with `oxlint --rules -f json` and by running each tool):

| Rule | typescript-eslint | oxlint 1.89 |
|---|---|---|
| `no-explicit-any` | yes | yes |
| `no-unsafe-assignment`, `-member-access`, `-call`, `-return`, `-argument` | yes | yes (type-aware) |
| `strict-boolean-expressions` | yes | yes (type-aware) |
| `switch-exhaustiveness-check` | yes | yes (type-aware) |
| `consistent-type-assertions` with `assertionStyle: "never"` | yes | yes (fired on `as { a: number }` in the proof) |
| `no-non-null-assertion` | yes | yes |
| `ban-ts-comment` | yes | yes |
| `explicit-module-boundary-types` | yes | yes |
| `prefer-readonly` | yes | yes (type-aware) |
| `no-floating-promises`, `no-misused-promises` | yes | yes (type-aware) |
| `no-restricted-syntax` (ESQuery) | yes (ESLint core) | no native rule; works through a JS plugin (alpha) |
| presets | `strictTypeChecked`, `stylisticTypeChecked` | no presets; 65 of the 70 `@typescript-eslint` rules in `strictTypeChecked` and 20 of the 21 in `stylisticTypeChecked` exist under the `typescript` scope; the others exist under the `eslint` scope except `no-unsafe-enum-assignment` (no enums in our code) |

Proof (scratch `s8/lint`, Windows 11, 16 cores, Node 24.20.0):
- Sample: `ports.ts`, `good.ts`, and `bad.ts` with one violation per rule. typescript-eslint reported 22 errors including the 6 `no-restricted-syntax` hits (`textContent`/`title` literals, `console.log` literal, `aria-label` literal, `JSON.parse`, `new Error` literal). oxlint `--type-aware` with all plan rules at `error` reported the same 14 non-syntax findings (it does not enable `restrict-plus-operands` unless asked).
- `no-restricted-syntax` under oxlint, two ways, both loaded through `jsPlugins` with the same five ESQuery selectors as the ESLint config:
  - a 5-line plugin that re-exports ESLint's own rule (`builtinRules.get("no-restricted-syntax")` from `eslint/use-at-your-own-risk`): all 6 hits, but it keeps `eslint` as a dependency;
  - a 12-line plugin of our own (`own-plugin.mjs`): `create(context)` turns each `{ selector, message }` option into a visitor key whose handler calls `context.report`. oxlint's selector engine did the matching; all 6 hits, 20 problems in total, no `eslint` dependency. This is the variant to adopt.
- Wall clock, three runs each, `src/` (3 files): typescript-eslint 1,464 to 1,496 ms; oxlint type-aware 300 to 324 ms; oxlint type-aware plus our JS plugin 362 to 381 ms. Scaled sample (81 files): typescript-eslint 1,900 to 2,007 ms; oxlint 335 to 355 ms. Most of the ESLint time is Node startup and building the TypeScript program, so the ratio (about 5x) holds at v1 size; neither tool is slow enough to hurt a pre-commit hook.

Decision: oxlint 1.89 with oxlint-tsgolint, all plan rules at `error`, plus a local `jsPlugins` rule (our own, about 12 lines, run by Node at lint time and never bundled) that replaces `no-restricted-syntax`. Fallback, if the JS plugin path proves flaky: typescript-eslint plus the row 2 alias pair (its parser needs the `typescript` 6.0 package even without type information, so a "syntax rules only" ESLint run does not avoid the alias). typescript-eslint stays the reference: when a rule behaves differently, its documentation is the spec.

Why not keep typescript-eslint: it works today and is the most mature option, but its `typescript <6.1` peer range pins the repo to the 6.0 line (or the alias pair in row 2) while TypeScript 7 is the supported release; oxlint runs on TS 7 directly, is about 5x faster, and covers every required rule. The cost is enumerating rules instead of extending presets, and the alpha JS plugin for one rule. This is a close call; if the main session prefers maturity over alignment with TS 7, typescript-eslint plus the row 2 alias pair is a sound alternative.

Consequences for the plan: the lint row changes default (see "Proposed plan changes"). `ban-ts-comment` should be configured with `"ts-expect-error": true` too, because its default allows `@ts-expect-error` with a description and the plan bans directive comments outright. The rule list in step 4 becomes an `.oxlintrc.json` that names each rule, `eslint.config.ts` in the file layout becomes `.oxlintrc.json` plus the plugin file, kept outside `scripts/` because rule 14 reserves that folder for `.sh` and `.py` (for example `lint/restricted-syntax.mjs`), and ESLint, typescript-eslint and the TS 6 alias leave the dependency list.

## 4. Format

Options: dprint with plugins (default); Biome plus Prettier. MDX support decides it.

Evidence:
- dprint 0.64.0 (2026-10-18, MIT) now resolves plugins from npm with `npm:` specifiers; `dprint config add` wrote these current versions: `@dprint/typescript@0.96.1`, `@dprint/json@0.25.2`, `@dprint/markdown@0.26.0`, `@dprint/toml@0.9.0`, `dprint-plugin-malva@0.16.0` (CSS, 2026-05-30), `dprint-plugin-markup@0.27.6` (HTML, 2026-10-17), `dprint-plugin-yaml@0.6.0` (pretty_yaml, 2026-01-09) [npm registry]. The g-plane plugins (malva, markup_fmt, pretty_yaml) are listed in dprint's own plugin registry and are all MIT.
- Biome 2.5.15 formats none of `.md`, `.mdx`, `.toml`, `.yaml` (proof: "No files were processed" for all four). So "Biome plus Prettier" means Prettier for Markdown, MDX and YAML and nothing for TOML.
- Prettier 3.9.10 (2026-10-10) has an MDX parser.

Proof (scratch `s8/fmt`), on an ADR-like `.mdx` with YAML frontmatter, `import`/`export` lines, a JSX block, an MDX comment, a JSX self-closing tag with an expression prop, a table, a long prose line, and a second file with `{props.count}`, `2 * 3 * 4`, nested JSX with Markdown inside and an `export default` function:
- dprint with default config skips `.mdx` silently ("No files found to format"). Adding `"markdown": { "associations": ["**/*.{md,mdx}"] }` makes the Markdown plugin format it. Result: frontmatter normalized, a blank line inserted after it, list markers normalized, table delimiter row normalized, the long prose line kept on one line (`textWrap: maintain`), import and export lines, the MDX comment and the JSX expression prop untouched; the Markdown inside the nested JSX was dedented by two spaces (still valid MDX). No content change.
- Prettier `--parser mdx --prose-wrap preserve --print-width 100` changed `2 * 3 * 4` into `2 _ 3 _ 4`, which corrupts the text, and reformatted the `export default` function body. Its MDX support is older than MDX 2 syntax.
- dprint CSS (malva) and HTML (markup_fmt) formatted a sample stylesheet with attribute selectors and an options page skeleton as expected.

Decision: keep dprint with the seven plugins above, `lineWidth: 100`, `markdown.textWrap: "maintain"`, and the `markdown.associations` entry for `.mdx`.

Consequences for the plan: add the `associations` line to `dprint.json` (without it, ADRs and design docs are silently unformatted). The Markdown plugin parses MDX as CommonMark, so ESM and JSX are treated as paragraphs or HTML blocks; keep JSX blocks simple in docs, and the `prepush` format check will catch any regression. Python stays on ruff (dprint has a `dprint-plugin-ruff` wrapper, but mise pins ruff directly; see row 9). Shell stays on shfmt.

## 5. Runtime validation

Options: valibot (default); zod 4 mini; hand-written type guards.

Evidence:
- valibot 1.5.0 (2026-09-09, MIT, 1.9 MB unpacked, modular); zod 4.6.7 (2026-10-12, MIT, 6.1 MB unpacked, `zod/mini` subpath) [npm registry].
- Both libraries strip unknown keys with their plain `object` schema (unknown keys allowed and ignored), offer `exactOptional` (yields `key?: T` without `| undefined`, which matches `exactOptionalPropertyTypes`) and a `readonly` wrapper.

Proof (scratch `s8/val`): the GetItems schema from the brief, written three ways, with `safeParse` wrapped in `parseGetItems(input: unknown)`, bundled with esbuild 0.28.2 as an IIFE, `--target=es2022`:

| Implementation | Unminified | Unminified gzip | Minified | Minified gzip |
|---|---|---|---|---|
| valibot 1.5.0 | 10,809 B | 2,320 B | 4,407 B | 1,621 B |
| zod 4.6.7 `zod/mini` | 37,289 B | 8,132 B | 16,661 B | 5,649 B |
| hand-written guards | 2,082 B | 656 B | 1,239 B | 516 B |

- Runtime: all three accepted a payload with extra keys at every level and returned it with the unknown keys removed, accepted `{ response: {} }`, and rejected `appid: "10"`. zod's `readonly` freezes the output at runtime (`Object.isFrozen` true); valibot's `readonly` is type-only.
- Types (`tsc` 6.0.3 with the plan's flags, `skipLibCheck: false`): both libraries compile cleanly. `exactOptional` rejects `{ appid: undefined }` in both. `readonly` is shallow in both: the top-level `response` and the `store_items` array are readonly, but item fields stay mutable unless every nested `object` gets its own `readonly` wrapper. The hand-written version gets exact, deep `readonly` types because the interfaces are written by hand, but each type predicate is an unchecked claim that no lint rule verifies, and the parser is 72 lines against 34 for the valibot schema (2,997 versus 1,070 bytes of source).

Decision: keep valibot. It is the only schema library whose cost fits the content-script budget (about 10.8 KB of the 60 KB unminified budget for this schema; each further schema adds little because the action functions are shared), and a declarative schema is easier to review than predicates. zod mini alone would use 62 percent of the budget. Hand-written guards stay the fallback if the bundle check ever fails on size.

Consequences for the plan: wrap every nested `v.object` in `v.pipe(..., v.readonly())` (or define the output types by hand and check the schema with `satisfies v.GenericSchema<unknown, Output>`) so verdict data is deep readonly; use `v.exactOptional` rather than `v.optional`. Validate per item (`v.array` of a lenient item schema, or `safeParse` per item) so one malformed store item does not discard the whole batch; the proof shows that a single bad item rejects the full response in all three implementations. Add valibot's MIT notice to `THIRD_PARTY_NOTICES.md`.

## 6. Tests

Options: vitest with happy-dom (default); vitest with jsdom.

Evidence: vitest 5.0.5 (2026-10-15, MIT; peers allow both `happy-dom` and `jsdom` at any version, and Vite 6 to 8), happy-dom 21.0.3 (2026-10-15, MIT), jsdom 30.1.3 (2026-10-15, MIT) [npm registry]. All three are actively released (same-week releases).

Proof (scratch `s8/dom`, vitest 5.0.5 on Node 24.20.0, Windows 11), one feature suite run under `--environment happy-dom` and `--environment jsdom`:
- Both pass all 7 tests: `DOMParser.parseFromString(html, "text/html")` with `querySelector` and `textContent` on Steam-like markup; `MutationObserver` with `subtree: true` reporting an appended node; `requestAnimationFrame` callback with a timestamp; `vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "Date", "performance"] })` firing a rAF callback after `advanceTimersByTime(16)` and a timeout after 1,000 ms; `WeakRef`, `WeakMap`, `structuredClone`; a `[data-sfs-verdict="disclosed"]` attribute selector; `getComputedStyle` returning `opacity: 0.4` from a `<style>` attribute-selector rule; `Response` and `AbortSignal.timeout`.
- API probe: happy-dom implements `innerText`, `IntersectionObserver`, `ResizeObserver`, `checkVisibility`, `document.adoptedStyleSheets`, the `popover` attribute and `HTMLDialogElement.showModal`; jsdom 30 implements none of these. Neither implements `requestIdleCallback` or layout (`getBoundingClientRect` returns zeros in both).
- Speed is mixed. Feature suite: vitest reported 568 ms with happy-dom versus 973 ms with jsdom (90 and 88 percent environment setup). A heavy synthetic scan (20 rounds of parsing a 200-capsule page, replacing `body.innerHTML`, querying and setting attributes) took 366 to 372 ms in happy-dom and 219 to 246 ms in jsdom. For v1's suite of many small tests, setup cost dominates and happy-dom wins; jsdom parses large documents faster.

Decision: keep vitest with happy-dom as the default environment, using `vi.useFakeTimers` with `requestAnimationFrame` in `toFake` for the scheduler tests. Use jsdom per file (`// @vitest-environment jsdom`) only where a happy-dom divergence is suspected, as a cross-check, not as a second full run.

Consequences for the plan: the scan-time budget test must compare against a budget calibrated on happy-dom (the slower parser of the two), and real performance is still measured in Chrome DevTools as the plan says. No layout-dependent assertions in unit tests. If the options page uses `popover` or `<dialog>`, only happy-dom can test it.

## 7. WebExtension types

Options: `@types/chrome` (default); `chrome-types` (Google's generated types); `webextension-polyfill` plus `@types/webextension-polyfill`.

Evidence:
- Versions [npm registry]: `@types/chrome` 0.3.5 (2026-10-09, MIT, DefinitelyTyped, `typeScriptVersion: 5.6`, depends on `@types/filesystem` and `@types/har-format`); `chrome-types` 0.1.457 (2026-10-16, Apache-2.0, regenerated from Chromium); `webextension-polyfill` 0.12.0 (2024-05-14, MPL-2.0, no release in 29 months); `@types/webextension-polyfill` 0.12.6 (2026-09-01).
- Namespaces: MDN lists `browser` as the namespace in Firefox and Safari and, from Chrome 148, in Chrome, Edge and Opera; Firefox and Safari implement promises for the whole API, and Chrome reached full promise coverage in Chrome 152 [mdn-differences] [mdn-chrome-incompat]. MDN describes the polyfill only as a way to target "older Chrome browser versions" [mdn-chrome-incompat]. MDN does not state whether Firefox's `chrome.*` alias returns promises under MV3; the wrapper below never relies on it, because it prefers `browser` whenever it exists.
- `@types/chrome` 0.3.5 already declares `declare var browser: typeof chrome` ("Cross-browser alias of chrome, since Chrome 148") and types `storage.local.get` as returning `Promise<{ [key: string]: unknown }>` and `StorageChange.newValue` as `unknown`. `chrome-types` types the same calls with `any` (`Promise<{[name: string]: any}>`, `newValue?: any`); it has 86 `: any` annotations versus 28 in `@types/chrome`.

Proof (scratch `s8/types` and `s8/lint/ext`, plan flags, `skipLibCheck: false`):
- A storage and i18n wrapper compiled cleanly against both packages with TypeScript 6.0.3 and 7.0.2.
- Adding `const n: number = items[key]` after `storage.local.get`: with `@types/chrome` the compiler rejects it (`Type 'unknown' is not assignable to type 'number'`); with `chrome-types` it compiles and only oxlint `no-unsafe-assignment` catches it. `@types/chrome` keeps untrusted storage data `unknown`, which is what invariant 10 asks for.
- With `@types/chrome`, `globalThis.browser ?? globalThis.chrome` fails `no-unnecessary-condition` (part of `strictTypeChecked`; oxlint has it too) because `browser` is declared non-optional. `"browser" in globalThis ? globalThis.browser : globalThis.chrome` passes `tsc` and both linters. Redeclaring `var browser: typeof chrome | undefined` in a `declare global` block fails with TS2403.

Decision: `@types/chrome` 0.3.x, no polyfill. The platform wrapper picks `browser` when present and falls back to `chrome`, both MV3 promise APIs, and never passes the generic type argument of `storage.local.get<T>()` (that argument is an unchecked assertion; the result stays `unknown` until valibot parses it).

Consequences for the plan: write the wrapper as `"browser" in globalThis ? globalThis.browser : globalThis.chrome`, or set `minimum_chrome_version` to 148 and use `browser` only (simpler, at the cost of dropping Chrome 121 to 147; by Chrome's four-week release cadence, stable is past 148 in October 2026). The polyfill would add an MPL-2.0 dependency and 38,440 bytes unminified (`dist/browser-polyfill.js` of 0.12.0; 10,113 minified) to every extension bundle, about 64 percent of the content-script budget, for no gain.

## 8. Userscript types

Options: `@violentmonkey/types` (default); `@types/tampermonkey`; a hand-written ambient declaration for the granted APIs only.

Evidence:
- `@violentmonkey/types` 0.3.4 (2026-07-22, ISC, 641 lines, maintained by the Violentmonkey author); `@types/tampermonkey` 5.5.0 (2026-08-20, MIT, DefinitelyTyped, 1,393 lines) [npm registry].
- Coverage (read from both `index.d.ts` files): both declare `GM.getValue`, `GM.setValue`, `GM.deleteValue`, `GM.listValues`, `GM_addStyle`, `GM.registerMenuCommand`, `GM_addValueChangeListener` and `GM.xmlHttpRequest`; `@types/tampermonkey` also has the promise forms `GM.addStyle` and `GM.addValueChangeListener`. Both type `GM.getValue` as `<T>(name: string, defaultValue?: T) => Promise<T>`; `@types/tampermonkey` types `GM.setValue`'s value as `any`.

Proof (scratch `s8/types`, a `store.ts` adapter using every API above, plan flags, `skipLibCheck: false`, TypeScript 6.0.3 and 7.0.2 gave identical results):
- `@violentmonkey/types` fails: its `index.d.ts` starts with `/// <reference types="@types/firefox-webext-browser" />` and `/// <reference types="chrome-types" />`, but both are only devDependencies of the package, so a consumer gets TS2688 and a cascade of `Cannot find namespace 'browser'`. It compiles once `@types/firefox-webext-browser` (143.0.1) and `chrome-types` are installed and `user-agent-data-types` is added to `types`, which drags two full WebExtension global namespaces into the userscript program.
- `@types/tampermonkey` fails under `exactOptionalPropertyTypes`: TS2430 at `index.d.ts(303,15)`, `HighlightNotification` declares `text?: undefined` while extending `Notification` with `text: string`. With that flag off it compiles (rc 0), but the flag is part of the plan.
- In both, `const n: number = await GM.getValue("x")` compiles without error: `T` is inferred from the assignment target, so the generic return is an unchecked type assertion that neither `tsc` nor the `no-unsafe-*` rules can see.

Decision: replace the default with a hand-written ambient file, `src/platform/userscript/gm.d.ts` (about 20 lines), that declares exactly the APIs the header grants, with non-generic signatures: `GM.getValue(name: string): Promise<unknown>`, `GM.setValue(name: string, value: JsonValue): Promise<void>` (our own recursive JSON type), `GM.deleteValue`, `GM.listValues(): Promise<readonly string[]>`, `GM_addStyle(css: string): HTMLStyleElement`, `GM.registerMenuCommand(caption: string, onClick: () => void): Promise<unknown>`, and `GM_addValueChangeListener` only if a step adopts it. No dependency, compiles under every plan flag, and storage reads stay `unknown` until valibot parses them. Signatures follow the Tampermonkey and Violentmonkey documentation (credited in the README like any other source); no declaration text is copied.

Consequences for the plan: the userscript type row changes (see "Proposed plan changes"). The userscript tsconfig sets `"types": []` and includes `gm.d.ts` through `files`, which also guarantees that core cannot see `GM` (invariant 5). If a later feature needs many more GM APIs, revisit `@violentmonkey/types` together with its two missing type packages.

## 9. Python scripts

Options: stdlib only, ruff for lint and format (line length 100), mypy `--strict`. No alternatives.

Evidence and proof: `mise latest` reports ruff 0.17.1 and mypy 2.4.0; both installed on Windows into an isolated mise data directory (`ruff 0.17.1` from `ruff-x86_64-pc-windows-msvc.zip` through `aqua:astral-sh/ruff`; `mypy 2.4.0 (compiled: yes)` through `pypi:mypy` in 2.2 s). mypy is not in the mise registry under a short name, so it must be written `"pypi:mypy"` in `mise.toml`. In mise 2026.10 the `pipx` backend's settings live under `pypi` (`mise settings get pypi.uvx` is recognized, `pipx.uvx` maps to it); `pipx:mypy` still resolves. Python itself is `core:python` (latest 3.15.0; 3.12.14 already installed on this machine through mise).

Decision: confirmed. Pin `ruff = "0.17.1"` and `"pypi:mypy" = "2.4.0"`; set `line-length = 100` in `ruff.toml` (already in the plan's layout) and pass `--strict` to mypy from the mise task (mypy does not read `ruff.toml`, so no extra config file is needed). The `pypi` backend installs each package into its own virtual environment and can use uv when uv is on PATH (this machine has uv 0.12.9, and the install took 2.2 s); pinning `uv` in `mise.toml` as well makes CI runners use the same installer. This uv behavior was not tested on a machine without uv.

## 10. Shell scripts

Options: shellcheck and shfmt. No alternatives.

Evidence and proof: shellcheck 0.11.0 (`aqua:koalaman/shellcheck`, `shellcheck-v0.11.0.zip`) and shfmt 3.14.1 (`aqua:mvdan/sh`, `shfmt_v3.14.1_windows_amd64.exe`) installed and ran `--version` on Windows through mise. Both projects publish Linux binaries for the same releases, which aqua selects on Linux runners.

Decision: confirmed. shfmt has no line-width option; it formats structure (use `-i 2 -ci` or an `.editorconfig`), so the 100-column rule for shell is a review rule plus an optional length check in `check_text.py`, not a formatter setting.

## 11. Workflows

Options: actionlint alone (default); actionlint plus zizmor.

Evidence and proof: actionlint 1.7.12 (`aqua:rhysd/actionlint`, verified by sha256 checksum and GitHub attestations) and zizmor 1.31.1 (`aqua:zizmorcore/zizmor`, GitHub attestations, `zizmor-x86_64-pc-windows-msvc.zip`) installed and ran on Windows through mise. actionlint checks workflow syntax, expressions and embedded shell (it calls shellcheck when present); zizmor is a security auditor for workflows (template injection, excessive `permissions`, unpinned actions, credential persistence), which matters for a pipeline that holds store-publishing secrets.

Decision: actionlint plus zizmor. zizmor is a single native binary with no extra runtime, and the release pipeline (ADR 0005) holds Chrome Web Store and AMO credentials. Run zizmor offline by default (`zizmor --offline .github/workflows`) so `prepush` does not need a GitHub token.

## 12. Package manager

Options: pnpm (user decision).

Evidence and proof:
- pnpm 12.14.0 (2026-10-15) is current on npm and in mise (`aqua:pnpm/pnpm`, GitHub attestations). It installed and ran on Windows through mise in 2.1 s.
- pnpm reads `packageManager` and, since v11, applies the `pmOnFail` setting to it: `download` (default) downloads and runs the declared version, `error` fails, `warn` continues, `ignore` skips; it is set in `pnpm-workspace.yaml` as `pmOnFail: error`, by `--pm-on-fail`, or by `pnpm_config_pm_on_fail`. It replaces the removed `managePackageManagerVersions`, `packageManagerStrict` and `packageManagerStrictVersion` [pnpm-cli-settings].
- Proof (scratch `s8/pm-*`): with mise's pnpm 12.14.0 and `"packageManager": "pnpm@12.5.1"`, pnpm silently downloaded and ran 12.5.1 from its own store (`pnpm --version` printed `12.5.1`), outside mise. `managePackageManagerVersions: false` is ignored with a warning in pnpm 12. With `pmOnFail: error`, the mismatch fails `pnpm install` (rc 1); with matching versions it reports `Done in 42ms using pnpm v12.14.0`.
- npm 11.19 and pnpm block dependency lifecycle scripts by default; esbuild and dprint ran without them in the proofs (row 1), so `pnpm-workspace.yaml` needs no build allowlist for them.

Decision: pnpm 12.14.0 from mise; `"packageManager": "pnpm@12.14.0"` in `package.json`; `pmOnFail: error` in `pnpm-workspace.yaml`, so a drift between `mise.toml` and `package.json` fails loudly instead of running a second pnpm. No corepack.

Consequences for the plan: add `pnpm-workspace.yaml` with `pmOnFail: error` to the file operations, and have a check script (for example `check_text.py`, or a small new `check_versions.py`) compare the `mise.toml` pnpm pin with `packageManager` so the two cannot drift.

## 13. Git hooks

Options: `mise generate git-pre-commit` (default).

Proof (throwaway repo `s8/hooks`, mise 2026.10.15, Git for Windows 2.55.0):
- Flags: `-t, --task <TASK>` (default `pre-commit`), `-w, --write` (write into `.git/hooks`, or `core.hooksPath` when set, mark executable, and move an existing hook to `<HOOK>.old`), `--hook <HOOK>` (default `pre-commit`), and `-- <MISE_ARG>...` for flags inserted between `mise` and `run` (for example `-- -C subdir`). Without `--write` it prints the hook. Alias: `mise generate pre-commit`.
- Commands used: `mise generate git-pre-commit --write --task=precommit` wrote `.git/hooks/pre-commit`; `mise generate git-pre-commit --write --hook=pre-push --task=prepush` wrote `.git/hooks/pre-push`. Both files are 4 lines of `#!/bin/sh`: `STAGED="$(git diff-index --cached --name-only -z HEAD | xargs -0)"`, `export STAGED`, `export MISE_PRE_COMMIT=1`, `exec mise run <task>`.
- Under Git for Windows both hooks ran from Git Bash and from PowerShell (`git commit`, `git push` to a local bare remote), and a task that exits 3 blocked the commit (`[precommit] ERROR task failed`, commit rc 1). Hooks live in `.git/hooks`, so every clone runs the two generate commands once (a `mise run hooks` task, documented in the README).
- Quirks found:
  - On the first commit (no `HEAD`) `git diff-index` prints `fatal: ambiguous argument 'HEAD'` and `STAGED` is empty; the hook still runs the task.
  - `STAGED` is space-separated (`xargs -0` joins with spaces), so paths with spaces split; `scripts/precommit_format.sh` should ask git itself (`git diff --cached --name-only -z --diff-filter=ACMR`, read NUL-separated) rather than parse `STAGED`.
  - The pre-push hook also computes `STAGED` and sets `MISE_PRE_COMMIT=1`; harmless, but `prepush` must not rely on either.
  - On Windows, mise runs inline task `run` strings with `cmd /c` (`windows_default_inline_shell_args = cmd /c`; Unix default `sh -o errexit -c`). The proof task `echo "...$STAGED"` printed the literal string under cmd and expanded correctly after adding `shell = "bash -c"` to the task.

Decision: confirmed. Consequences for the plan: every mise task that has inline shell either sets `shell = "bash -c"` (Git Bash is present wherever Git for Windows is) or, better, calls a script (`run = "python scripts/build.py"`, `run = "bash scripts/precommit_format.sh"`), which keeps tasks identical on Windows and Linux.

## 14. mise backends

Proof: `mise registry <tool>` for the backend, `mise latest <tool>` for the current version, then `mise exec <tool>@<version> -- <tool> --version` on Windows 11 with `MISE_DATA_DIR` and `MISE_CACHE_DIR` pointed into the scratch folder. One Windows-specific failure: with the long scratch path, every install failed with "The path is 284 characters, at or near Windows' 260-character limit"; the same installs succeeded through the folder's 8.3 short path. Contributors with long checkout paths could hit this; mise's own data directory (default under `%LOCALAPPDATA%`) is normally short enough.

| Tool | mise backend | Version checked | Windows (proof) | Linux |
|---|---|---|---|---|
| Node | `core:node` | plan pins 24.14.0; latest 24.x is 24.22.0 (26.12.0 overall) | yes (24.21.0 already installed by mise) | yes |
| pnpm | `aqua:pnpm/pnpm` (also `npm:pnpm`) | 12.14.0 | yes, installed and ran | yes |
| Python | `core:python` | latest 3.15.0 | yes (3.12.14 installed by mise) | yes |
| changie | `aqua:miniscruff/changie` | 1.26.0 | yes (`changie_1.26.0_windows_amd64.zip`) | yes |
| web-ext | `npm:web-ext` (not in the registry; write the backend prefix) | 10.8.0 | yes, installed in 11.3 s, needs Node from mise | yes |
| dprint | `aqua:dprint/dprint` | 0.64.0 | yes (`dprint-x86_64-pc-windows-msvc.zip`) | yes |
| ruff | `aqua:astral-sh/ruff` | 0.17.1 | yes | yes |
| mypy | `pypi:mypy` (not in the registry; `pipx:mypy` also resolves) | 2.4.0 | yes, installed in 2.2 s | yes |
| shellcheck | `aqua:koalaman/shellcheck` | 0.11.0 | yes | yes |
| shfmt | `aqua:mvdan/sh` (also `go:`) | 3.14.1 | yes | yes |
| actionlint | `aqua:rhysd/actionlint` (also `go:`) | 1.7.12 | yes | yes |
| gh | `aqua:cli/cli` | 2.102.0 | yes | yes |
| zizmor | `aqua:zizmorcore/zizmor` (also `cargo:`) | 1.31.1 | yes | yes |
| esbuild | none in the registry (`npm:esbuild` works, 0.28.2) | 0.28.2 | not installed through mise | n/a |
| uv (optional) | `aqua:astral-sh/uv` | already 0.12.9 on this machine | yes | yes |

Decision: every pinned tool installs on Windows through mise; all binaries except web-ext and mypy come from aqua, which verifies checksums or GitHub attestations for most of them (`mise tool <name>` shows a "Security" line: attestations for pnpm, zizmor, actionlint; none listed for shellcheck and mypy). esbuild, TypeScript, oxlint, valibot, vitest and happy-dom stay npm devDependencies managed by pnpm, not mise tools, because the build and tests import them from `node_modules` and the lockfile pins them; `mise.toml` pins the programs, `pnpm-lock.yaml` pins the libraries.

Consequences for the plan: write `"npm:web-ext"`, `"pypi:mypy"` with explicit backend prefixes in `mise.toml`. Consider committing `mise.lock` (mise's `--locked` mode refuses installs without pre-resolved URLs) so CI and AMO reviewers fetch exactly the same artifacts.

## Proposed plan changes

The main session decides; each item names the plan section it touches.

1. **Type check row** ("Tooling decisions"): TypeScript 7 (`typescript@7.0.x`, `tsc --noEmit` on both configs) instead of TS 5/6 `tsc` with `tsgo` as an alternative. Scripts test for a non-zero exit, not for exit code 2. Every tsconfig lists its `types` explicitly, since TS 7 defaults them to `[]`.
2. **Lint row** ("Tooling decisions", step 4, file layout): oxlint plus oxlint-tsgolint with every rule from the plan's list named in `.oxlintrc.json`, and a local `jsPlugins` rule of our own for the restricted-syntax selectors, instead of typescript-eslint presets. Configure `ban-ts-comment` with `"ts-expect-error": true`. Replace `eslint.config.ts` with `.oxlintrc.json` plus the plugin file. If the main session prefers typescript-eslint's maturity, keep it but add the documented alias pair (`typescript` as `npm:@typescript/typescript6`, `@typescript/native` as `npm:typescript@7`) so the type check still runs on TS 7.
3. **Format row**: add `"markdown": { "associations": ["**/*.{md,mdx}"] }` to `dprint.json`; list the seven plugin specifiers (`npm:@dprint/typescript`, `npm:@dprint/json`, `npm:@dprint/markdown`, `npm:@dprint/toml`, `npm:dprint-plugin-malva`, `npm:dprint-plugin-markup`, `npm:dprint-plugin-yaml`).
4. **Runtime validation row**: keep valibot, and note in step 4 or the parser step: `v.exactOptional` everywhere, `v.readonly()` on every nested object, per-item validation of `store_items`.
5. **WebExtension wrapper** (platform step): `"browser" in globalThis ? globalThis.browser : globalThis.chrome`, because `globalThis.browser ?? globalThis.chrome` fails `no-unnecessary-condition` with `@types/chrome` 0.3.x. Alternatively set `minimum_chrome_version: "148"` and use `browser` only. Never pass the type argument of `storage.local.get<T>()`.
6. **Userscript types row**: replace `@violentmonkey/types` with a hand-written `src/platform/userscript/gm.d.ts` (non-generic, `unknown` returns) for exactly the granted APIs.
7. **Workflows row**: actionlint plus zizmor (`--offline` in `prepush`), both pinned in `mise.toml`.
8. **Package manager row**: add `pnpm-workspace.yaml` with `pmOnFail: error` and a check that the `mise.toml` pnpm pin equals `packageManager`.
9. **mise.toml**: explicit backend prefixes `"npm:web-ext"` and `"pypi:mypy"`; consider pinning `uv` and committing `mise.lock`. The Node pin 24.14.0 is eight minor releases behind the latest 24.x release (24.22.0); keep it only if there is a reason.
10. **mise tasks** (invariant 14): no inline shell in tasks on Windows without `shell = "bash -c"`; prefer `run = "python scripts/..."` or `run = "bash scripts/..."`. Add a `hooks` task that runs the two `mise generate git-pre-commit --write` commands, since `.git/hooks` is not versioned.

## Caveats

- Proofs ran on Windows only. Linux support rests on published Linux binaries for every aqua tool and on npm platform packages (`@esbuild/linux-x64`, `@oxlint-tsgolint/linux-x64`, `@typescript/typescript-linux-x64`), not on a Linux run.
- Lint and type-check timings come from small synthetic samples (3 and 81 files) and are dominated by startup; they show the ratio, not the absolute cost on the real codebase.
- oxlint JS plugins are alpha [oxc-js-plugins]; the restricted-syntax rule depends on that API staying compatible with ESLint's `create(context)` and selector keys. oxlint type-aware rules claim the same options as typescript-eslint, but only the rules in the proof were exercised.
- dprint's Markdown plugin does not parse MDX; the association works because ADR-style MDX is mostly CommonMark plus simple JSX blocks. Complex JSX (multi-paragraph children, expressions with Markdown-like characters) was only lightly tested.
- MDN does not say whether Firefox's `chrome.*` alias returns promises under MV3. The recommended wrapper avoids the question by preferring `browser`, which MDN documents as promise-based in Firefox and in Chrome 148+ [mdn-differences].
- The valibot size is for one schema; settings and cache-record schemas will add some bytes (shared action code is counted once).
- The happy-dom versus jsdom speed numbers depend on the workload: jsdom was faster on large-document parsing in the proof.
- Every install path in mise failed under the long scratch path (Windows 260-character limit) and succeeded through the 8.3 short path; contributors with deep checkout paths may hit the same limit with `node_modules` or mise's temp files.

## Sources

Registry and CLI evidence (queried 2026-10-20): `npm view <package> version time license peerDependencies` for every npm package named above; `mise registry`, `mise latest`, `mise tool` and `mise generate git-pre-commit --help` from mise 2026.10.15; `oxlint --rules -f json` from oxlint 1.89.0; `biome explain <rule>` from Biome 2.5.15.

- [npm-esbuild] https://www.npmjs.com/package/esbuild
- [npm-typescript] https://www.npmjs.com/package/typescript
- [ts7-blog] https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- [oxc-type-aware] https://oxc.rs/docs/guide/usage/linter/type-aware.html
- [oxc-js-plugins] https://oxc.rs/docs/guide/usage/linter/js-plugins.html
- [mdn-chrome-incompat] https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities
- [mdn-differences] https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Differences_between_API_implementations
- [pnpm-cli-settings] https://pnpm.io/settings/cli
- typescript-eslint: https://www.npmjs.com/package/typescript-eslint
- oxlint: https://www.npmjs.com/package/oxlint and https://www.npmjs.com/package/oxlint-tsgolint
- dprint plugins: https://www.npmjs.com/package/dprint-plugin-malva, https://www.npmjs.com/package/dprint-plugin-markup, https://www.npmjs.com/package/dprint-plugin-yaml
- valibot: https://www.npmjs.com/package/valibot; zod: https://www.npmjs.com/package/zod
- happy-dom: https://www.npmjs.com/package/happy-dom; jsdom: https://www.npmjs.com/package/jsdom; vitest: https://www.npmjs.com/package/vitest
- `@types/chrome`: https://www.npmjs.com/package/@types/chrome; chrome-types: https://www.npmjs.com/package/chrome-types; webextension-polyfill: https://www.npmjs.com/package/webextension-polyfill
- `@violentmonkey/types`: https://www.npmjs.com/package/@violentmonkey/types; `@types/tampermonkey`: https://www.npmjs.com/package/@types/tampermonkey
- pnpm: https://www.npmjs.com/package/pnpm
- Not used as evidence (secondary reports on TS 7 that were checked against [ts7-blog]): search results from linuxiac.com, adtmag.com and dev.to.
