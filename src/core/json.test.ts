import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { parseJson, parseWithDefaults } from "./json";

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
