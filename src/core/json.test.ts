import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { parseJson, parseWithDefaults, toJsonValue } from "./json";

describe("parseJson", () => {
  it("returns the parsed value as unknown", () => {
    expect(parseJson('{"a":[1,2]}')).toStrictEqual({ a: [1, 2] });
  });

  it("throws on malformed text", () => {
    expect(() => parseJson("{")).toThrow(SyntaxError);
  });
});

describe("parseWithDefaults", () => {
  const schema = v.object({
    on: v.fallback(v.boolean(), true),
    name: v.fallback(v.string(), "none"),
  });

  it("keeps the valid fields and defaults the others", () => {
    expect(parseWithDefaults(schema, { on: false, name: 7 })).toStrictEqual({
      on: false,
      name: "none",
    });
  });

  it.each<unknown>([undefined, null, 7, "x", true])(
    "gives the defaults for %j, which is not an object",
    (input) => {
      expect(parseWithDefaults(schema, input)).toStrictEqual({ on: true, name: "none" });
    },
  );
});

describe("toJsonValue", () => {
  it("keeps strings, booleans, null, finite numbers, arrays and objects", () => {
    const value = { a: [1, "two", false, null], b: { c: 0.5 } };
    expect(toJsonValue(value)).toStrictEqual(value);
  });

  it("keeps an own __proto__ key as data and leaves the prototype alone", () => {
    const parsed = parseJson('{"__proto__":{"polluted":true},"a":1}');
    const json: unknown = toJsonValue(parsed);
    if (typeof json !== "object" || json === null) {
      throw new TypeError();
    }
    expect(json).toStrictEqual(parsed);
    expect(Object.hasOwn(json, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(json)).toBe(Object.prototype);
    expect(Reflect.get(json, "polluted")).toBeUndefined();
  });

  it("leaves out object keys whose value is undefined", () => {
    expect(toJsonValue({ a: 1, b: undefined })).toStrictEqual({ a: 1 });
  });

  it.each<readonly [string, unknown]>([
    ["undefined", undefined],
    ["a symbol", Symbol("s")],
    ["a function", () => 1],
    ["NaN", Number.NaN],
    ["a bigint", 1n],
    ["an object holding a function", { a: () => 1 }],
    ["an array holding a bigint", [1n]],
    ["an array holding Infinity", [Number.POSITIVE_INFINITY]],
  ])("gives undefined for %s, which JSON cannot carry", (_name, value) => {
    expect(toJsonValue(value)).toBeUndefined();
  });
});
