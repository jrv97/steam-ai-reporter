import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { DEFAULT_BATCH_LIMITS } from "../detect/getitems";
import type { JsonValue } from "../json";
import { AI_KIND, type AiVerdict } from "../kinds/ai";
import { EARLY_ACCESS_KIND } from "../kinds/early-access";
import { perKind } from "../kinds/registry";
import { type KindVerdicts, withRelations } from "../kinds/verdicts";
import { verdictKey } from "../storage-keys";
import type { AppId } from "../types";
import { TRANSIENT_TTL_MS, UNKNOWN_TTL_MS } from "./ttl";
import { createVerdictCache } from "./verdict-cache";

const T = make.time();
const FULL = make.verdicts.full();
// A fully disclosed app expires with Early Access, a fully undisclosed one with the AI kind.
const DISCLOSED_TTL_MS = EARLY_ACCESS_KIND.ttl.disclosed;
const NOT_DISCLOSED_TTL_MS = AI_KIND.ttl.notDisclosed;

/** Verdicts with this AI verdict and every other kind unknown `missing`. */
function ai(verdict: AiVerdict): KindVerdicts {
  return make.verdicts({ ai: verdict });
}

/** Verdicts whose AI kind is not disclosed. */
function notDisclosed(): KindVerdicts {
  return ai(make.verdict.notDisclosed());
}

