import { describe, expect, it } from "vitest";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { readKey } from "../../../tests/helpers/store-read";
import type { JsonValue } from "../json";
import {
  allowFromV1,
  migrateSettings,
  migrateStorage,
  readAllowValue,
  readSettingsValue,
  settingsFromV1,
} from "./migrate";
import { DEFAULT_SETTINGS, encodeSettings, parseSettings } from "./settings";

// What the version that stored layout v1 wrote: one flat settings object, and one object from app
// ID to name and date.
const V1_CUSTOM = make.raw.v1CustomSettings();
const V1_ALLOW = make.raw.v1Allow();

/** A store holding the v1 settings and ignore list only. */
function v1Store() {
  return fake.store(
    new Map<string, JsonValue>([["v1:settings", V1_CUSTOM], ["v1:allow", V1_ALLOW]]),
  );
}

migrationContract("memory", () => fake.store());

describe("migrateStorage", () => {
  it("checks, re-checks and verifies each key on its own, and never removes", async () => {
    const store = fake.loggingStore(v1Store());
    await migrateStorage(store);
    expect(store.log).toStrictEqual([
      "get v2:settings",
      "get v1:settings",
      "get v2:settings",
      "set v2:settings",
      "get v2:settings",
      "get v2:allow",
      "get v1:allow",
      "get v2:allow",
      "set v2:allow",
      "get v2:allow",
    ]);
  });

  it("reads no v1 key where v2 holds a usable value", async () => {
    const store = fake.loggingStore(
      fake.store(
        new Map<string, JsonValue>([
          ["v2:settings", encodeSettings(DEFAULT_SETTINGS)],
          ["v2:allow", make.raw.noGames()],
          ["v1:settings", V1_CUSTOM],
          ["v1:allow", V1_ALLOW],
        ]),
      ),
    );
    expect(await migrateStorage(store)).toBe("current");
    expect(store.keysRead()).toStrictEqual(["v2:settings", "v2:allow"]);
  });

  it("skips a key that another context wrote after the first read", async () => {
    const inner = v1Store();
    const changed = encodeSettings(make.settings.kind("ai", { banner: false }));
    // Another context changes the v2 settings between this run's first read and its re-read.
    const store = fake.loggingStore(inner, async (call) => {
      if (call === 3) {
        await inner.set(new Map([["v2:settings", changed]]));
      }
    });
    expect(await migrateStorage(store)).toBe("migrated");
    expect(await readKey(inner, "v2:settings")).toStrictEqual(changed);
    expect(store.log).not.toContain("set v2:settings");
    expect(store.log).toContain("set v2:allow");
  });

  it("changes nothing when another context finished the whole migration meanwhile", async () => {
    const inner = v1Store();
    const store = fake.loggingStore(inner, async (call) => {
      if (call === 3) {
        await migrateStorage(inner);
      }
    });
    expect(await migrateStorage(store)).toBe("current");
    expect(store.log.filter((line) => line.startsWith("set"))).toStrictEqual([]);
    expect(await readKey(inner, "v2:settings")).toStrictEqual(
      encodeSettings(settingsFromV1(V1_CUSTOM)),
    );
  });

  it("agrees with itself when two contexts migrate at once", async () => {
    const inner = v1Store();
    await Promise.all([migrateStorage(inner), migrateStorage(inner)]);
    expect(await readKey(inner, "v2:settings")).toStrictEqual(
      encodeSettings(settingsFromV1(V1_CUSTOM)),
    );
    expect(await readKey(inner, "v2:allow")).toStrictEqual(allowFromV1(V1_ALLOW));
    expect(await readKey(inner, "v1:settings")).toStrictEqual(V1_CUSTOM);
    expect(await readKey(inner, "v1:allow")).toStrictEqual(V1_ALLOW);
  });
});

