import * as v from "valibot";
import { SteamLanguageSchema } from "../i18n/locale";
import type { JsonValue } from "../json";
import { UNKNOWN, type Verdict } from "../types";
import { isStoredReason, STORED_REASONS } from "./ttl";

// The stored form of one verdict (`v1:a:<appid>`). Storage is untrusted: every read goes through
// `StoredVerdictSchema`, and anything that fails it is discarded, never cast. Only the unknown
// reasons in `STORED_REASONS` appear here.

const SourceSchema = v.picklist(["api", "html"]);
const TimeSchema = v.pipe(v.number(), v.finite());

const StoredVerdictSchema = v.variant("state", [
  v.object({
    state: v.literal("disclosed"),
    time: TimeSchema,
    notes: v.pipe(v.string(), v.minLength(1)),
    language: SteamLanguageSchema,
    service: v.exactOptional(v.string()),
    name: v.exactOptional(v.string()),
    source: SourceSchema,
  }),
  v.object({ state: v.literal("not-disclosed"), time: TimeSchema, source: SourceSchema }),
  v.object({
    state: v.literal("unknown"),
    time: TimeSchema,
    reason: v.picklist(STORED_REASONS),
  }),
]);

/** A verdict and the time (ms since the epoch) it was fetched. */
export interface TimedVerdict {
  readonly verdict: Verdict;
  readonly time: number;
}

/** The stored value as a verdict with its fetch time; undefined when it is not a valid entry. */
export function decodeVerdict(stored: unknown): TimedVerdict | undefined {
  const result = v.safeParse(StoredVerdictSchema, stored);
  if (!result.success) {
    return undefined;
  }
  const entry = result.output;
  switch (entry.state) {
    case "disclosed":
      return {
        time: entry.time,
        verdict: {
          state: "disclosed",
          notes: entry.notes,
          language: entry.language,
          source: entry.source,
          ...(entry.service === undefined ? {} : { service: entry.service }),
          ...(entry.name === undefined ? {} : { name: entry.name }),
        },
      };
    case "not-disclosed":
      return { time: entry.time, verdict: { state: "not-disclosed", source: entry.source } };
    case "unknown":
      return { time: entry.time, verdict: UNKNOWN[entry.reason] };
    default:
      return entry satisfies never;
  }
}

/**
 * The stored value for a verdict fetched at `time`; undefined for a verdict that is never
 * persisted (`error`, `rate-limited`).
 */
export function encodeVerdict(verdict: Verdict, time: number): JsonValue | undefined {
  switch (verdict.state) {
    case "disclosed":
      return {
        state: "disclosed",
        time,
        notes: verdict.notes,
        language: verdict.language,
        source: verdict.source,
        ...(verdict.service === undefined ? {} : { service: verdict.service }),
        ...(verdict.name === undefined ? {} : { name: verdict.name }),
      };
    case "not-disclosed":
      return { state: "not-disclosed", time, source: verdict.source };
    case "unknown":
      return isStoredReason(verdict.reason)
        ? { state: "unknown", time, reason: verdict.reason }
        : undefined;
    default:
      return verdict satisfies never;
  }
}
