import * as v from "valibot";
import type { Logger } from "../log";
import type { Clock, HttpResult, KeyValueStore } from "../ports";

// The circuit breaker that pauses detection after Steam refuses a request (ADR 0001, rq6 S1).
// `Retry-After` is not readable cross-origin, so the pause is always the fixed backoff below.

/** Where the GetItems breaker is stored; other tabs read it, so all of them pause together. */
export const API_BREAKER_KEY = "v1:breaker";
/** The HTML fallback's own breaker, so a refused app page does not pause GetItems. */
export const HTML_BREAKER_KEY = "v1:breaker:html";

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const HTTP_MAX_STATUS = 599;
const MS_PER_SECOND = 1000;

export interface Backoff {
  /** The fixed part of the pause. */
  readonly baseMs: number;
  /** The most random jitter added to it, so tabs and users do not retry in step. */
  readonly jitterMs: number;
}

export const DEFAULT_BACKOFF: Backoff = { baseMs: 60_000, jitterMs: 10_000 };

/**
 * Whether a result trips the breaker: a 429, a 5xx, or no readable answer. A failed request counts
 * like a 429 because Steam's error answers carry no CORS headers and reach `fetch` as a bare
 * `TypeError` (rq6, S1). A withheld request was never sent, so it trips nothing.
 */
export function tripsBreaker(result: HttpResult): boolean {
  switch (result.kind) {
    case "response":
      return result.status === HTTP_TOO_MANY_REQUESTS
        || (result.status >= HTTP_SERVER_ERROR && result.status <= HTTP_MAX_STATUS);
    case "failed":
      return true;
    case "withheld":
      return false;
  }
}

const StoredBreakerSchema = v.object({ until: v.pipe(v.number(), v.safeInteger()) });

/**
 * A persisted circuit breaker. Both methods never reject: when storage fails, the breaker keeps
 * working on what this tab knows.
 */
export interface Breaker {
  /** Whether requests are held back now, by this tab's state or by another tab's. */
  isOpen(): Promise<boolean>;
  /** Opens the breaker when `result` trips it; any other result changes nothing. */
  record(result: HttpResult): Promise<void>;
}

export interface BreakerOptions {
  readonly store: KeyValueStore;
  readonly clock: Clock;
  readonly logger: Logger;
  /** The storage key, `API_BREAKER_KEY` or `HTML_BREAKER_KEY`. */
  readonly key: string;
  readonly backoff?: Backoff;
  /** A number in [0, 1); `Math.random` unless a test fixes it. */
  readonly random?: () => number;
}

/**
 * A circuit breaker persisted as `{ until }` (epoch milliseconds) under its key. Open means
 * `now < until`. There is no half-open probe count: once the pause is over the next request goes
 * out, and a new trip opens the breaker again. An expired value is left in place rather than
 * removed, because removing could race with another tab that just opened it.
 */
export function createBreaker(options: BreakerOptions): Breaker {
  const { store, clock, logger, key } = options;
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const random = options.random ?? Math.random;
  const longest = backoff.baseMs + backoff.jitterMs;
  /** This tab's own pause, which holds even when storage cannot be read or written. */
  let localUntil = 0;
  let open = false;

  /** Another tab's pause. Values out of range (corrupt, or a clock moved back) are ignored. */
  async function storedUntil(now: number): Promise<number> {
    try {
      const parsed = v.safeParse(StoredBreakerSchema, (await store.get([key])).get(key));
      return parsed.success && parsed.output.until <= now + longest ? parsed.output.until : 0;
    } catch {
      return 0;
    }
  }

  return {
    async isOpen() {
      const now = clock.now();
      const until = Math.max(localUntil, await storedUntil(now));
      const nowOpen = now < until;
      if (open && !nowOpen) {
        logger.info("notice_breaker_closed", { breaker: key });
      }
      open = nowOpen;
      return nowOpen;
    },

    async record(result) {
      if (!tripsBreaker(result)) {
        return;
      }
      const now = clock.now();
      const pauseMs = backoff.baseMs + Math.floor(random() * backoff.jitterMs);
      const until = Math.max(localUntil, now + pauseMs);
      localUntil = until;
      open = true;
      logger.warn("warn_breaker_opened", {
        seconds: String(Math.ceil((until - now) / MS_PER_SECOND)),
        breaker: key,
      });
      try {
        await store.set(new Map([[key, { until }]]));
      } catch {
        // This tab still honors `localUntil`; other tabs find out from their own requests.
      }
    },
  };
}
