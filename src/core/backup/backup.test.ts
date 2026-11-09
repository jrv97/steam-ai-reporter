import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { writeSettings } from "../../../tests/helpers/settings";
import { createIgnoreLists } from "../ignored";
import type { JsonValue } from "../json";
import { parseOrder } from "../kinds/order";
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

/** Settings a person changed: a color, a filter, chip text and the tag order. */
const CHANGED: Settings = {
  ...make.settings.chipText(
    { deck: { chip: make.chipText(), chipCompact: make.chipText() } },
    make.settings.kind("ai", { color: make.color(), filter: "dim" }),
  ),
  order: parseOrder(["family", "ai"]),
};

function backupDeps(store: KeyValueStore = fake.store()): BackupDeps {
  return {
    settings: createSettingsSource(store),
    lists: createIgnoreLists(store, fake.clock(make.backup.time)),
    clock: fake.clock(make.backup.time),
  };
}

/** Deps whose store holds these settings and ignored games. */
async function seeded(settings: Settings, contents: Partial<BackupContents> = {}) {
  const deps = backupDeps();
  await writeSettings(deps.settings, settings);
  await restoreBackup(deps, make.backup.contents({ settings, ...contents }));
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
    const file = await createBackupFile({ ...backupDeps(), clock: fake.clock(at) });
    expect(file.name).toBe("tag-kit-backup-2026-01-05.json");
  });

  it("leaves out the verdict cache and the tab last shown", async () => {
    const marker = make.text.note();
    const store = fake.store(
      new Map<string, JsonValue>([
        [verdictKey(make.appId()), { cached: marker }],
        [UI_STATE_KEY, marker],
      ]),
    );
    expect((await createBackupFile(backupDeps(store))).text).not.toContain(marker);
  });

  it("rejects when the store cannot be read", async () => {
    const store = fake.countingStore(fake.store());
    store.break();
    await expect(createBackupFile(backupDeps(store))).rejects.toBeInstanceOf(Error);
  });
});

describe("restoreBackup", () => {
  it("makes another store hold the same settings and lists after a round trip", async () => {
    const source = await seeded(CHANGED, {
      games: make.allow.games({ all: [make.allow.gameRow()] }),
      creators: {
        developer: make.allow.creators({ ai: [make.allow.clanRow()] }),
        publisher: make.allow.creators({ drm: [make.allow.nameRow()] }),
      },
    });
    const target = backupDeps();
    await restoreBackup(target, await contentsOf(source));
    expect(await contentsOf(target)).toStrictEqual(await contentsOf(source));
  });

  it("replaces the settings, clearing what the backup does not hold", async () => {
    const deps = await seeded(CHANGED);
    await restoreBackup(deps, make.backup.contents());
    expect(parseSettings(await deps.settings.read())).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("tells settings subscribers, as any settings change does", async () => {
    const deps = backupDeps();
    const heard: Settings[] = [];
    deps.settings.subscribe((value) => heard.push(parseSettings(value)));
    await restoreBackup(deps, make.backup.contents({ settings: CHANGED }));
    expect(heard).toStrictEqual([CHANGED]);
  });

  it("writes the keys that open pages watch for list and settings changes", async () => {
    const store = fake.countingStore(fake.store());
    await restoreBackup(
      backupDeps(store),
      make.backup.contents({
        games: make.allow.games({ all: [make.allow.gameRow()] }),
        creators: {
          developer: make.allow.creators({ all: [make.allow.clanRow()] }),
          publisher: make.allow.creators({ all: [make.allow.clanRow()] }),
        },
      }),
    );
    expect(new Set(store.sets.flat())).toStrictEqual(
      new Set([ALLOW_KEY, ...Object.values(CREATOR_ALLOW_KEYS), SETTINGS_KEY]),
    );
  });

  it("adds to the lists, keeps what is here and counts both", async () => {
    const [held, added] = [make.allow.gameRow(), make.allow.gameRow()];
    const deps = await seeded(DEFAULT_SETTINGS, { games: make.allow.games({ all: [held] }) });
    const again = [held[0], held[1], make.time()] as const;
    const result = await restoreBackup(
      deps,
      make.backup.contents({ games: make.allow.games({ all: [again, added] }) }),
    );
    expect(result).toStrictEqual({ added: 1, kept: 1 });
    expect([...(await deps.lists.games.list()).all.keys()]).toStrictEqual([held[0], added[0]]);
  });
});
