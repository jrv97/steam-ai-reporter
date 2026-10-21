import { describe, expect, it } from "vitest";
import { normalizeBreaks } from "./notes";

describe("normalizeBreaks", () => {
  it("turns CRLF and lone CR into LF", () => {
    expect(normalizeBreaks("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
});
