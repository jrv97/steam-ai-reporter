---
title: "Store screenshots: five images for AMO and the Chrome Web Store, captured by a mise task"
status: active
issue: none
updated: 2026-11-09
---

# Store screenshots

## Objective

Replace the 2026-10-22 screenshots, which show the old single "AI use reported" badge, with five images that both stores take and that cover what ships: chips per tag on lists, the hover card, Dim and Hide with their notice, the app page banner and tag row, compact badges on capsules, the toolbar popup, the settings tabs, tag order, chip text and Go back to Steam. A mise task retakes them headless, and a runbook says when and how. The tooling choice is [ADR 0022](../adr/0022-store-screenshots-with-the-e2e-harness.mdx). The store rules are in `docs/research/store-screenshots/rq1-store-image-rules.md`.

## Store rules

- Chrome Web Store: one to five screenshots, 1280x800 or 640x400, full bleed with square corners. Screenshots can differ per locale.
- AMO: PNG or JPEG up to 4 MiB, 1280x800 recommended, one set for every locale, captions of up to 280 characters per locale.
- Both: five PNG files at 1280x800, 24-bit RGB with no alpha, under 4 MiB each. English images, with English and Spanish captions on AMO.
- Open risk: AMO's `content-optimization` switch, when on, asks for 4:3 and at least 1000x750. A signed-in look at the devhub media form settles it. If the switch is on, the task also writes a 1280x960 set from the same scenes.

## Shot list

All dark (the settings and in-page UI have no light theme), English, Chromium, signed in to Steam, framed below Steam's global header so the account name and wallet stay out of the frame.

1. `01-search.png`: search for "Electronic Arts". Chips on each row with a +N chip, one tag on Dim, one on Hide with the "titles have been hidden by Tag Kit" notice, and the hover card open on the row with the most chips.
2. `02-app.png`: THE FINALS (2073850). The tag row under Steam's user tags and the banner with the developer's note, the per-tag Ignore buttons and Ignore this game.
3. `03-home.png`: the store home with compact badges on the main carousel and the Discovery Queue, and the toolbar popup drawn over the top right.
4. `04-settings.png`: settings, General tab, scrolled to Tag order with the small-image divider; the header keeps Go back to Steam and the tab rail.
5. `05-tag.png`: settings, Steam Deck tab: values to tag, the badge and banner switches, chip text, short chip text and the preview.

README extra: `wishlist.png`, chips on the signed-in wishlist.

## Settings

`docs/store/sample-config.json` is a backup made with the settings page's Download backup: the enabled tags, their colors, the tag order, chip text and the ignore lists. The capture restores it through Restore from a backup before the first shot. Each shot may add a settings patch in code, such as the filter modes of the search shot, and sets the extension's language to the capture locale.

## Steps

1. Research note on the store rules, this plan and ADR 0022.
2. `launch()` in `tests/e2e/browser.ts` takes options: headed, locale and a Chromium profile folder. A `web(url)` opens store pages.
3. `tests/screenshots/`: helpers and one test per shot, each checking that what it shows is on the page before it saves. `vitest.screenshots.config.ts` runs them.
4. `scripts/screenshots.py`: copies the Chromium profile to a temporary folder (Chromium must be closed), runs the capture, deletes the copy. `scripts/check_screenshots.py` checks the set; `mise run check` runs it too.
5. `mise run screenshots`, local only.
6. One-time prep, outside the repo: uBlock Origin and uBO Lite in both dev profiles, Steam sign-in in the Chromium profile, the settings above, then Download backup to `docs/store/sample-config.json`.
7. Capture, review the five images, blur anything personal by hand if a shot shows it.
8. Runbook `docs/store/screenshots.mdx`; `docs/store/listing.mdx` and the README point to the new images.
9. `mise run check`, the PR.

## Out of scope

A Spanish image set (the task takes `SAR_SCREENSHOT_LOCALE=es` for later), Firefox captures, the promo tile and marquee, the userscript dialog.
