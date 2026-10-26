import * as v from "valibot";
import { type CompatField, MALFORMED } from "../detect/getitems.schema";
import { NOT_DISCLOSED, UNKNOWN } from "../types";
import type { FacetDefinition, KindDefinition, KindMessages } from "./kind";
import { OFF_KIND_SETTINGS } from "./kind-settings";
import { WEEK_TTL } from "./kind-ttl";
import { storedDisclosed } from "./stored-disclosed";

/** The ratings a person can tag, in Steam's order. Valve's 0, Unknown, is never one of them. */
export const COMPAT_FACETS = ["verified", "playable", "unsupported"] as const;

export type CompatFacet = (typeof COMPAT_FACETS)[number];

/** Valve's rating values (1 Unsupported, 2 Playable, 3 Verified) by facet. */
const VALUES: Readonly<Record<CompatFacet, number>> = { verified: 3, playable: 2, unsupported: 1 };

/** Steam's word for each rating, shared by every device. */
const FACETS: readonly FacetDefinition<CompatFacet>[] = [
  { id: "verified", word: "kind_compat_verified" },
  { id: "playable", word: "kind_compat_playable" },
  { id: "unsupported", word: "kind_compat_unsupported" },
];

function storedCompat<const Id extends string>(id: Id) {
  return storedDisclosed(id, { facet: v.picklist(COMPAT_FACETS) });
}

/** The disclosed verdict of a compatibility kind: Valve's rating, as a facet. */
export type CompatDisclosed<Id extends string> = v.InferOutput<
  ReturnType<typeof storedCompat<Id>>
>;

/**
 * A device's compatibility as Valve rates it, from `platforms.<field>` (`include_platforms`).
 * Unknown when the section has no such field or a value outside 0 to 3; 0 (Valve's Unknown) is
 * not disclosed, which draws nothing and is never shown as Unsupported. Valve states it, not the
 * developer, and it starts off with only Unsupported chosen and no banner entry.
 */
export function compatKind<const Id extends string>(
  id: Id,
  field: CompatField,
  messages: KindMessages,
): KindDefinition<CompatDisclosed<Id>> {
  const disclosed = new Map(
    COMPAT_FACETS.map((facet): [number, CompatDisclosed<Id>] => [
      VALUES[facet],
      { state: "disclosed", kind: id, source: "api", facet },
    ]),
  );
  return {
    id,
    source: "valve",
    sections: ["platforms"],
    facets: FACETS,

    fromGetItems(item) {
      const { platforms } = item;
      const value = platforms === MALFORMED ? MALFORMED : platforms?.[field];
      if (value === MALFORMED) {
        return UNKNOWN.malformed;
      }
      if (value === undefined) {
        return UNKNOWN.missing;
      }
      return disclosed.get(value) ?? NOT_DISCLOSED.api;
    },

    stored: storedCompat(id),

    messages,
    defaults: { ...OFF_KIND_SETTINGS, banner: false, facets: ["unsupported"] },
    // Valve rates a game rarely, so an entry without a rating keeps as long as any other kind.
    ttl: WEEK_TTL,
  };
}
