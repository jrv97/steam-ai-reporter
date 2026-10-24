import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/json";
import type { KeyValueStore } from "../../src/core/ports";
import { migrateStorage } from "../../src/core/settings/migrate";
import {
  DEFAULT_SETTINGS,
  encodeSettings,
  parseSettings,
  withKind,
} from "../../src/core/settings/settings";

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

const PLAIN_AI = { enabled: true, badge: true, banner: true, filter: "off" };

async function seed(
  store: KeyValueStore,
  entries: Readonly<Record<string, JsonValue>>,
): Promise<void> {
  await store.set(new Map(Object.entries(entries)));
}

async function stored(store: KeyValueStore, key: string): Promise<unknown> {
  return (await store.get([key])).get(key);
}

/**
 * What the move from the v1 settings and ignore list to the v2 keys does on every storage port,
 * from realistic v1 samples: defaults, customized, partial, corrupt and empty. `make` returns a
 * new, empty store for each case.
 */
export function migrationContract(name: string, make: () => KeyValueStore): void {
  describe(`migration contract: ${name}`, () => {
    it("moves default v1 settings and an empty list to the v2 keys", async () => {
      const store = make();
      await seed(store, { "v1:settings": V1_DEFAULTS, "v1:allow": {} });
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await stored(store, "v2:settings")).toStrictEqual({
        locale: "auto",
        debug: false,
        kinds: { ai: PLAIN_AI },
      });
      expect(await stored(store, "v2:allow")).toStrictEqual({ all: {}, ai: {} });
      expect([...(await store.keys())].toSorted()).toStrictEqual(["v2:allow", "v2:settings"]);
    });

    it("maps customized v1 settings into the AI kind and keeps the global ones", async () => {
      const store = make();
      await seed(store, { "v1:settings": V1_CUSTOM });
      await migrateStorage(store);
      expect(await stored(store, "v2:settings")).toStrictEqual({
        locale: "es",
        debug: true,
        kinds: { ai: { enabled: true, badge: false, banner: true, filter: "hide" } },
      });
      expect(await stored(store, "v1:settings")).toBeUndefined();
    });

    it("puts every ignored game in the AI scope, and none in the scope for all kinds", async () => {
      const store = make();
      await seed(store, { "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      expect(await stored(store, "v2:allow")).toStrictEqual({
        all: {},
        ai: { "1808500": ARC, "5072580": COURAGE },
      });
      expect(await stored(store, "v1:allow")).toBeUndefined();
    });

    it("migrates a customized install as the settings read it", async () => {
      const store = make();
      await seed(store, { "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      expect(parseSettings(await stored(store, "v2:settings"))).toStrictEqual(
        withKind({ ...DEFAULT_SETTINGS, locale: "es", debug: true }, "ai", {
          badge: false,
          filter: "hide",
        }),
      );
    });

    it("fills the fields a partial v1 object lacks with their defaults", async () => {
      const store = make();
      await seed(store, { "v1:settings": { badges: false, locale: "es" } });
      await migrateStorage(store);
      expect(parseSettings(await stored(store, "v2:settings"))).toStrictEqual(
        withKind({ ...DEFAULT_SETTINGS, locale: "es" }, "ai", { badge: false }),
      );
    });

    it("falls back per field on corrupt v1 settings and drops corrupt list entries", async () => {
      const store = make();
      await seed(store, {
        "v1:settings": { badges: "no", banner: false, listFilter: "blur", locale: "x y", debug: 1 },
        "v1:allow": {
          "1808500": ARC,
          "20": { name: "No date" },
          "abc": ARC,
          "5072580": "text",
        },
      });
      await migrateStorage(store);
      expect(parseSettings(await stored(store, "v2:settings"))).toStrictEqual(
        withKind(DEFAULT_SETTINGS, "ai", { banner: false }),
      );
      expect(await stored(store, "v2:allow")).toStrictEqual({ all: {}, ai: { "1808500": ARC } });
    });

    it("turns values that are not objects into defaults and an empty list", async () => {
      for (const junk of ["garbage", 7, null, true, [], [V1_CUSTOM]]) {
        const store = make();
        await seed(store, { "v1:settings": junk, "v1:allow": junk });
        expect(await migrateStorage(store)).toBe("migrated");
        expect(parseSettings(await stored(store, "v2:settings"))).toStrictEqual(DEFAULT_SETTINGS);
        expect(await stored(store, "v2:allow")).toStrictEqual({ all: {}, ai: {} });
      }
    });

    it("writes nothing when the store holds no v1 data", async () => {
      const store = make();
      expect(await migrateStorage(store)).toBe("current");
      expect(await store.keys()).toStrictEqual([]);
    });

    it("is idempotent: a second run changes nothing", async () => {
      const store = make();
      await seed(store, { "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      const settings = await stored(store, "v2:settings");
      const allow = await stored(store, "v2:allow");
      expect(await migrateStorage(store)).toBe("current");
      expect(await migrateStorage(store)).toBe("current");
      expect(await stored(store, "v2:settings")).toStrictEqual(settings);
      expect(await stored(store, "v2:allow")).toStrictEqual(allow);
    });

    it("keeps v2 data the user changed, and drops the v1 keys that came back", async () => {
      const store = make();
      await seed(store, { "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      const changed = encodeSettings(withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
      await seed(store, { "v2:settings": changed, "v1:settings": V1_DEFAULTS });
      expect(await migrateStorage(store)).toBe("current");
      expect(await stored(store, "v2:settings")).toStrictEqual(changed);
      expect(await stored(store, "v1:settings")).toBeUndefined();
    });

    it("finishes a run that stopped after one key, converting only the missing one", async () => {
      const store = make();
      const done = encodeSettings(withKind(DEFAULT_SETTINGS, "ai", { badge: false }));
      await seed(store, { "v2:settings": done, "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await stored(store, "v2:settings")).toStrictEqual(done);
      expect(await stored(store, "v2:allow")).toStrictEqual({
        all: {},
        ai: { "1808500": ARC, "5072580": COURAGE },
      });
      expect(await stored(store, "v1:settings")).toBeUndefined();
      expect(await stored(store, "v1:allow")).toBeUndefined();
    });

    it("leaves verdicts, the meta record and the breaker alone", async () => {
      const store = make();
      const others = {
        "v1:a:1808500": { time: T, kinds: { ai: { state: "not-disclosed", source: "api" } } },
        "v1:meta": { schema: 2, sweptAt: T },
        "v1:breaker": { openUntil: T },
      };
      await seed(store, { ...others, "v1:settings": V1_CUSTOM });
      await migrateStorage(store);
      for (const [key, value] of Object.entries(others)) {
        expect(await stored(store, key)).toStrictEqual(value);
      }
    });
  });
}
