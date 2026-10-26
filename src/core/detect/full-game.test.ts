import { describe, expect, it, vi } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { countingStore } from "../../../tests/helpers/counting-store";
import { fakeDetector } from "../../../tests/helpers/fake-detector";
import { fixedClock } from "../../../tests/helpers/fixed-clock";
import { memoryStore } from "../../../tests/helpers/memory-store";
import {
  demoOf,
  disclosedKinds,
  dlcOf,
  FULL_DISCLOSED,
  lent,
  uniformVerdicts,
} from "../../../tests/helpers/verdicts";
import { cachedDetector } from "../cache/cached-detector";
import { decodeVerdicts } from "../cache/stored";
import { isTransient } from "../cache/ttl";
import { createVerdictCache } from "../cache/verdict-cache";
import { KIND_IDS, type KindId } from "../kinds/id";
import { type KindVerdict, type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Detector } from "../ports";
import { verdictKey } from "../storage-keys";
import type { AppId } from "../types";
import { createFullGameDetector } from "./full-game";
import { RETRY_DELAY_MS } from "./retry";

const DEMO = appId(4513800);
const GAME = appId(3489340);
const OTHER_DEMO = appId(4513801);

/** A full-game detector over a fake that answers from `entries`, unknown `missing` otherwise. */
function setup(entries: readonly (readonly [AppId, KindVerdicts])[]) {
  const table = new Map(entries);
  const inner = fakeDetector((id) => table.get(id) ?? UNKNOWN_KINDS.missing);
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
    const found = await demoAnswer(disclosedKinds([kind]), FULL_DISCLOSED);
    for (const id of KIND_IDS) {
      expect(found[id]).toStrictEqual(id === kind ? FULL_DISCLOSED[id] : lent(FULL_DISCLOSED[id]));
    }
  });

  it.each<[string, KindVerdicts, KindVerdicts, (id: KindId) => KindVerdict]>([
    [
      "the game discloses",
      uniformVerdicts("not-disclosed"),
      FULL_DISCLOSED,
      (id) => lent(FULL_DISCLOSED[id]),
    ],
    ["both disclose", FULL_DISCLOSED, FULL_DISCLOSED, (id) => FULL_DISCLOSED[id]],
    [
      "the game is unknown",
      uniformVerdicts("not-disclosed"),
      uniformVerdicts("missing"),
      (id) => UNKNOWN_KINDS.missing[id],
    ],
    [
      "the game failed",
      uniformVerdicts("not-disclosed"),
      uniformVerdicts("error"),
      (id) => UNKNOWN_KINDS.error[id],
    ],
    [
      "the demo discloses and the game failed",
      FULL_DISCLOSED,
      uniformVerdicts("error"),
      (id) => FULL_DISCLOSED[id],
    ],
    [
      "the demo is unknown and the game discloses nothing",
      uniformVerdicts("malformed"),
      uniformVerdicts("not-disclosed"),
      (id) => UNKNOWN_KINDS.malformed[id],
    ],
  ])("answers each kind when %s", async (_name, own, game, expected) => {
    const found = await demoAnswer(own, game);
    for (const id of KIND_IDS) {
      expect(found[id], id).toStrictEqual(expected(id));
    }
  });

  it("returns the demo's own object when the game discloses nothing", async () => {
    const own = demoOf(GAME, disclosedKinds(["ai"]));
    const { detector } = setup([[DEMO, own], [GAME, disclosedKinds([])]]);
    expect((await detector.detect([DEMO])).get(DEMO)).toBe(own);
  });

  it("keeps the demo's relations next to the lent verdicts", async () => {
    const found = await demoAnswer(disclosedKinds([]), FULL_DISCLOSED);
    expect(found).toMatchObject({ parent: GAME, demo: true });
  });

  it("asks once more, in one call, for the unseen full games only", async () => {
    const { detector, inner } = setup([
      [DEMO, demoOf(GAME)],
      [OTHER_DEMO, demoOf(GAME)],
      [appId(7), demoOf(appId(8))],
      [appId(8), FULL_DISCLOSED],
      [appId(9), disclosedKinds([])],
      [GAME, FULL_DISCLOSED],
    ]);
    const found = await detector.detect([DEMO, OTHER_DEMO, appId(7), appId(8), appId(9)]);
    expect(inner.calls).toStrictEqual([appIds(4513800, 4513801, 7, 8, 9), [GAME]]);
    expect(found.get(appId(7))?.ai).toStrictEqual(lent(FULL_DISCLOSED.ai));
    expect([...found.keys()]).toStrictEqual(appIds(4513800, 4513801, 7, 8, 9));
  });

  it.each<[string, KindVerdicts]>([
    ["a DLC", dlcOf(GAME)],
    ["a game", disclosedKinds([])],
    ["an app with no answer", UNKNOWN_KINDS.missing],
  ])("lends nothing to %s and asks nothing more", async (_name, own) => {
    const { detector, inner } = setup([[DEMO, own], [GAME, FULL_DISCLOSED]]);
    expect((await detector.detect([DEMO])).get(DEMO)).toBe(own);
    expect(inner.calls).toStrictEqual([[DEMO]]);
  });

  it("goes one level up: a demo's full game that is a demo lends its own kinds", async () => {
    const grand = appId(1);
    const { detector, inner } = setup([
      [DEMO, demoOf(GAME)],
      [GAME, demoOf(grand, disclosedKinds(["drm"]))],
      [grand, FULL_DISCLOSED],
    ]);
    const found = (await detector.detect([DEMO])).get(DEMO);
    expect(inner.calls).toStrictEqual([[DEMO], [GAME]]);
    expect(found?.drm).toStrictEqual(lent(FULL_DISCLOSED.drm));
    expect(found?.ai.state).toBe("not-disclosed");
  });

  it("leaves a demo unknown when its full game is left out of the answer", async () => {
    const answered = (id: AppId): [AppId, KindVerdicts] => [id, demoOf(GAME)];
    const broken: Detector = {
      detect: (ids) => Promise.resolve(new Map(ids.filter((id) => id === DEMO).map(answered))),
    };
    const found = (await createFullGameDetector(broken).detect([DEMO])).get(DEMO);
    for (const id of KIND_IDS) {
      expect(found?.[id]).toBe(UNKNOWN_KINDS.error[id]);
    }
  });
});

