import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Detector } from "../ports";
import type { AppId } from "../types";
import { settle } from "./settle";

/** HTML fallback apps per page view (ADR 0001): each one is a full app page request. */
export const DEFAULT_HTML_BUDGET = 10;

/**
 * A `Detector` decorator that passes at most `limit` IDs to `inner` over its lifetime, which is
 * one page view: the composition root builds one per page. IDs past the budget get unknown
 * `rate-limited`, which is kept in page memory only, so a later page view can try them again.
 * Pacing comes from the throttled `Http` that `inner` is built on.
 */
export function createBudgetDetector(inner: Detector, limit = DEFAULT_HTML_BUDGET): Detector {
  let left = limit;
  return {
    async detect(ids) {
      const distinct = [...new Set(ids)];
      const allowed = distinct.slice(0, Math.max(left, 0));
      left -= allowed.length;
      const verdicts = new Map<AppId, KindVerdicts>(
        distinct.slice(allowed.length).map((id): [AppId, KindVerdicts] => [
          id,
          UNKNOWN_KINDS["rate-limited"],
        ]),
      );
      if (allowed.length > 0) {
        for (const [id, found] of await settle(inner, allowed)) {
          verdicts.set(id, found);
        }
      }
      return verdicts;
    },
  };
}
