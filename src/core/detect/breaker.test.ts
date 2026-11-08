import { describe, expect, it } from "vitest";
import { httpResult, type Reply } from "../../../tests/helpers/fake-http";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { englishI18n } from "../../../tests/helpers/i18n";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { recordingLogger } from "../../../tests/helpers/recording-logger";
import type { JsonValue } from "../json";
import type { HttpResult, KeyValueStore } from "../ports";
import {
  API_BREAKER_KEY,
  type BreakerOptions,
  createBreaker,
  HTML_BREAKER_KEY,
  tripsBreaker,
} from "./breaker";

const T0 = 1_000_000;
const i18n = englishI18n();
const URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1";

function result(reply: Reply): HttpResult {
  return httpResult(reply, URL);
}

function setup(overrides: Partial<BreakerOptions> = {}) {
  const clock = fixedClock(T0);
  const store = memoryStore();
  const { logger, sink } = recordingLogger();
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

/** A store whose every call rejects, like storage that is full or gone. */
const brokenStore: KeyValueStore = {
  get: () => Promise.reject(new Error()),
  set: () => Promise.reject(new Error()),
  remove: () => Promise.reject(new Error()),
  keys: () => Promise.reject(new Error()),
};

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

  it("opens on a 429 for 60 s plus jitter, then closes", async () => {
    const { breaker, clock, store, sink } = setup();
    await breaker.record(result({ status: 429 }));
    expect(await breaker.isOpen()).toBe(true);
    expect(await store.get([API_BREAKER_KEY])).toStrictEqual(
      new Map([[API_BREAKER_KEY, { until: T0 + 65_000 }]]),
    );
    expect(sink.warn).toHaveBeenCalledWith(
      "[sar]",
      i18n.t("warn_breaker_opened", { seconds: "65", breaker: API_BREAKER_KEY }),
    );
    clock.advance(64_999);
    expect(await breaker.isOpen()).toBe(true);
    clock.advance(1);
    expect(await breaker.isOpen()).toBe(false);
    expect(await breaker.isOpen()).toBe(false);
    expect(sink.info).toHaveBeenCalledOnce();
    expect(sink.info).toHaveBeenCalledWith(
      "[sar]",
      i18n.t("notice_breaker_closed", { breaker: API_BREAKER_KEY }),
    );
  });

  it.each([[0, 60_000], [0.999_99, 69_999]])("with random %d pauses %d ms", async (r, ms) => {
    const { breaker, clock } = setup({ random: () => r });
    await breaker.record(result("network-error"));
    clock.advance(ms - 1);
    expect(await breaker.isOpen()).toBe(true);
    clock.advance(1);
    expect(await breaker.isOpen()).toBe(false);
  });

  it("is honored by a new instance reading the same store, as in another tab", async () => {
    const { breaker, options, clock } = setup();
    await breaker.record(result({ status: 429 }));
    const otherTab = createBreaker({ ...options, logger: recordingLogger().logger });
    expect(await otherTab.isOpen()).toBe(true);
    clock.advance(65_000);
    expect(await otherTab.isOpen()).toBe(false);
  });

  it("keeps the API and HTML breakers apart", async () => {
    const { breaker, options } = setup();
    await breaker.record(result({ status: 429 }));
    expect(await createBreaker({ ...options, key: HTML_BREAKER_KEY }).isOpen()).toBe(false);
  });

  it.each<[string, JsonValue]>([
    ["a string", "open"],
    ["a non-numeric until", { until: "later" }],
    ["a fractional until", { until: T0 + 0.5 }],
    ["an until beyond the longest pause", { until: T0 + 70_001 }],
  ])("ignores a stored value with %s", async (_, value) => {
    const { options } = setup();
    await options.store.set(new Map([[API_BREAKER_KEY, value]]));
    expect(await createBreaker(options).isOpen()).toBe(false);
  });

  it("works on this tab's state when storage fails, without rejecting", async () => {
    const { breaker } = setup({ store: brokenStore });
    expect(await breaker.isOpen()).toBe(false);
    await expect(breaker.record(result({ status: 429 }))).resolves.toBeUndefined();
    expect(await breaker.isOpen()).toBe(true);
  });

  it("never shortens a pause when it trips again", async () => {
    const jitter = [0.999_99, 0];
    const { breaker, clock, store } = setup({ random: () => jitter.shift() ?? 0 });
    await breaker.record(result({ status: 429 }));
    clock.advance(1_000);
    await breaker.record(result({ status: 429 }));
    expect(await store.get([API_BREAKER_KEY])).toStrictEqual(
      new Map([[API_BREAKER_KEY, { until: T0 + 69_999 }]]),
    );
  });
});
