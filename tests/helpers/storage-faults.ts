import type { JsonValue } from "../../src/core/json";

/**
 * Faults that a storage layer under a `KeyValueStore` injects. A test sets them after seeding the
 * store, and the layer reads them on every call.
 */
export interface StorageFaults {
  /** The write calls so far: an area `set`, or a GM `setValue`. */
  writes: number;
  /** Keys the layer accepts and does not store. */
  readonly dropWrites: Set<string>;
  /** Keys the layer stores with another value than the one written. */
  readonly replaceWrites: Map<string, JsonValue>;
  /** The write call with this number rejects without storing. */
  rejectWrite: number | undefined;
  /** Removing rejects. */
  rejectRemove: boolean;
}

export function noFaults(): StorageFaults {
  return {
    writes: 0,
    dropWrites: new Set(),
    replaceWrites: new Map(),
    rejectWrite: undefined,
    rejectRemove: false,
  };
}

/** Counts a write call. Returns whether it rejects. */
export function failsWrite(faults: StorageFaults): boolean {
  faults.writes += 1;
  return faults.rejectWrite === faults.writes;
}

/** What the layer stores for a write of `value` to `key`; undefined when it drops the key. */
export function storedValue(
  faults: StorageFaults,
  key: string,
  value: JsonValue,
): JsonValue | undefined {
  return faults.dropWrites.has(key) ? undefined : faults.replaceWrites.get(key) ?? value;
}
