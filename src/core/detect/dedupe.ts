import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Logger } from "../log";
import type { Detector, VerdictSink } from "../ports";
import type { AppId } from "../types";
import { createSettle, tell } from "./settle";

type Answer = Promise<ReadonlyMap<AppId, KindVerdicts>>;

/** A caller of `detect` that waits on a flight, and the IDs it asked of it. */
interface Waiter {
  readonly ids: ReadonlySet<AppId>;
  readonly sink: VerdictSink;
}

/** One call to `inner`: its answer, the verdicts landed so far and the callers that hear them. */
interface Flight {
  readonly answer: Answer;
  readonly landed: Map<AppId, KindVerdicts>;
  readonly waiters: Set<Waiter>;
}

/** The IDs asked for in the current tick, and the one call that will answer them. */
interface Tick {
  readonly ids: AppId[];
  readonly flight: Flight;
}

function nextMicrotask(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

/** The verdicts of `ids` that `from` holds. */
function pick(
  from: ReadonlyMap<AppId, KindVerdicts>,
  ids: ReadonlySet<AppId>,
): ReadonlyMap<AppId, KindVerdicts> {
  return new Map([...from].filter(([id]) => ids.has(id)));
}

/**
 * A `Detector` decorator that deduplicates in-flight IDs. IDs asked for in the same tick, by any
 * number of `detect` calls, go to `inner` in one call, so one ID asked for twice costs one
 * request; an ID asked for while its call is still running waits for that call instead of
 * starting another. Every caller's sink hears its own IDs as they land, and one that joins late
 * hears at once what landed before. Once a call settles its IDs are forgotten: remembering
 * verdicts is the cache's job. Memory is bounded by the IDs in flight.
 */
export function createDedupingDetector(inner: Detector, logger: Pick<Logger, "error">): Detector {
  const inFlight = new Map<AppId, Flight>();
  let tick: Tick | undefined;
  const settle = createSettle(logger);

  async function flush(ids: readonly AppId[], flight: Omit<Flight, "answer">): Answer {
    await nextMicrotask();
    tick = undefined;
    const verdicts = await settle(inner, ids, (partial) => {
      for (const [id, found] of partial) {
        flight.landed.set(id, found);
      }
      for (const waiter of flight.waiters) {
        const heard = pick(partial, waiter.ids);
        if (heard.size > 0) {
          tell(waiter.sink, heard, logger);
        }
      }
    });
    for (const id of ids) {
      inFlight.delete(id);
    }
    return verdicts;
  }

  function flightFor(id: AppId): Flight {
    const running = inFlight.get(id);
    if (running !== undefined) {
      return running;
    }
    if (tick === undefined) {
      const ids: AppId[] = [];
      const parts = { landed: new Map<AppId, KindVerdicts>(), waiters: new Set<Waiter>() };
      tick = { ids, flight: { ...parts, answer: flush(ids, parts) } };
    }
    tick.ids.push(id);
    inFlight.set(id, tick.flight);
    return tick.flight;
  }

  /** Lets `sink` hear its IDs of each flight, starting with what already landed. */
  function listen(flights: ReadonlyMap<Flight, Set<AppId>>, sink: VerdictSink): () => void {
    const joined: [Flight, Waiter][] = [];
    for (const [flight, ids] of flights) {
      const waiter = { ids, sink };
      flight.waiters.add(waiter);
      joined.push([flight, waiter]);
      const landed = pick(flight.landed, ids);
      if (landed.size > 0) {
        tell(sink, landed, logger);
      }
    }
    return () => {
      for (const [flight, waiter] of joined) {
        flight.waiters.delete(waiter);
      }
    };
  }

  return {
    async detect(ids, sink) {
      const distinct = [...new Set(ids)];
      const flights = new Map<Flight, Set<AppId>>();
      for (const id of distinct) {
        const flight = flightFor(id);
        const asked = flights.get(flight) ?? new Set();
        asked.add(id);
        flights.set(flight, asked);
      }
      const leave = sink === undefined ? undefined : listen(flights, sink);
      const found = new Map<AppId, KindVerdicts>();
      for (const verdicts of await Promise.all([...flights.keys()].map((each) => each.answer))) {
        for (const [id, verdict] of verdicts) {
          found.set(id, verdict);
        }
      }
      leave?.();
      // A shared call may also hold other callers' IDs; answer only the requested ones.
      return new Map(
        distinct.map((id): [AppId, KindVerdicts] => [id, found.get(id) ?? UNKNOWN_KINDS.error]),
      );
    },
  };
}
