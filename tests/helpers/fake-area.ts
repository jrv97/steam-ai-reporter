import type { JsonValue } from "../../src/core/json";
import type { StorageArea } from "../../src/platform/extension/ext";
import { failsWrite, type StorageFaults, storedValue } from "./storage-faults";

/** A typed `storage.local` fake that clones values in and out, as the browsers serialize them. */
export function fakeArea(): StorageArea & { readonly calls: string[]; } {
  const items = new Map<string, JsonValue>();
  const calls: string[] = [];
  return {
    calls,
    get(keys) {
      calls.push("get");
      const found: Record<string, unknown> = {};
      for (const [key, value] of items) {
        if (keys === null || keys.includes(key)) {
          found[key] = structuredClone(value);
        }
      }
      return Promise.resolve(found);
    },
    set(entries) {
      calls.push("set");
      for (const [key, value] of Object.entries(entries)) {
        items.set(key, structuredClone(value));
      }
      return Promise.resolve();
    },
    remove(keys) {
      calls.push("remove");
      for (const key of keys) {
        items.delete(key);
      }
      return Promise.resolve();
    },
  };
}

/** A `storage.local` fake that injects the given faults, for the migration's failure cases. */
export function faultyArea(faults: StorageFaults): StorageArea {
  const inner = fakeArea();
  return {
    get: (keys) => inner.get(keys),
    set(items) {
      if (failsWrite(faults)) {
        return Promise.reject(new Error());
      }
      const kept: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(items)) {
        const stored = storedValue(faults, key, value);
        if (stored !== undefined) {
          kept[key] = stored;
        }
      }
      return inner.set(kept);
    },
    remove: (keys) => faults.rejectRemove ? Promise.reject(new Error()) : inner.remove(keys),
  };
}
