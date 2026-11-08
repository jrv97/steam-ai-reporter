import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import type { AiVerdict } from "../kinds/ai";
import { KIND_BY_ID } from "../kinds/registry";
import { type KindVerdicts, withRelations } from "../kinds/verdicts";
import type { AppId } from "../types";
import { cachedDetector } from "./cached-detector";
import { createVerdictCache } from "./verdict-cache";

/** Answers each ID with its AI verdict in `table`, not disclosed by default. */
function aiAnswers(table: ReadonlyMap<AppId, AiVerdict>): (id: AppId) => KindVerdicts {
  return (id) => make.verdicts({ ai: table.get(id) ?? make.verdict.notDisclosed() });
}

function setup(verdictsFor: (id: AppId) => KindVerdicts = aiAnswers(new Map())) {
  const store = fake.countingStore(fake.store());
  const clock = fake.clock(make.time());
  const { logger, sink } = fake.logger();
  const inner = fake.detector(verdictsFor);
  /** Another tab: a cached detector with its own memory over the same storage. */
  const tab = () => cachedDetector(inner, createVerdictCache(store, clock), logger);
  return { store, clock, sink, inner, tab, detector: tab() };
}

detectorContract("cachedDetector", () => setup().detector);

describe("cachedDetector", () => {
  it("asks the inner detector once, then answers from memory", async () => {
    const disclosed = make.appId();
    const ids = [disclosed, make.appId()];
    const { detector, inner, store } = setup(
      aiAnswers(new Map([[disclosed, make.verdict.disclosed("ai")]])),
    );
    const first = await detector.detect(ids);
    const gets = store.calls.get;
    const second = await detector.detect(ids);
    expect(second).toStrictEqual(first);
    expect(inner.calls).toStrictEqual([ids]);
    expect(store.calls).toMatchObject({ get: gets, set: 1 });
  });

  it("keeps the base game and creators from the first answer on, with one request", async () => {
    const dlc = withRelations(make.verdicts({ ai: make.verdict.disclosed("ai") }), {
      parent: make.appId(),
      creators: make.creator.forItem({ developers: [make.text.name()] }),
    });
    const id = make.appId();
    const { tab, inner } = setup(() => dlc);
    const first = await tab().detect([id]);
    const second = await tab().detect([id]);
    expect(first.get(id)).toStrictEqual(dlc);
    expect(second.get(id)).toStrictEqual(dlc);
    expect(inner.calls).toStrictEqual([[id]]);
  });

  it("asks the inner detector only about the IDs the cache lacks", async () => {
    const [a, b, c, d] = [make.appId(), make.appId(), make.appId(), make.appId()];
    const { detector, inner } = setup();
    await detector.detect([a, b]);
    const got = await detector.detect([b, c, c, d]);
    expect(inner.calls).toStrictEqual([[a, b], [c, d]]);
    expect([...got.keys()].toSorted((x, y) => x - y)).toStrictEqual([b, c, d]);
  });

  it("makes one storage read and one write for a batch of new IDs", async () => {
    const { detector, store } = setup();
    await detector.detect(make.appIds(5));
    expect(store.calls.get).toBe(1);
    expect(store.calls.set).toBe(1);
  });

  it("asks again about every kind when the shortest-lived one expires", async () => {
    // Six kinds hold a seven day verdict; the AI kind holds a twelve hour one.
    const verdicts = { ...make.verdicts.full(), ai: make.verdict.notDisclosed() };
    const id = make.appId();
    const { detector, inner, clock } = setup(() => verdicts);
    await detector.detect([id]);
    clock.advance(KIND_BY_ID.ai.ttl.notDisclosed - 1);
    expect(await detector.detect([id])).toStrictEqual(new Map([[id, verdicts]]));
    expect(inner.calls).toHaveLength(1);
    clock.advance(1);
    await detector.detect([id]);
    expect(inner.calls).toHaveLength(2);
  });

  it("remembers unknown error in memory for a while and never stores it", async () => {
    const id = make.appId();
    const { detector, inner, store } = setup(
      aiAnswers(new Map([[id, make.verdict.unknown("error")]])),
    );
    await detector.detect([id]);
    await detector.detect([id]);
    expect(inner.calls).toHaveLength(1);
    expect(store.calls.set).toBe(0);
  });

  it("detects through broken storage and logs the failures", async () => {
    const disclosed = make.appId();
    const other = make.appId();
    const { detector, store, sink } = setup(
      aiAnswers(new Map([[disclosed, make.verdict.disclosed("ai")]])),
    );
    store.break();
    const got = await detector.detect([disclosed, other]);
    expect(got.get(disclosed)).toStrictEqual(make.verdicts({ ai: make.verdict.disclosed("ai") }));
    expect(got.get(other)).toStrictEqual(make.verdicts({ ai: make.verdict.notDisclosed() }));
    expect(sink.error).toHaveBeenCalledTimes(2);
  });
});
