import { describe, expect, it } from "vitest";
import type { FakeStorePage } from "../../../tests/helpers/fake-store-tab";
import { fake } from "../../../tests/helpers/fakes";
import { announceStoreTab } from "./store-tab";

describe("announceStoreTab", () => {
  it.each<readonly [string, boolean, (page: FakeStorePage) => void, number]>([
    ["at once on a page in view", false, () => undefined, 1],
    ["once through the first pageshow", false, (page) => {
      page.pageshow(false);
    }, 1],
    ["again on a return from the back/forward cache", false, (page) => {
      page.pageshow(true);
    }, 2],
    ["never while the page prerenders", true, () => undefined, 0],
    ["once a prerendered page comes into view", true, (page) => {
      page.show();
    }, 1],
  ])("names the tab %s", (_name, prerendering, act, expected) => {
    const page = fake.storePage({ prerendering });
    let sent = 0;
    announceStoreTab(page, () => {
      sent += 1;
    });
    act(page);
    expect(sent).toBe(expected);
  });
});
