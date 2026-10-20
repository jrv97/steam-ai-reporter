import type { AppId, Detector, Verdict } from "../../src/core/types";

export interface FakeDetector extends Detector {
  /** The IDs of every `detect` call, in order. */
  readonly calls: readonly (readonly AppId[])[];
}

/**
 * A `Detector` that answers each ID with `verdictFor(id)` on a later microtask, so calls that are
 * not awaited overlap, and records what it was asked.
 */
export function fakeDetector(verdictFor: (id: AppId) => Verdict): FakeDetector {
  const calls: (readonly AppId[])[] = [];
  return {
    calls,
    async detect(ids) {
      calls.push(ids);
      await Promise.resolve();
      return new Map([...new Set(ids)].map((id): [AppId, Verdict] => [id, verdictFor(id)]));
    },
  };
}
