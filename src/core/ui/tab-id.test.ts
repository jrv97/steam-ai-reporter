import { describe, expect, it } from "vitest";
import { englishI18n } from "../../../tests/helpers/i18n";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { createI18n } from "../i18n/t";
import { KIND_IDS } from "../kinds/id";
import { KINDS } from "../kinds/registry";
import { GENERAL_TAB, parseTabHash, sortTabs, TAB_IDS, tabHash } from "./tab-id";

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
  const labelled = (locale: string) => {
    const i18n = createI18n(SHIPPED_CATALOGS, locale);
    return KINDS.map((kind) => ({ id: kind.id, label: i18n.t(kind.messages.chip) }));
  };

  it.each(Object.keys(SHIPPED_CATALOGS))(
    "puts General first, then the labels in %s alphabetical order",
    (locale) => {
      const tabs = labelled(locale);
      const order = sortTabs(tabs, locale);
      const labels = order.slice(1).map((id) => tabs.find((tab) => tab.id === id)?.label ?? "");
      expect(order[0]).toBe(GENERAL_TAB);
      expect(labels).toEqual(labels.toSorted((a, b) => a.localeCompare(b, locale)));
      expect(order.toSorted()).toEqual([...TAB_IDS].toSorted());
    },
  );

  it("sorts by the visible label, not by the id or the registry", () => {
    const i18n = englishI18n();
    const order = sortTabs(labelled("en"), "en");
    expect(order.indexOf("account")).toBeLessThan(order.indexOf("ai"));
    expect(KIND_IDS.indexOf("account")).toBeGreaterThan(KIND_IDS.indexOf("ai"));
    expect(i18n.t("kind_account_chip").localeCompare(i18n.t("kind_ai_chip"), "en")).toBe(-1);
  });

  it("puts the kinds of a given order first and sorts the rest", () => {
    const order = sortTabs(labelled("en"), "en", ["pvp", "drm"]);
    expect(order.slice(0, 3)).toEqual([GENERAL_TAB, "pvp", "drm"]);
    expect(order).toHaveLength(TAB_IDS.length);
  });
});
