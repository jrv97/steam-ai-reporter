import { describe, expect, it } from "vitest";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import type { JsonValue } from "../json";
import { type AppId, UNKNOWN, type Verdict } from "../types";
import { DISCLOSED_TTL_MS, NOT_DISCLOSED_TTL_MS, TRANSIENT_TTL_MS, UNKNOWN_TTL_MS } from "./ttl";
import { createVerdictCache } from "./verdict-cache";

const T = 1_000_000_000_000;

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
  it("returns a saved verdict from memory without reading storage", async () => {
    const { cache, store } = setup();
    const verdict = disclosedVerdict();
    await cache.save(new Map([[appId(10), verdict]]));
    expect(await cache.lookup(appIds(10))).toStrictEqual(new Map([[10, verdict]]));
    expect(store.calls.get).toBe(0);
  });

  it("serves another tab from storage and then from its memory", async () => {
    const { cache, another, store } = setup();
    const verdict = disclosedVerdict({ language: "german" });
    await cache.save(new Map([[appId(10), verdict]]));
    const tab = another();
    expect(await tab.lookup(appIds(10))).toStrictEqual(new Map([[10, verdict]]));
    expect(store.calls.get).toBe(1);
    await tab.lookup(appIds(10));
    expect(store.calls.get).toBe(1);
  });

  it("keeps the language the notes were fetched in", async () => {
    const { cache, another } = setup();
    const verdict = disclosedVerdict({ language: "spanish", notes: "Arte generado." });
    await cache.save(new Map([[appId(10), verdict]]));
    const got = (await another().lookup(appIds(10))).get(appId(10));
    expect(got).toStrictEqual(verdict);
  });

  it("answers only the fresh IDs and leaves the rest out", async () => {
    const { cache, another } = setup();
    await cache.save(new Map([[appId(10), NOT_DISCLOSED]]));
    const got = await another().lookup(appIds(10, 20));
    expect([...got.keys()]).toStrictEqual([10]);
  });

  it("reads storage once for a whole batch and writes it once", async () => {
    const { cache, another, store } = setup();
    const ids = Array.from({ length: 50 }, (_, n) => appId(1000 + n));
    await cache.save(new Map(ids.map((id) => [id, NOT_DISCLOSED])));
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
      new Map<AppId, Verdict>([[appId(1), NOT_DISCLOSED], [appId(2), NOT_DISCLOSED]]),
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

  describe("TTL edges", () => {
    const cases: readonly (readonly [string, Verdict, number])[] = [
      ["disclosed", disclosedVerdict(), DISCLOSED_TTL_MS],
      ["not disclosed", NOT_DISCLOSED, NOT_DISCLOSED_TTL_MS],
      ["unknown gated", UNKNOWN.gated, UNKNOWN_TTL_MS],
      ["unknown missing", UNKNOWN.missing, UNKNOWN_TTL_MS],
    ];

    it.each(cases)("%s: stored for its TTL, gone at exactly the TTL", async (_n, verdict, ttl) => {
      const { cache, another, clock } = setup();
      await cache.save(new Map([[appId(10), verdict]]));

      clock.set(T + ttl - 1);
      expect((await another().lookup(appIds(10))).has(appId(10))).toBe(true);
      expect((await cache.lookup(appIds(10))).has(appId(10))).toBe(true);

      clock.set(T + ttl);
      expect((await another().lookup(appIds(10))).has(appId(10))).toBe(false);
      expect((await cache.lookup(appIds(10))).has(appId(10))).toBe(false);
    });
  });

  describe("verdicts that are not stored", () => {
    const cases: readonly (readonly [string, Verdict])[] = [
      ["unknown error", UNKNOWN.error],
      ["unknown rate-limited", UNKNOWN["rate-limited"]],
    ];

    it.each(cases)("%s: page memory only, for a short while", async (_name, verdict) => {
      const { cache, another, store, clock } = setup();
      await cache.save(new Map([[appId(10), verdict]]));
      expect(store.calls.set).toBe(0);
      expect(await store.keys()).toStrictEqual([]);
      expect(await another().lookup(appIds(10))).toStrictEqual(new Map());

      clock.set(T + TRANSIENT_TTL_MS - 1);
      expect(await cache.lookup(appIds(10))).toStrictEqual(new Map([[10, verdict]]));
      clock.set(T + TRANSIENT_TTL_MS);
      expect(await cache.lookup(appIds(10))).toStrictEqual(new Map());
    });

    it("writes only the stored verdicts of a mixed batch", async () => {
      const { cache, store } = setup();
      const verdicts: readonly (readonly [AppId, Verdict])[] = [
        [appId(1), NOT_DISCLOSED],
        [appId(2), UNKNOWN.error],
        [appId(3), UNKNOWN.gated],
      ];
      await cache.save(new Map(verdicts));
      expect(store.calls.set).toBe(1);
      expect((await store.keys()).toSorted()).toStrictEqual(["v1:a:1", "v1:a:3"]);
    });
  });

  describe("invalid stored values", () => {
    const invalid: readonly (readonly [string, JsonValue])[] = [
      ["a string", "disclosed"],
      ["an old-schema entry", { s: "d", t: T, n: "old notes" }],
      ["an unknown language", { ...encoded(), language: "klingon" }],
      ["a stored error", { state: "unknown", time: T, reason: "error" }],
      ["a missing time", { state: "not-disclosed", source: "api" }],
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
      await cache.save(new Map(ids.map((id) => [id, NOT_DISCLOSED])));

      await cache.lookup(appIds(5));
      expect(store.calls.get).toBe(0);

      const oldest = await cache.lookup(appIds(1));
      expect(oldest.has(appId(1))).toBe(true);
      expect(store.gets).toStrictEqual([["v1:a:1"]]);
    });

    it("never holds more than the cap in memory", async () => {
      const { cache, store } = setup(2);
      await cache.save(
        new Map(appIds(1, 2, 3, 4).map((id) => [id, UNKNOWN["rate-limited"]])),
      );
      expect((await cache.lookup(appIds(1, 2, 3, 4))).size).toBe(2);
      expect(store.calls.get).toBe(1);
    });
  });
});

function encoded(): Record<string, JsonValue> {
  return { state: "disclosed", time: T, notes: "text", language: "english", source: "api" };
}
