import type { JsonValue } from "../json";
import type { Clock, KeyValueStore } from "../ports";
import { verdictKey } from "../storage-keys";
import type { AppId, Verdict } from "../types";
import { Lru, MEMORY_CAPACITY } from "./lru";
import { decodeVerdict, encodeVerdict, type TimedVerdict } from "./stored";
import { isFresh } from "./ttl";

/**
 * Fresh verdicts remembered in page memory and in storage. Storage is shared by every tab, so a
 * verdict fetched once serves them all; page memory also holds the verdicts that are never
 * stored (`error`, `rate-limited`). Rejections from the store propagate to the caller.
 */
export interface VerdictCache {
  /** The fresh verdicts among `ids`: one storage read for the IDs memory does not hold. */
  lookup(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, Verdict>>;
  /** Remembers the verdicts now: one storage write for the ones that are stored. */
  save(verdicts: ReadonlyMap<AppId, Verdict>): Promise<void>;
}

export function createVerdictCache(
  store: KeyValueStore,
  clock: Clock,
  capacity: number = MEMORY_CAPACITY,
): VerdictCache {
  const memory = new Lru<AppId, TimedVerdict>(capacity);

  return {
    async lookup(ids) {
      const now = clock.now();
      const found = new Map<AppId, Verdict>();
      const unseen = new Set<AppId>();
      for (const id of ids) {
        const held = memory.get(id);
        if (held !== undefined && isFresh(held.verdict, held.time, now)) {
          found.set(id, held.verdict);
        } else {
          memory.delete(id);
          unseen.add(id);
        }
      }
      if (unseen.size === 0) {
        return found;
      }
      const stored = await store.get([...unseen].map(verdictKey));
      for (const id of unseen) {
        const entry = decodeVerdict(stored.get(verdictKey(id)));
        if (entry !== undefined && isFresh(entry.verdict, entry.time, now)) {
          memory.set(id, entry);
          found.set(id, entry.verdict);
        }
      }
      return found;
    },

    async save(verdicts) {
      const now = clock.now();
      const entries = new Map<string, JsonValue>();
      for (const [id, verdict] of verdicts) {
        memory.set(id, { verdict, time: now });
        const value = encodeVerdict(verdict, now);
        if (value !== undefined) {
          entries.set(verdictKey(id), value);
        }
      }
      if (entries.size > 0) {
        await store.set(entries);
      }
    },
  };
}
