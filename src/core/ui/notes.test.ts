import { describe, expect, it } from "vitest";
import { excerpt, normalizeBreaks } from "./notes";

describe("normalizeBreaks", () => {
  it("turns CRLF and lone CR into LF", () => {
    expect(normalizeBreaks("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });
});

describe("excerpt", () => {
  it("keeps notes up to the limit as they are", () => {
    expect(excerpt("x".repeat(200))).toBe("x".repeat(200));
  });

  it("cuts longer notes at 200 characters and marks the cut", () => {
    expect(excerpt("y".repeat(201))).toBe(`${"y".repeat(200)}...`);
  });

  it("counts code points, so an emoji at the edge stays whole", () => {
    const notes = `${"a".repeat(199)}\u{1F3A8}tail`;
    expect(excerpt(notes)).toBe(`${"a".repeat(199)}\u{1F3A8}...`);
  });

  it("normalizes line breaks first", () => {
    expect(excerpt("one\r\ntwo", 5)).toBe("one\nt...");
  });
});
