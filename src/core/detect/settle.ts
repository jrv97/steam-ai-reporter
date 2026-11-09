import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import { createFailureStreak, type Logger } from "../log";
import type { Detector } from "../ports";
import type { AppId } from "../types";

/**
 * One `KindVerdicts` for each of `ids` (already distinct) from `detector`, even if it breaks its
 * contract: a rejection or an ID it left out becomes unknown `error`.
 */
export type Settle = (
  detector: Detector,
  ids: readonly AppId[],
) => Promise<ReadonlyMap<AppId, KindVerdicts>>;

/**
 * A `Settle` for one decorator, so one faulty link cannot reject the whole detection. The first
 * rejection of a streak goes to `logger`; an answer ends the streak.
 */
export function createSettle(logger: Pick<Logger, "error">): Settle {
  const rejections = createFailureStreak((problem) => {
    logger.error(problem);
  });
  return async (detector, ids) => {
    let found: ReadonlyMap<AppId, KindVerdicts>;
    try {
      found = await detector.detect(ids);
      rejections.worked();
    } catch (problem) {
      rejections.failed(problem);
      found = new Map();
    }
    return new Map(
      ids.map((id): [AppId, KindVerdicts] => [id, found.get(id) ?? UNKNOWN_KINDS.error]),
    );
  };
}
