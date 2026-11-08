import type { KeyValueStore } from "../../src/core/ports";

/** A `KeyValueStore` that logs each call as `get <keys>`, `set <keys>` or `remove <keys>`. */
export interface LoggingStore extends KeyValueStore {
  readonly log: readonly string[];
  /** The key lists of the `get` calls, in order. */
  readonly keysRead: () => readonly string[];
}

/**
 * Logs the calls to `inner`, and runs `before(n)` ahead of the nth `get`, so a test can change
 * the store between two reads of one run.
 */
export function loggingStore(
  inner: KeyValueStore,
  before: (getCall: number) => Promise<void> = () => Promise.resolve(),
): LoggingStore {
  const log: string[] = [];
  let gets = 0;
  return {
    log,
    keysRead: () =>
      log.filter((line) => line.startsWith("get ")).map((line) => line.slice("get ".length)),
    async get(keys) {
      gets += 1;
      await before(gets);
      log.push(`get ${keys.join(",")}`);
      return inner.get(keys);
    },
    set(entries) {
      log.push(`set ${[...entries.keys()].join(",")}`);
      return inner.set(entries);
    },
    remove(keys) {
      log.push(`remove ${keys.join(",")}`);
      return inner.remove(keys);
    },
    keys: () => inner.keys(),
  };
}
