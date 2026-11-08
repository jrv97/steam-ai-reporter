import { describe, expect, it } from "vitest";
import type { Detector } from "../../src/core/ports";
import { make } from "../helpers/factory";

/**
 * The behavior every `Detector` must have, whatever its source answers: GetItems, the HTML
 * fallback, chains and decorators. `harness` returns a new detector for each case.
 */
export function detectorContract(name: string, harness: () => Detector): void {
  describe(`Detector contract: ${name}`, () => {
    it("answers an empty request with an empty map", async () => {
      expect(await harness().detect([])).toStrictEqual(new Map());
    });

    it("gives exactly one verdict per distinct requested ID", async () => {
      const { aiWithService, noBlock, invalid } = make.fixture.app;
      const verdicts = await harness().detect([aiWithService, noBlock, invalid, aiWithService]);
      expect([...verdicts.keys()].sort((a, b) => a - b)).toStrictEqual(
        [aiWithService, noBlock, invalid].sort((a, b) => a - b),
      );
    });

    it("resolves with verdicts instead of rejecting", async () => {
      await expect(harness().detect(make.appIds(3))).resolves.toBeInstanceOf(Map);
    });
  });
}
