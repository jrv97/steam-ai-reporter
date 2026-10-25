import type { Clock, KeyValueStore } from "../ports";
import { createSerial } from "../serial";
import { ALLOW_KEY } from "../storage-keys";
import type { AppId } from "../types";
import {
  type AllowEntries,
  type AllowEntry,
  type AllowScope,
  decodeScopes,
  encodeAllow,
  parseGameKey,
  type ParseKey,
} from "./allow-data";
import { readAllowValue } from "./migrate";

/** The items the user chose to ignore, per scope: one tag kind, or all kinds. */
export interface ScopedList<Key> {
  /** The ignored items of every scope. */
  list(): Promise<AllowEntries<Key>>;
  /** Adds the item to the scope, or replaces its entry. */
  add(scope: AllowScope, key: Key, name: string): Promise<void>;
  /** Removes the item from the scope; a key that is not listed is ignored. */
  remove(scope: AllowScope, key: Key): Promise<void>;
}

/** The games the user chose to ignore. */
export type AllowList = ScopedList<AppId>;

/** Where a list lives and how its keys read back. */
export interface ScopedListSpec<Key> {
  /** The storage key of the list. */
  readonly storageKey: string;
  /** The stored value; a list that has a legacy home reads it here. */
  readonly read: (store: KeyValueStore) => Promise<unknown>;
  readonly parseKey: ParseKey<Key>;
}

/**
 * A list of ignored items over a `KeyValueStore`, stored as an object per scope. Changes read and
 * write the whole object, one after another in this context, so two quick changes both apply;
 * two tabs at once can still lose one.
 */
export function createScopedList<Key>(
  store: KeyValueStore,
  clock: Clock,
  spec: ScopedListSpec<Key>,
): ScopedList<Key> {
  async function read(): Promise<AllowEntries<Key>> {
    return decodeScopes(await spec.read(store), spec.parseKey);
  }

  async function write(entries: AllowEntries<Key>): Promise<void> {
    await store.set(new Map([[spec.storageKey, encodeAllow(entries)]]));
  }

  const serial = createSerial();

  function change(
    scope: AllowScope,
    update: (entries: Map<Key, AllowEntry>) => boolean,
  ): Promise<void> {
    return serial(async () => {
      const entries = await read();
      const scoped = new Map(entries[scope]);
      if (update(scoped)) {
        await write({ ...entries, [scope]: scoped });
      }
    });
  }

  return {
    list: read,

    add: (scope, key, name) =>
      change(scope, (entries) => {
        entries.set(key, { name, added: clock.now() });
        return true;
      }),

    remove: (scope, key) => change(scope, (entries) => entries.delete(key)),
  };
}

/** The games the user ignored, stored as `v2:allow`. A read copies a `v1:allow` list. */
export function createAllowList(store: KeyValueStore, clock: Clock): AllowList {
  return createScopedList(store, clock, {
    storageKey: ALLOW_KEY,
    read: readAllowValue,
    parseKey: parseGameKey,
  });
}
