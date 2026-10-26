import type { BareMessageKey } from "../i18n/t";
import { facetOf } from "../kinds/facets";
import type { FacetDefinition, FacetId } from "../kinds/kind";
import { pvpCategoryMessage } from "../kinds/pvp";
import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";

/** One line of a kind's entry in the hover card or the banner, below its heading. */
export type KindDetail =
  /** Catalog copy: Steam's own words. */
  | { readonly kind: "message"; readonly key: BareMessageKey; }
  /** The developer's short text, set verbatim. */
  | { readonly kind: "text"; readonly text: string; }
  /** The developer's long text, set verbatim and clamped. */
  | { readonly kind: "quote"; readonly text: string; }
  /** A catalog label followed by the developer's text. */
  | { readonly kind: "labeled"; readonly key: BareMessageKey; readonly text: string; };

const message = (key: BareMessageKey): KindDetail => ({ kind: "message", key });
const text = (value: string): KindDetail => ({ kind: "text", text: value });
const quote = (value: string): KindDetail => ({ kind: "quote", text: value });
const labeled = (key: BareMessageKey, value: string): KindDetail => ({
  kind: "labeled",
  key,
  text: value,
});

function present(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** A line for the name when there is one. */
function named(name: string | undefined): readonly KindDetail[] {
  return present(name) ? [text(name)] : [];
}

/** The lines a surface shows under a disclosed kind's heading. A new kind adds a case here. */
export function kindDetails(verdict: AnyDisclosed): readonly KindDetail[] {
  switch (verdict.kind) {
    case "ai":
      return [
        quote(verdict.notes),
        ...(present(verdict.service) ? [labeled("badge_card_service_label", verdict.service)] : []),
      ];
    case "kernel":
      return [
        ...named(verdict.name),
        ...(verdict.uninstallsCompletely ? [] : [message("kind_kernel_uninstall")]),
        ...(verdict.bootProtection === undefined ? [] : [message("kind_kernel_boot")]),
      ];
    case "anticheat":
      return named(verdict.name);
    case "drm":
      return [text(verdict.text), ...named(verdict.activationLimit)];
    case "account":
      return [text(verdict.text), ...(verdict.linksToSteam ? [message("kind_account_links")] : [])];
    case "eula":
      return verdict.items.map((item) => text(item.name));
    case "pvp":
      return verdict.categoryIds.flatMap((id) => {
        const key = pvpCategoryMessage(id);
        return key === undefined ? [] : [message(key)];
      });
    case "iap":
      // The heading is Steam's category name, and the category says nothing more.
      return [];
    case "deck":
    case "machine":
      return facetLines(verdict);
    case "family":
      // A derived value says what Steam's list shows, and nothing about the game (ADR 0016).
      return verdict.facet === "unsupported"
        ? [...facetLines(verdict), message("kind_family_unlisted")]
        : facetLines(verdict);
  }
}

/** Steam's word for the value a verdict reports, as its one line. */
function facetLines(verdict: AnyDisclosed): readonly KindDetail[] {
  const facet = facetOf(verdict);
  return facet === undefined ? [] : [message(facet.word)];
}

/** Whether Valve, not the developer, states the fact a verdict reports. */
export function fromValve(verdict: AnyDisclosed): boolean {
  return KIND_BY_ID[verdict.kind].source === "valve";
}

/** The line under the heading of a full game's verdict shown for its demo, by who states it. */
export function fullGameLine(verdict: AnyDisclosed): BareMessageKey {
  return fromValve(verdict) ? "kind_full_game_valve" : "kind_full_game";
}

/**
 * What names a kind's value, given the kind's heading: the value's word after it, or the word
 * alone when it names the kind by itself (a value with a chip of its own).
 */
export function facetName(
  i18n: MessageCatalog,
  heading: string,
  facet: FacetDefinition<FacetId>,
): string {
  const value = i18n.t(facet.word);
  return facet.chip === undefined ? i18n.t("kind_facet_name", { heading, value }) : value;
}

/**
 * What names a disclosed kind's entry where no line follows its heading (the banner, the package
 * summary): Steam's heading, or for a kind with facets the value's name.
 */
export function entryName(i18n: MessageCatalog, verdict: AnyDisclosed): string {
  const heading = i18n.t(KIND_BY_ID[verdict.kind].messages.heading);
  const facet = facetOf(verdict);
  return facet === undefined ? heading : facetName(i18n, heading, facet);
}
