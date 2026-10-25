import { describe, expect, it } from "vitest";
import { toHexColor } from "./color";
import {
  effectiveSettings,
  encodeKindSettings,
  type KindSettings,
  LIST_FILTERS,
  mergeKindSettings,
  parseKindSettings,
} from "./kind-settings";

const DEFAULTS: KindSettings = { enabled: true, badge: true, banner: true, filter: "off" };
const VIOLET = toHexColor("#8f73f3");

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

  it("has no color until one is stored, and no color key either", () => {
    expect(parseKindSettings(DEFAULTS, {})).not.toHaveProperty("color");
    expect(parseKindSettings(DEFAULTS, { color: undefined })).not.toHaveProperty("color");
  });

  it("reads a stored color in its normal form", () => {
    expect(parseKindSettings(DEFAULTS, { color: "#8F73F3" }).color).toBe(VIOLET);
    expect(parseKindSettings(DEFAULTS, { color: "f0a" }).color).toBe("#ff00aa");
  });

  it("drops a color that is not one and keeps the other fields", () => {
    for (const color of ["red", "#12", "#abc; x", 7, null, true, {}, []]) {
      const parsed = parseKindSettings(DEFAULTS, { color, filter: "dim" });
      expect(parsed, JSON.stringify(color)).toStrictEqual({ ...DEFAULTS, filter: "dim" });
    }
  });

  it("falls back to the color of the given defaults", () => {
    const tinted = mergeKindSettings(DEFAULTS, { color: VIOLET });
    expect(parseKindSettings(tinted, { color: "nope" })).toStrictEqual(tinted);
  });

  it("drops keys it does not know", () => {
    expect(parseKindSettings(DEFAULTS, { ...DEFAULTS, theme: "dark" })).toStrictEqual(DEFAULTS);
  });
});

describe("effectiveSettings", () => {
  it("keeps the color of a disabled kind", () => {
    const tinted = mergeKindSettings({ ...DEFAULTS, enabled: false }, { color: VIOLET });
    expect(effectiveSettings(tinted).color).toBe(VIOLET);
  });

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

describe("mergeKindSettings", () => {
  it("replaces the fields of the patch and keeps the others", () => {
    expect(mergeKindSettings(DEFAULTS, { badge: false })).toStrictEqual({
      ...DEFAULTS,
      badge: false,
    });
    expect(mergeKindSettings(DEFAULTS, undefined)).toStrictEqual(DEFAULTS);
  });

  it("sets a color, keeps it through other patches and clears it with undefined", () => {
    const tinted = mergeKindSettings(DEFAULTS, { color: VIOLET });
    expect(tinted.color).toBe(VIOLET);
    expect(mergeKindSettings(tinted, { filter: "dim" }).color).toBe(VIOLET);
    const cleared = mergeKindSettings(tinted, { color: undefined });
    expect(cleared).toStrictEqual(DEFAULTS);
    expect(cleared).not.toHaveProperty("color");
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

  it("stores a color as the text #rrggbb, and no key at all without one", () => {
    expect(encodeKindSettings(DEFAULTS)).not.toHaveProperty("color");
    const tinted = mergeKindSettings(DEFAULTS, { color: VIOLET });
    expect(encodeKindSettings(tinted)).toStrictEqual({ ...DEFAULTS, color: "#8f73f3" });
    expect(parseKindSettings(DEFAULTS, encodeKindSettings(tinted))).toStrictEqual(tinted);
  });
});
