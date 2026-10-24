---
title: Tag Kit for Steam: one tagger for AI, anti-cheat, DRM, EULA, account and PvP
  status: active
  issue: none
  updated: 2026-10-24
---

# Tag Kit for Steam

## Objective

Grow the extension and the userscript from one tag (AI disclosure) to seven, from one core. The decisions are in [ADR 0009](../adr/0009-tag-kinds-in-steams-words.mdx) (kinds, wording, settings) and [ADR 0010](../adr/0010-new-tags-from-getitems.mdx) (data). The research is in `docs/research/steam-store-disclosure-kinds.md`.

## Stack

Three PRs, each squash-merged in order, each branch based on the one below it.

1. `refactor/tag-kind-registry` (base `main`), about 3.5k changed lines. Research notes, ADRs 0009 and 0010 and this plan. A tag-kind registry with AI as the only kind. Per-kind verdicts through detection and the cache. Per-kind settings and ignore scopes with the v1 migration. No visible change. Done when `mise run ci` passes and the AI fixtures render identically.
2. `feat/tag-types` (base PR 1), about 4k lines. The six new tags with Steam's vocabulary for every tag including AI, chips, one banner, the hover card, per-kind switch, badge, banner entry, filter and ignore scopes, page-only detail from the live page, fixtures and canary checks, the bundle budget raise with measured numbers, rule 4 in AGENTS.md amended, ADRs 0006 and 0008 marked superseded, design docs for chips. Chip icons are not part of this PR.
3. `feat/tag-kit-rename` (base PR 2), about 1.5k lines. The name in the catalogs, README and PRIVACY, the new extension mark and its PNG script, licence notices, design docs for the mark and an ADR for the name.

## Migration

Settings and the ignore list move to the per-kind shape through a versioned, idempotent migration. The v1 keys are removed only after the v2 data reads back. The verdict cache is dropped once. Extension IDs, storage keys, the `sar-` prefix and the userscript `@namespace` do not change.

## Merge procedure

Squash is the only merge mode and branches delete on merge. After PR 1 merges, rebase PR 2 with `git rebase --onto origin/main <old PR 1 tip> feat/tag-types`, push with `--force-with-lease`, and let GitHub retarget it. Repeat for PR 3. CI runs on every pull request. The README, PRIVACY and listing text describe all seven tags from PR 3 on, so no release train runs between the merges.

## Tasks outside the repo

- Search the Chrome Web Store for "Tag Kit" before the name ADR.
- Spike a renamed userscript `@name` in Tampermonkey and Violentmonkey before changing it.
- Hand-hint the 16 px and 32 px marks.
- Update the store listings, the GCP display name and, after a repository rename, the workload identity binding (its subject names the repository).

## Out of scope

Chip icons (a design decision), user-defined tags, tags beyond the seven.
