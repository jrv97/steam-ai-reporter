/** The in-memory verdict map holds at most this many entries (rule 13: bounded cache). */
export const MEMORY_CAPACITY = 2000;

/**
 * A least-recently-used map with a fixed capacity. A `Map` iterates in insertion order, so the
 * first key is always the least recently used: reads and writes re-insert their key at the end.
 */
export class Lru<K, V> {
  readonly #capacity: number;
  readonly #entries = new Map<K, V>();

  constructor(capacity: number) {
    this.#capacity = Math.max(1, Math.floor(capacity));
  }

  get size(): number {
    return this.#entries.size;
  }

  /** The value, marked as most recently used. */
  get(key: K): V | undefined {
    const value = this.#entries.get(key);
    if (value !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, value);
    }
    return value;
  }

  /** Stores the value as most recently used, evicting the least recently used one when full. */
  set(key: K, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    if (this.#entries.size > this.#capacity) {
      for (const oldest of this.#entries.keys()) {
        this.#entries.delete(oldest);
        break;
      }
    }
  }

  delete(key: K): void {
    this.#entries.delete(key);
  }
}
