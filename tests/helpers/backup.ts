import { BACKUP_FORMAT, BACKUP_VERSION, type BackupContents } from "../../src/core/backup/format";
import type { CreatorKey } from "../../src/core/creator";
import type { PickedFile } from "../../src/core/ports";
import { type AllowEntries, type AllowScope, perScope } from "../../src/core/settings/allow-data";
import { DEFAULT_SETTINGS } from "../../src/core/settings/settings";
import { appId } from "./app-ids";
import { keyOf } from "./creators";

/** When the backups in tests were made: 2026-10-20, midday UTC. */
export const BACKUP_TIME = Date.UTC(2026, 9, 20, 12);

/** One list in a test, by scope: rows of key, name and the time it was ignored. */
export type EntriesSpec<Key> = Partial<
  Record<AllowScope, readonly (readonly [key: Key, name: string, added: number])[]>
>;

function entries<Spec, Key>(spec: EntriesSpec<Spec>, toKey: (key: Spec) => Key): AllowEntries<Key> {
  return perScope((scope) =>
    new Map((spec[scope] ?? []).map(([key, name, added]) => [toKey(key), { name, added }]))
  );
}

/** Ignored games, by app ID. */
export function gameEntries(spec: EntriesSpec<number> = {}): AllowEntries {
  return entries(spec, appId);
}

/** Ignored developers or publishers, by creator key such as `c:4` or `n:Valve`. */
export function creatorEntries(spec: EntriesSpec<string> = {}): AllowEntries<CreatorKey> {
  return entries(spec, keyOf);
}

/** What a backup holds: the defaults and empty lists unless overridden. */
export function backupContents(overrides: Partial<BackupContents> = {}): BackupContents {
  return {
    created: BACKUP_TIME,
    settings: DEFAULT_SETTINGS,
    games: gameEntries(),
    creators: { developer: creatorEntries(), publisher: creatorEntries() },
    ...overrides,
  };
}

/** The text of a hand-made backup file: a valid empty one, with these top-level fields replaced. */
export function backupText(overrides: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created: BACKUP_TIME,
    settings: {},
    ignored: {},
    ...overrides,
  });
}

/** A file the person picked; `size` defaults to the byte length of the text. */
export function pickedFile(
  text: string,
  name = "backup.json",
  size = new TextEncoder().encode(text).length,
): PickedFile {
  return { name, size, text: () => Promise.resolve(text) };
}
