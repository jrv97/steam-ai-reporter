import { afterEach, describe, expect, it, vi } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { make } from "../../../tests/helpers/factory";
import { PAGE_URL } from "../../../tests/helpers/fake-detector";
import type { Route } from "../../../tests/helpers/fake-http";
import { fake } from "../../../tests/helpers/fakes";
import { T0 } from "../../../tests/helpers/timer-clock";
import { KIND_IDS } from "../kinds/id";
import type { KindVerdicts } from "../kinds/verdicts";
import type { AppId } from "../types";
import { createBreaker, HTML_BREAKER_KEY } from "./breaker";
import { createBudgetDetector, DEFAULT_HTML_BUDGET } from "./budget";
import { createChainDetector } from "./chain";
import { createThrottledHttp, DEFAULT_SPACING_MS } from "./throttle";

const DISCLOSED = make.verdicts({ ai: make.verdict.disclosed("ai") });
const NOT_DISCLOSED = make.verdicts({ ai: make.verdict.notDisclosed("html") });
const RATE_LIMITED = make.verdicts.uniform("rate-limited");

/** Every ID unknown `missing`, like GetItems for IDs it has no item for. */
function allMissing() {
  return fake.detector(() => make.verdicts());
}

afterEach(() => {
  vi.useRealTimers();
});

detectorContract(
  "createChainDetector",
  () => createChainDetector([allMissing(), fake.detector(() => NOT_DISCLOSED)]),
);
detectorContract("createChainDetector with no links", () => createChainDetector([]));
detectorContract(
  "createChainDetector over a rejecting link",
  () => createChainDetector([fake.rejectingDetector()]),
);

describe("createChainDetector", () => {
  it("sends only the IDs a link left unknown missing to the next link", async () => {
    const ids = [make.appId(), make.appId(), make.appId(), make.appId(), make.appId()] as const;
    const [disclosed, missing, failed, limited, otherMissing] = ids;
    const answers = new Map<AppId, KindVerdicts>([
      [disclosed, DISCLOSED],
      [missing, make.verdicts()],
      [failed, make.verdicts.uniform("error")],
      [limited, RATE_LIMITED],
      [otherMissing, make.verdicts()],
    ]);
    const api = fake.detector((id) => answers.get(id) ?? make.verdicts.uniform("error"));
    const html = fake.detector(() => NOT_DISCLOSED);
    const verdicts = await createChainDetector([api, html]).detect([...ids, missing]);
    expect(api.calls).toStrictEqual([ids]);
    expect(html.calls).toStrictEqual([[missing, otherMissing]]);
    expect(verdicts).toStrictEqual(
      new Map<AppId, KindVerdicts>([
        [disclosed, DISCLOSED],
        [missing, NOT_DISCLOSED],
        [failed, make.verdicts.uniform("error")],
        [limited, RATE_LIMITED],
        [otherMissing, NOT_DISCLOSED],
      ]),
    );
  });

  it.each(KIND_IDS)("does not pass an ID on when only %s has an answer", async (kind) => {
    const partly = make.verdicts({ [kind]: make.verdict.notDisclosed() });
    const html = allMissing();
    const id = make.appId();
    const verdicts = await createChainDetector([fake.detector(() => partly), html]).detect([id]);
    expect(html.calls).toStrictEqual([]);
    expect(verdicts).toStrictEqual(new Map([[id, partly]]));
  });

  it("does not call a link when nothing is left for it", async () => {
    const html = fake.detector(() => NOT_DISCLOSED);
    await createChainDetector([fake.detector(() => DISCLOSED), html]).detect(make.appIds(2));
    expect(html.calls).toStrictEqual([]);
  });

  it("keeps missing when the last link also has nothing", async () => {
    const id = make.appId();
    const verdicts = await createChainDetector([allMissing(), allMissing()]).detect([id]);
    expect(verdicts).toStrictEqual(new Map([[id, make.verdicts()]]));
  });

  it("answers unknown error for IDs a faulty link rejected or left out", async () => {
    const [answered, left] = [make.appId(), make.appId()];
    const partial = fake.partialDetector(new Map([[answered, DISCLOSED]]));
    const verdicts = await createChainDetector([partial]).detect([answered, left]);
    expect(verdicts).toStrictEqual(
      new Map([[answered, DISCLOSED], [left, make.verdicts.uniform("error")]]),
    );
  });
});

describe("the HTML fallback budget in a chain", () => {
  const ids = make.appIds(DEFAULT_HTML_BUDGET + 5);

  function setup(routes: readonly Route[]) {
    const clock = fake.timerClock();
    const server = fake.timedHttp(routes, clock);
    const breaker = createBreaker({
      store: fake.store(),
      clock,
      logger: fake.logger().logger,
      key: HTML_BREAKER_KEY,
      random: () => 0,
    });
    const html = fake.pageDetector(
      createThrottledHttp({ http: server.http, breaker, clock }),
      NOT_DISCLOSED,
    );
    const chain = createChainDetector([allMissing(), createBudgetDetector(html)]);
    return { chain, server, sent: () => server.sent.map(({ at }) => at - T0) };
  }

  it("fetches at most the budget of app pages per page view, one at a time, spaced", async () => {
    const { chain, server, sent } = setup([[PAGE_URL, { status: 200 }]]);
    const first = chain.detect(ids);
    await vi.advanceTimersByTimeAsync(2 * DEFAULT_HTML_BUDGET * DEFAULT_SPACING_MS);
    const verdicts = await first;
    expect(sent()).toStrictEqual(
      Array.from({ length: DEFAULT_HTML_BUDGET }, (_, index) => index * DEFAULT_SPACING_MS),
    );
    expect(server.inner.maxInFlight).toBe(1);
    const states = [...verdicts.values()];
    expect(states.filter((verdict) => verdict === NOT_DISCLOSED)).toHaveLength(
      DEFAULT_HTML_BUDGET,
    );
    expect(states.filter((verdict) => verdict === RATE_LIMITED)).toHaveLength(
      ids.length - DEFAULT_HTML_BUDGET,
    );

    // The budget is spent for this page view: later scans send nothing.
    const later = make.appId();
    const pending = chain.detect([later]);
    await vi.advanceTimersByTimeAsync(5 * DEFAULT_SPACING_MS);
    expect(await pending).toStrictEqual(new Map([[later, RATE_LIMITED]]));
    expect(sent()).toHaveLength(DEFAULT_HTML_BUDGET);
  });

  it("stops at the first 429 from an app page", async () => {
    const { chain, sent } = setup([[PAGE_URL, { status: 429 }]]);
    const pending = chain.detect(ids);
    await vi.advanceTimersByTimeAsync(2 * DEFAULT_HTML_BUDGET * DEFAULT_SPACING_MS);
    const verdicts = await pending;
    expect(sent()).toStrictEqual([0]);
    expect([...verdicts.values()].filter((v) => v === RATE_LIMITED)).toHaveLength(ids.length - 1);
  });
});
