import type { KeyValueStore } from "../../src/core/ports";

export interface CountingStore extends KeyValueStore {
  /** How many calls of each method the store has seen. */
  readonly calls: { get: number; set: number; remove: number; keys: number; };
  /** The keys of every `get` call, in order. */
  readonly gets: (readonly string[])[];
  /** The keys of every `set` call, in order. */
  readonly sets: (readonly string[])[];
  /** Makes the next calls to `get` and `set` reject, until `heal()`. */
  break(): void;
  heal(): void;
}

/** Wraps a store and counts its calls, so tests can assert one `get` and one `set` per batch. */
export function countingStore(inner: KeyValueStore): CountingStore {
  const calls = { get: 0, set: 0, remove: 0, keys: 0 };
  const gets: (readonly string[])[] = [];
  const sets: (readonly string[])[] = [];
  let broken = false;
  return {
    calls,
    gets,
    sets,
    break() {
      broken = true;
    },
    heal() {
      broken = false;
    },
    get(keys) {
      calls.get += 1;
      gets.push(keys);
      return broken ? Promise.reject(new Error()) : inner.get(keys);
    },
    set(entries) {
      calls.set += 1;
      sets.push([...entries.keys()]);
      return broken ? Promise.reject(new Error()) : inner.set(entries);
    },
    remove(keys) {
      calls.remove += 1;
      return inner.remove(keys);
    },
    keys() {
      calls.keys += 1;
      return inner.keys();
    },
  };
}
