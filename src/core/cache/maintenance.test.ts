import { describe, expect, it } from "vitest";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { aiVerdicts, disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import type { JsonValue } from "../json";
import type { AiVerdict } from "../kinds/ai";
import { CACHE_SCHEMA, META_KEY } from "../storage-keys";
import { UNKNOWN } from "../types";
import { maintainCache } from "./maintenance";
import { encodeVerdicts } from "./stored";
import { DAY_MS, DISCLOSED_TTL_MS, NOT_DISCLOSED_TTL_MS } from "./ttl";

const T = 1_000_000_000_000;
const BREAKER: JsonValue = { openUntil: T + 60_000 };
const SETTINGS: JsonValue = { badges: false };
const ALLOW: JsonValue = { "10": { name: "Ignored", added: T } };

/** The stored value of a verdict that is persisted; `null` (invalid) for one that is not. */
function verdict(value: AiVerdict, time: number): JsonValue {
  return encodeVerdicts(aiVerdicts(value), time) ?? null;
}

function setup(entries: readonly (readonly [string, JsonValue])[]) {
  const store = countingStore(memoryStore(new Map(entries)));
  const clock = fixedClock(T);
  return { store, clock, run: () => maintainCache(store, clock) };
}

async function keysOf(store: { keys(): Promise<readonly string[]>; }): Promise<readonly string[]> {
  return (await store.keys()).toSorted();
}

describe("maintainCache: schema reset", () => {
  const others: readonly (readonly [string, JsonValue])[] = [
    ["v1:breaker", BREAKER],
    ["v1:settings", SETTINGS],
    ["v1:allow", ALLOW],
  ];

  it("clears the verdict keys when the stored schema differs, and nothing else", async () => {
    const { store, run } = setup([
      [META_KEY, { schema: CACHE_SCHEMA - 1, sweptAt: T }],
      ["v1:a:1", verdict(NOT_DISCLOSED, T)],
      ["v1:a:2", verdict(disclosedVerdict(), T)],
      ...others,
    ]);
    expect(await run()).toBe("reset");
    expect(await keysOf(store)).toStrictEqual(["v1:allow", "v1:breaker", META_KEY, "v1:settings"]);
    expect(await store.get(["v1:breaker", "v1:settings", "v1:allow"])).toStrictEqual(
      new Map<string, unknown>(others),
    );
    expect(await store.get([META_KEY])).toStrictEqual(
      new Map([[META_KEY, { schema: CACHE_SCHEMA, sweptAt: T }]]),
    );
  });

  it("drops the verdicts written before the per-kind layout, once", async () => {
    // Version 1 kept one flat verdict per app, with the time inside.
    const flat: JsonValue = {
      state: "disclosed",
      time: T,
      notes: "Concept art was generated.",
      language: "english",
      source: "api",
    };
    const { store, run } = setup([
      [META_KEY, { schema: 1, sweptAt: T }],
      ["v1:a:1", flat],
      ["v1:a:2", { state: "not-disclosed", time: T, source: "api" }],
      ...others,
    ]);
    expect(CACHE_SCHEMA).toBeGreaterThan(1);
    expect(await run()).toBe("reset");
    expect(await keysOf(store)).toStrictEqual(["v1:allow", "v1:breaker", META_KEY, "v1:settings"]);
    expect(await run()).toBe("skipped");
  });

  it("clears the verdicts of a newer schema too, after a downgrade", async () => {
    const { store, run } = setup([
      [META_KEY, { schema: CACHE_SCHEMA + 1, sweptAt: T }],
      ["v1:a:1", verdict(NOT_DISCLOSED, T)],
    ]);
    expect(await run()).toBe("reset");
    expect(await keysOf(store)).toStrictEqual([META_KEY]);
  });

  it("treats a missing or invalid meta record as a mismatch", async () => {
    for (
      const meta of [undefined, "v1", 1, { schema: CACHE_SCHEMA }, { schema: "1", sweptAt: T }]
    ) {
      const { store, run } = setup([
        ...(meta === undefined ? [] : [[META_KEY, meta] as const]),
        ["v1:a:1", verdict(NOT_DISCLOSED, T)],
        ["v1:breaker", BREAKER],
      ]);
      expect(await run()).toBe("reset");
      expect(await keysOf(store)).toStrictEqual(["v1:breaker", META_KEY]);
    }
  });

  it("does not reset again once the meta record is current", async () => {
    const { store, run } = setup([["v1:a:1", verdict(NOT_DISCLOSED, T)]]);
    expect(await run()).toBe("reset");
    await store.set(new Map([["v1:a:1", verdict(NOT_DISCLOSED, T)]]));
    expect(await run()).toBe("skipped");
    expect(await keysOf(store)).toStrictEqual(["v1:a:1", META_KEY]);
  });
});

describe("maintainCache: daily sweep", () => {
  const current = (sweptAt: number): readonly [string, JsonValue] => [
    META_KEY,
    { schema: CACHE_SCHEMA, sweptAt },
  ];

  it("skips within a day without reading verdicts", async () => {
    const { store, clock, run } = setup([current(T), ["v1:a:1", verdict(NOT_DISCLOSED, T - 1)]]);
    clock.set(T + DAY_MS - 1);
    expect(await run()).toBe("skipped");
    expect(store.calls).toStrictEqual({ get: 1, set: 0, remove: 0, keys: 0 });
  });

  it("sweeps at exactly a day and removes expired, invalid and future entries", async () => {
    const { store, clock, run } = setup([
      current(T),
      ["v1:a:1", verdict(NOT_DISCLOSED, T - 1)],
      ["v1:a:2", verdict(disclosedVerdict(), T - 1)],
      ["v1:a:3", verdict(UNKNOWN.gated, T + DAY_MS - 1)],
      ["v1:a:4", { s: "old" }],
      ["v1:a:5", verdict(NOT_DISCLOSED, T + DAY_MS + 1)],
      ["v1:breaker", BREAKER],
      ["v1:settings", SETTINGS],
    ]);
    clock.set(T + DAY_MS);
    expect(await run()).toBe("swept");
    expect(await keysOf(store)).toStrictEqual([
      "v1:a:2",
      "v1:a:3",
      "v1:breaker",
      META_KEY,
      "v1:settings",
    ]);
    expect(store.calls.remove).toBe(1);
  });

  it("keeps an entry until its TTL passes, to the millisecond", async () => {
    const sweepAt = T + 30 * DAY_MS;
    const { store, clock, run } = setup([
      current(T),
      ["v1:a:1", verdict(NOT_DISCLOSED, sweepAt - NOT_DISCLOSED_TTL_MS + 1)],
      ["v1:a:2", verdict(NOT_DISCLOSED, sweepAt - NOT_DISCLOSED_TTL_MS)],
      ["v1:a:3", verdict(disclosedVerdict(), sweepAt - DISCLOSED_TTL_MS + 1)],
      ["v1:a:4", verdict(disclosedVerdict(), sweepAt - DISCLOSED_TTL_MS)],
    ]);
    clock.set(sweepAt);
    expect(await run()).toBe("swept");
    expect(await keysOf(store)).toStrictEqual(["v1:a:1", "v1:a:3", META_KEY]);
  });

  it("records the sweep time, so the next sweep is a day later", async () => {
    const { store, clock, run } = setup([current(T)]);
    clock.set(T + DAY_MS);
    expect(await run()).toBe("swept");
    expect(await store.get([META_KEY])).toStrictEqual(
      new Map([[META_KEY, { schema: CACHE_SCHEMA, sweptAt: T + DAY_MS }]]),
    );
    clock.advance(DAY_MS - 1);
    expect(await run()).toBe("skipped");
    clock.advance(1);
    expect(await run()).toBe("swept");
  });

  it("sweeps when the clock moved back past the last sweep", async () => {
    const { clock, run } = setup([current(T + 10 * DAY_MS)]);
    clock.set(T);
    expect(await run()).toBe("swept");
  });

  it("writes only the meta record when nothing has expired", async () => {
    const { store, clock, run } = setup([current(T), [
      "v1:a:1",
      verdict(NOT_DISCLOSED, T + DAY_MS),
    ]]);
    clock.set(T + DAY_MS);
    expect(await run()).toBe("swept");
    expect(store.calls.remove).toBe(0);
    expect(store.calls.set).toBe(1);
  });
});
