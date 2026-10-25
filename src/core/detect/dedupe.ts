import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Detector } from "../ports";
import type { AppId } from "../types";
import { settle } from "./settle";

type Answer = Promise<ReadonlyMap<AppId, KindVerdicts>>;

/** The IDs asked for in the current tick, and the one call that will answer them. */
interface Tick {
  readonly ids: AppId[];
  readonly answer: Answer;
}

function nextMicrotask(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

/**
 * A `Detector` decorator that deduplicates in-flight IDs. IDs asked for in the same tick, by any
 * number of `detect` calls, go to `inner` in one call, so one ID asked for twice costs one
 * request; an ID asked for while its call is still running waits for that call instead of
 * starting another. Once a call settles its IDs are forgotten: remembering verdicts is the
 * cache's job. Memory is bounded by the IDs in flight.
 */
export function createDedupingDetector(inner: Detector): Detector {
  const inFlight = new Map<AppId, Answer>();
  let tick: Tick | undefined;

  async function flush(ids: readonly AppId[]): Answer {
    await nextMicrotask();
    tick = undefined;
    const verdicts = await settle(inner, ids);
    for (const id of ids) {
      inFlight.delete(id);
    }
    return verdicts;
  }

  function answerFor(id: AppId): Answer {
    const running = inFlight.get(id);
    if (running !== undefined) {
      return running;
    }
    if (tick === undefined) {
      const ids: AppId[] = [];
      tick = { ids, answer: flush(ids) };
    }
    tick.ids.push(id);
    inFlight.set(id, tick.answer);
    return tick.answer;
  }

  return {
    async detect(ids) {
      const distinct = [...new Set(ids)];
      const answers = new Set(distinct.map(answerFor));
      const found = new Map<AppId, KindVerdicts>();
      for (const verdicts of await Promise.all(answers)) {
        for (const [id, verdict] of verdicts) {
          found.set(id, verdict);
        }
      }
      // A shared call may also hold other callers' IDs; answer only the requested ones.
      return new Map(
        distinct.map((id): [AppId, KindVerdicts] => [id, found.get(id) ?? UNKNOWN_KINDS.error]),
      );
    },
  };
}
