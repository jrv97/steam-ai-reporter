import { describe, expect, it, vi } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { countingStore } from "../../../tests/helpers/counting-store";
import { creatorsFor } from "../../../tests/helpers/creators";
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
import { type KindVerdicts, withRelations } from "../kinds/verdicts";
import { type AppId, UNKNOWN } from "../types";
import { cachedDetector } from "./cached-detector";
import { createVerdictCache } from "./verdict-cache";

const T = 1_000_000_000_000;

/** Answers each ID with its AI verdict in `table`, not disclosed by default. */
function aiAnswers(table: ReadonlyMap<AppId, AiVerdict>): (id: AppId) => KindVerdicts {
  return (id) => aiVerdicts(table.get(id) ?? NOT_DISCLOSED);
}

function setup(verdictsFor: (id: AppId) => KindVerdicts = aiAnswers(new Map())) {
  const store = countingStore(memoryStore());
  const clock = fixedClock(T);
  const logger = { error: vi.fn<(problem: unknown) => void>() };
  const inner = fakeDetector(verdictsFor);
  /** Another tab: a cached detector with its own memory over the same storage. */
  const tab = () => cachedDetector(inner, createVerdictCache(store, clock), logger);
  return { store, clock, logger, inner, tab, detector: tab() };
}

detectorContract("cachedDetector", () => setup().detector);

describe("cachedDetector", () => {
  it("asks the inner detector once, then answers from memory", async () => {
    const { detector, inner, store } = setup(aiAnswers(new Map([[appId(10), disclosedVerdict()]])));
    const first = await detector.detect(appIds(10, 20));
    const gets = store.calls.get;
    const second = await detector.detect(appIds(10, 20));
    expect(second).toStrictEqual(first);
    expect(inner.calls).toStrictEqual([[10, 20]]);
    expect(store.calls).toMatchObject({ get: gets, set: 1 });
  });

  it("keeps the base game and creators from the first answer on, with one request", async () => {
    const dlc = withRelations(aiVerdicts(disclosedVerdict()), {
      parent: appId(1808500),
      creators: creatorsFor({ developers: ["Embark Studios"] }),
    });
    const { tab, inner } = setup(() => dlc);
    const first = await tab().detect(appIds(5201760));
    const second = await tab().detect(appIds(5201760));
    expect(first.get(appId(5201760))).toStrictEqual(dlc);
    expect(second.get(appId(5201760))).toStrictEqual(dlc);
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

  it("asks again about every kind when the shortest-lived one expires", async () => {
    // Six kinds hold a seven day verdict; the AI kind holds a twelve hour one.
    const verdicts = { ...FULL_DISCLOSED, ai: NOT_DISCLOSED };
    const { detector, inner, clock } = setup(() => verdicts);
    await detector.detect(appIds(1));
    clock.advance(12 * 3_600_000 - 1);
    expect(await detector.detect(appIds(1))).toStrictEqual(new Map([[appId(1), verdicts]]));
    expect(inner.calls).toHaveLength(1);
    clock.advance(1);
    await detector.detect(appIds(1));
    expect(inner.calls).toHaveLength(2);
  });

  it("remembers unknown error in memory for a while and never stores it", async () => {
    const { detector, inner, store } = setup(aiAnswers(new Map([[appId(1), UNKNOWN.error]])));
    await detector.detect(appIds(1));
    await detector.detect(appIds(1));
    expect(inner.calls).toHaveLength(1);
    expect(store.calls.set).toBe(0);
  });

  it("detects through broken storage and logs the failures", async () => {
    const { detector, store, logger } = setup(
      aiAnswers(new Map([[appId(1), disclosedVerdict()]])),
    );
    store.break();
    const got = await detector.detect(appIds(1, 2));
    expect(got.get(appId(1))).toStrictEqual(aiVerdicts(disclosedVerdict()));
    expect(got.get(appId(2))).toStrictEqual(aiVerdicts(NOT_DISCLOSED));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
