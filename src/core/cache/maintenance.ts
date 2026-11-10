import * as v from "valibot";
import type { KindId } from "../kinds/id";
import { KINDS } from "../kinds/registry";
import type { KindVerdicts } from "../kinds/verdicts";
import type { Clock, KeyValueStore } from "../ports";
import { CACHE_SCHEMA, isVerdictKey, META_KEY } from "../storage-keys";
import { decodeVerdicts, type TimedVerdicts } from "./stored";
import { DAY_MS, isFresh, isStoredReason } from "./ttl";

const MetaSchema = v.object({
  schema: v.number(),
  sweptAt: v.pipe(v.number(), v.finite()),
});

/**
 * What a maintenance run did: `reset` dropped every verdict because the stored schema is not
 * `CACHE_SCHEMA`; `swept` removed the expired and invalid verdicts; `skipped` found nothing due.
 */
export type Maintenance = "reset" | "swept" | "skipped";

/** Picks stored entries by what they read as; undefined is an entry that does not read. */
type EntryFilter = (entry: TimedVerdicts | undefined) => boolean;

/** How many apps have stored verdicts, and how many of them hold an unknown answer from Steam. */
export interface StoredCount {
  readonly games: number;
  readonly unanswered: number;
}

/**
 * Housekeeping for the stored verdicts, run once when a page starts. A schema mismatch (or a
 * missing or invalid meta record) clears the verdict keys `v1:a:*` and nothing else: settings,
 * the allow-list and the breaker survive. Otherwise the expiry sweep runs at most once a day.
 * Both are best effort and idempotent, so two tabs racing each other is harmless.
 */
export async function maintainCache(store: KeyValueStore, clock: Clock): Promise<Maintenance> {
  const now = clock.now();
  const meta = v.safeParse(MetaSchema, (await store.get([META_KEY])).get(META_KEY));
  const current = meta.success && meta.output.schema === CACHE_SCHEMA ? meta.output : undefined;
  if (current !== undefined && !sweepDue(current.sweptAt, now)) {
    return "skipped";
  }
  await removeVerdicts(
    store,
    current === undefined
      ? undefined
      : (entry) => entry === undefined || !isFresh(entry.verdicts, entry.time, now),
  );
  await store.set(new Map([[META_KEY, { schema: CACHE_SCHEMA, sweptAt: now }]]));
  return current === undefined ? "reset" : "swept";
}

/**
 * Removes the stored verdicts that `which` picks, or every one without it, and returns how many
 * went. Only keys `v1:a:*` are touched; settings, the lists, the breaker and meta stay.
 */
export async function removeVerdicts(store: KeyValueStore, which?: EntryFilter): Promise<number> {
  let doomed = (await store.keys()).filter(isVerdictKey);
  if (which !== undefined && doomed.length > 0) {
    const stored = await store.get(doomed);
    doomed = doomed.filter((key) => which(decodeVerdicts(stored.get(key))));
  }
  if (doomed.length > 0) {
    await store.remove(doomed);
  }
  return doomed.length;
}

/** Counts the stored entries that read, in one batch read. */
export async function countVerdicts(store: KeyValueStore): Promise<StoredCount> {
  const keys = (await store.keys()).filter(isVerdictKey);
  const stored = keys.length === 0 ? new Map<string, unknown>() : await store.get(keys);
  const entries = keys.flatMap((key) => decodeVerdicts(stored.get(key)) ?? []);
  return { games: entries.length, unanswered: entries.filter(isUnanswered).length };
}

/**
 * Whether Steam gave no answer for a kind it was asked about: unknown `gated`, `missing` or
 * `malformed`. An `unrequested` kind was never asked for, so it does not count.
 */
export function isUnanswered(entry: TimedVerdicts | undefined): boolean {
  return entry !== undefined && KINDS.some((kind) => unanswered(entry.verdicts, kind.id));
}

function unanswered(verdicts: KindVerdicts, id: KindId): boolean {
  const verdict = verdicts[id];
  return verdict.state === "unknown" && verdict.reason !== "unrequested"
    && isStoredReason(verdict.reason);
}

/** A sweep is due a day after the last one, or when the clock moved back past it. */
function sweepDue(sweptAt: number, now: number): boolean {
  const since = now - sweptAt;
  return since < 0 || since >= DAY_MS;
}