describe("readSettingsValue and readAllowValue", () => {
  it("read only the v2 key where v2 holds a usable value, v1 data too", async () => {
    const store = fake.loggingStore(
      fake.store(
        new Map<string, JsonValue>([
          ["v2:settings", encodeSettings(DEFAULT_SETTINGS)],
          ["v1:settings", V1_CUSTOM],
          ["v2:allow", make.raw.noGames()],
          ["v1:allow", V1_ALLOW],
        ]),
      ),
    );
    expect(await readSettingsValue(store)).toStrictEqual(encodeSettings(DEFAULT_SETTINGS));
    expect(await readAllowValue(store)).toStrictEqual(make.raw.noGames());
    expect(store.log).toStrictEqual(["get v2:settings", "get v2:allow"]);
  });

  it("read the v1 key only after v2 is absent, and read nothing on a fresh install", async () => {
    const store = fake.loggingStore(fake.store());
    expect(await readSettingsValue(store)).toBeUndefined();
    expect(await readAllowValue(store)).toBeUndefined();
    expect(store.log).toStrictEqual([
      "get v2:settings",
      "get v1:settings",
      "get v2:allow",
      "get v1:allow",
    ]);
  });

  it("read the v1 key when v2 is unusable, and return it where v1 has nothing", async () => {
    const corrupt = make.raw.corruptText();
    const store = fake.loggingStore(fake.store(new Map([["v2:settings", corrupt]])));
    expect(await readSettingsValue(store)).toBe(corrupt);
    expect(store.log).toStrictEqual(["get v2:settings", "get v1:settings"]);
  });

  it("migrate when only v1 data exists, and read what they wrote", async () => {
    const store = v1Store();
    expect(await readSettingsValue(store)).toStrictEqual(encodeSettings(settingsFromV1(V1_CUSTOM)));
    expect(await readAllowValue(store)).toStrictEqual(allowFromV1(V1_ALLOW));
  });

  it("migrate a corrupt v2 value from v1, one key without the other", async () => {
    const store = v1Store();
    await store.set(new Map([["v2:settings", make.raw.corruptText()]]));
    expect(await readSettingsValue(store)).toStrictEqual(encodeSettings(settingsFromV1(V1_CUSTOM)));
    expect(await readKey(store, "v2:allow")).toBeUndefined();
  });
});

describe("migrateSettings", () => {
  it("shares one run between callers that ask while it runs", async () => {
    const store = fake.countingStore(fake.store(new Map([["v1:settings", V1_CUSTOM]])));
    const [first, second] = await Promise.all([migrateSettings(store), migrateSettings(store)]);
    expect([first, second]).toStrictEqual(["migrated", "migrated"]);
    expect(store.calls.set).toBe(1);
  });

  it("forgets a run once it settles, so a v1 key that appears later is copied", async () => {
    const store = fake.store();
    expect(await migrateSettings(store)).toBe("current");
    await store.set(new Map([["v1:settings", V1_CUSTOM]]));
    expect(await migrateSettings(store)).toBe("migrated");
    expect(parseSettings(await readKey(store, "v2:settings")).locale).toBe(V1_CUSTOM.locale);
  });

  it("runs again for another store", async () => {
    const one = fake.store(new Map([["v1:settings", V1_CUSTOM]]));
    const two = fake.store(new Map([["v1:settings", make.raw.v1Settings()]]));
    await migrateSettings(one);
    expect(await migrateSettings(two)).toBe("migrated");
    expect(parseSettings(await readKey(two, "v2:settings"))).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("forgets a failed run, so the next call tries again", async () => {
    const store = fake.countingStore(fake.store(new Map([["v1:settings", V1_CUSTOM]])));
    store.break();
    await expect(migrateSettings(store)).rejects.toThrow();
    store.heal();
    expect(await migrateSettings(store)).toBe("migrated");
  });
});

describe("settingsFromV1 and allowFromV1", () => {
  it("map the v1 fields into the AI kind, the other kinds as on a fresh install", () => {
    expect(settingsFromV1(V1_CUSTOM)).toStrictEqual({
      ...DEFAULT_SETTINGS,
      locale: V1_CUSTOM.locale,
      debug: V1_CUSTOM.debug,
      kinds: {
        ...make.settings.plain({ enabled: true, badge: true, banner: true, filter: "off" }),
        ai: { enabled: true, badge: false, banner: true, filter: "hide" },
      },
    });
    expect(settingsFromV1(undefined)).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("put the v1 list in the AI scope, and nothing for a corrupt one", () => {
    expect(allowFromV1(V1_ALLOW)).toStrictEqual({ ...make.raw.noGames(), ai: V1_ALLOW });
    const junk = make.raw.junk();
    expect(junk.map((value) => allowFromV1(value))).toStrictEqual(
      junk.map(() => make.raw.noGames()),
    );
  });
});
