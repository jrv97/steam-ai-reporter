import { describe, expect, it } from "vitest";
import { API_BREAKER_KEY } from "../../src/core/detect/breaker";
import type { JsonValue } from "../../src/core/json";
import type { KeyValueStore } from "../../src/core/ports";
import { allowFromV1, migrateStorage, settingsFromV1 } from "../../src/core/settings/migrate";
import { DEFAULT_SETTINGS, encodeSettings, parseSettings } from "../../src/core/settings/settings";
import { CACHE_SCHEMA, META_KEY, verdictKey } from "../../src/core/storage-keys";
import { make } from "../helpers/factory";
import { readKey } from "../helpers/store-read";

// What the version that stored layout v1 wrote: one flat settings object, and one object from app
// ID to name and date. `ARC` and `COURAGE` are two games a person ignored.
const ARC_ID = String(make.appId());
const COURAGE_ID = String(make.appId());
const ARC = make.raw.allowEntry();
const COURAGE = make.raw.allowEntry();

const V1_DEFAULTS = make.raw.v1Settings();
const V1_CUSTOM = make.raw.v1CustomSettings();
const V1_ALLOW = make.raw.v1Allow({ [ARC_ID]: ARC, [COURAGE_ID]: COURAGE });

const PLAIN_AI = { enabled: true, badge: true, banner: true, filter: "off" };
const DEFAULT_KINDS = make.raw.v2Kinds(PLAIN_AI);
const CUSTOM_AI = { enabled: true, badge: false, banner: true, filter: "hide" };
const NO_GAMES = make.raw.noGames();

/** Rows for `it.each`, one stored value that is not an object each. */
const JUNK = make.raw.junk().map((junk) => [junk] as const);

async function seed(
  store: KeyValueStore,
  entries: Readonly<Record<string, JsonValue>>,
): Promise<void> {
  await store.set(new Map(Object.entries(entries)));
}

/**
 * What the move from the v1 settings and ignore list to the v2 keys does on every storage port,
 * from realistic v1 samples: defaults, customized, partial, corrupt and empty. `harness` returns a
 * new, empty store for each case.
 */
