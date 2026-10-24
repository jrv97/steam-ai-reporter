import { describe, expect, it } from "vitest";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { countingStore } from "../../../tests/helpers/counting-store";
import { memoryStore } from "../../../tests/helpers/memory-store";
import type { JsonValue } from "../json";
import type { KeyValueStore } from "../ports";
import { allowFromV1, migrateOnce, migrateStorage, settingsFromV1 } from "./migrate";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

const T = 1_000_000_000_000;

// What the version that stored layout v1 wrote: one flat settings object, and one object from app
// ID to name and date. `ARC` and `COURAGE` are two games the user ignored.
const ARC = { name: "ARC Raiders", added: T };
const COURAGE = { name: "Courage and Faith: Into the Dark Woods", added: T + 86_400_000 };

const V1_DEFAULTS: JsonValue = {
  badges: true,
  banner: true,
  listFilter: "off",
  locale: "auto",
  debug: false,
};
const V1_CUSTOM: JsonValue = {
  badges: false,
  banner: true,
  listFilter: "hide",
  locale: "es",
  debug: true,
};
const V1_ALLOW: JsonValue = { "1808500": ARC, "5072580": COURAGE };

async function stored(store: KeyValueStore, key: string): Promise<unknown> {
  return (await store.get([key])).get(key);
}

migrationContract("memory", () => memoryStore());

describe("migrateStorage under storage faults", () => {
  it("reads before it writes, writes before it verifies, and removes v1 last", async () => {
    const log: string[] = [];
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]));
    const store: KeyValueStore = {
      get(keys) {
        log.push(`get ${keys.join(",")}`);
        return inner.get(keys);
      },
      set(entries) {
        log.push(`set ${[...entries.keys()].join(",")}`);
        return inner.set(entries);
      },
      remove(keys) {
        log.push(`remove ${keys.join(",")}`);
        return inner.remove(keys);
      },
      keys: () => inner.keys(),
    };
    await migrateStorage(store);
    expect(log).toStrictEqual([
      "get v1:settings,v2:settings,v1:allow,v2:allow",
      "set v2:settings,v2:allow",
      "get v2:settings,v2:allow",
      "remove v1:settings,v1:allow",
    ]);
  });

  it("keeps the v1 data and clears the v2 keys when the write does not read back", async () => {
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]));
    const dropping: KeyValueStore = {
      get: (keys) => inner.get(keys),
      set: (entries) => inner.set(new Map([...entries].filter(([key]) => key !== "v2:allow"))),
      remove: (keys) => inner.remove(keys),
      keys: () => inner.keys(),
    };
    await expect(migrateStorage(dropping)).rejects.toThrow();
    expect(await stored(inner, "v1:settings")).toStrictEqual(V1_CUSTOM);
    expect(await stored(inner, "v1:allow")).toStrictEqual(V1_ALLOW);
    expect(await stored(inner, "v2:settings")).toBeUndefined();
    expect(await migrateStorage(inner)).toBe("migrated");
    expect(parseSettings(await stored(inner, "v2:settings")).locale).toBe("es");
  });

  it("keeps the v1 data when the write fails, and migrates on the next try", async () => {
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM]]));
    const failing: KeyValueStore = {
      get: (keys) => inner.get(keys),
      set: () => Promise.reject(new Error()),
      remove: (keys) => inner.remove(keys),
      keys: () => inner.keys(),
    };
    await expect(migrateStorage(failing)).rejects.toThrow();
    expect(await stored(inner, "v1:settings")).toStrictEqual(V1_CUSTOM);
    expect(await stored(inner, "v2:settings")).toBeUndefined();
    expect(await migrateStorage(inner)).toBe("migrated");
  });

  it("keeps v2 when removing the v1 keys fails, and finishes the cleanup next time", async () => {
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM]]));
    const failing: KeyValueStore = {
      get: (keys) => inner.get(keys),
      set: (entries) => inner.set(entries),
      remove: () => Promise.reject(new Error()),
      keys: () => inner.keys(),
    };
    await expect(migrateStorage(failing)).rejects.toThrow();
    expect(parseSettings(await stored(inner, "v2:settings")).locale).toBe("es");
    expect(await stored(inner, "v1:settings")).toStrictEqual(V1_CUSTOM);
    expect(await migrateStorage(inner)).toBe("current");
    expect(await stored(inner, "v1:settings")).toBeUndefined();
  });
});

describe("migrateOnce", () => {
  it("runs once per store, however many callers ask", async () => {
    const store = countingStore(memoryStore(new Map([["v1:settings", V1_CUSTOM]])));
    const [first, second] = await Promise.all([migrateOnce(store), migrateOnce(store)]);
    await migrateOnce(store);
    expect([first, second]).toStrictEqual(["migrated", "migrated"]);
    expect(store.calls.set).toBe(1);
    expect(store.calls.get).toBe(2);
  });

  it("runs again for another store", async () => {
    const one = memoryStore(new Map([["v1:settings", V1_CUSTOM]]));
    const two = memoryStore(new Map([["v1:settings", V1_DEFAULTS]]));
    await migrateOnce(one);
    expect(await migrateOnce(two)).toBe("migrated");
    expect(parseSettings(await stored(two, "v2:settings"))).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("forgets a failed run, so the next call tries again", async () => {
    const store = countingStore(memoryStore(new Map([["v1:settings", V1_CUSTOM]])));
    store.break();
    await expect(migrateOnce(store)).rejects.toThrow();
    store.heal();
    expect(await migrateOnce(store)).toBe("migrated");
  });
});

describe("settingsFromV1 and allowFromV1", () => {
  it("map the v1 fields into the AI kind", () => {
    expect(settingsFromV1(V1_CUSTOM)).toStrictEqual({
      locale: "es",
      debug: true,
      kinds: { ai: { enabled: true, badge: false, banner: true, filter: "hide" } },
    });
    expect(settingsFromV1(undefined)).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("put the v1 list in the AI scope", () => {
    expect(allowFromV1(V1_ALLOW)).toStrictEqual({
      all: {},
      ai: { "1808500": ARC, "5072580": COURAGE },
    });
    expect(allowFromV1("garbage")).toStrictEqual({ all: {}, ai: {} });
  });
});
