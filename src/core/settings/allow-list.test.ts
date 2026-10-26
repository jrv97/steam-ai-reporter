import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { gameEntries } from "../../../tests/helpers/backup";
import { countingStore } from "../../../tests/helpers/counting-store";
import { keyOf } from "../../../tests/helpers/creators";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import type { JsonValue } from "../json";
import type { AppId } from "../types";
import { type AllowEntry, type AllowScope, perScope } from "./allow-data";
import { createAllowList, createCreatorList } from "./allow-list";

const T = 1_000_000_000_000;
/** The stored ignore list with no game in any scope. */
const NO_GAMES = perScope(() => ({}));
/** The ignored games of every scope, none. */
const NO_ENTRIES = perScope(() => new Map());

function setup(initial: ReadonlyMap<string, JsonValue> = new Map()) {
  const store = countingStore(memoryStore(initial));
  const clock = fixedClock(T);
  return { store, clock, allow: createAllowList(store, clock) };
}

/** The ignored games of one scope. */
async function scoped(
  allow: ReturnType<typeof setup>["allow"],
  scope: AllowScope,
): Promise<ReadonlyMap<AppId, AllowEntry>> {
  return (await allow.list())[scope];
}

describe("two quick changes", () => {
  it("both apply when two games stop being ignored at once", async () => {
    const { allow } = setup();
    await allow.add("drm", appId(1), "One");
    await allow.add("drm", appId(2), "Two");
    await allow.add("drm", appId(3), "Three");
    await Promise.all([allow.remove("drm", appId(1)), allow.remove("drm", appId(2))]);
    expect([...(await scoped(allow, "drm")).keys()]).toEqual([3]);
  });

  it("keep every game added at once, in two scopes", async () => {
    const { allow } = setup();
    await Promise.all([
      allow.add("drm", appId(1), "One"),
      allow.add("eula", appId(1), "One"),
      allow.add("all", appId(2), "Two"),
    ]);
    const listed = await allow.list();
    expect([listed.drm.size, listed.eula.size, listed.all.size]).toEqual([1, 1, 1]);
  });

  it("run the next change after one that failed", async () => {
    const { allow, store } = setup();
    store.break();
    const failed = allow.add("drm", appId(1), "One");
    await expect(failed).rejects.toBeInstanceOf(Error);
    store.heal();
    await allow.add("drm", appId(2), "Two");
    expect([...(await scoped(allow, "drm")).keys()]).toEqual([2]);
  });
});

