import { CREATOR_ROLES } from "../creator";
import type { IgnoreLists } from "../ignored";
import type { Clock } from "../ports";
import { parseSettings, wholePatch } from "../settings/settings";
import type { StoredSettings } from "../settings/settings-source";
import { type BackupContents, countEntries, encodeBackup } from "./format";

/** Where a backup reads from and restores into. */
export interface BackupDeps {
  readonly settings: StoredSettings;
  readonly lists: IgnoreLists;
  readonly clock: Clock;
}

/** A backup ready to download. */
export interface BackupFile {
  readonly name: string;
  readonly text: string;
}

/** What a restore did to the ignore lists. */
export interface RestoreResult {
  /** Entries that were new on this browser. */
  readonly added: number;
  /** Entries this browser already held, which stay as they were. */
  readonly kept: number;
}

/** A technical file name prefix that outlives the product name, like the `sar-` prefix. */
const FILE_PREFIX = "ai-reporter-backup-";

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** `ai-reporter-backup-YYYY-MM-DD.json`, in local time. */
function fileName(time: number): string {
  const at = new Date(time);
  const day = [at.getFullYear(), twoDigits(at.getMonth() + 1), twoDigits(at.getDate())].join("-");
  return `${FILE_PREFIX}${day}.json`;
}

/** The backup of what is stored now. Rejects when the settings or a list cannot be read. */
export async function createBackupFile(deps: BackupDeps): Promise<BackupFile> {
  const { settings, lists, clock } = deps;
  const [stored, games, developer, publisher] = await Promise.all([
    settings.read(),
    lists.games.list(),
    lists.creators.developer.list(),
    lists.creators.publisher.list(),
  ]);
  const created = clock.now();
  const text = encodeBackup({
    created,
    settings: parseSettings(stored),
    games,
    creators: { developer, publisher },
  });
  return { name: fileName(created), text };
}

/**
 * Merges the backup's ignore lists into the stored ones, then replaces the settings with its own,
 * which tells every settings subscriber. The merges only add, so a restore that fails half way can
 * run again with the same result.
 */
export async function restoreBackup(
  deps: BackupDeps,
  contents: BackupContents,
): Promise<RestoreResult> {
  const { settings, lists } = deps;
  const added = await Promise.all([
    lists.games.merge(contents.games),
    ...CREATOR_ROLES.map((role) => lists.creators[role].merge(contents.creators[role])),
  ]);
  await settings.patch(wholePatch(contents.settings));
  const { games, creators } = contents;
  const total = countEntries([games, creators.developer, creators.publisher]);
  const fresh = added.reduce((sum, count) => sum + count, 0);
  return { added: fresh, kept: total - fresh };
}
