import { describe, expect, it } from "vitest";
import { readTypedColor, toHexColor } from "./color";

describe("toHexColor", () => {
  it.each([
    ["#8f73f3", "#8f73f3"],
    ["8f73f3", "#8f73f3"],
    ["#8F73F3", "#8f73f3"],
    ["#abc", "#aabbcc"],
    ["ABC", "#aabbcc"],
    [" #0a0 ", "#00aa00"],
  ])("reads %s as %s", (typed, normal) => {
    expect(toHexColor(typed)).toBe(normal);
  });

  it.each([
    "",
    "#",
    "#ab",
    "#abcd",
    "#abcde",
    "#abcdeff",
    "#abcdefgh",
    "##abc",
    "#ggg",
    "red",
    "rgb(1, 2, 3)",
    "#abc; background: url(x)",
    "#abc}",
    "var(--x)",
    "\n#abc\n#def",
  ])("rejects %j", (typed) => {
    expect(toHexColor(typed)).toBeUndefined();
  });

  it.each([undefined, null, 7, true, [], {}, ["#abc"]])("rejects the non-text %j", (value) => {
    expect(toHexColor(value)).toBeUndefined();
  });
});

describe("readTypedColor", () => {
  it("reads empty text as the default, which is valid", () => {
    expect(readTypedColor("")).toStrictEqual({ valid: true, color: undefined });
    expect(readTypedColor("   ")).toStrictEqual({ valid: true, color: undefined });
  });

  it("reads a color, and flags text that is none", () => {
    expect(readTypedColor("F00")).toStrictEqual({ valid: true, color: "#ff0000" });
    expect(readTypedColor("#12")).toStrictEqual({ valid: false });
  });
});
