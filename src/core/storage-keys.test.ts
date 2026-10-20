import { describe, expect, it } from "vitest";
import { appId } from "../../tests/helpers/app-ids";
import { appIdOfVerdictKey, isVerdictKey, verdictKey } from "./storage-keys";

describe("verdict keys", () => {
  it("round trips an app ID", () => {
    expect(verdictKey(appId(5072580))).toBe("v1:a:5072580");
    expect(appIdOfVerdictKey("v1:a:5072580")).toBe(5072580);
  });

  it("recognizes verdict keys only", () => {
    for (const key of ["v1:settings", "v1:allow", "v1:meta", "v1:breaker", "v2:a:1", "a:1"]) {
      expect(isVerdictKey(key)).toBe(false);
      expect(appIdOfVerdictKey(key)).toBeUndefined();
    }
  });

  it("rejects malformed app IDs", () => {
    const keys = ["v1:a:", "v1:a:0", "v1:a:012", "v1:a:1.5", "v1:a:-3", "v1:a:abc"];
    for (const key of [...keys, "v1:a:4294967296"]) {
      expect(appIdOfVerdictKey(key)).toBeUndefined();
    }
  });
});
