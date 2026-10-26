# Backlog (maintainer decisions, 2026-10-26). Scratchpad draft, not for the repo.

## Settings layout (tabs)
- Gear icon top right, always visible, opens All Settings. Tabs, one per tag type, each holding that tag's settings AND that tag's ignored games, developers and publishers (feedback: move ignored lists into each per-tag tab).
- General tab: language, colors help, the "All tags" scope ignores, Backup. Optionally a note on each tag tab: "N all-tags entries also apply" linking to General.
- Open: userscript dialog (narrow tabs?), popup (keep master switch list + gear), Ignored lists per role inside each tag tab.

## Banner ignore split button (modeled on Steam's native Ignore button + dropdown)
- Per tag entry: main button "Ignore for this game" (default; current button already is per game per tag, its label "Ignore for this tag" is ambiguous, relabel).
- Dropdown (checkbox-style entries with muted descriptions like Steam's): ignore this tag for this developer (one entry per developer), for this publisher (one entry per publisher), and "Ignore everywhere" = flips the tag's enable switch (kinds.<id>.enabled = false), maintainer chose the switch.
- Many studios (Assassin's Creed: 13 developers): separate entries per developer and per publisher. The combination entry is DROPPED (maintainer: not worth the trouble).
- Replaces the collapsed "Ignore a developer or publisher" section. Bottom "Ignore this game" stays (all tags), may get its own arrow. Undo notes stay for every scope. Accessible split-button/menu pattern.
- Quick win candidate: relabel "Ignore for this tag" to "Ignore for this game" (copy only).

## New tag kinds (plan at plan-new-kinds.md): IAP (60), Deck and Machine (61-63), Family Sharing (64). Reverse tagging via facets.
## Other: store listing refresh (promo tile 440x280, screenshots 1280x800, marquee), dim-reason hover line, sidebar filter block, '/' search shortcut setting, user-customizable chip text per size tier, release naming (last), bundle page support (needs DOM capture), per-locale bundle key check (optional).

## Tag customization (added 2026-10-26)
- Chip text customization per size tier (text, large) and, with it, REORDERING of tags: the order of chips on a game image, in the tag section, in the hover card, the banner entries, the package summary and the settings list (today: registry order, with the +N chip collapsing the tail on narrow images). Needs: a stored order (kinds order list in settings, additive, backup round trip), a drag or move up/down control in settings (keyboard accessible, no drag-only), a rule for new kinds appearing after an update (append at the end), and the interplay with the overlay chip limit (OVERLAY_CHIPS = 2: the first two in the chosen order show).
- Also: Steam Frame and SteamOS kinds (same platforms parser), per-facet colors, "Dim" count in the search bar, sample Steam's real link hover color on the search bar.
