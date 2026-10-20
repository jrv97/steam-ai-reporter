import { describe, expect, it } from "vitest";
import { trimNotes } from "./notes";

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

  it("returns an empty string for blank notes", () => {
    for (const text of ["", " ", "\r\n", "\u200b", "\u200b \u200b\n"]) {
      expect(trimNotes(text)).toBe("");
    }
  });
});