export function migrationContract(name: string, harness: () => KeyValueStore): void {
  describe(`migration contract: ${name}`, () => {
    it("copies default v1 settings and an empty list to the v2 keys, removing no key", async () => {
      const store = harness();
      await seed(store, { "v1:settings": V1_DEFAULTS, "v1:allow": {} });
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await readKey(store, "v2:settings")).toStrictEqual({
        locale: "auto",
        debug: false,
        kinds: DEFAULT_KINDS,
      });
      expect(await readKey(store, "v2:allow")).toStrictEqual(NO_GAMES);
      expect([...(await store.keys())].toSorted()).toStrictEqual([
        "v1:allow",
        "v1:settings",
        "v2:allow",
        "v2:settings",
      ]);
    });

    it("maps customized v1 settings into the AI kind and keeps the global ones", async () => {
      const store = harness();
      await seed(store, { "v1:settings": V1_CUSTOM });
      await migrateStorage(store);
      expect(await readKey(store, "v2:settings")).toStrictEqual({
        locale: "es",
        debug: true,
        kinds: { ...DEFAULT_KINDS, ai: CUSTOM_AI },
      });
      expect(await readKey(store, "v1:settings")).toStrictEqual(V1_CUSTOM);
    });

    it("puts every ignored game in the AI scope, and none in the scope for all kinds", async () => {
      const store = harness();
      await seed(store, { "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      expect(await readKey(store, "v2:allow")).toStrictEqual({
        ...NO_GAMES,
        ai: { [ARC_ID]: ARC, [COURAGE_ID]: COURAGE },
      });
      expect(await readKey(store, "v1:allow")).toStrictEqual(V1_ALLOW);
    });

    it("migrates a customized install as the settings read it", async () => {
      const store = harness();
      await seed(store, { "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      expect(parseSettings(await readKey(store, "v2:settings"))).toStrictEqual(
        make.settings.kind(
          "ai",
          { badge: false, filter: "hide" },
          make.settings({ locale: "es", debug: true }),
        ),
      );
    });

    it("fills the fields a partial v1 object lacks with their defaults", async () => {
      const store = harness();
      await seed(store, { "v1:settings": { badges: false, locale: "es" } });
      await migrateStorage(store);
      expect(parseSettings(await readKey(store, "v2:settings"))).toStrictEqual(
        make.settings.kind("ai", { badge: false }, make.settings({ locale: "es" })),
      );
    });

    it("falls back per field on corrupt v1 settings and drops corrupt list entries", async () => {
      const store = harness();
      await seed(store, {
        "v1:settings": make.raw.v1Settings({
          badges: "no",
          banner: false,
          listFilter: "blur",
          locale: "x y",
          debug: 1,
        }),
        "v1:allow": {
          [ARC_ID]: ARC,
          [String(make.appId())]: { name: make.text.name() },
          "abc": ARC,
          [COURAGE_ID]: make.text.note(),
        },
      });
      await migrateStorage(store);
      expect(parseSettings(await readKey(store, "v2:settings"))).toStrictEqual(
        make.settings.kind("ai", { banner: false }),
      );
      expect(await readKey(store, "v2:allow")).toStrictEqual({
        ...NO_GAMES,
        ai: { [ARC_ID]: ARC },
      });
    });

    it.each([...JUNK, [[V1_CUSTOM]] as const])(
      "turns %j, which is not an object, into defaults and an empty list",
      async (junk) => {
        const store = harness();
        await seed(store, { "v1:settings": junk, "v1:allow": junk });
        expect(await migrateStorage(store)).toBe("migrated");
        expect(parseSettings(await readKey(store, "v2:settings"))).toStrictEqual(DEFAULT_SETTINGS);
        expect(await readKey(store, "v2:allow")).toStrictEqual(NO_GAMES);
      },
    );

    it("writes nothing when the store holds no v1 data", async () => {
      const store = harness();
      expect(await migrateStorage(store)).toBe("current");
      expect(await store.keys()).toStrictEqual([]);
    });

    it("never removes a key from a customized install", async () => {
      const store = harness();
      await seed(store, { "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      const before = await store.keys();
      await migrateStorage(store);
      expect(await store.keys()).toStrictEqual(expect.arrayContaining([...before]));
    });

    it("is idempotent: a second run changes nothing", async () => {
      const store = harness();
      await seed(store, { "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      const settings = await readKey(store, "v2:settings");
      const allow = await readKey(store, "v2:allow");
      expect(await migrateStorage(store)).toBe("current");
      expect(await migrateStorage(store)).toBe("current");
      expect(await readKey(store, "v2:settings")).toStrictEqual(settings);
      expect(await readKey(store, "v2:allow")).toStrictEqual(allow);
    });

    it("keeps v2 data a person changed, and leaves the v1 keys as they are", async () => {
      const store = harness();
      await seed(store, { "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      await migrateStorage(store);
      const changed = encodeSettings(make.settings.kind("ai", { banner: false }));
      await seed(store, { "v2:settings": changed, "v1:settings": V1_DEFAULTS });
      expect(await migrateStorage(store)).toBe("current");
      expect(await readKey(store, "v2:settings")).toStrictEqual(changed);
      expect(await readKey(store, "v1:settings")).toStrictEqual(V1_DEFAULTS);
    });

    it.each(JUNK)(
      "replaces a corrupt v2 value %j with the v1 data and keeps the v1 keys",
      async (corrupt) => {
        const store = harness();
        await seed(store, {
          "v2:settings": corrupt,
          "v2:allow": corrupt,
          "v1:settings": V1_CUSTOM,
          "v1:allow": V1_ALLOW,
        });
        expect(await migrateStorage(store)).toBe("migrated");
        expect(await readKey(store, "v2:settings")).toStrictEqual(
          encodeSettings(settingsFromV1(V1_CUSTOM)),
        );
        expect(await readKey(store, "v2:allow")).toStrictEqual(allowFromV1(V1_ALLOW));
        expect(await readKey(store, "v1:settings")).toStrictEqual(V1_CUSTOM);
        expect(await readKey(store, "v1:allow")).toStrictEqual(V1_ALLOW);
      },
    );

    it.each(JUNK)(
      "leaves a corrupt v2 value %j alone when there is no v1 data to copy",
      async (corrupt) => {
        const store = harness();
        await seed(store, { "v2:settings": corrupt, "v2:allow": corrupt });
        expect(await migrateStorage(store)).toBe("current");
        expect(await readKey(store, "v2:settings")).toStrictEqual(corrupt);
        expect(await readKey(store, "v2:allow")).toStrictEqual(corrupt);
      },
    );

    it("keeps a usable v2 value over any v1 value, even one that is mostly defaults", async () => {
      const store = harness();
      await seed(store, { "v2:settings": {}, "v2:allow": {}, "v1:settings": V1_CUSTOM });
      expect(await migrateStorage(store)).toBe("current");
      expect(await readKey(store, "v2:settings")).toStrictEqual({});
      expect(parseSettings(await readKey(store, "v2:settings"))).toStrictEqual(DEFAULT_SETTINGS);
    });

    it("finishes a run that stopped after one key, converting only the missing one", async () => {
      const store = harness();
      const done = encodeSettings(make.settings.kind("ai", { badge: false }));
      await seed(store, { "v2:settings": done, "v1:settings": V1_CUSTOM, "v1:allow": V1_ALLOW });
      expect(await migrateStorage(store)).toBe("migrated");
      expect(await readKey(store, "v2:settings")).toStrictEqual(done);
      expect(await readKey(store, "v2:allow")).toStrictEqual({
        ...NO_GAMES,
        ai: { [ARC_ID]: ARC, [COURAGE_ID]: COURAGE },
      });
      expect(await readKey(store, "v1:settings")).toStrictEqual(V1_CUSTOM);
      expect(await readKey(store, "v1:allow")).toStrictEqual(V1_ALLOW);
    });

    it("leaves verdicts, the meta record and the breaker alone", async () => {
      const store = harness();
      const verdict = { time: make.time(), kinds: { ai: { ...make.verdict.notDisclosed() } } };
      const others = new Map<string, JsonValue>([
        [verdictKey(make.appId()), verdict],
        [META_KEY, { schema: CACHE_SCHEMA, sweptAt: make.time() }],
        [API_BREAKER_KEY, { openUntil: make.time() }],
      ]);
      await store.set(new Map([...others, ["v1:settings", V1_CUSTOM]]));
      await migrateStorage(store);
      expect(await store.get([...others.keys()])).toStrictEqual(others);
    });
  });
}
