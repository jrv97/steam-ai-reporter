import * as v from "valibot";
import type { Clock, KeyValueStore } from "../ports";
import { ALLOW_KEY } from "../storage-keys";
import { type AppId, toAppId } from "../types";

/** One ignored game: its store name at the time and when the user ignored it. */
export interface AllowEntry {
  readonly name: string;
  /** Milliseconds since the Unix epoch. */
  readonly added: number;
}

/** The games the user chose to ignore, keyed by app ID. */
export interface AllowList {
  list(): Promise<ReadonlyMap<AppId, AllowEntry>>;
  /** Adds the game, or replaces its entry. */
  add(id: AppId, name: string): Promise<void>;
  /** Removes the game; an ID that is not listed is ignored. */
  remove(id: AppId): Promise<void>;
}

const EntrySchema = v.pipe(
  v.object({ name: v.string(), added: v.pipe(v.number(), v.finite()) }),
  v.readonly(),
);

const RecordSchema = v.record(v.string(), v.unknown());

/**
 * The entries of a stored value. Anything but an object yields nothing, and an entry that is
 * invalid, or whose key is not an app ID, is dropped on its own.
 */
function decode(stored: unknown): ReadonlyMap<AppId, AllowEntry> {
  const entries = new Map<AppId, AllowEntry>();
  const record = v.safeParse(RecordSchema, stored);
  if (!record.success) {
    return entries;
  }
  for (const [key, value] of Object.entries(record.output)) {
    const id = /^[1-9]\d*$/.test(key) ? toAppId(Number(key)) : undefined;
    const entry = v.safeParse(EntrySchema, value);
    if (id !== undefined && entry.success) {
      entries.set(id, entry.output);
    }
  }
  return entries;
}

/**
 * The allow-list over a `KeyValueStore`, stored as `v1:allow`, an object from app ID to name and
 * date. `add` and `remove` read, change and write the whole object, so two tabs changing it at
 * the same moment can lose one change; the user's own clicks make that rare enough to accept.
 */
export function createAllowList(store: KeyValueStore, clock: Clock): AllowList {
  async function read(): Promise<ReadonlyMap<AppId, AllowEntry>> {
    return decode((await store.get([ALLOW_KEY])).get(ALLOW_KEY));
  }

  async function write(entries: ReadonlyMap<AppId, AllowEntry>): Promise<void> {
    const object = Object.fromEntries(
      [...entries].map(([id, entry]) => [String(id), { name: entry.name, added: entry.added }]),
    );
    await store.set(new Map([[ALLOW_KEY, object]]));
  }

  return {
    list: read,

    async add(id, name) {
      const entries = new Map(await read());
      entries.set(id, { name, added: clock.now() });
      await write(entries);
    },

    async remove(id) {
      const entries = new Map(await read());
      if (entries.delete(id)) {
        await write(entries);
      }
    },
  };
}
