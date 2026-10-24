import * as v from "valibot";
import { type JsonValue, toJsonValue } from "../json";
import type { KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import { KINDS } from "../kinds/registry";
import { isKindVerdicts, type KindVerdict, type KindVerdicts } from "../kinds/verdicts";
import { UNKNOWN, VerdictSourceSchema } from "../types";
import { isStoredReason, STORED_REASONS } from "./ttl";

// The stored form of one app's verdicts (`v1:a:<appid>`): the fetch time and one entry per kind.
// A disclosed entry is the verdict itself, read back with the schema its kind declares; the other
// two states are shared. Storage is untrusted: a read that fails these schemas is discarded, never
// cast. Only the unknown reasons in `STORED_REASONS` appear here.

const TimeSchema = v.pipe(v.number(), v.finite());

const StoredOtherSchema = v.variant("state", [
  v.object({ state: v.literal("not-disclosed"), source: VerdictSourceSchema }),
  v.object({ state: v.literal("unknown"), reason: v.picklist(STORED_REASONS) }),
]);

/** The entries stay `unknown` here and are validated kind by kind. */
const StoredAppSchema = v.object({
  time: TimeSchema,
  kinds: v.record(v.string(), v.unknown()),
});

/** An app's verdicts and the time (ms since the epoch) they were fetched. */
export interface TimedVerdicts {
  readonly verdicts: KindVerdicts;
  readonly time: number;
}

function decodeVerdict(kind: TagKind, stored: unknown): KindVerdict | undefined {
  const other = v.safeParse(StoredOtherSchema, stored);
  if (other.success) {
    return other.output.state === "unknown" ? UNKNOWN[other.output.reason] : other.output;
  }
  const disclosed = v.safeParse(kind.stored, stored);
  return disclosed.success ? disclosed.output : undefined;
}

/**
 * The stored value as verdicts with their fetch time. Undefined when it is not a valid entry, or
 * when it lacks a registered kind (written before the kind existed), so that app is fetched again.
 */
export function decodeVerdicts(stored: unknown): TimedVerdicts | undefined {
  const app = v.safeParse(StoredAppSchema, stored);
  if (!app.success) {
    return undefined;
  }
  const verdicts: Partial<Record<KindId, KindVerdict>> = {};
  for (const kind of KINDS) {
    const verdict = decodeVerdict(kind, app.output.kinds[kind.id]);
    if (verdict === undefined) {
      return undefined;
    }
    verdicts[kind.id] = verdict;
  }
  return isKindVerdicts(verdicts) ? { verdicts, time: app.output.time } : undefined;
}

function encodeVerdict(verdict: KindVerdict): JsonValue | undefined {
  switch (verdict.state) {
    case "disclosed":
      return toJsonValue(verdict);
    case "not-disclosed":
      return { state: "not-disclosed", source: verdict.source };
    case "unknown":
      return isStoredReason(verdict.reason)
        ? { state: "unknown", reason: verdict.reason }
        : undefined;
    default:
      return verdict satisfies never;
  }
}

/**
 * The stored value for verdicts fetched at `time`. Undefined when any kind holds a verdict that
 * is never persisted (`error`, `rate-limited`): the app is then asked about again as a whole.
 */
export function encodeVerdicts(verdicts: KindVerdicts, time: number): JsonValue | undefined {
  const kinds: Record<string, JsonValue> = {};
  for (const kind of KINDS) {
    const entry = encodeVerdict(verdicts[kind.id]);
    if (entry === undefined) {
      return undefined;
    }
    kinds[kind.id] = entry;
  }
  return { time, kinds };
}
