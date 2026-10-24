import type * as v from "valibot";
import type { ExtraDetails, StoreItem } from "../detect/getitems.schema";
import type { SteamLanguage } from "../i18n/locale";
import type { BareMessageKey } from "../i18n/t";
import type { DisclosedBase, Verdict } from "../types";
import type { KindSettings } from "./kind-settings";
import type { KINDS } from "./registry";

/** The catalog keys of the words a kind uses on every surface, in Steam's vocabulary. */
export interface KindMessages {
  /**
   * Steam's own line for the kind: the hover card title, the banner heading and, after the chip
   * text, the chip's accessible name.
   */
  readonly heading: BareMessageKey;
  /** The short text of the kind's chip. */
  readonly chip: BareMessageKey;
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
   * The kind's verdict for a GetItems item and its `extra_details`: disclosed or not disclosed, or
   * unknown when a field it reads is malformed. The language is the one the request asked for.
   */
  readonly fromGetItems: (
    item: StoreItem,
    details: ExtraDetails,
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
