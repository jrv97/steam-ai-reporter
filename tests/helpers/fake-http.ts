import type { Fetch } from "../../src/core/http";
import type { Clock, Http, HttpResult } from "../../src/core/ports";

/** What a fake server answers to one request. */
export type Reply =
  | {
    readonly status?: number;
    readonly body?: string;
    readonly headers?: Readonly<Record<string, string>>;
    /** The final URL after redirects; the requested URL when absent. */
    readonly url?: string;
  }
  /** `fetch` rejects with a `TypeError`, as for a network failure or an answer without CORS. */
  | "network-error"
  /** The headers arrive, then reading the body fails. */
  | "body-error";

/** A URL prefix or pattern, and the reply (or a function of the requested URL giving it). */
export type Route = readonly [match: string | RegExp, reply: Reply | ((url: URL) => Reply)];

/** Unrouted URLs get this, like a server that has no such page. */
const NOT_FOUND: Reply = { status: 404 };

function replyFor(routes: readonly Route[], url: string): Reply {
  for (const [match, reply] of routes) {
    const hit = typeof match === "string" ? url.startsWith(match) : match.test(url);
    if (hit) {
      return typeof reply === "function" ? reply(new URL(url)) : reply;
    }
  }
  return NOT_FOUND;
}

function lowerCaseHeaders(headers: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(headers).map(([name, value]): [string, string] => [name.toLowerCase(), value]),
  );
}

/** The `HttpResult` an `Http` gives for `reply` to a request for `url`. */
export function httpResult(reply: Reply, url: string): HttpResult {
  if (typeof reply === "string") {
    return { kind: "failed", cause: new TypeError() };
  }
  return {
    kind: "response",
    status: reply.status ?? 200,
    url: reply.url ?? url,
    headers: lowerCaseHeaders(reply.headers ?? {}),
    body: reply.body ?? "",
  };
}

export interface FakeHttp extends Http {
  /** Every requested URL, in order. */
  readonly calls: readonly string[];
  /** The most requests that were in flight at the same time. */
  readonly maxInFlight: number;
}

/** A fake `Http` answering from routes; the first matching route wins. */
export function fakeHttp(routes: readonly Route[]): FakeHttp {
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  return {
    calls,
    get maxInFlight() {
      return maxInFlight;
    },
    async get(url) {
      calls.push(url);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Answer on a later microtask, so requests sent without awaiting overlap.
      await Promise.resolve();
      inFlight -= 1;
      return httpResult(replyFor(routes, url), url);
    },
  };
}

export interface HeldHttp extends Http {
  /** Every requested URL, in order. */
  readonly calls: readonly string[];
  /** Lets the oldest waiting request answer from the routes. */
  answerNext(): void;
}

/** A fake `Http` over routes whose requests wait until the test answers them, one at a time. */
export function heldHttp(routes: readonly Route[]): HeldHttp {
  const calls: string[] = [];
  const waiting: (() => void)[] = [];
  return {
    calls,
    answerNext() {
      waiting.shift()?.();
    },
    get(url) {
      calls.push(url);
      return new Promise((resolve) => {
        waiting.push(() => {
          resolve(httpResult(replyFor(routes, url), url));
        });
      });
    },
  };
}

/** One request a `timedHttp` sent, and the clock's time when it went out. */
interface SentRequest {
  readonly url: string;
  readonly at: number;
}

export interface TimedHttp {
  readonly http: Http;
  /** Every request, in order, with the time it went out. */
  readonly sent: readonly SentRequest[];
  /** The fake server under it. */
  readonly inner: FakeHttp;
}

/** A `fakeHttp` over `routes` that also records when each request went out by `clock`. */
export function timedHttp(routes: readonly Route[], clock: Clock): TimedHttp {
  const inner = fakeHttp(routes);
  const sent: SentRequest[] = [];
  const http: Http = {
    get(url) {
      sent.push({ url, at: clock.now() });
      return inner.get(url);
    },
  };
  return { http, sent, inner };
}

/** An `Http` that withholds every request, like a throttle behind an open breaker. */
export function withheldHttp(): Http {
  return { get: () => Promise.resolve({ kind: "withheld" }) };
}

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

export interface FakeFetch {
  readonly fetch: Fetch;
  /** Every call, with the options it was made with. */
  readonly calls: readonly FetchCall[];
}

/** A fake `fetch` answering from the same routes, with real `Response` objects. */
export function fakeFetch(routes: readonly Route[]): FakeFetch {
  const calls: FetchCall[] = [];
  const fetch: Fetch = (url, init) => {
    calls.push({ url, init });
    const reply = replyFor(routes, url);
    if (reply === "network-error") {
      return Promise.reject(new TypeError());
    }
    if (reply === "body-error") {
      const response = new Response("");
      Object.defineProperty(response, "text", { value: () => Promise.reject(new TypeError()) });
      return Promise.resolve(response);
    }
    const { status = 200, body = "", headers = {} } = reply;
    const response = new Response(body, { status, headers });
    // A constructed Response has an empty `url`; a fetched one carries its final URL.
    Object.defineProperty(response, "url", { value: reply.url ?? url });
    return Promise.resolve(response);
  };
  return { fetch, calls };
}
