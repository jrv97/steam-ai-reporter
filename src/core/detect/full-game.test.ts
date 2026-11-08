import { describe, expect, it, vi } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { cachedDetector } from "../cache/cached-detector";
import { decodeVerdicts } from "../cache/stored";
import { isTransient } from "../cache/ttl";
import { createVerdictCache } from "../cache/verdict-cache";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { KindVerdict, KindVerdicts } from "../kinds/verdicts";
import { verdictKey } from "../storage-keys";
import type { AppId } from "../types";
import { createFullGameDetector } from "./full-game";
import { RETRY_DELAY_MS } from "./retry";

const DEMO = make.appId();
const GAME = make.appId();
const OTHER_DEMO = make.appId();
const FULL = make.verdicts.full();
const NONE = make.verdicts.only([]);
const { demoOf, dlcOf, uniform } = make.verdicts;
const { lent } = make.verdict;

function deck(facet: "verified" | "playable") {
  return make.verdict.disclosed("deck", { facet });
}

/** A full-game detector over a fake that answers from `entries`, unknown `missing` otherwise. */
function setup(entries: readonly (readonly [AppId, KindVerdicts])[]) {
  const table = new Map(entries);
  const inner = fake.detector((id) => table.get(id) ?? make.verdicts());
  return { inner, detector: createFullGameDetector(inner) };
}

async function demoAnswer(own: KindVerdicts, game: KindVerdicts): Promise<KindVerdicts> {
  const { detector } = setup([[DEMO, demoOf(GAME, own)], [GAME, game]]);
  const found = (await detector.detect([DEMO])).get(DEMO);
  if (found === undefined) {
    throw new TypeError();
  }
  return found;
}

detectorContract("createFullGameDetector", () => setup([]).detector);

describe("createFullGameDetector", () => {
  it.each(KIND_IDS)("keeps the demo's own %s and lends the game's other kinds", async (kind) => {
    const found = await demoAnswer(make.verdicts.only([kind]), FULL);
    const others = KIND_IDS.filter((id) => id !== kind);
    expect(found[kind]).toStrictEqual(FULL[kind]);
    expect(others.map((id) => found[id])).toStrictEqual(others.map((id) => lent(FULL[id])));
  });

  it.each<[string, KindVerdicts, KindVerdicts, (id: KindId) => KindVerdict]>([
    ["the game discloses", uniform("not-disclosed"), FULL, (id) => lent(FULL[id])],
    ["both disclose", FULL, FULL, (id) => FULL[id]],
    [
      "the game is unknown",
      uniform("not-disclosed"),
      uniform("missing"),
      (id) => uniform("missing")[id],
    ],
    ["the game failed", uniform("not-disclosed"), uniform("error"), (id) => uniform("error")[id]],
    ["the demo discloses and the game failed", FULL, uniform("error"), (id) => FULL[id]],
    [
      "the demo is unknown and the game discloses nothing",
      uniform("malformed"),
      uniform("not-disclosed"),
      (id) => uniform("malformed")[id],
    ],
  ])("answers each kind when %s", async (_name, own, game, expected) => {
    const found = await demoAnswer(own, game);
    for (const id of KIND_IDS) {
      expect(found[id], id).toStrictEqual(expected(id));
    }
  });

  it.each(
    [
      ["Valve has not rated the demo (0)", make.verdict.notDisclosed(), lent(deck("verified"))],
      ["the demo has its own rating", deck("playable"), deck("playable")],
      [
        "the demo was asked without platforms",
        make.verdict.unknown("unrequested"),
        lent(deck("verified")),
      ],
    ] as const,
  )("shows a demo its full game's Steam Deck rating per kind when %s", async (_n, own, shown) => {
    const found = await demoAnswer({ ...NONE, deck: own }, { ...NONE, deck: deck("verified") });
    expect(found.deck).toStrictEqual(shown);
  });

  it("returns the demo's own object when the game discloses nothing", async () => {
    const own = demoOf(GAME, make.verdicts.only(["ai"]));
    const { detector } = setup([[DEMO, own], [GAME, NONE]]);
    expect((await detector.detect([DEMO])).get(DEMO)).toBe(own);
  });

  it("keeps the demo's relations next to the lent verdicts", async () => {
    const found = await demoAnswer(NONE, FULL);
    expect(found).toMatchObject({ parent: GAME, demo: true });
  });

  it("asks once more, in one call, for the unseen full games only", async () => {
    const [seenDemo, seenGame, plain] = [make.appId(), make.appId(), make.appId()];
    const { detector, inner } = setup([
      [DEMO, demoOf(GAME)],
      [OTHER_DEMO, demoOf(GAME)],
      [seenDemo, demoOf(seenGame)],
      [seenGame, FULL],
      [plain, NONE],
      [GAME, FULL],
    ]);
    const asked = [DEMO, OTHER_DEMO, seenDemo, seenGame, plain];
    const found = await detector.detect(asked);
    expect(inner.calls).toStrictEqual([asked, [GAME]]);
    expect(found.get(seenDemo)?.ai).toStrictEqual(lent(FULL.ai));
    expect([...found.keys()]).toStrictEqual(asked);
  });

  it.each<[string, KindVerdicts]>([
    ["a DLC", dlcOf(GAME)],
    ["a game", NONE],
    ["an app with no answer", make.verdicts()],
  ])("lends nothing to %s and asks nothing more", async (_name, own) => {
    const { detector, inner } = setup([[DEMO, own], [GAME, FULL]]);
    expect((await detector.detect([DEMO])).get(DEMO)).toBe(own);
    expect(inner.calls).toStrictEqual([[DEMO]]);
  });

  it("goes one level up: a demo's full game that is a demo lends its own kinds", async () => {
    const grand = make.appId();
    const { detector, inner } = setup([
      [DEMO, demoOf(GAME)],
      [GAME, demoOf(grand, make.verdicts.only(["drm"]))],
      [grand, FULL],
    ]);
    const found = (await detector.detect([DEMO])).get(DEMO);
    expect(inner.calls).toStrictEqual([[DEMO], [GAME]]);
    expect(found?.drm).toStrictEqual(lent(FULL.drm));
    expect(found?.ai.state).toBe("not-disclosed");
  });

  it("leaves a demo unknown when its full game is left out of the answer", async () => {
    const broken = fake.partialDetector(new Map([[DEMO, demoOf(GAME)]]));
    const found = (await createFullGameDetector(broken).detect([DEMO])).get(DEMO);
    for (const id of KIND_IDS) {
      expect(found?.[id]).toBe(uniform("error")[id]);
    }
  });
});

