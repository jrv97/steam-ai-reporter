import { describe, expect, it } from "vitest";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { countingStore } from "../../../tests/helpers/counting-store";
import { memoryStore } from "../../../tests/helpers/memory-store";
import type { JsonValue } from "../json";
import type { KeyValueStore } from "../ports";
import {
  allowFromV1,
  migrateOnce,
  migrateStorage,
  readAllowValue,
  readSettingsValue,
  settingsFromV1,
} from "./migrate";
import { DEFAULT_SETTINGS, encodeSettings, parseSettings, withKind } from "./settings";

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

/** A store that logs its calls and runs `before(call)` ahead of the nth `get`, to interleave. */
function loggingStore(
  inner: KeyValueStore,
  log: string[],
  before: (getCall: number) => Promise<void> = () => Promise.resolve(),
): KeyValueStore {
  let gets = 0;
  return {
    async get(keys) {
      gets += 1;
      await before(gets);
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
}

describe("migrateStorage", () => {
  it("re-reads each key before it sets it, verifies the copies and never removes", async () => {
    const log: string[] = [];
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]));
    await migrateStorage(loggingStore(inner, log));
    expect(log).toStrictEqual([
      "get v1:settings,v2:settings,v1:allow,v2:allow",
      "get v2:settings",
      "set v2:settings",
      "get v2:allow",
      "set v2:allow",
      "get v2:settings,v2:allow",
    ]);
  });

  it("skips a key that another context wrote after the first read", async () => {
    const log: string[] = [];
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]));
    const changed = encodeSettings(withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
    // The user changes the v2 settings between this run's first read and its re-read.
    const store = loggingStore(inner, log, async (call) => {
      if (call === 2) {
        await inner.set(new Map([["v2:settings", changed]]));
      }
    });
    expect(await migrateStorage(store)).toBe("migrated");
    expect(await stored(inner, "v2:settings")).toStrictEqual(changed);
    expect(log).not.toContain("set v2:settings");
    expect(log).toContain("set v2:allow");
  });

  it("changes nothing when another context finished the whole migration meanwhile", async () => {
    const log: string[] = [];
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]));
    const store = loggingStore(inner, log, async (call) => {
      if (call === 2) {
        await migrateStorage(inner);
      }
    });
    const settings = encodeSettings(settingsFromV1(V1_CUSTOM));
    expect(await migrateStorage(store)).toBe("current");
    expect(log.filter((line) => line.startsWith("set"))).toStrictEqual([]);
    expect(await stored(inner, "v2:settings")).toStrictEqual(settings);
  });

  it("agrees with itself when two contexts migrate at once", async () => {
    const inner = memoryStore(new Map([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]));
    await Promise.all([migrateStorage(inner), migrateStorage(inner)]);
    expect(await stored(inner, "v2:settings")).toStrictEqual(
      encodeSettings(settingsFromV1(V1_CUSTOM)),
    );
    expect(await stored(inner, "v2:allow")).toStrictEqual(allowFromV1(V1_ALLOW));
    expect(await stored(inner, "v1:settings")).toStrictEqual(V1_CUSTOM);
    expect(await stored(inner, "v1:allow")).toStrictEqual(V1_ALLOW);
  });
});

describe("readSettingsValue and readAllowValue", () => {
  it("make one storage read when v2 data exists, v1 data too", async () => {
    const store = countingStore(
      memoryStore(
        new Map<string, JsonValue>([
          ["v2:settings", encodeSettings(DEFAULT_SETTINGS)],
          ["v1:settings", V1_CUSTOM],
          ["v2:allow", { all: {}, ai: {} }],
          ["v1:allow", V1_ALLOW],
        ]),
      ),
    );
    expect(await readSettingsValue(store)).toStrictEqual(encodeSettings(DEFAULT_SETTINGS));
    expect(await readAllowValue(store)).toStrictEqual({ all: {}, ai: {} });
    expect(store.calls).toStrictEqual({ get: 2, set: 0, remove: 0, keys: 0 });
  });

  it("make one storage read on a fresh install, and read nothing", async () => {
    const store = countingStore(memoryStore());
    expect(await readSettingsValue(store)).toBeUndefined();
    expect(await readAllowValue(store)).toBeUndefined();
    expect(store.calls).toStrictEqual({ get: 2, set: 0, remove: 0, keys: 0 });
  });

  it("migrate when only v1 data exists, and read what they wrote", async () => {
    const store = memoryStore(new Map([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]));
    expect(await readSettingsValue(store)).toStrictEqual(encodeSettings(settingsFromV1(V1_CUSTOM)));
    expect(await readAllowValue(store)).toStrictEqual(allowFromV1(V1_ALLOW));
  });
});

describe("migrateOnce", () => {
  it("runs once per store, however many callers ask", async () => {
    const store = countingStore(memoryStore(new Map([["v1:settings", V1_CUSTOM]])));
    const [first, second] = await Promise.all([migrateOnce(store), migrateOnce(store)]);
    await migrateOnce(store);
    expect([first, second]).toStrictEqual(["migrated", "migrated"]);
    expect(store.calls.set).toBe(1);
    expect(store.calls.get).toBe(3);
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
