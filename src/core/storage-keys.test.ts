import { describe, expect, it } from "vitest";
import { make } from "../../tests/helpers/factory";
import { appIdOfVerdictKey, isVerdictKey, verdictKey } from "./storage-keys";

describe("verdict keys", () => {
  it("round trips an app ID", () => {
    const id = make.appId();
    expect(verdictKey(id)).toBe(`v1:a:${String(id)}`);
    expect(appIdOfVerdictKey(verdictKey(id))).toBe(id);
  });

  it.each(["v1:settings", "v1:allow", "v1:meta", "v1:breaker", "v2:a:1", "a:1"])(
    "does not take %j for a verdict key",
    (key) => {
      expect([isVerdictKey(key), appIdOfVerdictKey(key)]).toStrictEqual([false, undefined]);
    },
  );

  it.each(make.raw.badGameKeys())("reads no app ID from the verdict key for %j", (text) => {
    expect(appIdOfVerdictKey(`v1:a:${text}`)).toBeUndefined();
  });
});
