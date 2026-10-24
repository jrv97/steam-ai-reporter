import * as v from "valibot";
import type { Clock, KeyValueStore } from "../ports";
import { CACHE_SCHEMA, isVerdictKey, META_KEY } from "../storage-keys";
import { decodeVerdicts } from "./stored";
import { DAY_MS, isFresh } from "./ttl";

const MetaSchema = v.object({
  schema: v.number(),
  sweptAt: v.pipe(v.number(), v.finite()),
});

/**
 * What a maintenance run did: `reset` dropped every verdict because the stored schema is not
 * `CACHE_SCHEMA`; `swept` removed the expired and invalid verdicts; `skipped` found nothing due.
 */
export type Maintenance = "reset" | "swept" | "skipped";

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
  const verdictKeys = (await store.keys()).filter(isVerdictKey);
  const doomed = current === undefined ? verdictKeys : await expired(store, verdictKeys, now);
  if (doomed.length > 0) {
    await store.remove(doomed);
  }
  await store.set(new Map([[META_KEY, { schema: CACHE_SCHEMA, sweptAt: now }]]));
  return current === undefined ? "reset" : "swept";
}

/** A sweep is due a day after the last one, or when the clock moved back past it. */
function sweepDue(sweptAt: number, now: number): boolean {
  const since = now - sweptAt;
  return since < 0 || since >= DAY_MS;
}

/** The keys whose value is invalid or no longer fresh. */
async function expired(
  store: KeyValueStore,
  keys: readonly string[],
  now: number,
): Promise<readonly string[]> {
  if (keys.length === 0) {
    return [];
  }
  const stored = await store.get(keys);
  return keys.filter((key) => {
    const entry = decodeVerdicts(stored.get(key));
    return entry === undefined || !isFresh(entry.verdicts, entry.time, now);
  });
}
