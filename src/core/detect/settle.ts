import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Logger } from "../log";
import type { Detector } from "../ports";
import type { AppId } from "../types";

/**
 * One `KindVerdicts` for each of `ids` (already distinct) from `detector`, even if it breaks its
 * contract: a rejection or an ID it left out becomes unknown `error`. Decorators call their inner
 * detectors through this, so one faulty link cannot reject the whole detection. A rejection goes
 * to `logger` before it turns into unknown verdicts.
 */
export async function settle(
  detector: Detector,
  ids: readonly AppId[],
  logger: Pick<Logger, "error">,
): Promise<ReadonlyMap<AppId, KindVerdicts>> {
  let found: ReadonlyMap<AppId, KindVerdicts>;
  try {
    found = await detector.detect(ids);
  } catch (problem) {
    logger.error(problem);
    found = new Map();
  }
  return new Map(
    ids.map((id): [AppId, KindVerdicts] => [id, found.get(id) ?? UNKNOWN_KINDS.error]),
  );
}
