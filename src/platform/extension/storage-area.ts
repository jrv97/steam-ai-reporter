import type { JsonValue } from "../../core/json";
import type { Unsubscribe } from "../../core/ports";

// The storage types the extension adapters take. They name no WebExtension API, so code and
// tests can import them without the `chrome` globals.

/**
 * The part of a storage area the store adapter uses. Reads stay `unknown`: the type argument of
 * `get<T>()` is never passed, since it would be an unchecked assertion (rule 10).
 */
export interface StorageArea {
  /** The stored items of `keys`, or every item for `null`. */
  get(keys: string[] | null): Promise<Readonly<Record<string, unknown>>>;
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** One key's change, as `storage.onChanged` reports it. */
export interface StorageChange {
  readonly newValue?: unknown;
}

/** The changes of one `storage.onChanged` event in one area, by key. */
export type StorageChanges = Readonly<Record<string, StorageChange>>;

/** Subscribes to changes in one storage area, from any context of this extension. */
export type OnStorageChanged = (listener: (changes: StorageChanges) => void) => Unsubscribe;
