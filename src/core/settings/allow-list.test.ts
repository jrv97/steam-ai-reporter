import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import type { JsonValue } from "../json";
import { createAllowList } from "./allow-list";

const T = 1_000_000_000_000;

function setup(initial: ReadonlyMap<string, JsonValue> = new Map()) {
  const store = countingStore(memoryStore(initial));
  const clock = fixedClock(T);
  return { store, clock, allow: createAllowList(store, clock) };
}

describe("createAllowList", () => {
  it("starts empty", async () => {
    expect(await setup().allow.list()).toStrictEqual(new Map());
  });

  it("adds a game with its name and the time it was added", async () => {
    const { allow, clock } = setup();
    await allow.add(appId(10), "Counter-Strike");
    clock.advance(5_000);
    await allow.add(appId(20), "Team Fortress");
    expect(await allow.list()).toStrictEqual(
      new Map([
        [10, { name: "Counter-Strike", added: T }],
        [20, { name: "Team Fortress", added: T + 5_000 }],
      ]),
    );
  });

  it("stores the list as one object from app ID to name and date", async () => {
    const { allow, store } = setup();
    await allow.add(appId(10), "Counter-Strike");
    expect(await store.get(["v1:allow"])).toStrictEqual(
      new Map([["v1:allow", { "10": { name: "Counter-Strike", added: T } }]]),
    );
  });

  it("replaces the entry of a game that is added again", async () => {
    const { allow, clock } = setup();
    await allow.add(appId(10), "Old name");
    clock.advance(1_000);
    await allow.add(appId(10), "New name");
    expect(await allow.list()).toStrictEqual(
      new Map([[10, { name: "New name", added: T + 1_000 }]]),
    );
  });

  it("removes a game and keeps the others", async () => {
    const { allow } = setup();
    await allow.add(appId(10), "A");
    await allow.add(appId(20), "B");
    await allow.remove(appId(10));
    expect([...(await allow.list()).keys()]).toStrictEqual([20]);
    await allow.remove(appId(20));
    expect(await allow.list()).toStrictEqual(new Map());
  });

  it("ignores removing a game that is not listed, without writing", async () => {
    const { allow, store } = setup();
    await allow.remove(appId(10));
    expect(store.calls.set).toBe(0);
  });

  it("is shared by every list over the same store", async () => {
    const { allow, store, clock } = setup();
    await allow.add(appId(10), "A");
    expect((await createAllowList(store, clock).list()).has(appId(10))).toBe(true);
  });

  it("reads once per call and writes once per change", async () => {
    const { allow, store } = setup();
    await allow.add(appId(10), "A");
    expect(store.calls).toStrictEqual({ get: 1, set: 1, remove: 0, keys: 0 });
    await allow.list();
    expect(store.calls.get).toBe(2);
  });

  describe("invalid stored values", () => {
    it("discards a value that is not an object", async () => {
      for (const stored of ["x", 3, null, true, [["10", { name: "A", added: T }]]]) {
        const { allow } = setup(new Map([["v1:allow", stored]]));
        expect(await allow.list()).toStrictEqual(new Map());
      }
    });

    it("drops invalid entries and keeps the valid ones", async () => {
      const { allow } = setup(
        new Map<string, JsonValue>([[
          "v1:allow",
          {
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
        ]]),
      );
      expect(await allow.list()).toStrictEqual(new Map([[10, { name: "Good", added: T }]]));
    });

    it("repairs the stored object on the next change", async () => {
      const { allow, store } = setup(
        new Map<string, JsonValue>([["v1:allow", { "10": { name: "Good", added: T }, "20": 7 }]]),
      );
      await allow.add(appId(30), "New");
      expect(await store.get(["v1:allow"])).toStrictEqual(
        new Map([[
          "v1:allow",
          { "10": { name: "Good", added: T }, "30": { name: "New", added: T } },
        ]]),
      );
    });
  });
});
