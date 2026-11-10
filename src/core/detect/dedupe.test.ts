import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { getItemsRequest } from "../../../tests/helpers/getitems";
import type { AppId } from "../types";
import { createDedupingDetector } from "./dedupe";
import { createGetItemsDetector } from "./getitems";

const NOT_DISCLOSED = make.verdicts({ ai: make.verdict.notDisclosed("api") });
const { logger } = fake.logger();

detectorContract(
  "createDedupingDetector",
  () => createDedupingDetector(fake.detector(() => NOT_DISCLOSED), logger),
);
detectorContract(
  "createDedupingDetector over a rejecting detector",
  () => createDedupingDetector(fake.rejectingDetector(), logger),
);

/** A deduping detector over GetItems, whose server holds a plain item for each of `ids`. */
function overGetItems(ids: readonly number[]) {
  const http = fake.http([make.item.route(ids.map((id) => make.item.store(id)))]);
  return {
    http,
    detector: createDedupingDetector(createGetItemsDetector({ http, language: "english" }), logger),
  };
}

describe("createDedupingDetector", () => {
  it("costs one GetItems request for one ID asked for twice in the same tick", async () => {
    const id = make.appId();
    const { http, detector } = overGetItems([id]);
    const [first, second] = await Promise.all([detector.detect([id]), detector.detect([id])]);
    expect(http.calls).toHaveLength(1);
    expect(first.get(id)?.ai).toStrictEqual(make.verdict.notDisclosed("api"));
    expect(second).toStrictEqual(first);
  });

  it("merges the IDs of one tick into one call and answers each caller its own", async () => {
    const [a, b, c] = [make.appId(), make.appId(), make.appId()];
    const { http, detector } = overGetItems([a, b, c]);
    const [left, right] = await Promise.all([detector.detect([a, b]), detector.detect([b, c, c])]);
    expect(http.calls.map((url) => getItemsRequest(url).ids)).toStrictEqual([[a, b, c]]);
    expect([...left.keys()]).toStrictEqual([a, b]);
    expect([...right.keys()]).toStrictEqual([b, c]);
  });

  it("lets a later request wait for an ID still in flight", async () => {
    const ids = make.appIds(1);
    const held = fake.heldDetector(() => NOT_DISCLOSED);
    const detector = createDedupingDetector(held, logger);
    const first = detector.detect(ids);
    await Promise.resolve();
    await Promise.resolve();
    const second = detector.detect(ids);
    await Promise.resolve();
    held.release();
    expect(await second).toStrictEqual(await first);
    expect(held.calls).toStrictEqual([ids]);
  });

  it("asks again once the earlier call has settled", async () => {
    const ids = make.appIds(1);
    const inner = fake.detector(() => NOT_DISCLOSED);
    const detector = createDedupingDetector(inner, logger);
    await detector.detect(ids);
    await detector.detect(ids);
    expect(inner.calls).toStrictEqual([ids, ids]);
  });

  it("keeps telling the other callers when one caller's sink throws", async () => {
    const id = make.appId();
    const recording = fake.logger();
    const detector = createDedupingDetector(fake.detector(() => NOT_DISCLOSED), recording.logger);
    const heard: AppId[] = [];
    const [, answer] = await Promise.all([
      detector.detect([id], () => {
        throw new Error();
      }),
      detector.detect([id], (partial) => heard.push(...partial.keys())),
    ]);
    expect(heard).toStrictEqual([id]);
    expect(answer).toStrictEqual(new Map([[id, NOT_DISCLOSED]]));
    expect(recording.sink.error).toHaveBeenCalledOnce();
  });

  it("answers unknown error when the inner detector rejects", async () => {
    const id = make.appId();
    const detector = createDedupingDetector(fake.rejectingDetector(), logger);
    expect(await detector.detect([id])).toStrictEqual(
      new Map([[id, make.verdicts.uniform("error")]]),
    );
  });
});