describe("createFullGameDetector over the verdict cache", () => {
  /** A full-game detector over the cache over a fake that answers with `answer`. */
  function cachedSetup(answer: (id: AppId) => KindVerdicts) {
    const store = fake.countingStore(fake.store());
    const clock = fake.clock(make.time());
    const inner = fake.detector(answer);
    const cached = cachedDetector(inner, createVerdictCache(store, clock), { error: vi.fn() });
    return { store, clock, inner, detector: createFullGameDetector(cached) };
  }

  it("serves a stored full game to a demo seen later, and stores only own verdicts", async () => {
    const { store, inner, detector } = cachedSetup((id) => id === GAME ? FULL : demoOf(GAME));
    await detector.detect([DEMO]);
    const later = (await detector.detect([OTHER_DEMO])).get(OTHER_DEMO);
    expect(inner.calls).toStrictEqual([[DEMO], [GAME], [OTHER_DEMO]]);
    expect(later?.ai).toStrictEqual(lent(FULL.ai));
    const stored = await store.get([verdictKey(DEMO)]);
    expect(decodeVerdicts(stored.get(verdictKey(DEMO)))?.verdicts).toStrictEqual(demoOf(GAME));
  });

  it("asks again for a full game whose lookup failed, once its memory entry expired", async () => {
    let gameAnswer: KindVerdicts = uniform("error");
    const { clock, inner, detector } = cachedSetup((id) => id === GAME ? gameAnswer : demoOf(GAME));
    const first = (await detector.detect([DEMO])).get(DEMO);
    expect(first === undefined ? false : isTransient(first)).toBe(true);
    gameAnswer = FULL;
    clock.advance(RETRY_DELAY_MS);
    const retried = (await detector.detect([DEMO])).get(DEMO);
    expect(inner.calls).toStrictEqual([[DEMO], [GAME], [GAME]]);
    expect(retried?.kernel).toStrictEqual(lent(FULL.kernel));
  });
});