describe("createAllowList", () => {
  it("starts empty in every scope", async () => {
    expect(await setup().allow.list()).toStrictEqual(NO_ENTRIES);
  });

  it("adds a game with its name and the time it was added", async () => {
    const { allow, clock } = setup();
    await allow.add("ai", appId(10), "Counter-Strike");
    clock.advance(5_000);
    await allow.add("ai", appId(20), "Team Fortress");
    expect(await scoped(allow, "ai")).toStrictEqual(
      new Map([
        [10, { name: "Counter-Strike", added: T }],
        [20, { name: "Team Fortress", added: T + 5_000 }],
      ]),
    );
  });

  it("keeps a game's ignore apart in each scope", async () => {
    const { allow } = setup();
    await allow.add("ai", appId(10), "A");
    await allow.add("all", appId(20), "B");
    expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([10]);
    expect([...(await scoped(allow, "all")).keys()]).toStrictEqual([20]);
    await allow.remove("all", appId(10));
    expect((await scoped(allow, "ai")).has(appId(10))).toBe(true);
  });

  it("stores one object per scope, each from app ID to name and date", async () => {
    const { allow, store } = setup();
    await allow.add("ai", appId(10), "Counter-Strike");
    expect(await store.get(["v2:allow"])).toStrictEqual(
      new Map([["v2:allow", { ...NO_GAMES, ai: { "10": { name: "Counter-Strike", added: T } } }]]),
    );
  });

  it("replaces the entry of a game that is added again", async () => {
    const { allow, clock } = setup();
    await allow.add("ai", appId(10), "Old name");
    clock.advance(1_000);
    await allow.add("ai", appId(10), "New name");
    expect(await scoped(allow, "ai")).toStrictEqual(
      new Map([[10, { name: "New name", added: T + 1_000 }]]),
    );
  });

  it("removes a game and keeps the others", async () => {
    const { allow } = setup();
    await allow.add("ai", appId(10), "A");
    await allow.add("ai", appId(20), "B");
    await allow.remove("ai", appId(10));
    expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([20]);
    await allow.remove("ai", appId(20));
    expect(await scoped(allow, "ai")).toStrictEqual(new Map());
  });

  it("ignores removing a game that is not listed, without writing", async () => {
    const { allow, store } = setup();
    await allow.remove("ai", appId(10));
    expect(store.calls.set).toBe(0);
  });

  it.each([
    ["the earlier entry here", T - 1, { name: "Here", added: T - 1 }],
    ["the earlier entry in the merge", T + 1, { name: "Merged", added: T }],
  ])("keeps %s when a merge lists a game again", async (_case, hereAdded, kept) => {
    const { allow, clock } = setup();
    clock.set(hereAdded);
    await allow.add("ai", appId(10), "Here");
    await allow.merge(gameEntries({ ai: [[10, "Merged", T]] }));
    expect((await scoped(allow, "ai")).get(appId(10))).toStrictEqual(kept);
  });

  it("merges in one write, counts the new games and writes nothing the second time", async () => {
    const { allow, store } = setup();
    const merged = gameEntries({ all: [[10, "Ten", T]], drm: [[10, "Ten", T], [20, "Twenty", T]] });
    expect(await allow.merge(merged)).toBe(3);
    expect(await allow.merge(merged)).toBe(0);
    expect(store.calls.set).toBe(1);
  });

  it("is shared by every list over the same store", async () => {
    const { allow, store, clock } = setup();
    await allow.add("ai", appId(10), "A");
    expect((await scoped(createAllowList(store, clock), "ai")).has(appId(10))).toBe(true);
  });

  it("reads only the v2 key once the list is stored, and writes once per change", async () => {
    const { allow, store } = setup(
      new Map<string, JsonValue>([
        ["v2:allow", { all: {}, ai: {} }],
        ["v1:allow", { "10": { name: "Old", added: T } }],
      ]),
    );
    await allow.add("ai", appId(10), "A");
    expect(store.gets).toStrictEqual([["v2:allow"]]);
    expect(store.calls.set).toBe(1);
    await allow.list();
    expect(store.gets).toStrictEqual([["v2:allow"], ["v2:allow"]]);
  });

  it("reads the v1 key only when the v2 key is absent", async () => {
    const { allow, store } = setup();
    await allow.list();
    expect(store.gets).toStrictEqual([["v2:allow"], ["v1:allow"]]);
  });

  describe("a v1 list", () => {
    const V1 = {
      "10": { name: "Counter-Strike", added: T },
      "20": { name: "Team Fortress", added: T },
    };

    it("is copied to the AI scope on the first read, and left in place", async () => {
      const { allow, store } = setup(new Map<string, JsonValue>([["v1:allow", V1]]));
      expect(await scoped(allow, "ai")).toStrictEqual(
        new Map([[10, V1["10"]], [20, V1["20"]]]),
      );
      expect(await scoped(allow, "all")).toStrictEqual(new Map());
      expect((await store.get(["v2:allow"])).get("v2:allow")).toStrictEqual({
        ...NO_GAMES,
        ai: V1,
      });
      expect((await store.get(["v1:allow"])).get("v1:allow")).toStrictEqual(V1);
    });

    it("is copied once: later changes go to v2 and the list is not copied again", async () => {
      const { allow, store } = setup(new Map<string, JsonValue>([["v1:allow", V1]]));
      await allow.remove("ai", appId(10));
      expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([20]);
      expect([...(await scoped(createAllowList(store, fixedClock(T)), "ai")).keys()]).toStrictEqual(
        [20],
      );
    });

    it("keeps the entries it can read when part of the list is corrupt", async () => {
      const { allow } = setup(
        new Map<string, JsonValue>([["v1:allow", { "10": V1["10"], "20": 7, "abc": V1["20"] }]]),
      );
      expect([...(await scoped(allow, "ai")).keys()]).toStrictEqual([10]);
    });

    it("adds to the AI scope after the copy and keeps the copied games", async () => {
      const { allow } = setup(new Map<string, JsonValue>([["v1:allow", V1]]));
      await allow.add("ai", appId(30), "New");
      expect([...(await scoped(allow, "ai")).keys()].toSorted((a, b) => a - b)).toStrictEqual([
        10,
        20,
        30,
      ]);
    });
  });

  describe("invalid stored values", () => {
    it("discards a value that is not an object", async () => {
      for (const stored of ["x", 3, null, true, [["10", { name: "A", added: T }]]]) {
        const { allow } = setup(new Map([["v2:allow", stored]]));
        expect(await allow.list()).toStrictEqual(NO_ENTRIES);
      }
    });

    it("discards the entries of a scope that is not an object", async () => {
      const { allow } = setup(
        new Map<string, JsonValue>([["v2:allow", {
          all: "x",
          ai: { "10": { name: "A", added: T } },
        }]]),
      );
      expect(await scoped(allow, "all")).toStrictEqual(new Map());
      expect(await scoped(allow, "ai")).toStrictEqual(new Map([[10, { name: "A", added: T }]]));
    });

    it("drops invalid entries and keeps the valid ones", async () => {
      const { allow } = setup(
        new Map<string, JsonValue>([[
          "v2:allow",
          {
            ai: {
              "10": { name: "Good", added: T },
              "20": { name: "No date" },
              "30": { name: 5, added: T },
              "40": "text",
              "50": null,
              "0": { name: "Zero", added: T },
              "-5": { name: "Negative", added: T },
              "abc": { name: "Not an ID", added: T },
              "1.5": { name: "Fraction", added: T },
              "4294967296": { name: "Too big", added: T },
            },
          },
        ]]),
      );
      expect(await scoped(allow, "ai")).toStrictEqual(
        new Map([[10, { name: "Good", added: T }]]),
      );
    });

    it("drops scopes it does not know", async () => {
      const { allow } = setup(
        new Map<string, JsonValue>([["v2:allow", { future: { "10": { name: "A", added: T } } }]]),
      );
      expect(await allow.list()).toStrictEqual(NO_ENTRIES);
    });

    it("repairs the stored object on the next change", async () => {
      const { allow, store } = setup(
        new Map<string, JsonValue>([[
          "v2:allow",
          { ai: { "10": { name: "Good", added: T }, "20": 7 }, future: { "5": 1 } },
        ]]),
      );
      await allow.add("ai", appId(30), "New");
      expect(await store.get(["v2:allow"])).toStrictEqual(
        new Map([[
          "v2:allow",
          {
            ...NO_GAMES,
            ai: { "10": { name: "Good", added: T }, "30": { name: "New", added: T } },
          },
        ]]),
      );
    });
  });
});

