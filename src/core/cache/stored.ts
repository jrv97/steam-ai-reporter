import * as v from "valibot";
import { SteamLanguageSchema } from "../i18n/locale";
import type { JsonValue } from "../json";
import { definedKinds, KINDS, perKind } from "../kinds/registry";
import type { KindVerdicts } from "../kinds/verdicts";
import { UNKNOWN, type Verdict } from "../types";
import { isStoredReason, STORED_REASONS } from "./ttl";

// The stored form of one app's verdicts (`v1:a:<appid>`): the fetch time and one entry per kind.
// Storage is untrusted: a read that fails these schemas is discarded, never cast. Only the
// unknown reasons in `STORED_REASONS` appear here.

const SourceSchema = v.picklist(["api", "html"]);
const TimeSchema = v.pipe(v.number(), v.finite());

const StoredVerdictSchema = v.variant("state", [
  v.object({
    state: v.literal("disclosed"),
    notes: v.pipe(v.string(), v.minLength(1)),
    language: SteamLanguageSchema,
    service: v.exactOptional(v.string()),
    name: v.exactOptional(v.string()),
    source: SourceSchema,
  }),
  v.object({ state: v.literal("not-disclosed"), source: SourceSchema }),
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

function decodeVerdict(stored: unknown): Verdict | undefined {
  const result = v.safeParse(StoredVerdictSchema, stored);
  if (!result.success) {
    return undefined;
  }
  const entry = result.output;
  switch (entry.state) {
    case "disclosed":
      return {
        state: "disclosed",
        notes: entry.notes,
        language: entry.language,
        source: entry.source,
        ...(entry.service === undefined ? {} : { service: entry.service }),
        ...(entry.name === undefined ? {} : { name: entry.name }),
      };
    case "not-disclosed":
      return { state: "not-disclosed", source: entry.source };
    case "unknown":
      return UNKNOWN[entry.reason];
    default:
      return entry satisfies never;
  }
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
  const verdicts = definedKinds(perKind((kind) => decodeVerdict(app.output.kinds[kind.id])));
  return verdicts === undefined ? undefined : { verdicts, time: app.output.time };
}

function encodeVerdict(verdict: Verdict): JsonValue | undefined {
  switch (verdict.state) {
    case "disclosed":
      return {
        state: "disclosed",
        notes: verdict.notes,
        language: verdict.language,
        source: verdict.source,
        ...(verdict.service === undefined ? {} : { service: verdict.service }),
        ...(verdict.name === undefined ? {} : { name: verdict.name }),
      };
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
