import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import type { JsonValue } from "../json";
import type { AppId } from "../types";
import type { AllowEntry, AllowScope } from "./allow-data";
import { createAllowList } from "./allow-list";

const T = 1_000_000_000_000;

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

describe("createAllowList", () => {
  it("starts empty in every scope", async () => {
    expect(await setup().allow.list()).toStrictEqual({ all: new Map(), ai: new Map() });
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
      new Map([["v2:allow", { all: {}, ai: { "10": { name: "Counter-Strike", added: T } } }]]),
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
      expect((await store.get(["v2:allow"])).get("v2:allow")).toStrictEqual({ all: {}, ai: V1 });
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
        expect(await allow.list()).toStrictEqual({ all: new Map(), ai: new Map() });
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
      expect(await allow.list()).toStrictEqual({ all: new Map(), ai: new Map() });
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
            all: {},
            ai: { "10": { name: "Good", added: T }, "30": { name: "New", added: T } },
          },
        ]]),
      );
    });
  });
});
