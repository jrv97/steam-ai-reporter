import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { API_BREAKER_KEY } from "../detect/breaker";
import type { JsonValue } from "../json";
import { AI_KIND } from "../kinds/ai";
import { EARLY_ACCESS_KIND } from "../kinds/early-access";
import {
  CACHE_SCHEMA,
  LEGACY_ALLOW_KEY,
  LEGACY_SETTINGS_KEY,
  META_KEY,
  verdictKey,
} from "../storage-keys";
import { maintainCache } from "./maintenance";
import { encodeVerdicts } from "./stored";
import { DAY_MS } from "./ttl";

const T = make.time();
// An app whose kinds are all in one state expires with the shortest-lived kind: Early Access when
// disclosed, the AI kind when not.
const DISCLOSED_TTL_MS = EARLY_ACCESS_KIND.ttl.disclosed;
const NOT_DISCLOSED_TTL_MS = AI_KIND.ttl.notDisclosed;
const BREAKER: JsonValue = { openUntil: make.time() };
const SETTINGS: JsonValue = make.raw.v1CustomSettings();
const ALLOW: JsonValue = make.raw.v1Allow();

/** A verdict as cache schema 1 stored it: one flat verdict per app, with the time inside. */
const FLAT_V1: JsonValue = { ...make.verdict.disclosed("ai"), time: T };

type Entry = readonly [string, JsonValue];

/** The stored value of an app whose kinds all have this state; `null` (invalid) if not stored. */
function verdict(state: Parameters<typeof make.verdicts.uniform>[0], time: number): JsonValue {
  return encodeVerdicts(make.verdicts.uniform(state), time) ?? null;
}

/** The storage key of a fresh app's verdicts. */
function key(): string {
  return verdictKey(make.appId());
}

function setup(entries: readonly Entry[]) {
  const store = fake.countingStore(fake.store(new Map(entries)));
  const clock = fake.clock(T);
  return { store, clock, run: () => maintainCache(store, clock) };
}

async function keysOf(store: { keys(): Promise<readonly string[]>; }): Promise<readonly string[]> {
  return (await store.keys()).toSorted();
}

function sorted(...keys: readonly string[]): readonly string[] {
  return keys.toSorted();
}

describe("maintainCache: schema reset", () => {
  const others: readonly Entry[] = [
    [API_BREAKER_KEY, BREAKER],
    [LEGACY_SETTINGS_KEY, SETTINGS],
    [LEGACY_ALLOW_KEY, ALLOW],
  ];
  const survivors = sorted(API_BREAKER_KEY, LEGACY_SETTINGS_KEY, LEGACY_ALLOW_KEY, META_KEY);

  it("clears the verdict keys when the stored schema differs, and nothing else", async () => {
    const { store, run } = setup([
      [META_KEY, { schema: CACHE_SCHEMA - 1, sweptAt: T }],
      [key(), verdict("not-disclosed", T)],
      [key(), verdict("disclosed", T)],
      ...others,
    ]);
    expect(await run()).toBe("reset");
    expect(await keysOf(store)).toStrictEqual(survivors);
    expect(await store.get([API_BREAKER_KEY, LEGACY_SETTINGS_KEY, LEGACY_ALLOW_KEY])).toStrictEqual(
      new Map<string, unknown>(others),
    );
    expect(await store.get([META_KEY])).toStrictEqual(
      new Map([[META_KEY, { schema: CACHE_SCHEMA, sweptAt: T }]]),
    );
  });

  // Version 1 kept one flat verdict per app, with the time inside. Version 2 entries lack
  // `parent`, so a cached DLC never learns its base game. Version 4 entries lack `demo`.
  it.each(
    [
      [1, FLAT_V1],
      [2, verdict("disclosed", T)],
      [4, verdict("disclosed", T)],
    ] as const,
  )("drops the verdicts of schema %i once", async (schema, entry) => {
    const { store, run } = setup([[META_KEY, { schema, sweptAt: T }], [key(), entry], ...others]);
    expect(CACHE_SCHEMA).toBeGreaterThan(schema);
    expect(await run()).toBe("reset");
    expect(await keysOf(store)).toStrictEqual(survivors);
    expect(await run()).toBe("skipped");
  });

  it("clears the verdicts of a newer schema too, after a downgrade", async () => {
    const { store, run } = setup([
      [META_KEY, { schema: CACHE_SCHEMA + 1, sweptAt: T }],
      [key(), verdict("not-disclosed", T)],
    ]);
    expect(await run()).toBe("reset");
    expect(await keysOf(store)).toStrictEqual([META_KEY]);
  });

  it.each<{ readonly meta: string; readonly entries: readonly Entry[]; }>([
    { meta: "missing", entries: [] },
    ...make.raw.junk().map((junk) => ({
      meta: JSON.stringify(junk),
      entries: [[META_KEY, junk] as const],
    })),
    { meta: "without a sweep time", entries: [[META_KEY, { schema: CACHE_SCHEMA }]] },
    {
      meta: "with a text schema",
      entries: [[META_KEY, { schema: String(CACHE_SCHEMA), sweptAt: T }]],
    },
  ])(
    "treats a meta record $meta as a mismatch",
    async ({ entries }) => {
      const { store, run } = setup([
        ...entries,
        [key(), verdict("not-disclosed", T)],
        [API_BREAKER_KEY, BREAKER],
      ]);
      expect(await run()).toBe("reset");
      expect(await keysOf(store)).toStrictEqual(sorted(API_BREAKER_KEY, META_KEY));
    },
  );

  it("does not reset again once the meta record is current", async () => {
    const kept = key();
    const { store, run } = setup([[kept, verdict("not-disclosed", T)]]);
    expect(await run()).toBe("reset");
    await store.set(new Map([[kept, verdict("not-disclosed", T)]]));
    expect(await run()).toBe("skipped");
    expect(await keysOf(store)).toStrictEqual(sorted(kept, META_KEY));
  });
});

