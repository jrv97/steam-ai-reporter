import { KINDS } from "../kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { AppId, Detector } from "../types";
import { settle } from "./settle";

/** Only Steam having no usable item, so that no kind has an answer, is worth a second source. */
function passesOn(verdicts: KindVerdicts): boolean {
  for (const kind of KINDS) {
    const verdict = verdicts[kind.id];
    if (verdict.state !== "unknown" || verdict.reason !== "missing") {
      return false;
    }
  }
  return true;
}

/**
 * A `Detector` over an ordered list of links, such as GetItems and then the HTML fallback. Each
 * link gets only the IDs the links before it left as unknown `missing`; a link is not called when
 * none are left. Any other verdict, unknown `error` and `rate-limited` included, is final, so an
 * outage or a pause of one source does not move its load onto the next. New sources are new
 * links; this module is not edited for them.
 */
export function createChainDetector(links: readonly Detector[]): Detector {
  return {
    async detect(ids) {
      let pending: readonly AppId[] = [...new Set(ids)];
      // What no link has answered yet is unknown `missing`, so an empty chain still answers.
      const verdicts = new Map(
        pending.map((id): [AppId, KindVerdicts] => [id, UNKNOWN_KINDS.missing]),
      );
      for (const link of links) {
        if (pending.length === 0) {
          break;
        }
        // Sequential on purpose: each link sees only what the one before it could not settle.
        const next: AppId[] = [];
        for (const [id, found] of await settle(link, pending)) {
          verdicts.set(id, found);
          if (passesOn(found)) {
            next.push(id);
          }
        }
        pending = next;
      }
      return verdicts;
    },
  };
}
