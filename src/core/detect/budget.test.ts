import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { createBudgetDetector, DEFAULT_HTML_BUDGET } from "./budget";

const NOT_DISCLOSED = make.verdicts({ ai: make.verdict.notDisclosed("html") });
const RATE_LIMITED = make.verdicts.uniform("rate-limited");
const { logger } = fake.logger();

detectorContract(
  "createBudgetDetector",
  () => createBudgetDetector(fake.detector(() => NOT_DISCLOSED), logger),
);
detectorContract(
  "createBudgetDetector with a spent budget",
  () => createBudgetDetector(fake.detector(() => NOT_DISCLOSED), logger, 0),
);

describe("createBudgetDetector", () => {
  it("allows 10 apps by default", () => {
    expect(DEFAULT_HTML_BUDGET).toBe(10);
  });

  it("passes on at most the budget over all calls, and rate-limits the rest", async () => {
    const [a, b, c, d, e] = [make.appId(), make.appId(), make.appId(), make.appId(), make.appId()];
    const inner = fake.detector(() => NOT_DISCLOSED);
    const detector = createBudgetDetector(inner, logger, 3);
    expect(await detector.detect([a, b, a])).toStrictEqual(
      new Map([[a, NOT_DISCLOSED], [b, NOT_DISCLOSED]]),
    );
    expect(await detector.detect([c, d])).toStrictEqual(
      new Map([[c, NOT_DISCLOSED], [d, RATE_LIMITED]]),
    );
    expect(await detector.detect([e])).toStrictEqual(new Map([[e, RATE_LIMITED]]));
    expect(inner.calls).toStrictEqual([[a, b], [c]]);
  });
});
