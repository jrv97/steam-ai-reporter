import type * as v from "valibot";
import type { ExtraDetails, StoreItem } from "../detect/getitems.schema";
import type { SteamLanguage } from "../i18n/locale";
import type { BareMessageKey } from "../i18n/t";
import type { DisclosedBase, Verdict } from "../types";
import type { KindSettings } from "./kind-settings";
import type { KindTtl } from "./kind-ttl";
import type { KINDS } from "./registry";
import type { Section } from "./sections";

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
 * One tag kind: what the extension reports about a game. `Disclosed` is the shape of its disclosed
 * verdict. A new kind is a definition listed in `registry.ts`; the scanner, the chain and the
 * cache stay as they are.
 */
export interface KindDefinition<Disclosed extends DisclosedBase> {
  /** Stable; stored in the settings and in the ignore list. */
  readonly id: Disclosed["kind"];
  /**
   * The kind's verdict for a GetItems item and its `extra_details`. It is unknown malformed when a
   * field it reads has the wrong shape. The language is the one the request asked for.
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
  /**
   * The GetItems sections the kind reads besides `extra_details` and `categories`. A request that
   * leaves one out makes the kind unknown `unrequested`, and an enabled kind adds them to it.
   */
  readonly sections?: readonly Section[];
  /** Reads a stored disclosed verdict back; anything that does not fit is dropped. */
  readonly stored: v.GenericSchema<unknown, Disclosed>;
  readonly messages: KindMessages;
  readonly defaults: KindSettings;
  readonly ttl: KindTtl;
}

/** Every registered kind. */
export type TagKind = (typeof KINDS)[number];
