import type { ExtraDetails } from "../detect/getitems.schema";
import type { SteamLanguage } from "../i18n/locale";
import type { BareMessageKey } from "../i18n/t";
import type { Verdict } from "../types";
import type { KindId } from "./id";
import type { KindSettings } from "./kind-settings";

/** The catalog keys whose text names the kind. Generic copy stays shared between kinds. */
export interface KindMessages {
  /** The badge text, the hover card title and the banner heading. */
  readonly label: BareMessageKey;
  /** In the hover card, precedes the product the developer named. */
  readonly cardService: BareMessageKey;
  /** In the banner, precedes the product the developer named. */
  readonly bannerService: BareMessageKey;
  /** Screen reader name of the banner's one-line note. */
  readonly bannerRegion: BareMessageKey;
  /** Label of the badges switch in the settings page and in the popup. */
  readonly badgesSwitch: BareMessageKey;
  readonly badgesSwitchShort: BareMessageKey;
  /** Label of the list filter choice. */
  readonly filterLabel: BareMessageKey;
}

/**
 * One tag kind: what the extension reports about a game. Adding a kind is adding an id, a
 * definition and a registry entry; the scanner, the detector chain and the cache stay as they are.
 */
export interface TagKind {
  readonly id: KindId;
  /**
   * The kind's verdict for a GetItems item with `extra_details`: disclosed or not disclosed. The
   * name is the store name when Steam sent one; the language is the one the request asked for.
   */
  readonly fromGetItems: (
    details: ExtraDetails,
    name: string | undefined,
    language: SteamLanguage,
  ) => Verdict;
  readonly messages: KindMessages;
  readonly defaults: KindSettings;
}
