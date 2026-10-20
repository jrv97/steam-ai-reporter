import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { fakeDetector } from "../../../tests/helpers/fake-detector";
import { type AppId, UNKNOWN, type Verdict } from "../types";
import { createBudgetDetector, DEFAULT_HTML_BUDGET } from "./budget";

const NOT_DISCLOSED: Verdict = { state: "not-disclosed", source: "html" };

detectorContract(
  "createBudgetDetector",
  () => createBudgetDetector(fakeDetector(() => NOT_DISCLOSED)),
);
detectorContract(
  "createBudgetDetector with a spent budget",
  () => createBudgetDetector(fakeDetector(() => NOT_DISCLOSED), 0),
);

describe("createBudgetDetector", () => {
  it("allows 10 apps by default", () => {
    expect(DEFAULT_HTML_BUDGET).toBe(10);
  });

  it("passes on at most the budget over all calls, and rate-limits the rest", async () => {
    const inner = fakeDetector(() => NOT_DISCLOSED);
    const detector = createBudgetDetector(inner, 3);
    expect(await detector.detect(appIds(1, 2, 1))).toStrictEqual(
      new Map<AppId, Verdict>([[appId(1), NOT_DISCLOSED], [appId(2), NOT_DISCLOSED]]),
    );
    expect(await detector.detect(appIds(3, 4))).toStrictEqual(
      new Map<AppId, Verdict>([[appId(3), NOT_DISCLOSED], [appId(4), UNKNOWN["rate-limited"]]]),
    );
    expect(await detector.detect(appIds(5))).toStrictEqual(
      new Map([[appId(5), UNKNOWN["rate-limited"]]]),
    );
    expect(inner.calls).toStrictEqual([appIds(1, 2), appIds(3)]);
  });
});
