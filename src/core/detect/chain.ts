import { KINDS } from "../kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Logger } from "../log";
import type { Detector, VerdictSink } from "../ports";
import type { AppId } from "../types";
import { createSettle } from "./settle";

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

/** Forwards a link's verdicts that no later link will change: all of them for the last link. */
function finalOnly(sink: VerdictSink, last: boolean): VerdictSink {
  return last ? sink : (partial) => {
    const known = new Map([...partial].filter(([, verdicts]) => !passesOn(verdicts)));
    if (known.size > 0) {
      sink(known);
    }
  };
}

/**
 * A `Detector` over an ordered list of links, such as GetItems and then the HTML fallback. Each
 * link gets only the IDs the links before it left as unknown `missing`; a link is not called when
 * none are left. Any other verdict, unknown `error` and `rate-limited` included, is final, so an
 * outage or a pause of one source does not move its load onto the next. New sources are new
 * links; this module is not edited for them. The sink hears what no later link will change: a
 * link's answers that do not pass on, and everything the last link answers.
 */
export function createChainDetector(
  links: readonly Detector[],
  logger: Pick<Logger, "error">,
): Detector {
  // One settle per link, so each link's failure streak is its own.
  const settled = links.map((link) => ({ link, settle: createSettle(logger) }));
  return {
    async detect(ids, sink) {
      let pending: readonly AppId[] = [...new Set(ids)];
      // What no link has answered yet is unknown `missing`, so an empty chain still answers.
      const verdicts = new Map(
        pending.map((id): [AppId, KindVerdicts] => [id, UNKNOWN_KINDS.missing]),
      );
      for (const [index, { link, settle }] of settled.entries()) {
        if (pending.length === 0) {
          break;
        }
        const hear = sink === undefined
          ? undefined
          : finalOnly(sink, index === settled.length - 1);
        // Sequential on purpose: each link sees only what the one before it could not settle.
        const next: AppId[] = [];
        for (const [id, found] of await settle(link, pending, hear)) {
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