function setup(capacity?: number) {
  const store = fake.countingStore(fake.store());
  const clock = fake.clock(T);
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
    const id = make.appId();
    const verdicts = ai(make.verdict.disclosed("ai"));
    await cache.save(new Map([[id, verdicts]]));
    expect(await cache.lookup([id])).toStrictEqual(new Map([[id, verdicts]]));
    expect(store.calls.get).toBe(0);
  });

  it("keeps what an app is related to in memory and for another tab", async () => {
    const { cache, another, store } = setup();
    const id = make.appId();
    const verdicts = withRelations(ai(make.verdict.disclosed("ai")), {
      parent: make.appId(),
      creators: make.creator.forItem({
        developers: [[make.text.creator(), make.creator.clan()]],
        publishers: [make.text.creator()],
      }),
    });
    await cache.save(new Map([[id, verdicts]]));
    expect((await cache.lookup([id])).get(id)).toStrictEqual(verdicts);
    const tab = another();
    expect((await tab.lookup([id])).get(id)).toStrictEqual(verdicts);
    expect(store.calls.get).toBe(1);
  });

  it("serves another tab from storage, language included, and then from its memory", async () => {
    const { cache, another, store } = setup();
    const id = make.appId();
    const verdicts = ai(make.verdict.disclosed("ai", { language: "german" }));
    await cache.save(new Map([[id, verdicts]]));
    const tab = another();
    expect(await tab.lookup([id])).toStrictEqual(new Map([[id, verdicts]]));
    expect(store.calls.get).toBe(1);
    await tab.lookup([id]);
    expect(store.calls.get).toBe(1);
  });

  it("stores one entry per app, holding the fetch time and a verdict for each kind", async () => {
    const { cache, store } = setup();
    const id = make.appId();
    await cache.save(new Map([[id, make.verdicts.uniform("not-disclosed")]]));
    const entry = { time: T, kinds: perKind(() => ({ state: "not-disclosed", source: "api" })) };
    expect(await store.get([verdictKey(id)])).toStrictEqual(new Map([[verdictKey(id), entry]]));
  });

  it("answers only the fresh IDs and leaves the rest out", async () => {
    const { cache, another } = setup();
    const saved = make.appId();
    await cache.save(new Map([[saved, notDisclosed()]]));
    const got = await another().lookup([saved, make.appId()]);
    expect([...got.keys()]).toStrictEqual([saved]);
  });

  it("reads storage once for a whole batch and writes it once", async () => {
    const { cache, another, store } = setup();
    const ids = make.appIds(DEFAULT_BATCH_LIMITS.maxIds);
    await cache.save(new Map(ids.map((id) => [id, notDisclosed()])));
    expect(store.calls.set).toBe(1);
    expect(store.calls.get).toBe(0);

    const asked = [...ids, make.appId()];
    const found = await another().lookup(asked);
    expect(found.size).toBe(ids.length);
    expect(store.calls.get).toBe(1);
    expect(store.gets[0]).toHaveLength(asked.length);
  });

  it("asks storage only for the IDs memory does not hold", async () => {
    const { cache, another, store } = setup();
    const [first, second] = [make.appId(), make.appId()];
    await cache.save(
      new Map<AppId, KindVerdicts>([[first, notDisclosed()], [second, notDisclosed()]]),
    );
    const tab = another();
    await tab.lookup([first]);
    await tab.lookup([first, second]);
    expect(store.gets).toStrictEqual([[verdictKey(first)], [verdictKey(second)]]);
  });

  it("makes no storage call for nothing to look up or to save", async () => {
    const { cache, store } = setup();
    expect(await cache.lookup([])).toStrictEqual(new Map());
    await cache.save(new Map());
    expect(store.calls).toStrictEqual({ get: 0, set: 0, remove: 0, keys: 0 });
  });

  it.each<readonly [string, KindVerdicts, boolean]>([
    ["holds the section", { ...FULL, sections: ["basic_info", "platforms"] }, true],
    ["lacks the section", { ...FULL, sections: ["basic_info"] }, false],
    ["came without GetItems details", FULL, true],
  ])("serves an entry that %s to a lookup that needs it: %s", async (_n, verdicts, hit) => {
    const { cache, another } = setup();
    const id = make.appId();
    await cache.save(new Map([[id, verdicts]]));
    for (const tab of [cache, another()]) {
      expect((await tab.lookup([id], ["platforms"])).has(id)).toBe(hit);
      expect((await tab.lookup([id])).has(id)).toBe(true);
    }
  });

  describe("TTL edges", () => {
    it.each<readonly [string, KindVerdicts, number]>([
      ["disclosed", make.verdicts.uniform("disclosed"), DISCLOSED_TTL_MS],
      ["not disclosed", make.verdicts.uniform("not-disclosed"), NOT_DISCLOSED_TTL_MS],
      ["unknown gated", make.verdicts.uniform("gated"), UNKNOWN_TTL_MS],
      ["unknown missing", make.verdicts.uniform("missing"), UNKNOWN_TTL_MS],
    ])("%s: stored for its TTL, gone at exactly the TTL", async (_n, verdicts, ttl) => {
      const { cache, another, clock } = setup();
      const id = make.appId();
      await cache.save(new Map([[id, verdicts]]));

      clock.set(T + ttl - 1);
      expect((await another().lookup([id])).has(id)).toBe(true);
      expect((await cache.lookup([id])).has(id)).toBe(true);

      clock.set(T + ttl);
      expect((await another().lookup([id])).has(id)).toBe(false);
      expect((await cache.lookup([id])).has(id)).toBe(false);
    });
  });

  describe("verdicts that are not stored", () => {
    it.each<readonly [string, AiVerdict]>([
      ["unknown error", make.verdict.unknown("error")],
      ["unknown rate-limited", make.verdict.unknown("rate-limited")],
    ])("%s: page memory only, for a short while", async (_name, verdict) => {
      const { cache, another, store, clock } = setup();
      const id = make.appId();
      const verdicts = ai(verdict);
      await cache.save(new Map([[id, verdicts]]));
      expect(store.calls.set).toBe(0);
      expect(await store.keys()).toStrictEqual([]);
      expect(await another().lookup([id])).toStrictEqual(new Map());

      clock.set(T + TRANSIENT_TTL_MS - 1);
      expect(await cache.lookup([id])).toStrictEqual(new Map([[id, verdicts]]));
      clock.set(T + TRANSIENT_TTL_MS);
      expect(await cache.lookup([id])).toStrictEqual(new Map());
    });

    it("writes only the stored verdicts of a mixed batch", async () => {
      const { cache, store } = setup();
      const [answered, failed, gated] = [make.appId(), make.appId(), make.appId()];
      await cache.save(
        new Map<AppId, KindVerdicts>([
          [answered, notDisclosed()],
          [failed, ai(make.verdict.unknown("error"))],
          [gated, ai(make.verdict.unknown("gated"))],
        ]),
      );
      expect(store.calls.set).toBe(1);
      expect((await store.keys()).toSorted()).toStrictEqual(
        [verdictKey(answered), verdictKey(gated)].toSorted(),
      );
    });
  });

  describe("invalid stored values", () => {
    // Which entries are invalid is up to decodeVerdicts; these two show the cache drops them.
    it.each<readonly [string, JsonValue]>([
      ["a string", "disclosed"],
      ["an entry without kinds", { time: T, kinds: {} }],
    ])("discards %s", async (_name, value) => {
      const id = make.appId();
      const store = fake.countingStore(fake.store(new Map([[verdictKey(id), value]])));
      const cache = createVerdictCache(store, fake.clock(T));
      expect(await cache.lookup([id])).toStrictEqual(new Map());
    });
  });

  describe("memory cap", () => {
    it("evicts the least recently used entries and falls back to storage", async () => {
      const [oldest, second, third, fourth, newest] = [
        make.appId(),
        make.appId(),
        make.appId(),
        make.appId(),
        make.appId(),
      ];
      const { cache, store } = setup(3);
      await cache.save(
        new Map([oldest, second, third, fourth, newest].map((id) => [id, notDisclosed()])),
      );

      await cache.lookup([newest]);
      expect(store.calls.get).toBe(0);

      expect((await cache.lookup([oldest])).has(oldest)).toBe(true);
      expect(store.gets).toStrictEqual([[verdictKey(oldest)]]);
    });

    it("never holds more than the cap in memory", async () => {
      const ids = make.appIds(4);
      const { cache, store } = setup(2);
      await cache.save(new Map(ids.map((id) => [id, ai(make.verdict.unknown("rate-limited"))])));
      expect((await cache.lookup(ids)).size).toBe(2);
      expect(store.calls.get).toBe(1);
    });
  });
});
