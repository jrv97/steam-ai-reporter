import { type AppId, type Detector, UNKNOWN, type Verdict } from "../types";

/**
 * One verdict for each of `ids` (already distinct) from `detector`, even if it breaks its
 * contract: a rejection or an ID it left out becomes unknown `error`. Decorators call their inner
 * detectors through this, so one faulty link cannot reject the whole detection.
 */
export async function settle(
  detector: Detector,
  ids: readonly AppId[],
): Promise<ReadonlyMap<AppId, Verdict>> {
  let found: ReadonlyMap<AppId, Verdict>;
  try {
    found = await detector.detect(ids);
  } catch {
    found = new Map();
  }
  return new Map(ids.map((id): [AppId, Verdict] => [id, found.get(id) ?? UNKNOWN.error]));
}
