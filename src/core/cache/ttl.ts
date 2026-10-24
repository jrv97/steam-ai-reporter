import { DAY_MS, HOUR_MS, type KindTtl } from "../kinds/kind-ttl";
import { KINDS } from "../kinds/registry";
import type { KindVerdicts } from "../kinds/verdicts";
import type { UnknownReason, Verdict } from "../types";

export { DAY_MS };

/** How long a stored unknown verdict (`gated`, `missing`, `malformed`) stays fresh. */
export const UNKNOWN_TTL_MS = 6 * HOUR_MS;
/**
 * How long an `error` or `rate-limited` verdict is remembered in page memory. About the breaker's
 * backoff, so a failed ID is asked again soon after the breaker closes but not on every rescan.
 */
export const TRANSIENT_TTL_MS = 60_000;

/**
 * The unknown reasons that are written to storage. `error` and `rate-limited` say nothing about
 * the app, so they live in page memory only.
 */
export const STORED_REASONS = ["gated", "missing", "malformed"] as const;

export type StoredReason = (typeof STORED_REASONS)[number];

export function isStoredReason(reason: UnknownReason): reason is StoredReason {
  return reason === "gated" || reason === "missing" || reason === "malformed";
}

/** How long one verdict stays fresh, given the TTLs of its kind. */
export function ttlMs(ttl: KindTtl, verdict: Verdict): number {
  switch (verdict.state) {
    case "disclosed":
      return ttl.disclosed;
    case "not-disclosed":
      return ttl.notDisclosed;
    case "unknown":
      return isStoredReason(verdict.reason) ? UNKNOWN_TTL_MS : TRANSIENT_TTL_MS;
    default:
      return verdict satisfies never;
  }
}

/**
 * An app's verdicts come from one fetch and expire with the first kind whose TTL has run out, at
 * exactly that TTL. A fetch time in the future is stale, so a wrong clock cannot pin a verdict.
 */
export function isFresh(verdicts: KindVerdicts, time: number, now: number): boolean {
  const age = now - time;
  if (age < 0) {
    return false;
  }
  for (const kind of KINDS) {
    if (age >= ttlMs(kind.ttl, verdicts[kind.id])) {
      return false;
    }
  }
  return true;
}
