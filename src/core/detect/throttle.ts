import type { Clock, Http, HttpResult, HttpWithheld } from "../ports";
import type { Breaker } from "./breaker";

// Request pacing for Steam (rq6, S1): 30 back-to-back calls passed, so these are safety margins
// for the user's own browsing on the same IP, not measured limits.

export const DEFAULT_SPACING_MS = 1000;

const WITHHELD: HttpWithheld = { kind: "withheld" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface ThrottleOptions {
  readonly http: Http;
  readonly breaker: Breaker;
  readonly clock: Clock;
  /** The quiet time between one answer and the next request. */
  readonly spacingMs?: number;
}

/**
 * An `Http` decorator: one request in flight, `spacingMs` between the end of one request and the
 * start of the next, and nothing sent while the breaker is open (the result is `withheld`). Each
 * result is recorded before the next queued request checks the breaker, so a 429 stops the rest
 * of the queue. Like every `Http`, it never rejects.
 */
export function createThrottledHttp(options: ThrottleOptions): Http {
  const { http, breaker, clock } = options;
  const spacingMs = options.spacingMs ?? DEFAULT_SPACING_MS;
  let lastEnd = Number.NEGATIVE_INFINITY;
  let tail: Promise<unknown> = Promise.resolve();

  async function send(url: string): Promise<HttpResult> {
    const wait = lastEnd + spacingMs - clock.now();
    if (wait > 0) {
      await sleep(wait);
    }
    if (await breaker.isOpen()) {
      return WITHHELD;
    }
    const result = await http.get(url);
    lastEnd = clock.now();
    await breaker.record(result);
    return result;
  }

  return {
    get(url) {
      const result = tail.then(() => send(url));
      tail = result;
      return result;
    },
  };
}
