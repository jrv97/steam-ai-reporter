import { NOT_DISCLOSED } from "../types";
import type { KindId } from "./id";
import type { FacetDefinition, FacetId } from "./kind";
import type { KindSettings } from "./kind-settings";
import { KIND_BY_ID, KINDS } from "./registry";
import { type AnyDisclosed, isKindVerdicts, type KindVerdict, type KindVerdicts } from "./verdicts";

/** The facet a disclosed verdict reports, with Steam's word; none for a kind with one value. */
export function facetOf(verdict: AnyDisclosed): FacetDefinition<FacetId> | undefined {
  if (!("facet" in verdict)) {
    return undefined;
  }
  const facets: readonly FacetDefinition<FacetId>[] = KIND_BY_ID[verdict.kind].facets ?? [];
  return facets.find((facet) => facet.id === verdict.facet);
}

/** Whether a kind's verdict draws: disclosed, with a facet the settings choose when it has one. */
function isChosen(verdict: KindVerdict, settings: KindSettings): boolean {
  return verdict.state !== "disclosed" || !("facet" in verdict)
    || (settings.facets ?? []).includes(verdict.facet);
}

/**
 * The verdicts as the surfaces draw them: a disclosed facet the person did not choose reads as not
 * disclosed, as an untagged value draws nothing. The same object when nothing changes, so a kind
 * without facets costs no allocation. Nothing of it is stored.
 */
export function taggedView(
  verdicts: KindVerdicts,
  kinds: Readonly<Record<KindId, KindSettings>>,
): KindVerdicts {
  let chosen = true;
  for (const kind of KINDS) {
    chosen &&= isChosen(verdicts[kind.id], kinds[kind.id]);
  }
  if (chosen) {
    return verdicts;
  }
  const view: Partial<Record<KindId, KindVerdict>> = {};
  for (const kind of KINDS) {
    const verdict = verdicts[kind.id];
    view[kind.id] = isChosen(verdict, kinds[kind.id]) || verdict.state !== "disclosed"
      ? verdict
      : NOT_DISCLOSED[verdict.source];
  }
  return isKindVerdicts(view) ? { ...verdicts, ...view } : verdicts;
}
