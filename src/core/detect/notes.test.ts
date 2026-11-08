import { describe, expect, it } from "vitest";
import { hasText, trimNotes } from "./notes";

const BLANKS = ["", " ", "\r\n", "\u200b", "\u200b \u200b\n"] as const;

describe("trimNotes", () => {
  it("removes outer whitespace and zero-width characters", () => {
    expect(trimNotes("\n\t\u200bSome art\u00a0 \u200b\ufeff")).toBe("Some art");
    expect(trimNotes("\u200c\u200d\u2060x\u2060")).toBe("x");
  });

  it("keeps inner text verbatim, line breaks and zero-width spaces included", () => {
    expect(trimNotes(" Waifus\r\nBackgrounds \u200b\u200band music ")).toBe(
      "Waifus\r\nBackgrounds \u200b\u200band music",
    );
  });

  it.each(BLANKS)("returns an empty string for the blank notes %j", (text) => {
    expect(trimNotes(text)).toBe("");
  });
});

describe("hasText", () => {
  it.each<readonly [string, boolean]>([
    ["Denuvo", true],
    [" a ", true],
    ...BLANKS.map((text): readonly [string, boolean] => [text, false]),
  ])("reads %j as text: %s", (text, expected) => {
    expect(hasText(text)).toBe(expected);
  });
});
