import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { hasText, trimNotes } from "./notes";

const BLANKS = ["", " ", "\r\n", "\u200b", "\u200b \u200b\n"] as const;

describe("trimNotes", () => {
  it("removes outer whitespace and zero-width characters", () => {
    const [first, second] = [make.text.note(), make.text.note()];
    expect(trimNotes(`\n\t\u200b${first}\u00a0 \u200b\ufeff`)).toBe(first);
    expect(trimNotes(`\u200c\u200d\u2060${second}\u2060`)).toBe(second);
  });

  it("keeps inner text verbatim, line breaks and zero-width spaces included", () => {
    const inner = `${make.text.note()}\r\n${make.text.note()} \u200b\u200b${make.text.note()}`;
    expect(trimNotes(` ${inner} `)).toBe(inner);
  });

  it.each(BLANKS)("returns an empty string for the blank notes %j", (text) => {
    expect(trimNotes(text)).toBe("");
  });
});

describe("hasText", () => {
  it.each<readonly [string, boolean]>([
    [make.text.service(), true],
    [` ${make.text.note()} `, true],
    ...BLANKS.map((text): readonly [string, boolean] => [text, false]),
  ])("reads %j as text: %s", (text, expected) => {
    expect(hasText(text)).toBe(expected);
  });
});
