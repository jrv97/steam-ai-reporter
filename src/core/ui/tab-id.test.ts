import { describe, expect, it } from "vitest";
import { KIND_IDS, type KindId } from "../kinds/id";
import { parseOrder } from "../kinds/order";
import { GENERAL_TAB, parseTabHash, TAB_IDS, tabHash, tabsInOrder } from "./tab-id";

describe("the tab a location fragment names", () => {
  it.each([
    ["#tab=drm", "drm"],
    ["tab=general", "general"],
    ["#tab=family&x=1", "family"],
    ["#x=1&tab=ai", "ai"],
    ["#tab=gone", undefined],
    ["#tab=", undefined],
    ["#tab=DRM", undefined],
    ["#drm", undefined],
    ["", undefined],
  ])("reads %j as %s", (hash, tab) => {
    expect(parseTabHash(hash)).toBe(tab);
  });

  it.each(TAB_IDS)("reads back the fragment of the %s tab", (id) => {
    expect(parseTabHash(tabHash(id))).toBe(id);
  });

  it("knows General and every kind, General first", () => {
    expect(TAB_IDS).toEqual([GENERAL_TAB, ...KIND_IDS]);
  });
});

describe("the order of the tabs", () => {
  it.each<readonly KindId[]>([KIND_IDS, parseOrder(["pvp", "drm"])])(
    "puts General first, then %j",
    (...order) => {
      expect(tabsInOrder(order)).toEqual([GENERAL_TAB, ...order]);
    },
  );
});
