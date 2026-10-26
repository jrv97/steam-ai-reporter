import * as v from "valibot";
import { GAME_TYPE, MALFORMED } from "../detect/getitems.schema";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import { categoryIds } from "./categories";
import type { FacetDefinition, KindDefinition } from "./kind";
import { OFF_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

/** Steam's feature category ID for Family Sharing, which Valve computes, not the developer. */
export const FAMILY_CATEGORY_ID = 62;

/** The values a person can tag: listed, and left out of a paid game's list (ADR 0016). */
export const FAMILY_FACETS = ["supported", "unsupported"] as const;

export type FamilyFacet = (typeof FAMILY_FACETS)[number];

const STORED = storedDisclosed("family", { facet: v.picklist(FAMILY_FACETS) });

/** The disclosed verdict of the Family Sharing kind, with the value it reports. */
export type FamilyDisclosed = v.InferOutput<typeof STORED>;

const SUPPORTED: FamilyDisclosed = {
  state: "disclosed",
  kind: "family",
  source: "api",
  facet: "supported",
};
const UNSUPPORTED: FamilyDisclosed = { ...SUPPORTED, facet: "unsupported" };

/**
 * Steam's words name the kind by themselves. The listed value's chip is Steam's word, and the
 * derived value's chip is our own wording, as the maintainer chose (ADR 0016, amended).
 */
const FACETS: readonly FacetDefinition<FamilyFacet>[] = [
  { id: "supported", word: "kind_family_heading", chip: "kind_family_heading" },
  { id: "unsupported", word: "kind_family_unsupported", chip: "kind_family_unsupported_chip" },
];

/**
 * Family Sharing, from the feature categories Valve computes: listed with 62, not available for a
 * paid game (`type` 0, no `is_free`) whose list lacks it, nothing for free games and other items
 * (ADR 0016). Steam's JSON leaves an empty list out, which makes an empty list unknown too.
 */
export const FAMILY_KIND: KindDefinition<FamilyDisclosed> = {
  id: "family",
  source: "valve",
  facets: FACETS,

  fromGetItems(item) {
    const ids = categoryIds(item, "feature_categoryids");
    if ("state" in ids) {
      return ids;
    }
    if (ids.length === 0) {
      return UNKNOWN.missing;
    }
    if (ids.includes(FAMILY_CATEGORY_ID)) {
      return SUPPORTED;
    }
    if (item.type !== GAME_TYPE) {
      return NOT_DISCLOSED.api;
    }
    if (item.is_free === MALFORMED) {
      return UNKNOWN.malformed;
    }
    return item.is_free === true ? NOT_DISCLOSED.api : UNSUPPORTED;
  },

  stored: STORED,

  messages: {
    heading: "kind_family_heading",
    chip: "kind_family_heading",
    source: "kind_family_source",
  },
  // Most paid games are listed, so the tag starts off, warning of the unlisted ones when turned on.
  defaults: { ...OFF_KIND_SETTINGS, banner: false, facets: ["unsupported"] },
  ttl: WEEK_TTL,
};
