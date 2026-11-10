import { describe, expect, it } from "vitest";
import type { CountingStore } from "../../../tests/helpers/counting-store";
import { make } from "../../../tests/helpers/factory";
import type { Reply } from "../../../tests/helpers/fake-http";
import { fake } from "../../../tests/helpers/fakes";
import { englishI18n } from "../../../tests/helpers/i18n";
import type { JsonValue } from "../json";
import type { HttpResult } from "../ports";
import {
  API_BREAKER_KEY,
  type BreakerOptions,
  createBreaker,
  DEFAULT_BACKOFF,
  HTML_BREAKER_KEY,
  tripsBreaker,
} from "./breaker";

const T0 = make.time();
const URL = make.text.url();
const i18n = englishI18n();
const { baseMs, jitterMs } = DEFAULT_BACKOFF;
/** The pause with the random source at 0.5, as `setup` sets it. */
const PAUSE = baseMs + jitterMs / 2;

function result(reply: Reply): HttpResult {
  return make.http.result(reply, URL);
}

function setup(overrides: Partial<BreakerOptions> = {}) {
  const clock = fake.clock(T0);
  const store = fake.store();
  const { logger, sink } = fake.logger();
  const options: BreakerOptions = {
    store,
    clock,
    logger,
    key: API_BREAKER_KEY,
    random: () => 0.5,
    ...overrides,
  };
  return { clock, store, sink, options, breaker: createBreaker(options) };
}

describe("tripsBreaker", () => {
  it.each<readonly [string, HttpResult, boolean]>([
    ["a 429", result({ status: 429 }), true],
    ["a 500", result({ status: 500 }), true],
    ["a 503", result({ status: 503 }), true],
    ["a 599", result({ status: 599 }), true],
    ["a network error", result("network-error"), true],
    ["a 200", result({ status: 200 }), false],
    ["a 400", result({ status: 400 }), false],
    ["a 404", result({ status: 404 }), false],
    ["a withheld request", { kind: "withheld" }, false],
  ])("%s trips: %s", (_name, answer, trips) => {
    expect(tripsBreaker(answer)).toBe(trips);
  });
});

describe("createBreaker", () => {
  it("starts closed and stays closed on answers that do not trip it", async () => {
    const { breaker, store } = setup();
    expect(await breaker.isOpen()).toBe(false);
    await breaker.record(result({ status: 200 }));
    await breaker.record(result({ status: 404 }));
    expect(await breaker.isOpen()).toBe(false);
    expect(await store.keys()).toStrictEqual([]);
  });

  it("opens on a 429 for the base pause plus jitter, then closes", async () => {
    const { breaker, clock, store, sink } = setup();
    await breaker.record(result({ status: 429 }));
    expect(await breaker.isOpen()).toBe(true);
    expect(await store.get([API_BREAKER_KEY])).toStrictEqual(
      new Map([[API_BREAKER_KEY, { until: T0 + PAUSE }]]),
    );
    expect(sink.warn).toHaveBeenCalledWith(
      "[tks]",
      i18n.t("warn_breaker_opened", { seconds: String(PAUSE / 1000), breaker: API_BREAKER_KEY }),
    );
    clock.advance(PAUSE - 1);
    expect(await breaker.isOpen()).toBe(true);
    clock.advance(1);
    expect(await breaker.isOpen()).toBe(false);
    expect(await breaker.isOpen()).toBe(false);
    expect(sink.info).toHaveBeenCalledOnce();
    expect(sink.info).toHaveBeenCalledWith(
      "[tks]",
      i18n.t("notice_breaker_closed", { breaker: API_BREAKER_KEY }),
    );
  });

  it.each([[0, baseMs], [0.999_99, baseMs + jitterMs - 1]])(
    "with random %d pauses %d ms",
    async (r, ms) => {
      const { breaker, clock } = setup({ random: () => r });
      await breaker.record(result("network-error"));
      clock.advance(ms - 1);
      expect(await breaker.isOpen()).toBe(true);
      clock.advance(1);
      expect(await breaker.isOpen()).toBe(false);
    },
  );

  it("is honored by a new instance reading the same store, as in another tab", async () => {
    const { breaker, options, clock } = setup();
    await breaker.record(result({ status: 429 }));
    const otherTab = createBreaker({ ...options, logger: fake.logger().logger });
    expect(await otherTab.isOpen()).toBe(true);
    clock.advance(PAUSE);
    expect(await otherTab.isOpen()).toBe(false);
  });

  it("keeps the API and HTML breakers apart", async () => {
    const { breaker, options } = setup();
    await breaker.record(result({ status: 429 }));
    expect(await createBreaker({ ...options, key: HTML_BREAKER_KEY }).isOpen()).toBe(false);
  });

  it.each<[string, JsonValue]>([
    ...make.raw.junk().map((value): [string, JsonValue] => [JSON.stringify(value), value]),
    ["a non-numeric until", { until: make.text.note() }],
    ["a fractional until", { until: T0 + 0.5 }],
    ["an until beyond the longest pause", { until: T0 + baseMs + jitterMs + 1 }],
  ])("ignores a stored value of %s", async (_, value) => {
    const { options } = setup();
    await options.store.set(new Map([[API_BREAKER_KEY, value]]));
    expect(await createBreaker(options).isOpen()).toBe(false);
  });

  it("works on this tab's state when storage fails, without rejecting", async () => {
    const store = fake.countingStore(fake.store());
    store.break();
    const { breaker } = setup({ store });
    expect(await breaker.isOpen()).toBe(false);
    await expect(breaker.record(result({ status: 429 }))).resolves.toBeUndefined();
    expect(await breaker.isOpen()).toBe(true);
  });

  it.each<readonly [string, (store: CountingStore) => void, number]>([
    ["reads and writes", (store) => {
      store.break();
    }, 2],
    ["only writes", (store) => {
      store.breakWrites();
    }, 1],
  ])("logs failed %s once per streak of failures", async (_name, breakStore, perStreak) => {
    const store = fake.countingStore(fake.store());
    const { breaker, sink } = setup({ store });
    const tripTwice = async () => {
      for (let trip = 0; trip < 2; trip += 1) {
        await breaker.isOpen();
        await breaker.record(result({ status: 429 }));
      }
    };
    breakStore(store);
    await tripTwice();
    expect(sink.error).toHaveBeenCalledTimes(perStreak);
    expect(sink.error).toHaveBeenCalledWith(
      "[tks]",
      i18n.t("error_breaker_store", { breaker: API_BREAKER_KEY }),
      expect.any(Error),
    );
    store.heal();
    await tripTwice();
    breakStore(store);
    await tripTwice();
    expect(sink.error).toHaveBeenCalledTimes(2 * perStreak);
  });

  it("never shortens a pause when it trips again", async () => {
    const jitter = [0.999_99, 0];
    const { breaker, clock, store } = setup({ random: () => jitter.shift() ?? 0 });
    await breaker.record(result({ status: 429 }));
    clock.advance(1_000);
    await breaker.record(result({ status: 429 }));
    expect(await store.get([API_BREAKER_KEY])).toStrictEqual(
      new Map([[API_BREAKER_KEY, { until: T0 + baseMs + jitterMs - 1 }]]),
    );
  });
});
