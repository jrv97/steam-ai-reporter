import type { ExtraDetails, StoreItem } from "../detect/getitems.schema";
import type { SteamLanguage } from "../i18n/locale";
import { type DisclosedBase, UNKNOWN, type UnknownReason, type Verdict } from "../types";
import type { KindId } from "./id";
import type { KindDefinition, TagKind } from "./kind";
import { hasEveryKind, KINDS, perKind } from "./registry";

type DisclosedOf<Kind> = Kind extends KindDefinition<infer Disclosed> ? Disclosed : never;

/** The disclosed verdict of any registered kind. */
export type AnyDisclosed = DisclosedOf<TagKind>;

/** A verdict of any registered kind, for code that does not know which kind it holds. */
export type KindVerdict = Verdict<AnyDisclosed>;

/**
 * What core knows about one app: a verdict for every registered kind, each with the disclosed
 * shape of its own kind. Each verdict has exactly the three states of rule 4, and a missing answer
 * is unknown, never not disclosed.
 */
export type KindVerdicts = {
  readonly [Id in KindId]: Verdict<Extract<AnyDisclosed, DisclosedBase<Id>>>;
};

/**
 * Whether the verdicts hold an answer for every registered kind. Builders fill one entry per kind
 * from that kind's own definition, so the entry of each kind has the shape of that kind.
 */
export function isKindVerdicts(
  verdicts: Partial<Record<KindId, KindVerdict>>,
): verdicts is KindVerdicts {
  return hasEveryKind(verdicts);
}

function allUnknown(reason: UnknownReason): KindVerdicts {
  return perKind(() => UNKNOWN[reason]);
}

/** One shared object per unknown reason, so an app nobody could settle costs no allocation. */
export const UNKNOWN_KINDS: Readonly<Record<UnknownReason, KindVerdicts>> = {
  "gated": allUnknown("gated"),
  "missing": allUnknown("missing"),
  "error": allUnknown("error"),
  "rate-limited": allUnknown("rate-limited"),
};

/** Every kind's verdict for a GetItems item with `extra_details`. */
export function kindsFromGetItems(
  item: StoreItem,
  details: ExtraDetails,
  language: SteamLanguage,
): KindVerdicts {
  const verdicts: Partial<Record<KindId, KindVerdict>> = {};
  for (const kind of KINDS) {
    verdicts[kind.id] = kind.fromGetItems(item, details, language);
  }
  return isKindVerdicts(verdicts) ? verdicts : UNKNOWN_KINDS.error;
}
