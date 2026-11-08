import { describe, expect, it } from "vitest";
import { make } from "../../tests/helpers/factory";
import { toAppId, UNKNOWN } from "./types";

describe("toAppId", () => {
  it.each([...make.raw.appIdBounds(), make.appId()])("accepts %i", (value) => {
    expect(toAppId(value)).toBe(value);
  });

  it.each(make.raw.badAppIds())("rejects %j", (value) => {
    expect(toAppId(value)).toBeUndefined();
  });
});

describe("UNKNOWN", () => {
  it("holds one unknown verdict per reason", () => {
    for (const [reason, verdict] of Object.entries(UNKNOWN)) {
      expect(verdict).toStrictEqual({ state: "unknown", reason });
    }
  });
});
