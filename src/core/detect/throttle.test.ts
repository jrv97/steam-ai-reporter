import { afterEach, describe, expect, it, vi } from "vitest";
import { httpContract } from "../../../tests/contracts/http.contract";
import { make } from "../../../tests/helpers/factory";
import type { Reply, Route } from "../../../tests/helpers/fake-http";
import { fake } from "../../../tests/helpers/fakes";
import { getItemsRequest } from "../../../tests/helpers/getitems";
import { T0 } from "../../../tests/helpers/timer-clock";
import type { KindVerdicts } from "../kinds/verdicts";
import type { Clock, HttpResult, KeyValueStore } from "../ports";
import { API_BREAKER_KEY, createBreaker, DEFAULT_BACKOFF } from "./breaker";
import { createGetItemsDetector, DEFAULT_BATCH_LIMITS, GETITEMS_URL } from "./getitems";
import { createThrottledHttp, DEFAULT_SPACING_MS } from "./throttle";

const API = `${GETITEMS_URL}?input_json=%7B%7D`;
const SPACING = DEFAULT_SPACING_MS;
const PAUSE = DEFAULT_BACKOFF.baseMs;

function setup(routes: readonly Route[], store: KeyValueStore = fake.store()) {
  const clock = fake.timerClock();
  const server = fake.timedHttp(routes, clock);
  const breaker = createBreaker({
    store,
    clock,
    logger: fake.logger().logger,
    key: API_BREAKER_KEY,
    random: () => 0,
  });
  const http = createThrottledHttp({ http: server.http, breaker, clock });
  return {
    http,
    inner: server.inner,
    sent: server.sent,
    at: () => server.sent.map(({ at }) => at - T0),
  };
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

httpContract("createThrottledHttp", (routes) => {
  const clock: Clock = { now: () => Date.now() };
  // No spacing, so the contract runs on real timers; spacing and the breaker have their own tests.
  return createThrottledHttp({
    http: fake.http(routes),
    breaker: fake.closedBreaker(),
    clock,
    spacingMs: 0,
  });
});

describe("createThrottledHttp", () => {
  it("keeps one request in flight, one spacing after the previous answer", async () => {
    const { http, at, inner } = setup([[API, { status: 200 }]]);
    const all = Promise.all([http.get(API), http.get(`${API}&2`), http.get(`${API}&3`)]);
    await after(2 * SPACING, all);
    expect(at()).toStrictEqual([0, SPACING, 2 * SPACING]);
    expect(inner.maxInFlight).toBe(1);
  });

  it("sends at once when the last answer is older than the spacing", async () => {
    const { http, at } = setup([[API, { status: 200 }]]);
    const idle = SPACING + make.duration();
    await after(0, http.get(API));
    await vi.advanceTimersByTimeAsync(idle);
    await after(0, http.get(API));
    expect(at()).toStrictEqual([0, idle]);
  });

  it.each<[string, Reply, HttpResult["kind"]]>([
    ["a 429", { status: 429 }, "response"],
    ["a TypeError from fetch", "network-error", "failed"],
    ["a 503", { status: 503 }, "response"],
  ])("after %s, sends nothing until the breaker closes", async (_, reply, kind) => {
    const { http, sent, at } = setup([sequence(reply, { status: 200 })]);
    expect((await after(0, http.get(API))).kind).toBe(kind);
    // Queued behind the trip, and asked for during the pause: all withheld, none sent.
    const queued = http.get(API);
    expect(await after(SPACING, queued)).toStrictEqual({ kind: "withheld" });
    expect(await after(PAUSE / 2, http.get(API))).toStrictEqual({ kind: "withheld" });
    expect(await after(PAUSE / 2 - 2 * SPACING, http.get(API))).toStrictEqual({
      kind: "withheld",
    });
    expect(sent).toHaveLength(1);
    // The base pause after the trip (random 0, so no jitter) the next request goes out.
    await vi.advanceTimersByTimeAsync(SPACING);
    expect((await after(0, http.get(API))).kind).toBe("response");
    expect(at()).toStrictEqual([0, PAUSE]);
  });

  it("honors a breaker another tab opened", async () => {
    // Any pause the breaker accepts as stored: at most the base pause plus jitter.
    const pause = PAUSE / 6;
    const store = fake.store(new Map([[API_BREAKER_KEY, { until: T0 + pause }]]));
    const { http, at } = setup([[API, { status: 200 }]], store);
    expect(await after(0, http.get(API))).toStrictEqual({ kind: "withheld" });
    await vi.advanceTimersByTimeAsync(pause);
    expect((await after(0, http.get(API))).kind).toBe("response");
    expect(at()).toStrictEqual([pause]);
  });
});

describe("GetItems through the throttle", () => {
  const { maxIds } = DEFAULT_BATCH_LIMITS;
  const ids = make.appIds(2 * maxIds + 20);
  const pool = ids.map((id) => make.item.store(id));
  const RATE_LIMITED = make.verdicts.uniform("rate-limited");

  it("sends 120 IDs as calls of 50, 50 and 20, one spacing apart", async () => {
    const { http, sent, at, inner } = setup([make.item.route(pool)]);
    const detector = createGetItemsDetector({ http, language: "english" });
    const verdicts = await after(2 * SPACING, detector.detect(ids));
    expect(sent.map(({ url }) => getItemsRequest(url).ids.length)).toStrictEqual([
      maxIds,
      maxIds,
      20,
    ]);
    expect(at()).toStrictEqual([0, SPACING, 2 * SPACING]);
    expect(inner.maxInFlight).toBe(1);
    expect(verdicts.size).toBe(ids.length);
    expect([...verdicts.values()].every((verdict) => verdict.ai.state === "not-disclosed")).toBe(
      true,
    );
  });

  it.each<[string, Reply, KindVerdicts]>([
    ["a 429", { status: 429 }, RATE_LIMITED],
    ["a TypeError", "network-error", make.verdicts.uniform("error")],
  ])("stops after %s and holds every later batch as rate-limited", async (_, reply, tripped) => {
    const { http, sent } = setup([[GETITEMS_URL, reply]]);
    const detector = createGetItemsDetector({ http, language: "english" });
    const verdicts = await after(2 * SPACING, detector.detect(ids));
    expect(sent).toHaveLength(1);
    const verdictsOf = (part: readonly typeof ids[number][]) => part.map((id) => verdicts.get(id));
    expect(verdictsOf(ids.slice(0, maxIds))).toStrictEqual(ids.slice(0, maxIds).map(() => tripped));
    expect(verdictsOf(ids.slice(maxIds))).toStrictEqual(ids.slice(maxIds).map(() => RATE_LIMITED));
    const first = ids.slice(0, 1);
    expect(await after(PAUSE - 10 * SPACING, detector.detect(first))).toStrictEqual(
      new Map(first.map((id) => [id, RATE_LIMITED])),
    );
    expect(sent).toHaveLength(1);
  });
});
