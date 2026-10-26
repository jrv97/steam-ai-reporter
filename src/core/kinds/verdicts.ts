import { type Creator, CREATOR_ROLES, type CreatorRole } from "../creator";
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
import { BASE_SECTIONS, type Section } from "./sections";

type DisclosedOf<Kind> = Kind extends KindDefinition<infer Disclosed> ? Disclosed : never;

/**
 * Marks the full game's disclosure that its demo shows (`detect/full-game.ts`), so a surface can
 * say whose it is. Set when read, never stored: the cache keeps each app's own verdicts.
 */
interface Lent {
  readonly fullGame?: true;
}

/** The disclosed verdict of any registered kind. */
export type AnyDisclosed = DisclosedOf<TagKind> & Lent;

/** A verdict of any registered kind, for code that does not know which kind it holds. */
export type KindVerdict = Verdict<AnyDisclosed>;

/**
 * What an app is related to, from Valve's data. The ignore list follows these (`isIgnored`); no
 * verdict reads them. Each is absent when Valve did not send it and when the answer came from a
 * source that does not know it (the app page).
 */
export interface Relations {
  /** The base game of a DLC or the full game of a demo, from `related_items.parent_appid`. */
  readonly parent?: AppId;
  /** Set when the app is a demo (GetItems `type` 1) with a `parent`, its full game. */
  readonly demo?: true;
  /** The developers and publishers, from `basic_info`; absent when there are none. */
  readonly creators?: Readonly<Record<CreatorRole, readonly Creator[]>>;
}

/** Where an answer came from, which the cache keeps to know what a later request would add. */
interface Provenance {
  /** The GetItems sections the answer came with; absent when it had no GetItems details. */
  readonly sections?: readonly Section[];
}

/** A verdict for every registered kind, in the shape of that kind. */
type PerKindVerdicts = {
  readonly [Id in KindId]: Verdict<Extract<AnyDisclosed, DisclosedBase<Id>>>;
};

/**
 * What core knows about one app: a verdict for every registered kind, in the shape of that kind,
 * what the app is related to, and the sections the answer came with. A verdict has the three
 * states of rule 4. A missing answer is unknown, never not disclosed.
 */
export type KindVerdicts = PerKindVerdicts & Relations & Provenance;

/** Relations as read from data: each one may be missing. */
export type FoundRelations = { readonly [Key in keyof Relations]?: Relations[Key] | undefined; };

/**
 * The verdicts with the relations of `from` added; the same object when there are none. A demo
 * mark without a parent is left out, as nothing follows it.
 */
export function withRelations(verdicts: KindVerdicts, from: FoundRelations): KindVerdicts {
  const { parent, creators } = from;
  const named = creators !== undefined && CREATOR_ROLES.some((role) => creators[role].length > 0);
  if (parent === undefined && !named) {
    return verdicts;
  }
  return {
    ...verdicts,
    ...(parent === undefined ? {} : { parent }),
    ...(parent !== undefined && from.demo === true ? { demo: true } : {}),
    ...(named ? { creators } : {}),
  };
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
  "unrequested": allUnknown("unrequested"),
};

/**
 * Every kind's verdict for a GetItems item with `extra_details`, asked for with `sections`. A kind
 * that reads a section the request left out is unknown `unrequested`.
 */
export function kindsFromGetItems(
  item: StoreItem,
  details: ExtraDetails,
  language: SteamLanguage,
  sections: readonly Section[] = BASE_SECTIONS,
): KindVerdicts {
  const verdicts: Partial<Record<KindId, KindVerdict>> = {};
  for (const kind of KINDS) {
    const asked = kind.sections?.every((section) => sections.includes(section)) ?? true;
    verdicts[kind.id] = asked ? kind.fromGetItems(item, details, language) : UNKNOWN.unrequested;
  }
  return isKindVerdicts(verdicts) ? { ...verdicts, sections } : UNKNOWN_KINDS.error;
}
