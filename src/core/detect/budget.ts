import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Logger } from "../log";
import type { Detector } from "../ports";
import type { AppId } from "../types";
import { createSettle } from "./settle";

/** HTML fallback apps per page view (ADR 0001): each one is a full app page request. */
export const DEFAULT_HTML_BUDGET = 10;

/**
 * A `Detector` decorator that passes at most `limit` IDs to `inner` over its lifetime, which is
 * one page view: the composition root builds one per page. IDs past the budget get unknown
 * `rate-limited`, which is kept in page memory only, so a later page view can try them again.
 * Pacing comes from the throttled `Http` that `inner` is built on. The sink hears the IDs past
 * the budget at once, then what `inner` lets it hear.
 */
export function createBudgetDetector(
  inner: Detector,
  logger: Pick<Logger, "error">,
  limit = DEFAULT_HTML_BUDGET,
): Detector {
  let left = limit;
  const settle = createSettle(logger);
  return {
    async detect(ids, sink) {
      const distinct = [...new Set(ids)];
      const allowed = distinct.slice(0, Math.max(left, 0));
      left -= allowed.length;
      const verdicts = new Map<AppId, KindVerdicts>(
        distinct.slice(allowed.length).map((id): [AppId, KindVerdicts] => [
          id,
          UNKNOWN_KINDS["rate-limited"],
        ]),
      );
      if (verdicts.size > 0) {
        sink?.(new Map(verdicts));
      }
      if (allowed.length > 0) {
        for (const [id, found] of await settle(inner, allowed, sink)) {
          verdicts.set(id, found);
        }
      }
      return verdicts;
    },
  };
}
