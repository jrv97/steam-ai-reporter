import { compatKind } from "./compat";

/** Steam Deck Compatibility, as Valve rates it. */
export const DECK_KIND = compatKind("deck", "steam_deck_compat_category", {
  heading: "kind_deck_heading",
  chip: "kind_deck_chip",
});
