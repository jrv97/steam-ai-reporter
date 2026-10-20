import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/json";
import type { KeyValueStore } from "../../src/core/ports";

/**
 * The behavior every `KeyValueStore` must have (src/core/AGENTS.md, "The contract-test rule").
 * `make` returns a new, empty store for each case.
 */
export function keyValueStoreContract(
  name: string,
  make: () => KeyValueStore | Promise<KeyValueStore>,
): void {
  describe(`KeyValueStore contract: ${name}`, () => {
    it("returns nothing for keys that were never set", async () => {
      const store = await make();
      expect(await store.get(["a", "b"])).toStrictEqual(new Map());
      expect(await store.keys()).toStrictEqual([]);
    });

    it("returns what was set, for the requested keys only", async () => {
      const store = await make();
      await store.set(
        new Map<string, JsonValue>([["a", { n: 1, list: ["x"] }], ["b", "two"], ["c", 3]]),
      );
      expect(await store.get(["a", "c", "missing"])).toStrictEqual(
        new Map<string, unknown>([["a", { n: 1, list: ["x"] }], ["c", 3]]),
      );
    });

    it("keeps falsy values apart from absent ones", async () => {
      const store = await make();
      await store.set(
        new Map<string, JsonValue>([["null", null], ["false", false], ["zero", 0], ["empty", ""]]),
      );
      const got = await store.get(["null", "false", "zero", "empty"]);
      expect(got).toStrictEqual(
        new Map<string, unknown>([["null", null], ["false", false], ["zero", 0], ["empty", ""]]),
      );
    });

    it("replaces existing values", async () => {
      const store = await make();
      await store.set(new Map<string, JsonValue>([["a", 1]]));
      await store.set(new Map<string, JsonValue>([["a", { replaced: true }]]));
      expect(await store.get(["a"])).toStrictEqual(new Map([["a", { replaced: true }]]));
    });

    it("removes keys and ignores keys that do not exist", async () => {
      const store = await make();
      await store.set(new Map<string, JsonValue>([["a", 1], ["b", 2]]));
      await store.remove(["a", "missing"]);
      expect(await store.get(["a", "b"])).toStrictEqual(new Map([["b", 2]]));
      expect(await store.keys()).toStrictEqual(["b"]);
    });

    it("lists every stored key", async () => {
      const store = await make();
      await store.set(
        new Map<string, JsonValue>([["v1:a:10", 1], ["v1:settings", {}], ["v1:meta", []]]),
      );
      expect([...(await store.keys())].sort()).toStrictEqual(["v1:a:10", "v1:meta", "v1:settings"]);
    });

    it("copies values in and out", async () => {
      const store = await make();
      const value = [1];
      await store.set(new Map<string, JsonValue>([["a", value]]));
      value.push(2);
      const first = (await store.get(["a"])).get("a");
      expect(Array.isArray(first)).toBe(true);
      if (Array.isArray(first)) {
        first.push(3);
      }
      expect(await store.get(["a"])).toStrictEqual(new Map([["a", [1]]]));
    });

    it("treats empty batches as no-ops", async () => {
      const store = await make();
      await store.set(new Map<string, JsonValue>([["a", 1]]));
      await store.set(new Map());
      await store.remove([]);
      expect(await store.get([])).toStrictEqual(new Map());
      expect(await store.keys()).toStrictEqual(["a"]);
    });
  });
}
