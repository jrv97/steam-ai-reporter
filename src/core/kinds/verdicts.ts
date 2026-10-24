import { UNKNOWN, type UnknownReason, type Verdict } from "../types";
import type { KindId } from "./id";
import { perKind } from "./registry";

/**
 * What core knows about one app: a verdict for every registered kind. Each verdict has exactly
 * the three states of rule 4, and a missing answer is unknown, never not disclosed.
 */
export type KindVerdicts = Readonly<Record<KindId, Verdict>>;

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
