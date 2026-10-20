import { type AppId, type Detector, UNKNOWN, type Verdict } from "../types";
import { settle } from "./settle";

/** Only Steam having no usable item is worth asking the next source about. */
function passesOn(verdict: Verdict): boolean {
  return verdict.state === "unknown" && verdict.reason === "missing";
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
      const verdicts = new Map(pending.map((id): [AppId, Verdict] => [id, UNKNOWN.missing]));
      for (const link of links) {
        if (pending.length === 0) {
          break;
        }
        // Sequential on purpose: each link sees only what the one before it could not settle.
        const next: AppId[] = [];
        for (const [id, verdict] of await settle(link, pending)) {
          verdicts.set(id, verdict);
          if (passesOn(verdict)) {
            next.push(id);
          }
        }
        pending = next;
      }
      return verdicts;
    },
  };
}
