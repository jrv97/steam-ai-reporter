import * as v from "valibot";
import type { BareMessageKey } from "../i18n/t";
import { NOT_DISCLOSED } from "../types";
import { categoryIds } from "./categories";
import type { KindDefinition } from "./kind";
import { OFF_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

/**
 * Steam's player category IDs for player-versus-player modes, with the catalog key of the name
 * Steam gives each: 49 PvP, 36 Online PvP, 47 LAN PvP, 37 Shared/Split Screen PvP.
 */
const CATEGORY_MESSAGES: ReadonlyMap<number, BareMessageKey> = new Map([
  [49, "kind_pvp_category_pvp"],
  [36, "kind_pvp_category_online"],
  [47, "kind_pvp_category_lan"],
  [37, "kind_pvp_category_split"],
]);

export const PVP_CATEGORY_IDS: readonly number[] = [...CATEGORY_MESSAGES.keys()];

/** The catalog key of a PvP category's name, or undefined for any other category ID. */
export function pvpCategoryMessage(id: number): BareMessageKey | undefined {
  return CATEGORY_MESSAGES.get(id);
}

const STORED = storedDisclosed("pvp", {
  /** The player categories of the game that mean PvP. */
  categoryIds: v.pipe(v.array(v.pipe(v.number(), v.integer())), v.minLength(1), v.readonly()),
});

/** The disclosed verdict of the PvP kind. */
export type PvpDisclosed = v.InferOutput<typeof STORED>;

/**
 * The game has a player-versus-player mode, from its Steam categories. Unlike the other kinds this
 * is not a developer's declaration in `extra_details`; an item without categories says nothing.
 */
export const PVP_KIND: KindDefinition<PvpDisclosed> = {
  id: "pvp",

  fromGetItems(item) {
    const ids = categoryIds(item, "supported_player_categoryids");
    if ("state" in ids) {
      return ids;
    }
    const matching: number[] = [];
    for (const id of ids) {
      if (PVP_CATEGORY_IDS.includes(id)) {
        matching.push(id);
      }
    }
    return matching.length === 0
      ? NOT_DISCLOSED.api
      : { state: "disclosed", kind: "pvp", source: "api", categoryIds: matching };
  },

  stored: STORED,

  messages: { heading: "kind_pvp_heading", chip: "kind_pvp_chip" },
  // A PvP mode is on most games, so the tag starts off until the player turns it on.
  defaults: OFF_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