describe("maintainCache: daily sweep", () => {
  const current = (sweptAt: number): Entry => [META_KEY, { schema: CACHE_SCHEMA, sweptAt }];

  it("skips within a day without reading verdicts", async () => {
    const { store, clock, run } = setup([current(T), [key(), verdict("not-disclosed", T - 1)]]);
    clock.set(T + DAY_MS - 1);
    expect(await run()).toBe("skipped");
    expect(store.calls).toStrictEqual({ get: 1, set: 0, remove: 0, keys: 0 });
  });

  it("sweeps at exactly a day and removes expired, invalid and future entries", async () => {
    const [expired, disclosed, gated, invalid, future] = [key(), key(), key(), key(), key()];
    const { store, clock, run } = setup([
      current(T),
      [expired, verdict("not-disclosed", T - 1)],
      [disclosed, verdict("disclosed", T - 1)],
      [gated, verdict("gated", T + DAY_MS - 1)],
      [invalid, FLAT_V1],
      [future, verdict("not-disclosed", T + DAY_MS + 1)],
      [API_BREAKER_KEY, BREAKER],
      [LEGACY_SETTINGS_KEY, SETTINGS],
    ]);
    clock.set(T + DAY_MS);
    expect(await run()).toBe("swept");
    expect(await keysOf(store)).toStrictEqual(
      sorted(disclosed, gated, API_BREAKER_KEY, META_KEY, LEGACY_SETTINGS_KEY),
    );
    expect(store.calls.remove).toBe(1);
  });

  it("keeps an entry until its TTL passes, to the millisecond", async () => {
    const sweepAt = T + 30 * DAY_MS;
    const [notDisclosedKept, notDisclosedGone, disclosedKept, disclosedGone] = [
      key(),
      key(),
      key(),
      key(),
    ];
    const { store, clock, run } = setup([
      current(T),
      [notDisclosedKept, verdict("not-disclosed", sweepAt - NOT_DISCLOSED_TTL_MS + 1)],
      [notDisclosedGone, verdict("not-disclosed", sweepAt - NOT_DISCLOSED_TTL_MS)],
      [disclosedKept, verdict("disclosed", sweepAt - DISCLOSED_TTL_MS + 1)],
      [disclosedGone, verdict("disclosed", sweepAt - DISCLOSED_TTL_MS)],
    ]);
    clock.set(sweepAt);
    expect(await run()).toBe("swept");
    expect(await keysOf(store)).toStrictEqual(sorted(notDisclosedKept, disclosedKept, META_KEY));
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
      key(),
      verdict("not-disclosed", T + DAY_MS),
    ]]);
    clock.set(T + DAY_MS);
    expect(await run()).toBe("swept");
    expect(store.calls.remove).toBe(0);
    expect(store.calls.set).toBe(1);
  });
});
