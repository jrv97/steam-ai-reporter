import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/json";
import type { KeyValueStore } from "../../src/core/ports";
import { migrateStorage } from "../../src/core/settings/migrate";
import { make } from "../helpers/factory";
import { fake } from "../helpers/fakes";
import type { StorageFaults } from "../helpers/storage-faults";
import { readKey } from "../helpers/store-read";

const GAME_ID = String(make.appId());
const GAME = make.raw.allowEntry();
const V1_SETTINGS = make.raw.v1CustomSettings();
const V1_ALLOW = make.raw.v1Allow({ [GAME_ID]: GAME });
const SETTINGS_V2 = {
  locale: "es",
  debug: true,
  kinds: {
    ...make.raw.v2Kinds({ enabled: true, badge: true, banner: true, filter: "off" }),
    ai: { enabled: true, badge: false, banner: true, filter: "hide" },
  },
};
const ALLOW_V2 = { ...make.raw.noGames(), ai: { [GAME_ID]: GAME } };

const MIGRATION_ERROR = { code: "error_settings_load" };

/**
 * What the migration does when the storage under a port fails, on the real port wrappers. `harness`
 * returns a new, empty store whose layer reads the given faults.
 */
export function migrationFaultContract(
  name: string,
  harness: (faults: StorageFaults) => KeyValueStore,
): void {
  describe(`migration fault contract: ${name}`, () => {
    async function seeded() {
      const faults = fake.faults();
      const store = harness(faults);
      await store.set(
        new Map<string, JsonValue>([["v1:settings", V1_SETTINGS], ["v1:allow", V1_ALLOW]]),
      );
      return { faults, store };
    }

    async function expectV1Intact(store: KeyValueStore): Promise<void> {
      expect(await readKey(store, "v1:settings")).toStrictEqual(V1_SETTINGS);
      expect(await readKey(store, "v1:allow")).toStrictEqual(V1_ALLOW);
    }

    it("copies the v1 keys and keeps them where removing a key would fail", async () => {
      const { faults, store } = await seeded();
      faults.rejectRemove = true;
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await readKey(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await readKey(store, "v2:allow")).toStrictEqual(ALLOW_V2);
      await expectV1Intact(store);
    });

    it("keeps the settings copy when the ignore-list copy does not read back", async () => {
      const { faults, store } = await seeded();
      faults.dropWrites.add("v2:allow");
      await expect(migrateStorage(store)).rejects.toMatchObject(MIGRATION_ERROR);
      expect(await readKey(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await readKey(store, "v2:allow")).toBeUndefined();
      await expectV1Intact(store);

      faults.dropWrites.clear();
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await readKey(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await readKey(store, "v2:allow")).toStrictEqual(ALLOW_V2);
    });

    it("keeps the ignore-list copy when the settings copy does not read back", async () => {
      const { faults, store } = await seeded();
      faults.dropWrites.add("v2:settings");
      await expect(migrateStorage(store)).rejects.toMatchObject(MIGRATION_ERROR);
      expect(await readKey(store, "v2:allow")).toStrictEqual(ALLOW_V2);
      expect(await readKey(store, "v2:settings")).toBeUndefined();
      await expectV1Intact(store);
    });

    it("accepts any usable v2 value on read-back, as another context may edit it", async () => {
      const { faults, store } = await seeded();
      const other = make.raw.v2Allow("ai", make.appId());
      faults.replaceWrites.set("v2:allow", other);
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await readKey(store, "v2:allow")).toStrictEqual(other);
      expect(await readKey(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
    });

    it("fails on an unusable value, leaves it, and replaces it from v1 next time", async () => {
      const { faults, store } = await seeded();
      const garbage = make.text.note();
      faults.replaceWrites.set("v2:allow", garbage);
      await expect(migrateStorage(store)).rejects.toMatchObject(MIGRATION_ERROR);
      expect(await readKey(store, "v2:allow")).toBe(garbage);
      expect(await readKey(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      await expectV1Intact(store);

      faults.replaceWrites.clear();
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await readKey(store, "v2:allow")).toStrictEqual(ALLOW_V2);
    });

    it("keeps the copy that landed when the next write rejects, and finishes later", async () => {
      const { faults, store } = await seeded();
      faults.rejectWrite = faults.writes + 2;
      await expect(migrateStorage(store)).rejects.toThrow();
      expect(await readKey(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await readKey(store, "v2:allow")).toBeUndefined();
      await expectV1Intact(store);

      faults.rejectWrite = undefined;
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await readKey(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await readKey(store, "v2:allow")).toStrictEqual(ALLOW_V2);
    });

    it("keeps the v1 data when the first write rejects, and copies the other key", async () => {
      const { faults, store } = await seeded();
      faults.rejectWrite = faults.writes + 1;
      await expect(migrateStorage(store)).rejects.toThrow();
      expect(await readKey(store, "v2:settings")).toBeUndefined();
      expect(await readKey(store, "v2:allow")).toStrictEqual(ALLOW_V2);
      await expectV1Intact(store);
    });
  });
}
