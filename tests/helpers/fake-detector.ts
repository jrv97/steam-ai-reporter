import type { KindVerdicts } from "../../src/core/kinds/verdicts";
import type { Detector } from "../../src/core/ports";
import type { AppId } from "../../src/core/types";

export interface FakeDetector extends Detector {
  /** The IDs of every `detect` call, in order. */
  readonly calls: readonly (readonly AppId[])[];
}

/**
 * A `Detector` that answers each ID with `verdictsFor(id)` on a later microtask, so calls that are
 * not awaited overlap, and records what it was asked.
 */
export function fakeDetector(verdictsFor: (id: AppId) => KindVerdicts): FakeDetector {
  const calls: (readonly AppId[])[] = [];
  return {
    calls,
    async detect(ids) {
      calls.push(ids);
      await Promise.resolve();
      return new Map([...new Set(ids)].map((id): [AppId, KindVerdicts] => [id, verdictsFor(id)]));
    },
  };
}
