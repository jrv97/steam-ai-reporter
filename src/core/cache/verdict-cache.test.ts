import { describe, expect, it } from "vitest";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { countingStore } from "../../../tests/helpers/counting-store";
import { creatorsFor } from "../../../tests/helpers/creators";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import {
  aiVerdicts,
  disclosedVerdict,
  NOT_DISCLOSED,
  uniformVerdicts,
} from "../../../tests/helpers/verdicts";
import type { JsonValue } from "../json";
import { AI_KIND, type AiVerdict } from "../kinds/ai";
import { perKind } from "../kinds/registry";
import { type KindVerdicts, withRelations } from "../kinds/verdicts";
import { type AppId, UNKNOWN } from "../types";
import { TRANSIENT_TTL_MS, UNKNOWN_TTL_MS } from "./ttl";
import { createVerdictCache } from "./verdict-cache";

const T = 1_000_000_000_000;
const FULL = uniformVerdicts("disclosed");
const { disclosed: DISCLOSED_TTL_MS, notDisclosed: NOT_DISCLOSED_TTL_MS } = AI_KIND.ttl;

function setup(capacity?: number) {
  const store = countingStore(memoryStore());
  const clock = fixedClock(T);
  return {
    store,
    clock,
    cache: createVerdictCache(store, clock, capacity),
    /** Another tab: a cache with its own memory over the same storage. */
    another: () => createVerdictCache(store, clock, capacity),
  };
}

