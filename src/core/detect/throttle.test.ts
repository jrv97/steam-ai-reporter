import { afterEach, describe, expect, it, vi } from "vitest";
import { httpContract } from "../../../tests/contracts/http.contract";
import { appIds } from "../../../tests/helpers/app-ids";
import { fakeHttp, type Reply, type Route } from "../../../tests/helpers/fake-http";
import { getItemsRequest, getItemsRoute, storeItem } from "../../../tests/helpers/getitems";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { recordingLogger } from "../../../tests/helpers/recording-logger";
import { T0, useTimerClock } from "../../../tests/helpers/timer-clock";
import type { Clock, Http, KeyValueStore } from "../ports";
import { UNKNOWN } from "../types";
import { API_BREAKER_KEY, type Breaker, createBreaker } from "./breaker";
import { createGetItemsDetector, GETITEMS_URL } from "./getitems";
import { createThrottledHttp } from "./throttle";

const API = `${GETITEMS_URL}?input_json=%7B%7D`;

interface Sent {
  readonly url: string;
  readonly at: number;
}

/** A fake server that also records when each request went out. */
function timedHttp(routes: readonly Route[], clock: Clock) {
  const inner = fakeHttp(routes);
  const sent: Sent[] = [];
  const http: Http = {
    get(url) {
      sent.push({ url, at: clock.now() - T0 });
      return inner.get(url);
    },
  };
  return { http, sent, inner };
}

function setup(routes: readonly Route[], store: KeyValueStore = memoryStore()) {
  const clock = useTimerClock();
  const server = timedHttp(routes, clock);
  const breaker = createBreaker({
    store,
    clock,
    logger: recordingLogger().logger,
    key: API_BREAKER_KEY,
    random: () => 0,
  });
  const http = createThrottledHttp({ http: server.http, breaker, clock });
  return { ...server, http, store };
}

/** Answers the URL with each reply in turn, then with the last one. */
function sequence(...replies: readonly Reply[]): Route {
  let index = 0;
  return [API, () => replies[Math.min(index++, replies.length - 1)] ?? { status: 200 }];
}

/** The settled value of `promise` after the fake timers ran for `ms`. */
async function after<T>(ms: number, promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
}

afterEach(() => {
  vi.useRealTimers();
});

/** A breaker that never opens: the contract checks what the throttle passes through. */
const closedBreaker: Breaker = {
  isOpen: () => Promise.resolve(false),
  record: () => Promise.resolve(),
};

httpContract("createThrottledHttp", (routes) => {
  const clock: Clock = { now: () => Date.now() };
  // No spacing, so the contract runs on real timers; spacing and the breaker have their own tests.
  return createThrottledHttp({
    http: fakeHttp(routes),
    breaker: closedBreaker,
    clock,
    spacingMs: 0,
  });
});

describe("createThrottledHttp", () => {
  it("keeps one request in flight, 1 s after the previous answer", async () => {
    const { http, sent, inner } = setup([[API, { status: 200 }]]);
    const all = Promise.all([http.get(API), http.get(`${API}&2`), http.get(`${API}&3`)]);
    await after(2_000, all);
    expect(sent.map(({ at }) => at)).toStrictEqual([0, 1_000, 2_000]);
    expect(inner.maxInFlight).toBe(1);
  });

  it("sends at once when the last answer is older than the spacing", async () => {
    const { http, sent } = setup([[API, { status: 200 }]]);
    await after(0, http.get(API));
    await vi.advanceTimersByTimeAsync(5_000);
    await after(0, http.get(API));
    expect(sent.map(({ at }) => at)).toStrictEqual([0, 5_000]);
  });

  it.each<[string, Reply]>([
    ["a 429", { status: 429 }],
    ["a TypeError from fetch", "network-error"],
    ["a 503", { status: 503 }],
  ])("after %s, sends nothing until the breaker closes", async (_, reply) => {
    const { http, sent } = setup([sequence(reply, { status: 200 })]);
    const first = await after(0, http.get(API));
    expect(first.kind).toBe(reply === "network-error" ? "failed" : "response");
    // Queued behind the trip, and asked for during the pause: all withheld, none sent.
    const queued = http.get(API);
    expect(await after(1_000, queued)).toStrictEqual({ kind: "withheld" });
    expect(await after(30_000, http.get(API))).toStrictEqual({ kind: "withheld" });
    expect(await after(28_000, http.get(API))).toStrictEqual({ kind: "withheld" });
    expect(sent).toHaveLength(1);
    // 60 s after the trip (random 0, so no jitter) the next request goes out.
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await after(0, http.get(API))).kind).toBe("response");
    expect(sent.map(({ at }) => at)).toStrictEqual([0, 60_000]);
  });

  it("honors a breaker another tab opened", async () => {
    const store = memoryStore(new Map([[API_BREAKER_KEY, { until: T0 + 10_000 }]]));
    const { http, sent } = setup([[API, { status: 200 }]], store);
    expect(await after(0, http.get(API))).toStrictEqual({ kind: "withheld" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await after(0, http.get(API))).kind).toBe("response");
    expect(sent.map(({ at }) => at)).toStrictEqual([10_000]);
  });
});

describe("GetItems through the throttle", () => {
  const ids = appIds(...Array.from({ length: 120 }, (_, index) => 4_000_000 + index));
  const pool = ids.map((id) => storeItem(id));

  it("sends 120 IDs as calls of 50, 50 and 20, 1 s apart", async () => {
    const { http, sent, inner } = setup([getItemsRoute(pool)]);
    const detector = createGetItemsDetector({ http, language: "english" });
    const verdicts = await after(2_000, detector.detect(ids));
    expect(sent.map(({ url }) => getItemsRequest(url).ids.length)).toStrictEqual([50, 50, 20]);
    expect(sent.map(({ at }) => at)).toStrictEqual([0, 1_000, 2_000]);
    expect(inner.maxInFlight).toBe(1);
    expect(verdicts.size).toBe(120);
    expect([...verdicts.values()].every((verdict) => verdict.state === "not-disclosed")).toBe(true);
  });

  it.each<[string, Reply]>([
    ["a 429", { status: 429 }],
    ["a TypeError", "network-error"],
  ])("stops after %s and answers every ID unknown rate-limited", async (_, reply) => {
    const { http, sent } = setup([[GETITEMS_URL, reply]]);
    const detector = createGetItemsDetector({ http, language: "english" });
    const verdicts = await after(2_000, detector.detect(ids));
    expect(sent).toHaveLength(1);
    const first = new Set(ids.slice(0, 50));
    for (const [id, verdict] of verdicts) {
      // The batch that tripped is `rate-limited` (429) or `error` (TypeError); the rest were held.
      if (!first.has(id)) {
        expect(verdict).toBe(UNKNOWN["rate-limited"]);
      }
    }
    expect(await after(50_000, detector.detect(ids.slice(0, 1)))).toStrictEqual(
      new Map([[ids[0], UNKNOWN["rate-limited"]]]),
    );
    expect(sent).toHaveLength(1);
  });
});
