import type * as v from "valibot";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import { categoryIds } from "./categories";
import type { KindDefinition } from "./kind";
import { OFF_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

/** Steam's feature category ID for In-App Purchases, which the developer sets in Steamworks. */
export const IAP_CATEGORY_ID = 35;

const STORED = storedDisclosed("iap", {});

/** The disclosed verdict of the In-App Purchases kind. */
export type IapDisclosed = v.InferOutput<typeof STORED>;

const DISCLOSED: IapDisclosed = { state: "disclosed", kind: "iap", source: "api" };

/**
 * The game sells items inside it, from its Steam feature categories. An empty list says no more
 * than an absent one, since Steam's JSON leaves an empty list out, so both are unknown.
 */
export const IAP_KIND: KindDefinition<IapDisclosed> = {
  id: "iap",

  fromGetItems(item) {
    const ids = categoryIds(item, "feature_categoryids");
    if ("state" in ids) {
      return ids;
    }
    if (ids.length === 0) {
      return UNKNOWN.missing;
    }
    return ids.includes(IAP_CATEGORY_ID) ? DISCLOSED : NOT_DISCLOSED.api;
  },

  stored: STORED,

  messages: { heading: "kind_iap_heading", chip: "kind_iap_chip" },
  // Most free games and many paid ones sell items, so the tag starts off, as PvP does.
  defaults: OFF_KIND_SETTINGS,
  ttl: WEEK_TTL,
};
