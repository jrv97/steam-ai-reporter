import { describe, expect, it, vi } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fakeDetector } from "../../../tests/helpers/fake-detector";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import {
  aiVerdicts,
  disclosedVerdict,
  FULL_DISCLOSED,
  NOT_DISCLOSED,
} from "../../../tests/helpers/verdicts";
import type { AiVerdict } from "../kinds/ai";
import { withParent } from "../kinds/verdicts";
import type { Detector } from "../ports";
import { type AppId, UNKNOWN } from "../types";
import { cachedDetector } from "./cached-detector";
import { createVerdictCache } from "./verdict-cache";

const T = 1_000_000_000_000;

/** A detector that answers from a table (not disclosed by default) and records its calls. */
function stubDetector(table: ReadonlyMap<AppId, AiVerdict> = new Map()) {
  const calls: (readonly AppId[])[] = [];
  const detector: Detector = {
    detect(ids) {
      calls.push(ids);
      return Promise.resolve(
        new Map(ids.map((id) => [id, aiVerdicts(table.get(id) ?? NOT_DISCLOSED)])),
      );
    },
  };
  return { detector, calls };
}

function memoryCountingStore() {
  return countingStore(memoryStore());
}

function setup(table?: ReadonlyMap<AppId, AiVerdict>) {
  const store = countingStore(memoryStore());
  const clock = fixedClock(T);
  const logger = { error: vi.fn<(problem: unknown) => void>() };
  const inner = stubDetector(table);
  const cache = createVerdictCache(store, clock);
  return { store, clock, logger, inner, detector: cachedDetector(inner.detector, cache, logger) };
}

detectorContract("cachedDetector", () => setup().detector);

describe("cachedDetector", () => {
  it("asks the inner detector once, then answers from the cache", async () => {
    const { detector, inner, store } = setup(new Map([[appId(10), disclosedVerdict()]]));
    const first = await detector.detect(appIds(10, 20));
    const second = await detector.detect(appIds(10, 20));
    expect(second).toStrictEqual(first);
    expect(inner.calls).toStrictEqual([[10, 20]]);
    expect(store.calls.set).toBe(1);
  });

  it("keeps the base game of a DLC from the first answer on, with one request", async () => {
    const dlc = withParent(aiVerdicts(disclosedVerdict()), appId(1808500));
    const inner = fakeDetector(() => dlc);
    const store = memoryStore();
    const logger = { error: vi.fn<(problem: unknown) => void>() };
    const tab = () => cachedDetector(inner, createVerdictCache(store, fixedClock(T)), logger);
    const first = await tab().detect(appIds(5201760));
    const second = await tab().detect(appIds(5201760));
    expect(first.get(appId(5201760))?.parent).toBe(1808500);
    expect(second.get(appId(5201760))?.parent).toBe(1808500);
    expect(inner.calls).toStrictEqual([[5201760]]);
  });

  it("asks the inner detector only about the IDs the cache lacks", async () => {
    const { detector, inner } = setup();
    await detector.detect(appIds(1, 2));
    const got = await detector.detect(appIds(2, 3, 3, 4));
    expect(inner.calls).toStrictEqual([[1, 2], [3, 4]]);
    expect([...got.keys()].toSorted((a, b) => a - b)).toStrictEqual([2, 3, 4]);
  });

  it("makes one storage read and one write for a batch of new IDs", async () => {
    const { detector, store } = setup();
    await detector.detect(appIds(1, 2, 3, 4, 5));
    expect(store.calls.get).toBe(1);
    expect(store.calls.set).toBe(1);
  });

  it("does not call the inner detector when everything is cached", async () => {
    const { detector, inner, store } = setup();
    await detector.detect(appIds(1, 2));
    const gets = store.calls.get;
    await detector.detect(appIds(1, 2));
    expect(inner.calls).toHaveLength(1);
    expect(store.calls.get).toBe(gets);
  });

  it("asks again after the verdict expires", async () => {
    const { detector, inner, clock } = setup();
    await detector.detect(appIds(1));
    clock.advance(12 * 3_600_000);
    await detector.detect(appIds(1));
    expect(inner.calls).toHaveLength(2);
  });

  it("asks again about every kind when the shortest-lived one expires", async () => {
    // Six kinds hold a seven day verdict; the AI kind holds a twelve hour one.
    const verdicts = { ...FULL_DISCLOSED, ai: NOT_DISCLOSED };
    const inner = fakeDetector(() => verdicts);
    const clock = fixedClock(T);
    const logger = { error: vi.fn<(problem: unknown) => void>() };
    const detector = cachedDetector(
      inner,
      createVerdictCache(memoryCountingStore(), clock),
      logger,
    );
    await detector.detect(appIds(1));
    clock.advance(12 * 3_600_000 - 1);
    expect(await detector.detect(appIds(1))).toStrictEqual(new Map([[appId(1), verdicts]]));
    expect(inner.calls).toHaveLength(1);
    clock.advance(1);
    await detector.detect(appIds(1));
    expect(inner.calls).toHaveLength(2);
  });

  it("remembers unknown error in memory for a while and never stores it", async () => {
    const { detector, inner, store } = setup(new Map([[appId(1), UNKNOWN.error]]));
    await detector.detect(appIds(1));
    await detector.detect(appIds(1));
    expect(inner.calls).toHaveLength(1);
    expect(store.calls.set).toBe(0);
  });

  it("detects through broken storage and logs the failures", async () => {
    const { detector, store, logger } = setup(new Map([[appId(1), disclosedVerdict()]]));
    store.break();
    const got = await detector.detect(appIds(1, 2));
    expect(got.get(appId(1))).toStrictEqual(aiVerdicts(disclosedVerdict()));
    expect(got.get(appId(2))).toStrictEqual(aiVerdicts(NOT_DISCLOSED));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
