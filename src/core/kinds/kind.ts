import type * as v from "valibot";
import type { ExtraDetails } from "../detect/getitems.schema";
import type { SteamLanguage } from "../i18n/locale";
import type { BareMessageKey } from "../i18n/t";
import type { DisclosedBase, Verdict } from "../types";
import type { KindSettings } from "./kind-settings";
import type { KINDS } from "./registry";

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
 * One tag kind: what the extension reports about a game, with `Disclosed` as the shape of its
 * disclosed verdict. Adding a kind is writing a definition and listing it in `registry.ts`; the
 * scanner, the detector chain and the cache stay as they are.
 */
export interface KindDefinition<Disclosed extends DisclosedBase> {
  /** Stable; stored in the settings and in the ignore list. */
  readonly id: Disclosed["kind"];
  /**
   * The kind's verdict for a GetItems item with `extra_details`: disclosed or not disclosed, or
   * unknown when a field it reads is malformed. The name is the store name when Steam sent one; the
   * language is the one the request asked for.
   */
  readonly fromGetItems: (
    details: ExtraDetails,
    name: string | undefined,
    language: SteamLanguage,
  ) => Verdict<Disclosed>;
  /**
   * The kind's verdict from an English app page that passed the store checks, given the app's name.
   * Only kinds that can be read from the page declare it; the others stay unknown on that path.
   */
  readonly fromAppPage?: (doc: Document, name: string) => Verdict<Disclosed>;
  /** Reads a stored disclosed verdict back; anything that does not fit is dropped. */
  readonly stored: v.GenericSchema<unknown, Disclosed>;
  readonly messages: KindMessages;
  readonly defaults: KindSettings;
}

/** Every registered kind. */
export type TagKind = (typeof KINDS)[number];
