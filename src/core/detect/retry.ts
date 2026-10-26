import { isTransient } from "../cache/ttl";
import type { KindVerdicts } from "../kinds/verdicts";
import { DEFAULT_BACKOFF } from "./breaker";

/** How many times one item is asked again after a transient answer. */
export const MAX_RETRIES = 2;
/** Slack past the longest breaker pause for timer and clock drift. */
const RETRY_MARGIN_MS = 1000;
/**
 * The wait before a retry round: past the longest breaker pause, so the breaker has closed and the
 * page memory entry of the transient answer (`TRANSIENT_TTL_MS`) has expired.
 */
export const RETRY_DELAY_MS = DEFAULT_BACKOFF.baseMs + DEFAULT_BACKOFF.jitterMs + RETRY_MARGIN_MS;

/** Runs a callback after a delay and returns its cancel. */
export type Delay = (callback: () => void, ms: number) => () => void;

function timeout(callback: () => void, ms: number): () => void {
  const id = setTimeout(callback, ms);
  return () => {
    clearTimeout(id);
  };
}

/** Asks again, in rounds, about what came back transient: a failed or withheld lookup. */
export interface TransientRetry<Item extends WeakKey> {
  /** Queues the item for the next round when its verdicts are transient and it has retries left. */
  offer(item: Item, verdicts: KindVerdicts): void;
  /** Drops the queued items and cancels the round's timer. */
  cancel(): void;
}

/**
 * One timer per round for every queued item, never one per item, and at most `MAX_RETRIES` rounds
 * per item, counted in a `WeakMap`. `retry` gets the round's items and decides which still matter.
 * A verdict that is stored, such as `missing`, is never asked again before its TTL.
 */
export function createTransientRetry<Item extends WeakKey>(
  retry: (items: readonly Item[]) => void,
  delay: Delay = timeout,
): TransientRetry<Item> {
  const tries = new WeakMap<Item, number>();
  let queued = new Set<Item>();
  let cancelRound: (() => void) | undefined;

  function fire(): void {
    const due = [...queued];
    queued = new Set();
    cancelRound = undefined;
    retry(due);
  }

  return {
    offer(item, verdicts) {
      const done = tries.get(item) ?? 0;
      if (done >= MAX_RETRIES || !isTransient(verdicts)) {
        return;
      }
      tries.set(item, done + 1);
      queued.add(item);
      cancelRound ??= delay(fire, RETRY_DELAY_MS);
    },
    cancel() {
      cancelRound?.();
      cancelRound = undefined;
      queued = new Set();
    },
  };
}
