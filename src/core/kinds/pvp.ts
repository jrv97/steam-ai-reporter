import * as v from "valibot";
import { MALFORMED } from "../detect/getitems.schema";
import { type DisclosedBase, NOT_DISCLOSED, UNKNOWN } from "../types";
import { BORROWED_MESSAGES } from "./borrowed-messages";
import type { KindDefinition } from "./kind";
import { DEFAULT_KIND_SETTINGS } from "./kind-settings";
import { storedDisclosed } from "./stored-disclosed";

/**
 * Steam's player category IDs for player-versus-player modes, with the English names Steam gives
 * them: 49 PvP, 36 Online PvP, 47 LAN PvP, 37 Shared/Split Screen PvP.
 */
export const PVP_CATEGORY_IDS: readonly number[] = [49, 36, 47, 37];

/** The disclosed verdict of the PvP kind: the player categories of the game that mean PvP. */
export interface PvpDisclosed extends DisclosedBase<"pvp"> {
  readonly categoryIds: readonly number[];
}

/**
 * The game has a player-versus-player mode, from its Steam categories. Unlike the other kinds this
 * is not a developer's declaration in `extra_details`; an item without categories says nothing.
 */
export const PVP_KIND: KindDefinition<PvpDisclosed> = {
  id: "pvp",

  fromGetItems(item) {
    const { categories } = item;
    if (categories === MALFORMED) {
      return UNKNOWN.error;
    }
    const ids = categories?.supported_player_categoryids;
    if (ids === undefined) {
      return UNKNOWN.missing;
    }
    const categoryIds: number[] = [];
    for (const id of ids) {
      if (PVP_CATEGORY_IDS.includes(id)) {
        categoryIds.push(id);
      }
    }
    return categoryIds.length === 0
      ? NOT_DISCLOSED.api
      : { state: "disclosed", kind: "pvp", source: "api", categoryIds };
  },

  stored: storedDisclosed("pvp", {
    categoryIds: v.pipe(v.array(v.pipe(v.number(), v.integer())), v.minLength(1)),
  }),

  messages: BORROWED_MESSAGES,
  defaults: DEFAULT_KIND_SETTINGS,
};
