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

## Test feedback on the tabs and order build (zip of 7e17ad8), 2026-10-26, NOT yet fixed
Maintainer testing in Firefox Nightly. Everything else tested worked.
1. Tabs keyboard: arrow keys up and down work; Enter "does not enter"; Space toggles something. After clicking blank space outside the settings main region, arrow keys stop working although the tab stays highlighted (keydown handler lives on the form root; focus falls to body). Open: expected Enter to move focus into the panel and Space to do nothing on a tab, or manual activation (maintainer did not answer).
2. Tab names: use the long proper names (3rd-party Account, AI Generated Content Disclosure, Steam Deck Compatibility, 3rd-party EULA, In-App Purchases, Kernel-Level Anti-Cheat, ...), not the chip words. Recommended: a per-tag name, editable, separate from the chip text (maintainer earlier asked for user defined names for tags and chips).
3. The "small image" pill in the Tag order card is not understood: replace with a clearer cue (for example a divider with "Small images show only the tags above this line") or remove.
4. Layout stability, hard rule where applicable: turning a tag off must NOT change the page layout: dim and disable the region instead of hiding controls; likewise loading states should show placeholder bubbles (skeletons) where content appears later instead of layout jumps. Audit settings, ignore lists, the hidden-results bar, package summary, tag section, banner.
5. Family Sharing values in Settings should read "Available" and "Not Available".
6. Settings page: keep the header fixed and scroll only the right panel.
7. Popup: clicking the gear should close the small popup (like clicking a tag does).
8. All Settings page: add a "Go back to Steam" button that returns to the page you came from. Options: link to the store home (no permission); remember the last store page URL in local storage (privacy decision needed); activeTab permission (needs an ADR). Maintainer did not choose.
9. Color picker and tag editing (color and text): built in slice 3 (feat/chip-text), not in the tested zip.
10. Reordering does not reorder the popup rows or the tabs (intentional: tabs and popup are alphabetical; maintainer asks whether that is intended; open: one order everywhere with default registry order, or keep alphabetical tabs).
11. Banner button "Ignore for this tag" is confusing: rename to "Ignore tag for this game" (and the matching note text).
12. Only the AI Generated Content Disclosure entry shows a detail text; the other kinds show only their heading. Idea: show the declared details verbatim (anti-cheat name, DRM type, third-party account name, EULA name and link) in the banner and the hover card.
13. Spanish copy of the Tag order card: use "arrastrar y soltar" for drag and drop.
14. Slice 3 report open points: Spanish rating chip name has two colons ("Deck: No compatible: Compatibilidad con Steam Deck"), content.js has only 106 B of room left under its limit, the order card follows custom chip text.
