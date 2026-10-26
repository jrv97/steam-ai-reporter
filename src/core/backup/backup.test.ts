import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import {
  BACKUP_TIME,
  backupContents,
  creatorEntries,
  gameEntries,
} from "../../../tests/helpers/backup";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { hexColor, withKind, writeSettings } from "../../../tests/helpers/settings";
import { createIgnoreLists } from "../ignored";
import type { JsonValue } from "../json";
import type { KeyValueStore } from "../ports";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "../settings/settings";
import { createSettingsSource } from "../settings/settings-source";
import {
  ALLOW_KEY,
  CREATOR_ALLOW_KEYS,
  SETTINGS_KEY,
  UI_STATE_KEY,
  verdictKey,
} from "../storage-keys";
import { type BackupDeps, createBackupFile, restoreBackup } from "./backup";
import { type BackupContents, readBackup } from "./format";

const COLORED = withKind(DEFAULT_SETTINGS, "ai", { color: hexColor("#112233"), filter: "dim" });

function backupDeps(store: KeyValueStore = memoryStore()): BackupDeps {
  return {
    settings: createSettingsSource(store),
    lists: createIgnoreLists(store, fixedClock(BACKUP_TIME)),
    clock: fixedClock(BACKUP_TIME),
  };
}

/** Deps whose store holds these settings and ignored games. */
async function seeded(settings: Settings, contents: Partial<BackupContents> = {}) {
  const deps = backupDeps();
  await writeSettings(deps.settings, settings);
  await restoreBackup(deps, backupContents({ settings, ...contents }));
  return deps;
}

async function contentsOf(deps: BackupDeps): Promise<BackupContents> {
  const reading = readBackup((await createBackupFile(deps)).text);
  if (reading.kind !== "backup") {
    throw new Error(reading.kind);
  }
  return reading.contents;
}

describe("createBackupFile", () => {
  it("names the file after the local date", async () => {
    const at = new Date(2026, 0, 5, 9).getTime();
    const file = await createBackupFile({ ...backupDeps(), clock: fixedClock(at) });
    expect(file.name).toBe("ai-reporter-backup-2026-01-05.json");
  });

  it("leaves out the verdict cache and the tab last shown", async () => {
    const store = memoryStore(
      new Map<string, JsonValue>([
        [verdictKey(appId(10)), { cached: "marker" }],
        [UI_STATE_KEY, "marker"],
      ]),
    );
    expect((await createBackupFile(backupDeps(store))).text).not.toContain("marker");
  });

  it("rejects when the store cannot be read", async () => {
    const store = countingStore(memoryStore());
    store.break();
    await expect(createBackupFile(backupDeps(store))).rejects.toBeInstanceOf(Error);
  });
});

describe("restoreBackup", () => {
  it("makes another store hold the same settings and lists after a round trip", async () => {
    const source = await seeded(COLORED, {
      games: gameEntries({ all: [[10, "Ten", 1]] }),
      creators: {
        developer: creatorEntries({ ai: [["c:4", "Studio", 2]] }),
        publisher: creatorEntries({ drm: [["n:Label", "Label", 3]] }),
      },
    });
    const target = backupDeps();
    await restoreBackup(target, await contentsOf(source));
    expect(await contentsOf(target)).toStrictEqual(await contentsOf(source));
  });

  it("replaces the settings, clearing a color the backup does not have", async () => {
    const deps = await seeded(COLORED);
    await restoreBackup(deps, backupContents());
    expect(parseSettings(await deps.settings.read())).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("tells settings subscribers, as any settings change does", async () => {
    const deps = backupDeps();
    const heard: Settings[] = [];
    deps.settings.subscribe((value) => heard.push(parseSettings(value)));
    await restoreBackup(deps, backupContents({ settings: COLORED }));
    expect(heard).toStrictEqual([COLORED]);
  });

  it("writes the keys that open pages watch for list and settings changes", async () => {
    const store = countingStore(memoryStore());
    await restoreBackup(
      backupDeps(store),
      backupContents({
        games: gameEntries({ all: [[10, "Ten", 1]] }),
        creators: {
          developer: creatorEntries({ all: [["c:4", "Studio", 1]] }),
          publisher: creatorEntries({ all: [["c:5", "Label", 1]] }),
        },
      }),
    );
    expect(new Set(store.sets.flat())).toStrictEqual(
      new Set([ALLOW_KEY, ...Object.values(CREATOR_ALLOW_KEYS), SETTINGS_KEY]),
    );
  });

  it("adds to the lists, keeps what is here and counts both", async () => {
    const deps = await seeded(DEFAULT_SETTINGS, {
      games: gameEntries({ all: [[10, "Ten", 1]] }),
    });
    const result = await restoreBackup(
      deps,
      backupContents({ games: gameEntries({ all: [[10, "Ten", 5], [20, "Twenty", 5]] }) }),
    );
    expect(result).toStrictEqual({ added: 1, kept: 1 });
    expect([...(await deps.lists.games.list()).all.keys()]).toStrictEqual([10, 20]);
  });
});