describe("createFullGameDetector over the verdict cache", () => {
  const T = 1_000_000_000_000;

  /** A full-game detector over the cache over a fake that answers with `answer`. */
  function cachedSetup(answer: (id: AppId) => KindVerdicts) {
    const store = countingStore(memoryStore());
    const clock = fixedClock(T);
    const inner = fakeDetector(answer);
    const cached = cachedDetector(inner, createVerdictCache(store, clock), { error: vi.fn() });
    return { store, clock, inner, detector: createFullGameDetector(cached) };
  }

  it("serves a stored full game to a demo seen later, and stores only own verdicts", async () => {
    const { store, inner, detector } = cachedSetup((id) =>
      id === GAME ? FULL_DISCLOSED : demoOf(GAME)
    );
    await detector.detect([DEMO]);
    const later = (await detector.detect([OTHER_DEMO])).get(OTHER_DEMO);
    expect(inner.calls).toStrictEqual([[DEMO], [GAME], [OTHER_DEMO]]);
    expect(later?.ai).toStrictEqual(lent(FULL_DISCLOSED.ai));
    const stored = await store.get([verdictKey(DEMO)]);
    expect(decodeVerdicts(stored.get(verdictKey(DEMO)))?.verdicts).toStrictEqual(demoOf(GAME));
  });

  it("asks again for a full game whose lookup failed, once its memory entry expired", async () => {
    let gameAnswer: KindVerdicts = UNKNOWN_KINDS.error;
    const { clock, inner, detector } = cachedSetup((id) => id === GAME ? gameAnswer : demoOf(GAME));
    const first = (await detector.detect([DEMO])).get(DEMO);
    expect(first === undefined ? false : isTransient(first)).toBe(true);
    gameAnswer = FULL_DISCLOSED;
    clock.advance(RETRY_DELAY_MS);
    const retried = (await detector.detect([DEMO])).get(DEMO);
    expect(inner.calls).toStrictEqual([[DEMO], [GAME], [GAME]]);
    expect(retried?.kernel).toStrictEqual(lent(FULL_DISCLOSED.kernel));
  });
});
