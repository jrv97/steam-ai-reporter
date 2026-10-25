import { afterEach, describe, expect, it, vi } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { fakeDetector } from "../../../tests/helpers/fake-detector";
import { fakeHttp, type Route } from "../../../tests/helpers/fake-http";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { recordingLogger } from "../../../tests/helpers/recording-logger";
import { T0, useTimerClock } from "../../../tests/helpers/timer-clock";
import { aiVerdicts } from "../../../tests/helpers/verdicts";
import { KINDS } from "../kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Http } from "../ports";
import type { Detector } from "../ports";
import { type AppId, NOT_DISCLOSED as NOT_DISCLOSED_VERDICT } from "../types";
import { createBreaker, HTML_BREAKER_KEY } from "./breaker";
import { createBudgetDetector } from "./budget";
import { createChainDetector } from "./chain";
import { createThrottledHttp } from "./throttle";

const DISCLOSED = aiVerdicts({
  state: "disclosed",
  kind: "ai",
  notes: "Art",
  language: "english",
  source: "api",
});
const NOT_DISCLOSED = aiVerdicts({ state: "not-disclosed", source: "html" });
const PAGE = "https://store.steampowered.com/app/";

/** Every ID unknown `missing`, like GetItems for IDs it has no item for. */
function allMissing() {
  return fakeDetector(() => UNKNOWN_KINDS.missing);
}

/**
 * A stand-in for the HTML fallback detector, built in its own step: one app page request per ID,
 * all sent at once (the worst case for pacing). 200 is not disclosed; withheld is rate-limited.
 */
