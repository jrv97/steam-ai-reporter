import { describe, expect, it } from "vitest";
import type { KindVerdicts } from "../../src/core/kinds/verdicts";
import type { Detector } from "../../src/core/ports";
import type { AppId } from "../../src/core/types";
import { make } from "../helpers/factory";

/** Lets every queued task run, so a sink call that comes too late is heard. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * The behavior every `Detector` must have, whatever its source answers: GetItems, the HTML
 * fallback, chains and decorators. `harness` returns a new detector for each case.
 */
export function detectorContract(name: string, harness: () => Detector): void {
  describe(`Detector contract: ${name}`, () => {
    const { aiWithService, noBlock, invalid } = make.fixture.app;

    it("answers an empty request with an empty map", async () => {
      expect(await harness().detect([])).toStrictEqual(new Map());
    });

    it("gives exactly one verdict per distinct requested ID", async () => {
      const verdicts = await harness().detect([aiWithService, noBlock, invalid, aiWithService]);
      expect([...verdicts.keys()].sort((a, b) => a - b)).toStrictEqual(
        [aiWithService, noBlock, invalid].sort((a, b) => a - b),
      );
    });

    it("resolves with verdicts instead of rejecting", async () => {
      await expect(harness().detect(make.appIds(3))).resolves.toBeInstanceOf(Map);
    });

    it.each([
      ["the fixture apps", [aiWithService, noBlock, invalid, aiWithService]],
      ["new apps", make.appIds(3)],
    ])("lets the sink hear %s once each, final and before resolving", async (_name, ids) => {
      const heard: [AppId, KindVerdicts][] = [];
      let resolved = false;
      let late = false;
      const verdicts = await harness().detect(ids, (partial) => {
        late ||= resolved;
        heard.push(...partial);
      });
      resolved = true;
      await nextTask();
      expect(late).toBe(false);
      expect(new Set(heard.map(([id]) => id)).size).toBe(heard.length);
      expect(heard).toStrictEqual(heard.map(([id]) => [id, verdicts.get(id)]));
    });
  });
}
