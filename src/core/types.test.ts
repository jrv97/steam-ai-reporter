import { describe, expect, it } from "vitest";
import { toAppId, UNKNOWN } from "./types";

describe("toAppId", () => {
  it("accepts unsigned 32-bit integers above zero", () => {
    expect(toAppId(1)).toBe(1);
    expect(toAppId(5072580)).toBe(5072580);
    expect(toAppId(0xffff_ffff)).toBe(0xffff_ffff);
  });

  it("rejects everything else", () => {
    for (const value of [0, -1, 1.5, 0x1_0000_0000, Number.NaN, "10", null, undefined]) {
      expect(toAppId(value)).toBeUndefined();
    }
  });
});

describe("UNKNOWN", () => {
  it("holds one unknown verdict per reason", () => {
    for (const [reason, verdict] of Object.entries(UNKNOWN)) {
      expect(verdict).toStrictEqual({ state: "unknown", reason });
    }
  });
});