describe.each(
  [
    ["developer", "v2:allow-developers", "v2:allow-publishers"],
    ["publisher", "v2:allow-publishers", "v2:allow-developers"],
  ] as const,
)("createCreatorList for the %s role", (role, storageKey, otherKey) => {
  const valve = keyOf("c:4");
  const embark = keyOf("n:Embark Studios");

  function creatorSetup(initial: ReadonlyMap<string, JsonValue> = new Map()) {
    const store = countingStore(memoryStore(initial));
    const clock = fixedClock(T);
    return { store, clock, list: createCreatorList(store, clock, role) };
  }

  it("starts empty, and reads its own key only", async () => {
    const { list, store } = creatorSetup();
    expect(await list.list()).toStrictEqual(NO_ENTRIES);
    expect(store.gets).toStrictEqual([[storageKey]]);
  });

  it("stores an object per scope from creator key to name and date, in its own key", async () => {
    const { list, store, clock } = creatorSetup();
    await list.add("ai", valve, "Valve");
    clock.advance(1_000);
    await list.add("all", embark, "Embark Studios");
    expect((await store.get([storageKey])).get(storageKey)).toStrictEqual({
      ...NO_GAMES,
      ai: { "c:4": { name: "Valve", added: T } },
      all: { "n:Embark Studios": { name: "Embark Studios", added: T + 1_000 } },
    });
    expect((await store.get([otherKey, "v2:allow"])).size).toBe(0);
  });

  it("removes a creator from one scope and keeps the others", async () => {
    const { list } = creatorSetup();
    await list.add("ai", valve, "Valve");
    await list.add("pvp", valve, "Valve");
    await list.remove("ai", valve);
    const listed = await list.list();
    expect([listed.ai.size, [...listed.pvp.keys()]]).toStrictEqual([0, ["c:4"]]);
  });

  it("drops a stored entry whose key is not a creator key", async () => {
    const entry = { name: "Valve", added: T };
    const { list } = creatorSetup(
      new Map<string, JsonValue>([[
        storageKey,
        { ai: { "c:4": entry, "c:0": entry, "Valve": entry, "n:": entry } },
      ]]),
    );
    expect([...(await list.list()).ai.keys()]).toStrictEqual(["c:4"]);
  });

  it("does not read the games' v2:allow entries", async () => {
    const { list } = creatorSetup(
      new Map<string, JsonValue>([["v2:allow", { ai: { "10": { name: "A", added: T } } }]]),
    );
    expect(await list.list()).toStrictEqual(NO_ENTRIES);
  });
});
