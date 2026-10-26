import { type CreatorKey, type CreatorRole, toCreatorKey } from "../creator";
import type { Clock, KeyValueStore } from "../ports";
import { createSerial } from "../serial";
import { ALLOW_KEY, CREATOR_ALLOW_KEYS } from "../storage-keys";
import type { AppId } from "../types";
import {
  ALLOW_SCOPES,
  type AllowEntries,
  type AllowEntry,
  type AllowScope,
  decodeScopes,
  encodeAllow,
  parseGameKey,
  type ParseKey,
  perScope,
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
  /**
   * Adds the entries of every scope in one write and returns how many were new. Where a scope
   * holds a key on both sides, the entry ignored first stays, so merging twice changes nothing.
   */
  merge(entries: AllowEntries<Key>): Promise<number>;
}

/** The games the user chose to ignore. */
export type AllowList = ScopedList<AppId>;

/** The developers or publishers the user chose to ignore, by creator key. */
export type CreatorList = ScopedList<CreatorKey>;

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

    merge: (incoming) =>
      serial(async () => {
        const entries = await read();
        const merged = perScope((scope) => new Map(entries[scope]));
        let added = 0;
        let changed = false;
        for (const scope of ALLOW_SCOPES) {
          for (const [key, entry] of incoming[scope]) {
            const held = merged[scope].get(key);
            added += held === undefined ? 1 : 0;
            if (held === undefined || entry.added < held.added) {
              merged[scope].set(key, entry);
              changed = true;
            }
          }
        }
        if (changed) {
          await write(merged);
        }
        return added;
      }),
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

/**
 * The developers or publishers the user ignored, stored as `v2:allow-developers` or
 * `v2:allow-publishers`. A missing key is an empty list, and nothing else is read.
 */
export function createCreatorList(
  store: KeyValueStore,
  clock: Clock,
  role: CreatorRole,
): CreatorList {
  const storageKey = CREATOR_ALLOW_KEYS[role];
  return createScopedList(store, clock, {
    storageKey,
    read: async (from) => (await from.get([storageKey])).get(storageKey),
    parseKey: toCreatorKey,
  });
}