function pageDetector(http: Http): Detector {
  return {
    async detect(ids) {
      const distinct = [...new Set(ids)];
      const results = await Promise.all(distinct.map((id) => http.get(`${PAGE}${String(id)}/`)));
      return new Map(
        distinct.map((id, index): [AppId, KindVerdicts] => {
          const result = results[index];
          if (result?.kind === "withheld") {
            return [id, UNKNOWN_KINDS["rate-limited"]];
          }
          return [
            id,
            result?.kind === "response" && result.status === 200
              ? NOT_DISCLOSED
              : UNKNOWN_KINDS.error,
          ];
        }),
      );
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

detectorContract(
  "createChainDetector",
  () => createChainDetector([allMissing(), fakeDetector(() => NOT_DISCLOSED)]),
);
detectorContract("createChainDetector with no links", () => createChainDetector([]));
detectorContract(
  "createChainDetector over a rejecting link",
  () => createChainDetector([{ detect: () => Promise.reject(new Error()) }]),
);

describe("createChainDetector", () => {
  it("sends only the IDs a link left unknown missing to the next link", async () => {
    const verdictFor = new Map<number, KindVerdicts>([
      [1, DISCLOSED],
      [2, UNKNOWN_KINDS.missing],
      [3, UNKNOWN_KINDS.error],
      [4, UNKNOWN_KINDS["rate-limited"]],
      [5, UNKNOWN_KINDS.missing],
    ]);
    const api = fakeDetector((id) => verdictFor.get(id) ?? UNKNOWN_KINDS.error);
    const html = fakeDetector(() => NOT_DISCLOSED);
    const verdicts = await createChainDetector([api, html]).detect(appIds(1, 2, 3, 4, 5, 2));
    expect(api.calls).toStrictEqual([appIds(1, 2, 3, 4, 5)]);
    expect(html.calls).toStrictEqual([appIds(2, 5)]);
    expect(verdicts).toStrictEqual(
      new Map<AppId, KindVerdicts>([
        [appId(1), DISCLOSED],
        [appId(2), NOT_DISCLOSED],
        [appId(3), UNKNOWN_KINDS.error],
        [appId(4), UNKNOWN_KINDS["rate-limited"]],
        [appId(5), NOT_DISCLOSED],
      ]),
    );
  });

  it("passes an ID on only when no kind has an answer, whichever kind has one", async () => {
    for (const kind of KINDS) {
      const partly = { ...UNKNOWN_KINDS.missing, [kind.id]: NOT_DISCLOSED_VERDICT };
      const api = fakeDetector(() => partly);
      const html = allMissing();
      const verdicts = await createChainDetector([api, html]).detect(appIds(1));
      expect(html.calls).toStrictEqual([]);
      expect(verdicts).toStrictEqual(new Map([[appId(1), partly]]));
    }
    const html = allMissing();
    await createChainDetector([allMissing(), html]).detect(appIds(1));
    expect(html.calls).toStrictEqual([appIds(1)]);
  });

  it("does not call a link when nothing is left for it", async () => {
    const html = fakeDetector(() => NOT_DISCLOSED);
    await createChainDetector([fakeDetector(() => DISCLOSED), html]).detect(appIds(1, 2));
    expect(html.calls).toStrictEqual([]);
  });

  it("keeps missing when the last link also has nothing", async () => {
    const verdicts = await createChainDetector([allMissing(), allMissing()]).detect(appIds(7));
    expect(verdicts).toStrictEqual(new Map([[appId(7), UNKNOWN_KINDS.missing]]));
  });

  it("answers unknown error for IDs a faulty link rejected or left out", async () => {
    const partial: Detector = { detect: () => Promise.resolve(new Map([[appId(1), DISCLOSED]])) };
    const verdicts = await createChainDetector([partial]).detect(appIds(1, 2));
    expect(verdicts).toStrictEqual(
      new Map<AppId, KindVerdicts>([[appId(1), DISCLOSED], [appId(2), UNKNOWN_KINDS.error]]),
    );
  });
});

describe("the HTML fallback budget in a chain", () => {
  const ids = appIds(...Array.from({ length: 15 }, (_, index) => 4_000_000 + index));

  function setup(routes: readonly Route[]) {
    const clock = useTimerClock();
    const server = fakeHttp(routes);
    const sent: number[] = [];
    const timed: Http = {
      get(url) {
        sent.push(clock.now() - T0);
        return server.get(url);
      },
    };
    const breaker = createBreaker({
      store: memoryStore(),
      clock,
      logger: recordingLogger().logger,
      key: HTML_BREAKER_KEY,
      random: () => 0,
    });
    const html = pageDetector(createThrottledHttp({ http: timed, breaker, clock }));
    const chain = createChainDetector([allMissing(), createBudgetDetector(html)]);
    return { chain, server, sent };
  }

  it("fetches at most 10 app pages per page view, one at a time, 1 s apart", async () => {
    const { chain, server, sent } = setup([[PAGE, { status: 200 }]]);
    const first = chain.detect(ids);
    await vi.advanceTimersByTimeAsync(20_000);
    const verdicts = await first;
    expect(sent).toStrictEqual(Array.from({ length: 10 }, (_, index) => index * 1_000));
    expect(server.maxInFlight).toBe(1);
    const states = [...verdicts.values()];
    expect(states.filter((verdict) => verdict === NOT_DISCLOSED)).toHaveLength(10);
    expect(states.filter((verdict) => verdict === UNKNOWN_KINDS["rate-limited"])).toHaveLength(5);

    // The budget is spent for this page view: later scans send nothing.
    const later = chain.detect(appIds(5_000_000));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await later).toStrictEqual(new Map([[appId(5_000_000), UNKNOWN_KINDS["rate-limited"]]]));
    expect(sent).toHaveLength(10);
  });

  it("stops at the first 429 from an app page", async () => {
    const { chain, sent } = setup([[PAGE, { status: 429 }]]);
    const pending = chain.detect(ids);
    await vi.advanceTimersByTimeAsync(20_000);
    const verdicts = await pending;
    expect(sent).toStrictEqual([0]);
    expect([...verdicts.values()].filter((v) => v === UNKNOWN_KINDS["rate-limited"])).toHaveLength(
      14,
    );
  });
});
