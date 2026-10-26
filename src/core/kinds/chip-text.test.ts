import { describe, expect, it } from "vitest";
import { CHIP_TEXT_FIELDS, CHIP_TEXT_LIMITS, toChipText } from "./chip-text";

const SMILE = "\u{1F600}";
const ACUTE_E = "e\u0301";

describe("toChipText", () => {
  it.each<readonly [string, unknown, string | undefined]>([
    ["trims the ends", "  Mine  ", "Mine"],
    ["collapses any whitespace to one space", "My\t\n tag\u00a0\u3000here", "My tag here"],
    ["drops control characters", "My\u0000\u0007\u007ftag", "Mytag"],
    ["drops right-to-left marks and overrides", "\u200fMy\u202e tag\u2066", "My tag"],
    [
      "drops zero-width characters without joining the words around them",
      "My \u200b tag",
      "My tag",
    ],
    ["keeps markup as literal text", "<b>x</b>", "<b>x</b>"],
    ["keeps emoji", `${SMILE} mine`, `${SMILE} mine`],
    ["reads empty text as unset", "", undefined],
    ["reads only spaces as unset", " \t ", undefined],
    ["reads only hidden characters as unset", "\u200b\u200f", undefined],
    ["reads a number as unset", 7, undefined],
    ["reads null as unset", null, undefined],
    ["reads an object as unset", { text: "Mine" }, undefined],
  ])("%s", (_name, input, expected) => {
    expect(toChipText("chip", input)).toBe(expected);
  });

  it.each(CHIP_TEXT_FIELDS)("cuts %s to its limit, counted in code points", (field) => {
    const limit = CHIP_TEXT_LIMITS[field];
    expect(toChipText(field, "x".repeat(limit + 5))).toBe("x".repeat(limit));
    expect(toChipText(field, SMILE.repeat(limit + 1))).toBe(SMILE.repeat(limit));
    expect(toChipText(field, ACUTE_E.repeat(limit))).toBe(ACUTE_E.repeat(limit / 2));
  });

  it.each(CHIP_TEXT_FIELDS)("trims a space the cut leaves at the end of %s", (field) => {
    const limit = CHIP_TEXT_LIMITS[field];
    expect(toChipText(field, `${"x".repeat(limit - 1)} yz`)).toBe("x".repeat(limit - 1));
  });
});
