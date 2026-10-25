import * as v from "valibot";
import { type JsonValue, toJsonValue } from "../json";
import type { KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import { KINDS } from "../kinds/registry";
import {
  isKindVerdicts,
  type KindVerdict,
  type KindVerdicts,
  withRelations,
} from "../kinds/verdicts";
import { AppIdSchema, NOT_DISCLOSED, UNKNOWN, VerdictSourceSchema } from "../types";
import { isStoredReason, STORED_REASONS } from "./ttl";

// An app is stored as `v1:a:<appid>`: its fetch time, one entry per kind and, for a DLC, its base
// game. A disclosed entry is the verdict, read back with its kind's schema. Storage is untrusted,
// so a read that fails is discarded, and the app is fetched again.

const TimeSchema = v.pipe(v.number(), v.finite());

const StoredOtherSchema = v.variant("state", [
  v.object({ state: v.literal("not-disclosed"), source: VerdictSourceSchema }),
  v.object({ state: v.literal("unknown"), reason: v.picklist(STORED_REASONS) }),
]);

/**
 * The entries stay `unknown` here and are validated kind by kind. `parent` is the base game of a
 * DLC; an entry whose `parent` is not an app ID is invalid, so that app is fetched again.
 */
const StoredAppSchema = v.object({
  time: TimeSchema,
  kinds: v.record(v.string(), v.unknown()),
  parent: v.exactOptional(AppIdSchema),
});

/** An app's verdicts and the time (ms since the epoch) they were fetched. */
export interface TimedVerdicts {
  readonly verdicts: KindVerdicts;
  readonly time: number;
}

function isDisclosedEntry(stored: unknown): boolean {
  return typeof stored === "object" && stored !== null && "state" in stored
    && stored.state === "disclosed";
}

/** The verdict of a stored entry. Not disclosed and unknown entries come back as shared objects. */
function decodeVerdict(kind: TagKind, stored: unknown): KindVerdict | undefined {
  if (isDisclosedEntry(stored)) {
    const disclosed = v.safeParse(kind.stored, stored);
    return disclosed.success ? disclosed.output : undefined;
  }
  const other = v.safeParse(StoredOtherSchema, stored);
  if (!other.success) {
    return undefined;
  }
  return other.output.state === "unknown"
    ? UNKNOWN[other.output.reason]
    : NOT_DISCLOSED[other.output.source];
}

/**
 * The stored value as verdicts with their fetch time. Undefined when it is not a valid entry or
 * lacks a registered kind; that app is then fetched again.
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
  return isKindVerdicts(verdicts)
    ? { verdicts: withRelations(verdicts, { parent: app.output.parent }), time: app.output.time }
    : undefined;
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
  return verdicts.parent === undefined ? { time, kinds } : { time, kinds, parent: verdicts.parent };
}
