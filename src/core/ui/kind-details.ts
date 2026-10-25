import type { BareMessageKey } from "../i18n/t";
import { eulaLink } from "../kinds/eula";
import { pvpCategoryMessage } from "../kinds/pvp";
import type { AnyDisclosed } from "../kinds/verdicts";

/** One line of a kind's entry in the hover card or the banner, below its heading. */
export type KindDetail =
  /** Catalog copy: Steam's own words. */
  | { readonly kind: "message"; readonly key: BareMessageKey; }
  /** The developer's short text, set verbatim. */
  | { readonly kind: "text"; readonly text: string; }
  /** The developer's short text with a link on the store; only the banner draws the link. */
  | { readonly kind: "link"; readonly text: string; readonly url: string; }
  /** The developer's long text, set verbatim and clamped. */
  | { readonly kind: "quote"; readonly text: string; }
  /** A catalog label followed by the developer's text. */
  | { readonly kind: "labeled"; readonly key: BareMessageKey; readonly text: string; };

const message = (key: BareMessageKey): KindDetail => ({ kind: "message", key });
const text = (value: string): KindDetail => ({ kind: "text", text: value });
const link = (value: string, url: string): KindDetail => ({ kind: "link", text: value, url });
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
      return verdict.items.map((item) => {
        const url = item.url === undefined ? undefined : eulaLink(item.url);
        return url === undefined ? text(item.name) : link(item.name, url);
      });
    case "pvp":
      return verdict.categoryIds.flatMap((id) => {
        const key = pvpCategoryMessage(id);
        return key === undefined ? [] : [message(key)];
      });
  }
}
