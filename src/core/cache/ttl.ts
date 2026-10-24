import { KINDS } from "../kinds/registry";
import type { KindVerdicts } from "../kinds/verdicts";
import type { UnknownReason, Verdict } from "../types";

const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

// Tunable constants (plan assumptions): a disclosure rarely goes away, a missing one can appear.
export const DISCLOSED_TTL_MS = 7 * DAY_MS;
export const NOT_DISCLOSED_TTL_MS = 12 * HOUR_MS;
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
export const STORED_REASONS = ["gated", "missing"] as const;

export type StoredReason = (typeof STORED_REASONS)[number];

export function isStoredReason(reason: UnknownReason): reason is StoredReason {
  return reason === "gated" || reason === "missing";
}

/** How long one verdict stays fresh. */
export function ttlMs(verdict: Verdict): number {
  switch (verdict.state) {
    case "disclosed":
      return DISCLOSED_TTL_MS;
    case "not-disclosed":
      return NOT_DISCLOSED_TTL_MS;
    case "unknown":
      return isStoredReason(verdict.reason) ? UNKNOWN_TTL_MS : TRANSIENT_TTL_MS;
    default:
      return verdict satisfies never;
  }
}

/**
 * An app's verdicts come from one fetch and expire with the shortest-lived one, at exactly its TTL.
 * A fetch time in the future is stale, so a wrong clock cannot pin a verdict.
 */
export function isFresh(verdicts: KindVerdicts, time: number, now: number): boolean {
  const age = now - time;
  if (age < 0) {
    return false;
  }
  for (const kind of KINDS) {
    if (age >= ttlMs(verdicts[kind.id])) {
      return false;
    }
  }
  return true;
}
