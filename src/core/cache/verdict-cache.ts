import type { JsonValue } from "../json";
import type { KindVerdicts } from "../kinds/verdicts";
import type { Clock, KeyValueStore } from "../ports";
import { verdictKey } from "../storage-keys";
import type { AppId } from "../types";
import { Lru, MEMORY_CAPACITY } from "./lru";
import { decodeVerdicts, encodeVerdicts, type TimedVerdicts } from "./stored";
import { isFresh } from "./ttl";

/**
 * Fresh verdicts remembered in page memory and in storage. Storage is shared by every tab, so a
 * verdict fetched once serves them all; page memory also holds the verdicts that are never
 * stored (`error`, `rate-limited`). Rejections from the store propagate to the caller.
 */
export interface VerdictCache {
  /** The fresh verdicts among `ids`: one storage read for the IDs memory does not hold. */
  lookup(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, KindVerdicts>>;
  /** Remembers the verdicts now: one storage write for the ones that are stored. */
  save(verdicts: ReadonlyMap<AppId, KindVerdicts>): Promise<void>;
}

export function createVerdictCache(
  store: KeyValueStore,
  clock: Clock,
  capacity: number = MEMORY_CAPACITY,
): VerdictCache {
  const memory = new Lru<AppId, TimedVerdicts>(capacity);

  return {
    async lookup(ids) {
      const now = clock.now();
      const found = new Map<AppId, KindVerdicts>();
      const unseen = new Set<AppId>();
      for (const id of ids) {
        const held = memory.get(id);
        if (held !== undefined && isFresh(held.verdicts, held.time, now)) {
          found.set(id, held.verdicts);
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
        const entry = decodeVerdicts(stored.get(verdictKey(id)));
        if (entry !== undefined && isFresh(entry.verdicts, entry.time, now)) {
          memory.set(id, entry);
          found.set(id, entry.verdicts);
        }
      }
      return found;
    },

    async save(verdicts) {
      const now = clock.now();
      const entries = new Map<string, JsonValue>();
      for (const [id, found] of verdicts) {
        memory.set(id, { verdicts: found, time: now });
        const value = encodeVerdicts(found, now);
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
