import { describe, expect, it } from "vitest";
import { parseJson } from "./json";

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
