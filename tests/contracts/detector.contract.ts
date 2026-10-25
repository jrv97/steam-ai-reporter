import { describe, expect, it } from "vitest";
import type { Detector } from "../../src/core/ports";
import { appIds as ids } from "../helpers/app-ids";

/**
 * The behavior every `Detector` must have, whatever its source answers: GetItems, the HTML
 * fallback, chains and decorators. `make` returns a new detector for each case.
 */
export function detectorContract(name: string, make: () => Detector): void {
  describe(`Detector contract: ${name}`, () => {
    it("answers an empty request with an empty map", async () => {
      expect(await make().detect([])).toStrictEqual(new Map());
    });

    it("gives exactly one verdict per distinct requested ID", async () => {
      const requested = ids(5072580, 413150, 99999999, 5072580);
      const verdicts = await make().detect(requested);
      expect([...verdicts.keys()].sort((a, b) => a - b)).toStrictEqual([413150, 5072580, 99999999]);
    });

    it("resolves with verdicts instead of rejecting", async () => {
      await expect(make().detect(ids(1, 2, 3))).resolves.toBeInstanceOf(Map);
    });
  });
}
