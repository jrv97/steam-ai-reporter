import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/json";
import { perKind } from "../../src/core/kinds/registry";
import type { KeyValueStore } from "../../src/core/ports";
import { perScope } from "../../src/core/settings/allow-data";
import { migrateStorage } from "../../src/core/settings/migrate";
import { noFaults, type StorageFaults } from "../helpers/storage-faults";

const T = 1_000_000_000_000;
const V1_SETTINGS: JsonValue = {
  badges: false,
  banner: true,
  listFilter: "hide",
  locale: "es",
  debug: true,
};
const V1_ALLOW: JsonValue = { "1808500": { name: "ARC Raiders", added: T } };
const SETTINGS_V2 = {
  locale: "es",
  debug: true,
  kinds: {
    ...perKind(() => ({ enabled: true, badge: true, banner: true, filter: "off" })),
    ai: { enabled: true, badge: false, banner: true, filter: "hide" },
  },
};
const ALLOW_V2 = {
  ...perScope(() => ({})),
  ai: { "1808500": { name: "ARC Raiders", added: T } },
};

const MIGRATION_ERROR = { code: "error_settings_load" };

/**
 * What the migration does when the storage under a port fails, on the real port wrappers. `make`
 * returns a new, empty store whose layer reads the given faults.
 */
export function migrationFaultContract(
  name: string,
  make: (faults: StorageFaults) => KeyValueStore,
): void {
  describe(`migration fault contract: ${name}`, () => {
    async function seeded() {
      const faults = noFaults();
      const store = make(faults);
      await store.set(new Map([["v1:settings", V1_SETTINGS], ["v1:allow", V1_ALLOW]]));
      return { faults, store };
    }

    async function stored(store: KeyValueStore, key: string): Promise<unknown> {
      return (await store.get([key])).get(key);
    }

    async function expectV1Intact(store: KeyValueStore): Promise<void> {
      expect(await stored(store, "v1:settings")).toStrictEqual(V1_SETTINGS);
      expect(await stored(store, "v1:allow")).toStrictEqual(V1_ALLOW);
    }

    it("copies the v1 keys and removes nothing, even where removing would fail", async () => {
      const { faults, store } = await seeded();
      faults.rejectRemove = true;
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await stored(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await stored(store, "v2:allow")).toStrictEqual(ALLOW_V2);
      await expectV1Intact(store);
    });

    it("keeps the settings copy when the ignore-list copy does not read back", async () => {
      const { faults, store } = await seeded();
      faults.dropWrites.add("v2:allow");
      await expect(migrateStorage(store)).rejects.toMatchObject(MIGRATION_ERROR);
      expect(await stored(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await stored(store, "v2:allow")).toBeUndefined();
      await expectV1Intact(store);

      faults.dropWrites.clear();
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await stored(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await stored(store, "v2:allow")).toStrictEqual(ALLOW_V2);
    });

    it("keeps the ignore-list copy when the settings copy does not read back", async () => {
      const { faults, store } = await seeded();
      faults.dropWrites.add("v2:settings");
      await expect(migrateStorage(store)).rejects.toMatchObject(MIGRATION_ERROR);
      expect(await stored(store, "v2:allow")).toStrictEqual(ALLOW_V2);
      expect(await stored(store, "v2:settings")).toBeUndefined();
      await expectV1Intact(store);
    });

    it("accepts any usable v2 value on read-back, as another context may edit it", async () => {
      const { faults, store } = await seeded();
      const other = { all: {}, ai: { "42": { name: "Written by another context", added: T } } };
      faults.replaceWrites.set("v2:allow", other);
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await stored(store, "v2:allow")).toStrictEqual(other);
      expect(await stored(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
    });

    it("fails on an unusable value, leaves it, and replaces it from v1 next time", async () => {
      const { faults, store } = await seeded();
      faults.replaceWrites.set("v2:allow", "garbage");
      await expect(migrateStorage(store)).rejects.toMatchObject(MIGRATION_ERROR);
      expect(await stored(store, "v2:allow")).toBe("garbage");
      expect(await stored(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      await expectV1Intact(store);

      faults.replaceWrites.clear();
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await stored(store, "v2:allow")).toStrictEqual(ALLOW_V2);
    });

    it("keeps the copy that landed when the next write rejects, and finishes later", async () => {
      const { faults, store } = await seeded();
      faults.rejectWrite = faults.writes + 2;
      await expect(migrateStorage(store)).rejects.toThrow();
      expect(await stored(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await stored(store, "v2:allow")).toBeUndefined();
      await expectV1Intact(store);

      faults.rejectWrite = undefined;
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await stored(store, "v2:settings")).toStrictEqual(SETTINGS_V2);
      expect(await stored(store, "v2:allow")).toStrictEqual(ALLOW_V2);
    });

    it("keeps the v1 data when the first write rejects, and copies the other key", async () => {
      const { faults, store } = await seeded();
      faults.rejectWrite = faults.writes + 1;
      await expect(migrateStorage(store)).rejects.toThrow();
      expect(await stored(store, "v2:settings")).toBeUndefined();
      expect(await stored(store, "v2:allow")).toStrictEqual(ALLOW_V2);
      await expectV1Intact(store);
    });
  });
}
