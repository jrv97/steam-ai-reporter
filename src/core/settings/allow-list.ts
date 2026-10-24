import type { Clock, KeyValueStore } from "../ports";
import { ALLOW_KEY } from "../storage-keys";
import type { AppId } from "../types";
import {
  type AllowEntries,
  type AllowEntry,
  type AllowScope,
  decodeAllow,
  encodeAllow,
} from "./allow-data";
import { migrateOnce } from "./migrate";

/** The games the user chose to ignore, per scope: one tag kind, or all kinds. */
export interface AllowList {
  /** The ignored games of every scope. */
  list(): Promise<AllowEntries>;
  /** Adds the game to the scope, or replaces its entry. */
  add(scope: AllowScope, id: AppId, name: string): Promise<void>;
  /** Removes the game from the scope; an ID that is not listed is ignored. */
  remove(scope: AllowScope, id: AppId): Promise<void>;
}

/**
 * The allow-list over a `KeyValueStore`, stored as `v2:allow`, an object per scope from app ID to
 * name and date. `add` and `remove` read, change and write the whole object, so two tabs changing
 * it at the same moment can lose one change; the user's own clicks make that rare enough to
 * accept. The first use moves a `v1:allow` list into the AI scope (see `migrateOnce`).
 */
export function createAllowList(store: KeyValueStore, clock: Clock): AllowList {
  async function read(): Promise<AllowEntries> {
    await migrateOnce(store);
    return decodeAllow((await store.get([ALLOW_KEY])).get(ALLOW_KEY));
  }

  async function write(entries: AllowEntries): Promise<void> {
    await store.set(new Map([[ALLOW_KEY, encodeAllow(entries)]]));
  }

  async function change(
    scope: AllowScope,
    update: (entries: Map<AppId, AllowEntry>) => boolean,
  ): Promise<void> {
    const entries = await read();
    const scoped = new Map(entries[scope]);
    if (update(scoped)) {
      await write({ ...entries, [scope]: scoped });
    }
  }

  return {
    list: read,

    add: (scope, id, name) =>
      change(scope, (entries) => {
        entries.set(id, { name, added: clock.now() });
        return true;
      }),

    remove: (scope, id) => change(scope, (entries) => entries.delete(id)),
  };
}
