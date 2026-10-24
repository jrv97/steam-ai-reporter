import { describe, expect, it } from "vitest";
import { detectorContract } from "../../../tests/contracts/detector.contract";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { fakeDetector } from "../../../tests/helpers/fake-detector";
import { fakeHttp } from "../../../tests/helpers/fake-http";
import { getItemsRequest, getItemsRoute, storeItem } from "../../../tests/helpers/getitems";
import { aiVerdicts } from "../../../tests/helpers/verdicts";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { AppId, Detector } from "../types";
import { createDedupingDetector } from "./dedupe";
import { createGetItemsDetector } from "./getitems";

const NOT_DISCLOSED = aiVerdicts({ state: "not-disclosed", source: "api" });

detectorContract(
  "createDedupingDetector",
  () => createDedupingDetector(fakeDetector(() => NOT_DISCLOSED)),
);
detectorContract(
  "createDedupingDetector over a rejecting detector",
  () => createDedupingDetector({ detect: () => Promise.reject(new Error()) }),
);

/** A detector whose single call answers only when the test says so. */
function heldDetector() {
  const calls: (readonly AppId[])[] = [];
  let release = (): void => undefined;
  const detector: Detector = {
    async detect(ids) {
      calls.push(ids);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return new Map(ids.map((id): [AppId, KindVerdicts] => [id, NOT_DISCLOSED]));
    },
  };
  const releaseNow = (): void => {
    release();
  };
  return { detector, calls, release: releaseNow };
}

describe("createDedupingDetector", () => {
  it("costs one GetItems request for one ID asked for twice in the same tick", async () => {
    const http = fakeHttp([getItemsRoute([storeItem(413150)])]);
    const detector = createDedupingDetector(createGetItemsDetector({ http, language: "english" }));
    const [first, second] = await Promise.all([
      detector.detect(appIds(413150)),
      detector.detect(appIds(413150)),
    ]);
    expect(http.calls).toHaveLength(1);
    expect(first).toStrictEqual(new Map([[appId(413150), NOT_DISCLOSED]]));
    expect(second).toStrictEqual(first);
  });

  it("merges the IDs of one tick into one call and answers each caller its own", async () => {
    const http = fakeHttp([getItemsRoute([storeItem(1), storeItem(2), storeItem(3)])]);
    const detector = createDedupingDetector(createGetItemsDetector({ http, language: "english" }));
    const [left, right] = await Promise.all([
      detector.detect(appIds(1, 2)),
      detector.detect(appIds(2, 3, 3)),
    ]);
    expect(http.calls.map((url) => getItemsRequest(url).ids)).toStrictEqual([[1, 2, 3]]);
    expect([...left.keys()]).toStrictEqual(appIds(1, 2));
    expect([...right.keys()]).toStrictEqual(appIds(2, 3));
  });

  it("lets a later request wait for an ID still in flight", async () => {
    const held = heldDetector();
    const detector = createDedupingDetector(held.detector);
    const first = detector.detect(appIds(1));
    await Promise.resolve();
    await Promise.resolve();
    const second = detector.detect(appIds(1));
    await Promise.resolve();
    held.release();
    expect(await second).toStrictEqual(await first);
    expect(held.calls).toStrictEqual([appIds(1)]);
  });

  it("asks again once the earlier call has settled", async () => {
    const inner = fakeDetector(() => NOT_DISCLOSED);
    const detector = createDedupingDetector(inner);
    await detector.detect(appIds(1));
    await detector.detect(appIds(1));
    expect(inner.calls).toStrictEqual([appIds(1), appIds(1)]);
  });

  it("answers unknown error when the inner detector rejects", async () => {
    const detector = createDedupingDetector({ detect: () => Promise.reject(new Error()) });
    expect(await detector.detect(appIds(9))).toStrictEqual(
      new Map([[appId(9), UNKNOWN_KINDS.error]]),
    );
  });
});
