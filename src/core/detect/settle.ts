import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import { createFailureStreak, type Logger } from "../log";
import type { Detector, VerdictSink } from "../ports";
import type { AppId } from "../types";

/**
 * One `KindVerdicts` for each of `ids` (already distinct) from `detector`, even if it breaks its
 * contract: a rejection or an ID it left out becomes unknown `error`. `sink` hears each requested
 * ID at most once and only before the answer; the answer keeps what it heard.
 */
export type Settle = (
  detector: Detector,
  ids: readonly AppId[],
  sink?: VerdictSink,
) => Promise<ReadonlyMap<AppId, KindVerdicts>>;

/**
 * A `Settle` for one decorator, so one faulty link cannot reject the whole detection. The first
 * rejection of a streak goes to `logger`; an answer ends the streak.
 */
export function createSettle(logger: Pick<Logger, "error">): Settle {
  const rejections = createFailureStreak((problem) => {
    logger.error(problem);
  });
  return async (detector, ids, sink) => {
    const asked = new Set(ids);
    const heard = new Map<AppId, KindVerdicts>();
    let open = true;
    const hear: VerdictSink | undefined = sink === undefined ? undefined : (partial) => {
      const fresh = new Map<AppId, KindVerdicts>();
      for (const [id, verdicts] of open ? partial : []) {
        if (asked.has(id) && !heard.has(id)) {
          heard.set(id, verdicts);
          fresh.set(id, verdicts);
        }
      }
      if (fresh.size > 0) {
        sink(fresh);
      }
    };
    let found: ReadonlyMap<AppId, KindVerdicts>;
    try {
      found = await detector.detect(ids, hear);
      rejections.worked();
    } catch (problem) {
      rejections.failed(problem);
      found = new Map();
    }
    open = false;
    return new Map(
      ids.map((id): [AppId, KindVerdicts] => [
        id,
        heard.get(id) ?? found.get(id) ?? UNKNOWN_KINDS.error,
      ]),
    );
  };
}
