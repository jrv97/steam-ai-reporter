import type { PageDetails } from "../detect/page-details";
import type { BareMessageKey } from "../i18n/t";
import { eulaLink } from "../kinds/eula";
import type { KernelDisclosed } from "../kinds/kernel";
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

/** A line for the first of the candidates that has text, or none. */
function firstText(...candidates: readonly (string | undefined)[]): readonly KindDetail[] {
  const first = candidates.find(present);
  return first === undefined ? [] : [text(first)];
}

/** The page's own boot protection line, else Steam's note when the game declared the need. */
function bootProtection(verdict: KernelDisclosed, page: PageDetails): readonly KindDetail[] {
  if (present(page.bootProtection)) {
    return [text(page.bootProtection)];
  }
  return verdict.bootProtection === undefined ? [] : [message("kind_kernel_boot")];
}

const NO_PAGE_DETAILS: PageDetails = {};

/**
 * What a surface says about a disclosed verdict under the kind's heading: the developer's own
 * text, the names Steam lists, and Steam's notes. `page` holds what only the game's own page
 * knows (the custom anti-cheat name, the boot protection line, the DRM activation limit); the
 * hover card has none. This is the one place that knows each kind's details, so a new kind adds a
 * case here and nothing else in the card or the banner.
 */
export function kindDetails(
  verdict: AnyDisclosed,
  page: PageDetails = NO_PAGE_DETAILS,
): readonly KindDetail[] {
  switch (verdict.kind) {
    case "ai":
      return [
        quote(verdict.notes),
        ...(present(verdict.service) ? [labeled("badge_card_service_label", verdict.service)] : []),
      ];
    case "kernel":
      return [
        ...firstText(verdict.name, page.anticheatName),
        ...(verdict.uninstallsCompletely ? [] : [message("kind_kernel_uninstall")]),
        ...bootProtection(verdict, page),
      ];
    case "anticheat":
      return firstText(verdict.name, page.anticheatName);
    case "drm":
      return [text(verdict.text), ...firstText(page.activationLimit, verdict.activationLimit)];
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
