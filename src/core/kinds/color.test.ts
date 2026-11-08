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

  it.each<unknown>([
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
    undefined,
    null,
    7,
    true,
    [],
    {},
    ["#abc"],
  ])("rejects %j", (typed) => {
    expect(toHexColor(typed)).toBeUndefined();
  });
});

describe("readTypedColor", () => {
  it.each<readonly [string, string, ReturnType<typeof readTypedColor>]>([
    ["empty text as the default, which is valid", "", { valid: true, color: undefined }],
    ["blank text as the default, which is valid", "   ", { valid: true, color: undefined }],
    ["a color in its normal form", "F00", { valid: true, color: toHexColor("#ff0000") }],
    ["text that is no color as invalid", "#12", { valid: false }],
  ])("reads %s", (_name, typed, reading) => {
    expect(readTypedColor(typed)).toStrictEqual(reading);
  });
});
