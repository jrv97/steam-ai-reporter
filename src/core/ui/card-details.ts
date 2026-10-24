import type { BareMessageKey } from "../i18n/t";
import { pvpCategoryMessage } from "../kinds/pvp";
import type { AnyDisclosed } from "../kinds/verdicts";

/** One line of a kind's entry in the hover card, below its heading. */
export type CardDetail =
  /** Catalog copy: Steam's own words. */
  | { readonly kind: "message"; readonly key: BareMessageKey; }
  /** The developer's short text, set verbatim. */
  | { readonly kind: "text"; readonly text: string; }
  /** The developer's long text, set verbatim and clamped. */
  | { readonly kind: "quote"; readonly text: string; }
  /** A catalog label followed by the developer's text. */
  | { readonly kind: "labeled"; readonly key: BareMessageKey; readonly text: string; };

const message = (key: BareMessageKey): CardDetail => ({ kind: "message", key });
const text = (value: string): CardDetail => ({ kind: "text", text: value });
const quote = (value: string): CardDetail => ({ kind: "quote", text: value });
const labeled = (key: BareMessageKey, value: string): CardDetail => ({
  kind: "labeled",
  key,
  text: value,
});

function present(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/**
 * What the hover card says about a disclosed verdict under the kind's heading: the developer's
 * own text, the names Steam lists, and Steam's notes. This is the one place that knows each kind's
 * details, so a new kind adds a case here and nothing else in the card.
 */
export function cardDetails(verdict: AnyDisclosed): readonly CardDetail[] {
  switch (verdict.kind) {
    case "ai":
      return [
        quote(verdict.notes),
        ...(present(verdict.service) ? [labeled("badge_card_service_label", verdict.service)] : []),
      ];
    case "kernel":
      return [
        ...(present(verdict.name) ? [text(verdict.name)] : []),
        ...(verdict.uninstallsCompletely ? [] : [message("kind_kernel_uninstall")]),
        ...(verdict.bootProtection === undefined ? [] : [message("kind_kernel_boot")]),
      ];
    case "anticheat":
      return present(verdict.name) ? [text(verdict.name)] : [];
    case "drm":
      return [text(verdict.text)];
    case "account":
      return [text(verdict.text), ...(verdict.linksToSteam ? [message("kind_account_links")] : [])];
    case "eula":
      return verdict.items.map((item) => text(item.name));
    case "pvp":
      return verdict.categoryIds.flatMap((id) => {
        const key = pvpCategoryMessage(id);
        return key === undefined ? [] : [message(key)];
      });
  }
}
