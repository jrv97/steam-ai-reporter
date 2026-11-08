import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/json";
import type { KeyValueStore } from "../../src/core/ports";
import { make } from "../helpers/factory";

/**
 * The behavior every `KeyValueStore` must have (src/core/AGENTS.md, "The contract-test rule").
 * `harness` returns a new, empty store for each case.
 */
export function keyValueStoreContract(
  name: string,
  harness: () => KeyValueStore | Promise<KeyValueStore>,
): void {
  describe(`KeyValueStore contract: ${name}`, () => {
    it("returns nothing for keys that were never set", async () => {
      const store = await harness();
      expect(await store.get(["a", "b"])).toStrictEqual(new Map());
      expect(await store.keys()).toStrictEqual([]);
    });

    it("returns what was set, for the requested keys only", async () => {
      const store = await harness();
      const [a, b, c] = [make.raw.json(), make.raw.json(), make.raw.json()];
      await store.set(new Map<string, JsonValue>([["a", a], ["b", b], ["c", c]]));
      expect(await store.get(["a", "c", "missing"])).toStrictEqual(
        new Map<string, unknown>([["a", a], ["c", c]]),
      );
    });

    it("keeps falsy values apart from absent ones", async () => {
      const store = await harness();
      // The falsy values themselves are the case, not stand-ins for content
      const falsy = new Map<string, JsonValue>([
        ["null", null],
        ["false", false],
        ["zero", 0],
        ["empty", ""],
      ]);
      await store.set(falsy);
      expect(await store.get([...falsy.keys()])).toStrictEqual(falsy);
    });

    it("replaces existing values", async () => {
      const store = await harness();
      const replacement = make.raw.json();
      await store.set(new Map<string, JsonValue>([["a", make.raw.json()]]));
      await store.set(new Map<string, JsonValue>([["a", replacement]]));
      expect(await store.get(["a"])).toStrictEqual(new Map([["a", replacement]]));
    });

    it("removes keys and ignores keys that do not exist", async () => {
      const store = await harness();
      const kept = make.raw.json();
      await store.set(new Map<string, JsonValue>([["a", make.raw.json()], ["b", kept]]));
      await store.remove(["a", "missing"]);
      expect(await store.get(["a", "b"])).toStrictEqual(new Map([["b", kept]]));
      expect(await store.keys()).toStrictEqual(["b"]);
    });

    it("lists every stored key", async () => {
      const store = await harness();
      const keys = ["v1:a:10", "v1:meta", "v1:settings"];
      await store.set(new Map(keys.map((key) => [key, make.raw.json()])));
      expect([...(await store.keys())].sort()).toStrictEqual(keys);
    });

    it("copies values in and out", async () => {
      const store = await harness();
      const original = make.text.note();
      const value = [original];
      await store.set(new Map<string, JsonValue>([["a", value]]));
      value.push(make.text.note());
      const first = (await store.get(["a"])).get("a");
      expect(Array.isArray(first)).toBe(true);
      if (Array.isArray(first)) {
        first.push(make.text.note());
      }
      expect(await store.get(["a"])).toStrictEqual(new Map([["a", [original]]]));
    });

    it("treats empty batches as no-ops", async () => {
      const store = await harness();
      await store.set(new Map<string, JsonValue>([["a", make.raw.json()]]));
      await store.set(new Map());
      await store.remove([]);
      expect(await store.get([])).toStrictEqual(new Map());
      expect(await store.keys()).toStrictEqual(["a"]);
    });
  });
}
