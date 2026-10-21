import type { JsonValue } from "../../core/json";
import type { KeyValueStore } from "../../core/ports";

/**
 * An in-memory `KeyValueStore`: the dev bundle's storage and the tests'. Values are cloned in and
 * out, like the browser storages.
 */
export function memoryStore(initial: ReadonlyMap<string, JsonValue> = new Map()): KeyValueStore {
  const values = new Map<string, JsonValue>();
  for (const [key, value] of initial) {
    values.set(key, structuredClone(value));
  }
  return {
    get(keys) {
      const found = new Map<string, unknown>();
      for (const key of keys) {
        const value = values.get(key);
        if (value !== undefined) {
          found.set(key, structuredClone(value));
        }
      }
      return Promise.resolve(found);
    },
    set(entries) {
      for (const [key, value] of entries) {
        values.set(key, structuredClone(value));
      }
      return Promise.resolve();
    },
    remove(keys) {
      for (const key of keys) {
        values.delete(key);
      }
      return Promise.resolve();
    },
    keys() {
      return Promise.resolve([...values.keys()]);
    },
  };
}