describe("VerdictCache", () => {
  it("returns saved verdicts from memory without reading storage", async () => {
    const { cache, store } = setup();
    const verdicts = aiVerdicts(disclosedVerdict());
    await cache.save(new Map([[appId(10), verdicts]]));
    expect(await cache.lookup(appIds(10))).toStrictEqual(new Map([[10, verdicts]]));
    expect(store.calls.get).toBe(0);
  });

  it("keeps what an app is related to in memory and for another tab", async () => {
    const { cache, another, store } = setup();
    const verdicts = withRelations(aiVerdicts(disclosedVerdict()), {
      parent: appId(1808500),
      creators: creatorsFor({ developers: [["Valve", 4]], publishers: ["Embark Studios"] }),
    });
    await cache.save(new Map([[appId(5201760), verdicts]]));
    expect((await cache.lookup(appIds(5201760))).get(appId(5201760))).toStrictEqual(verdicts);
    const tab = another();
    expect((await tab.lookup(appIds(5201760))).get(appId(5201760))).toStrictEqual(verdicts);
    expect(store.calls.get).toBe(1);
  });

  it("serves another tab from storage and then from its memory", async () => {
    const { cache, another, store } = setup();
    const verdicts = aiVerdicts(disclosedVerdict({ language: "german" }));
    await cache.save(new Map([[appId(10), verdicts]]));
    const tab = another();
    expect(await tab.lookup(appIds(10))).toStrictEqual(new Map([[10, verdicts]]));
    expect(store.calls.get).toBe(1);
    await tab.lookup(appIds(10));
    expect(store.calls.get).toBe(1);
  });

  it("stores one entry per app, holding the fetch time and a verdict for each kind", async () => {
    const { cache, store } = setup();
    await cache.save(new Map([[appId(10), uniformVerdicts("not-disclosed")]]));
    const entry = { time: T, kinds: perKind(() => ({ state: "not-disclosed", source: "api" })) };
    expect(await store.get(["v1:a:10"])).toStrictEqual(new Map([["v1:a:10", entry]]));
  });

  it("keeps the language the notes were fetched in", async () => {
    const { cache, another } = setup();
    const verdicts = aiVerdicts(disclosedVerdict({ language: "spanish", notes: "Arte generado." }));
    await cache.save(new Map([[appId(10), verdicts]]));
    const got = (await another().lookup(appIds(10))).get(appId(10));
    expect(got).toStrictEqual(verdicts);
  });

  it("answers only the fresh IDs and leaves the rest out", async () => {
    const { cache, another } = setup();
    await cache.save(new Map([[appId(10), aiVerdicts(NOT_DISCLOSED)]]));
    const got = await another().lookup(appIds(10, 20));
    expect([...got.keys()]).toStrictEqual([10]);
  });

  it("reads storage once for a whole batch and writes it once", async () => {
    const { cache, another, store } = setup();
    const ids = Array.from({ length: 50 }, (_, n) => appId(1000 + n));
    await cache.save(new Map(ids.map((id) => [id, aiVerdicts(NOT_DISCLOSED)])));
    expect(store.calls.set).toBe(1);
    expect(store.calls.get).toBe(0);

    const found = await another().lookup([...ids, appId(2000)]);
    expect(found.size).toBe(50);
    expect(store.calls.get).toBe(1);
    expect(store.gets[0]).toHaveLength(51);
  });

  it("asks storage only for the IDs memory does not hold", async () => {
    const { cache, another, store } = setup();
    await cache.save(
      new Map<AppId, KindVerdicts>([
        [appId(1), aiVerdicts(NOT_DISCLOSED)],
        [appId(2), aiVerdicts(NOT_DISCLOSED)],
      ]),
    );
    const tab = another();
    await tab.lookup(appIds(1));
    await tab.lookup(appIds(1, 2));
    expect(store.gets).toStrictEqual([["v1:a:1"], ["v1:a:2"]]);
  });

  it("makes no storage call for nothing to look up or to save", async () => {
    const { cache, store } = setup();
    expect(await cache.lookup([])).toStrictEqual(new Map());
    await cache.save(new Map());
    expect(store.calls).toStrictEqual({ get: 0, set: 0, remove: 0, keys: 0 });
  });

  it.each(
    [
      ["holds the section", ["basic_info", "platforms"], true],
      ["lacks the section", ["basic_info"], false],
      ["came without GetItems details", undefined, true],
    ] as const,
  )("serves an entry that %s to a lookup that needs it: %s", async (_n, had, hit) => {
    const { cache, another } = setup();
    const verdicts = had === undefined ? FULL : { ...FULL, sections: had };
    await cache.save(new Map([[appId(10), verdicts]]));
    for (const tab of [cache, another()]) {
      expect((await tab.lookup(appIds(10), ["platforms"])).has(appId(10))).toBe(hit);
      expect((await tab.lookup(appIds(10))).has(appId(10))).toBe(true);
    }
  });

  describe("TTL edges", () => {
    const cases: readonly (readonly [string, KindVerdicts, number])[] = [
      ["disclosed", uniformVerdicts("disclosed"), DISCLOSED_TTL_MS],
      ["not disclosed", uniformVerdicts("not-disclosed"), NOT_DISCLOSED_TTL_MS],
      ["unknown gated", uniformVerdicts("gated"), UNKNOWN_TTL_MS],
      ["unknown missing", uniformVerdicts("missing"), UNKNOWN_TTL_MS],
    ];

    it.each(cases)("%s: stored for its TTL, gone at exactly the TTL", async (_n, verdicts, ttl) => {
      const { cache, another, clock } = setup();
      await cache.save(new Map([[appId(10), verdicts]]));

      clock.set(T + ttl - 1);
      expect((await another().lookup(appIds(10))).has(appId(10))).toBe(true);
      expect((await cache.lookup(appIds(10))).has(appId(10))).toBe(true);

      clock.set(T + ttl);
      expect((await another().lookup(appIds(10))).has(appId(10))).toBe(false);
      expect((await cache.lookup(appIds(10))).has(appId(10))).toBe(false);
    });
  });

  describe("verdicts that are not stored", () => {
    const cases: readonly (readonly [string, AiVerdict])[] = [
      ["unknown error", UNKNOWN.error],
      ["unknown rate-limited", UNKNOWN["rate-limited"]],
    ];

    it.each(cases)("%s: page memory only, for a short while", async (_name, verdict) => {
      const { cache, another, store, clock } = setup();
      const verdicts = aiVerdicts(verdict);
      await cache.save(new Map([[appId(10), verdicts]]));
      expect(store.calls.set).toBe(0);
      expect(await store.keys()).toStrictEqual([]);
      expect(await another().lookup(appIds(10))).toStrictEqual(new Map());

      clock.set(T + TRANSIENT_TTL_MS - 1);
      expect(await cache.lookup(appIds(10))).toStrictEqual(new Map([[10, verdicts]]));
      clock.set(T + TRANSIENT_TTL_MS);
      expect(await cache.lookup(appIds(10))).toStrictEqual(new Map());
    });

    it("writes only the stored verdicts of a mixed batch", async () => {
      const { cache, store } = setup();
      const verdicts: readonly (readonly [AppId, KindVerdicts])[] = [
        [appId(1), aiVerdicts(NOT_DISCLOSED)],
        [appId(2), aiVerdicts(UNKNOWN.error)],
        [appId(3), aiVerdicts(UNKNOWN.gated)],
      ];
      await cache.save(new Map(verdicts));
      expect(store.calls.set).toBe(1);
      expect((await store.keys()).toSorted()).toStrictEqual(["v1:a:1", "v1:a:3"]);
    });
  });

  describe("invalid stored values", () => {
    const invalid: readonly (readonly [string, JsonValue])[] = [
      ["a string", "disclosed"],
      ["a v1 entry, one flat verdict", { ...encoded(), time: T }],
      ["an old-schema entry", { s: "d", t: T, n: "old notes" }],
      ["an unknown language", entry({ ...encoded(), language: "klingon" })],
      ["a stored error", entry({ state: "unknown", reason: "error" })],
      ["a missing time", { kinds: { ai: { state: "not-disclosed", source: "api" } } }],
      ["an entry without kinds", { time: T, kinds: {} }],
    ];

    it.each(invalid)("discards %s", async (_name, value) => {
      const store = countingStore(memoryStore(new Map([["v1:a:10", value]])));
      const cache = createVerdictCache(store, fixedClock(T));
      expect(await cache.lookup(appIds(10))).toStrictEqual(new Map());
    });
  });

  describe("memory cap", () => {
    it("evicts the least recently used entries and falls back to storage", async () => {
      const { cache, store } = setup(3);
      const ids = appIds(1, 2, 3, 4, 5);
      await cache.save(new Map(ids.map((id) => [id, aiVerdicts(NOT_DISCLOSED)])));

      await cache.lookup(appIds(5));
      expect(store.calls.get).toBe(0);

      const oldest = await cache.lookup(appIds(1));
      expect(oldest.has(appId(1))).toBe(true);
      expect(store.gets).toStrictEqual([["v1:a:1"]]);
    });

    it("never holds more than the cap in memory", async () => {
      const { cache, store } = setup(2);
      await cache.save(
        new Map(appIds(1, 2, 3, 4).map((id) => [id, aiVerdicts(UNKNOWN["rate-limited"])])),
      );
      expect((await cache.lookup(appIds(1, 2, 3, 4))).size).toBe(2);
      expect(store.calls.get).toBe(1);
    });
  });
});

/** A verdict body as stored: no time of its own. */
function encoded(): Record<string, JsonValue> {
  return { state: "disclosed", notes: "text", language: "english", source: "api" };
}

/** A stored app entry with this body for the AI kind. */
function entry(ai: JsonValue): JsonValue {
  return { time: T, kinds: { ai } };
}
