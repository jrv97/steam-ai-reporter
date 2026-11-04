---
title: "Early Access tag"
status: active
issue: none
updated: 2026-11-04
---

# Early Access tag

## Objective

Add an Early Access tag kind (`earlyaccess`) to the registry. The decisions, the evidence and the library check are in [ADR 0018](../adr/0018-tag-early-access-from-the-item-flag.mdx).

## Scope

- Chip on every surface from GetItems `is_early_access`. An absent flag is not disclosed and draws nothing.
- Hover card: the developer's note (`extra_details.early_access.why_bbcode`, verbatim, flagged items only), the release date (`release.steam_release_date`, section `release`), and on the game's own app page the latest update post (`last_update_event.rtime` from the open document).
- Defaults: on, badge on, banner off, filter off. Entries keep 2 days disclosed, 7 days not disclosed.

## Steps

1. ADR 0018 and this plan.
2. Schema: `is_early_access`, `release.steam_release_date` and `extra_details.early_access.why_bbcode` in `getitems.schema.ts`; the `release` section in `sections.ts` and its `include_release` flag in `getitems.ts`.
3. Kind: `kinds/early-access.ts`, one line in `registry.ts`.
4. Latest update: `detect/early-access-update.ts` reads the embedded time; `app-page.ts` adds it to the open page's own disclosed verdict after detection.
5. UI: `kindDetails` case and a dated detail line, date formatting shared with the settings form, `shared.css` and `styles.css` rules.
6. Catalog: English and Spanish keys.
7. Tests: builders in `tests/helpers/`, table-driven kind, schema, request and detail tests, a captured fixture item and an app page fixture with the embedded time.
8. Docs and tooling: README, listing, design docs, issue template, canary check, change note.
9. `mise run check`, commit, the PR.

## Done when

`mise run check` passes, the hover card shows the note and the release date on lists and the latest update post on the app page, and no request, host or permission is new.

## Risks

- Valve's embedded script moves or renames `last_update_event`: the line disappears and the canary shows it.
- The note shows raw BBCode tags: tracked in ADR 0018.
