# AI Reporter for Steam

A Chrome and Firefox MV3 extension and a Tampermonkey/Violentmonkey userscript, built from one
TypeScript core, that mark Steam store items whose developers reported generative AI use.

## Working knowledge (docs/)

- Plans: `docs/plans/<slug>.md`, one per piece of work, with a status header (draft, active, done, dropped).
- Research: `docs/research/<topic>.md` summary plus `docs/research/<topic>/rqN-<slug>.md` notes.
- Journal: `docs/journal/YYYY-MM-DD.md`, append-only, one line per unit of work.
- Drafts: `docs/drafts/` holds prose in progress; `*.review.md` sidecars are git-excluded.
- Decisions: `docs/adr/`, MADR format in `.mdx`, one ADR per choice with real alternatives.
- Design: `docs/design/` holds the UI tokens and component specs; `assets/icons/` the icons.
- `docs/TASKS.md` is personal and untracked; never commit it.

## Project rules

These are hard rules. A change that breaks one needs an ADR first.

1. **Privacy.** App IDs leave the browser only for Valve hosts the user is already on:
   `api.steampowered.com` (GetItems) and `store.steampowered.com` (app pages). Every such request
   uses `credentials: "omit"`. No analytics, no third-party hosts, no seed lists, no server of our
   own.
2. **No remote code.** No `eval`, `new Function`, remote scripts or remote selector logic. Bundles
   are not minified.
3. **Permissions.** `storage` plus content-script matches on `https://store.steampowered.com/*`.
   No `host_permissions` and no background script unless an ADR says otherwise.
4. **Semantics.** Three verdict states: disclosed, not disclosed, unknown. Unknown is never stored
   or shown as not disclosed. The wording is "AI use reported", never "uses AI" or "AI-free". The
   developer's own text is rendered verbatim through `textContent`.
5. **Core purity.** `src/core` uses only DOM and web standards and never names `chrome`, `browser`
   or `GM`. Platform code lives in `src/platform/`.
6. **Originality and credit.** No code is copied from other AI-disclosure extensions, and nothing
   from GPL projects such as Augmented Steam. Ideas are credited in the README.
   `THIRD_PARTY_NOTICES.md` lists the licenses of bundled dependencies only.
7. **One version source.** The `package.json` version feeds both manifests and the userscript
   header. Feature changes never edit it; the release pipeline does.
8. **Repo hygiene.** Repo text is ASCII with normal capitalization and no em dashes (non-English
   catalogs excepted). Branches are `<type>/<slug>`. Commits follow Conventional Commits 1.0.0 with
   the types `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ops`, `chore`
   (CI changes are `build`), and carry no trailers.
9. **i18n from day 1.** Every user-visible or logged message (UI copy, errors, warnings, notices,
   ARIA labels, tooltips, manifest and userscript names and descriptions) lives in a message
   catalog under `src/locales/`, keyed and typed. Code holds keys, never copy. Allowed literals:
   identifiers, selectors, URLs, storage keys, CSS class names, and detection constants such as
   Steam's own `AI Generated Content Disclosure` heading.
10. **Strict static typing.** No `any`, explicit or implicit. Untrusted input is `unknown` until a
    validation schema turns it into a typed value. No type assertions other than `as const`, no
    non-null assertions, no `@ts-ignore` or `@ts-nocheck`. Branded types for domain IDs,
    discriminated unions with exhaustive checks, `readonly` by default.
11. **SOLID and DRY.** One module, one reason to change. New store surfaces are new placement
    entries and new detection sources are new detector links; the scanner and the chain are not
    edited for them. Every port implementation passes the shared contract tests. Ports stay small.
    Core depends only on ports; the extension content script and the userscript entry are the only
    shipped composition roots (`src/platform/dev/inject.ts` is a dev-only root, never packaged).
    Before writing new code, check whether existing code can be refactored to cover the case.
12. **Library check first.** Before building anything non-trivial, look for a library that does it
    and study it (size, types, maintenance, license, whether we need it at all). Record the outcome
    in the ADR or PR description.
13. **Efficiency.** Performance and memory are requirements:
    - one GetItems request per batch of up to 50 unseen app IDs, none for cached verdicts;
    - after the first pass, scan only added DOM subtrees; batch DOM reads before writes; dim and
      hide are CSS attribute selectors; no polling;
    - `WeakSet`/`WeakMap` keyed by elements, no per-node closures or listeners, a bounded
      in-memory cache, observers disconnected on `pagehide`;
    - bundle size and scan-time budgets are enforced by checks.
14. **mise is the only toolchain manager and task runner.** Local development, Git hooks, CI and
    release pipelines all run `mise run <task>`. Every tool is pinned in `mise.toml`; JavaScript
    libraries loaded from `node_modules` (esbuild, TypeScript, oxlint, valibot, vitest) are
    exact-pinned in `package.json` and the lockfile. Non-trivial logic lives in `scripts/` as `.sh`
    (short glue) or `.py` (anything with logic), called only from mise tasks; lint configuration
    such as the oxlint plugin in `lint/` is not task logic. `package.json` holds dependencies and
    no scripts. The pre-commit hook runs `mise run precommit`; the pre-push hook runs
    `mise run prepush`.
15. **Formatting.** Line width 100 for every file we own: TypeScript, JSON, CSS, HTML, YAML, TOML,
    Python and shell. Markdown and MDX are formatted for structure only; prose is not wrapped.
    `precommit` formats staged files and re-stages them; `prepush` and CI reject unformatted
    files. Captured fixtures, the lockfile and `LICENSE` are excluded.
16. **Secrets.** `STEAM_API_KEY` is read only by development scripts, only from the environment.
    It is never committed, logged, written into fixtures or bundled; a build check fails if its
    value appears in `dist/` or `artifacts/`. Release secrets live in GitHub environments.

## Development browsers

- Firefox testing uses Firefox Nightly only, through a dedicated profile. The regular Firefox
  install is personal: never launch it, install into it, or touch its profiles.
- Chrome (regular release) is used only for this project; loading the unpacked build there is fine.
- Machine-specific paths (`SAR_FIREFOX_BIN`, `SAR_FIREFOX_PROFILE`, `SAR_CHROME_BIN`,
  `SAR_CHROME_PROFILE`) live in the gitignored `mise.local.toml` of the main checkout. Edit it
  there; `.worktreeinclude` copies it into each new worktree, and an older worktree copies it by
  hand.
- The Claude desktop app's built-in browser cannot load extensions; agents use it to inject the
  dev bundle (`dist/dev/inject.js`) for smoke tests on live store pages.

## Workflow

- Trunk-based: every change reaches `main` through a PR from its own `<type>/<slug>` branch,
  squash-merged with the PR title (a Conventional Commit header) as the commit message.
- Sessions spawned for a piece of work run in their own Git worktree and branch, never in the
  shared checkout. They push and open the PR; the main session reviews and merges.
- After a merge: archive the session, remove its worktree and branch, and rebase any open branch
  that the merge left behind onto `main`.
- PR descriptions carry no AI attribution or trailers.
- On GitHub, sessions may push branches, open PRs, add labels and close superseded PRs. They
  change repo settings only after explicit approval. They post no comments, reviews or issues.
- Plans in `docs/plans/` and research in `docs/research/` stay committed in this repo, since ADRs
  link to the research. Code never references either.
- Main tasks: `mise run setup` once per clone, then `fmt`, `lint`, `typecheck`, `test`, `build`,
  `check`, `ci`; `dev`, `run-firefox`, `run-chrome` to try builds; `change-new` for changelog notes.
