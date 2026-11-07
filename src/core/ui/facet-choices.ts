import type { BareMessageKey } from "../i18n/t";
import type { KindId } from "../kinds/id";
import type { FacetDefinition, FacetId } from "../kinds/kind";

/**
 * Words the settings page puts on a kind's choices when Steam's word for the value names the kind
 * and would repeat the group's section ("Family Sharing not Available"). Chips, cards and
 * accessible names keep Steam's word; only the choice list reads these.
 */
const CHOICE_WORDS: Partial<Record<KindId, Partial<Record<FacetId, BareMessageKey>>>> = {
  family: { supported: "options_facet_available", unsupported: "options_facet_unavailable" },
};

/** The catalog key of the label of a facet's checkbox in the kind's settings. */
export function facetChoiceKey(kind: KindId, facet: FacetDefinition<FacetId>): BareMessageKey {
  return CHOICE_WORDS[kind]?.[facet.id] ?? facet.word;
}
