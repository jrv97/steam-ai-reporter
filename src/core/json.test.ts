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

  it("runs in happy-dom", () => {
    expect(document.createElement("div").tagName).toBe("DIV");
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

  it("gives the defaults for input that is not an object", () => {
    for (const input of [undefined, null, 7, "x", true]) {
      expect(parseWithDefaults(schema, input)).toStrictEqual({ on: true, name: "none" });
    }
  });
});

describe("toJsonValue", () => {
  it("keeps strings, booleans, null, finite numbers, arrays and objects", () => {
    const value = { a: [1, "two", false, null], b: { c: 0.5 } };
    expect(toJsonValue(value)).toStrictEqual(value);
  });

  it("leaves out object keys whose value is undefined", () => {
    expect(toJsonValue({ a: 1, b: undefined })).toStrictEqual({ a: 1 });
  });

  it("gives undefined for what JSON cannot carry, at any depth", () => {
    for (const value of [undefined, Symbol("s"), () => 1, Number.NaN, 1n, { a: () => 1 }, [1n]]) {
      expect(toJsonValue(value)).toBeUndefined();
    }
    expect(toJsonValue([Number.POSITIVE_INFINITY])).toBeUndefined();
  });
});
