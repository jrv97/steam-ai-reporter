import { describe, expect, it } from "vitest";
import { OFF_KINDS } from "../../../tests/helpers/settings";
import { SHIPPED_CATALOGS } from "../i18n/shipped";
import { KIND_IDS } from "./id";
import { holdsEveryKind, KIND_BY_ID, KINDS, perKind } from "./registry";

describe("KINDS", () => {
  it("holds one definition for each kind id, in order, and each one knows its id", () => {
    expect(KINDS.map((kind) => kind.id)).toStrictEqual([...KIND_IDS]);
    expect(new Set(KIND_IDS).size).toBe(KIND_IDS.length);
  });

  it("starts every kind but PvP and IAP enabled, with badge, banner and an untouched list", () => {
    for (const kind of KINDS) {
      expect(kind.defaults).toStrictEqual({
        enabled: !OFF_KINDS.includes(kind.id),
        badge: true,
        banner: true,
        filter: "off",
      });
    }
  });
});

describe("perKind", () => {
  it("calls make once for each registered kind and keys the results by kind id", () => {
    const seen: string[] = [];
    const result = perKind((kind) => {
      seen.push(kind.id);
      return kind.messages.chip;
    });
    expect(seen).toStrictEqual([...KIND_IDS]);
    expect(Object.keys(result)).toStrictEqual([...KIND_IDS]);
    expect(result.ai).toBe(KINDS[0].messages.chip);
  });
});

describe("KIND_BY_ID", () => {
  it("maps each id to its own definition", () => {
    for (const kind of KINDS) {
      expect(KIND_BY_ID[kind.id]).toBe(kind);
    }
  });
});

describe("holdsEveryKind", () => {
  it("is true only when a value is present for each registered kind", () => {
    expect(holdsEveryKind(perKind(() => 1))).toBe(true);
    expect(holdsEveryKind({})).toBe(false);
    expect(holdsEveryKind({ ...perKind(() => 1), ai: undefined })).toBe(false);
  });

  it("asks `fits` about every slot and fails when one value does not fit", () => {
    const seen: string[] = [];
    const fits = (id: string, value: number): boolean => {
      seen.push(id);
      return value > 0;
    };
    expect(holdsEveryKind(perKind(() => 1), fits)).toBe(true);
    expect(seen).toStrictEqual([...KIND_IDS]);
    expect(holdsEveryKind({ ...perKind(() => 1), kernel: 0 }, fits)).toBe(false);
  });
});

describe("kind messages", () => {
  const locales = Object.entries(SHIPPED_CATALOGS);

  it.each(locales)("%s names every kind with a heading and a chip", (_locale, catalog) => {
    for (const kind of KINDS) {
      expect(catalog?.[kind.messages.heading]?.message).toBeTruthy();
      expect(catalog?.[kind.messages.chip]?.message).toBeTruthy();
    }
  });

  it.each(locales)(
    "%s gives every kind its own chip, no longer than its heading",
    (_l, catalog) => {
      const chips = KINDS.map((kind) => catalog?.[kind.messages.chip]?.message ?? "");
      expect(new Set(chips).size).toBe(KINDS.length);
      for (const kind of KINDS) {
        const chip = catalog?.[kind.messages.chip]?.message ?? "";
        const heading = catalog?.[kind.messages.heading]?.message ?? "";
        expect(chip.length).toBeLessThanOrEqual(heading.length);
      }
    },
  );
});
