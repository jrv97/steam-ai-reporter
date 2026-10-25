import { describe, expect, it } from "vitest";
import {
  effectiveSettings,
  encodeKindSettings,
  type KindSettings,
  LIST_FILTERS,
  parseKindSettings,
} from "./kind-settings";

const DEFAULTS: KindSettings = { enabled: true, badge: true, banner: true, filter: "off" };

describe("LIST_FILTERS", () => {
  it("lists the three filters in the order the settings show them", () => {
    expect(LIST_FILTERS).toStrictEqual(["off", "dim", "hide"]);
  });
});

describe("parseKindSettings", () => {
  it("returns the defaults when nothing valid is stored", () => {
    for (const stored of [undefined, null, 7, "dim", true, [], [{ badge: false }]]) {
      expect(parseKindSettings(DEFAULTS, stored)).toStrictEqual(DEFAULTS);
    }
  });

  it("accepts every valid value", () => {
    const stored: KindSettings = { enabled: false, badge: false, banner: false, filter: "hide" };
    expect(parseKindSettings(DEFAULTS, stored)).toStrictEqual(stored);
  });

  it("falls back per field and keeps the valid ones", () => {
    expect(
      parseKindSettings(DEFAULTS, { enabled: 0, badge: "yes", banner: false, filter: "blur" }),
    ).toStrictEqual({ ...DEFAULTS, banner: false });
  });

  it("falls back to the given defaults, not to fixed ones", () => {
    const other: KindSettings = { enabled: false, badge: false, banner: true, filter: "dim" };
    expect(parseKindSettings(other, {})).toStrictEqual(other);
  });

  it("drops keys it does not know", () => {
    expect(parseKindSettings(DEFAULTS, { ...DEFAULTS, theme: "dark" })).toStrictEqual(DEFAULTS);
  });
});

describe("effectiveSettings", () => {
  it("keeps the settings of an enabled kind as they are", () => {
    const settings: KindSettings = { enabled: true, badge: false, banner: true, filter: "dim" };
    expect(effectiveSettings(settings)).toBe(settings);
  });

  it("shows no badge or banner and filters nothing while the kind is disabled", () => {
    expect(
      effectiveSettings({ enabled: false, badge: true, banner: true, filter: "hide" }),
    ).toStrictEqual({ enabled: false, badge: false, banner: false, filter: "off" });
  });
});

describe("encodeKindSettings", () => {
  it("stores every field and reads back through parseKindSettings", () => {
    const settings: KindSettings = { enabled: false, badge: true, banner: false, filter: "hide" };
    expect(encodeKindSettings(settings)).toStrictEqual({
      enabled: false,
      badge: true,
      banner: false,
      filter: "hide",
    });
    expect(parseKindSettings(DEFAULTS, encodeKindSettings(settings))).toStrictEqual(settings);
  });
});
