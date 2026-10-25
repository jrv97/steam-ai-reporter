import type { ExtraDetails, StoreItem } from "../detect/getitems.schema";
import type { SteamLanguage } from "../i18n/locale";
import {
  type AppId,
  type DisclosedBase,
  UNKNOWN,
  type UnknownReason,
  type Verdict,
} from "../types";
import type { KindId } from "./id";
import type { KindDefinition, TagKind } from "./kind";
import { holdsEveryKind, KINDS, perKind } from "./registry";

type DisclosedOf<Kind> = Kind extends KindDefinition<infer Disclosed> ? Disclosed : never;

/** The disclosed verdict of any registered kind. */
export type AnyDisclosed = DisclosedOf<TagKind>;

/** A verdict of any registered kind, for code that does not know which kind it holds. */
export type KindVerdict = Verdict<AnyDisclosed>;

/**
 * The base game of a DLC, from Valve's `related_items.parent_appid`. Absent when the app has none,
 * when Valve did not send one and when the answer came from a source that does not know it (the
 * app page). The ignore list follows it (`isIgnored`); no verdict reads it.
 */
export interface BaseGame {
  readonly parent?: AppId;
}

/** A verdict for every registered kind, in the shape of that kind. */
type PerKindVerdicts = {
  readonly [Id in KindId]: Verdict<Extract<AnyDisclosed, DisclosedBase<Id>>>;
};

/**
 * What core knows about one app: a verdict for every registered kind, in the shape of that kind,
 * and the base game when it is a DLC. A verdict has the three states of rule 4. A missing answer
 * is unknown, never not disclosed.
 */
export type KindVerdicts = PerKindVerdicts & BaseGame;

/** The verdicts with `parent` as the base game; the same object when there is none to add. */
export function withParent(verdicts: KindVerdicts, parent: AppId | undefined): KindVerdicts {
  return parent === undefined ? verdicts : { ...verdicts, parent };
}

function sitsUnderItsKind(id: KindId, verdict: KindVerdict): boolean {
  return verdict.state !== "disclosed" || verdict.kind === id;
}

/**
 * Whether the verdicts hold an answer for every registered kind. A disclosed verdict must sit in
 * the slot of its own kind.
 */
export function isKindVerdicts(
  verdicts: Partial<Record<KindId, KindVerdict>>,
): verdicts is KindVerdicts {
  return holdsEveryKind(verdicts, sitsUnderItsKind);
}

/** Whether two lists hold the very same verdict objects in the same order. */
export function sameVerdicts(a: readonly AnyDisclosed[], b: readonly AnyDisclosed[]): boolean {
  return a.length === b.length && a.every((verdict, index) => verdict === b[index]);
}

function allUnknown(reason: UnknownReason): KindVerdicts {
  return perKind(() => UNKNOWN[reason]);
}

/** One shared object per unknown reason, so an app nobody could settle costs no allocation. */
export const UNKNOWN_KINDS: Readonly<Record<UnknownReason, KindVerdicts>> = {
  "gated": allUnknown("gated"),
  "missing": allUnknown("missing"),
  "malformed": allUnknown("malformed"),
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
