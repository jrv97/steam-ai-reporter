import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRoot } from "../../../tests/helpers/dom";
import { toHexColor } from "../kinds/color";
import { KIND_IDS } from "../kinds/id";
import { DEFAULT_KIND_SETTINGS, type KindSettings } from "../kinds/kind-settings";
import { perKind } from "../kinds/registry";
import {
  applyKindSettings,
  colorProperty,
  filterAttribute,
  KIND_ATTRIBUTE,
  setColorOnce,
} from "./kind-attributes";

const root = () => document.documentElement;

/** The same settings for every kind, over the defaults. */
function settings(patch: Partial<KindSettings> = {}) {
  return perKind((kind) => ({ ...kind.defaults, enabled: true, ...patch }));
}

/** The defaults, except for the DRM kind. */
function withDrm(patch: Partial<KindSettings>) {
  return { ...settings(), drm: { ...DEFAULT_KIND_SETTINGS, ...patch } };
}

afterEach(() => {
  clearRoot();
});

describe("attribute names", () => {
  it("name the kind after a fixed prefix", () => {
    expect(filterAttribute("drm")).toBe("data-sar-filter-drm");
    expect(filterAttribute("pvp")).toBe("data-sar-filter-pvp");
    expect(KIND_ATTRIBUTE).toBe("data-sar-kind");
  });

  it("name the root custom property of a kind's color after a fixed prefix", () => {
    expect(colorProperty("drm")).toBe("--sar-kind-color-drm");
    expect(colorProperty("anticheat")).toBe("--sar-kind-color-anticheat");
  });
});

const colorOf = (id: "ai" | "drm") => root().style.getPropertyValue(colorProperty(id));

describe("the custom colors", () => {
  it("writes no property while no kind has a color", () => {
    applyKindSettings(root(), settings());
    for (const id of KIND_IDS) {
      expect(root().style.getPropertyValue(colorProperty(id))).toBe("");
    }
    expect(root().getAttribute("style")).toBeNull();
  });

  it("writes the color of one kind as #rrggbb and touches no other kind", () => {
    applyKindSettings(root(), withDrm({ color: toHexColor("F0A") }));
    expect(colorOf("drm")).toBe("#ff00aa");
    expect(colorOf("ai")).toBe("");
  });

  it("removes the property when the color is cleared", () => {
    applyKindSettings(root(), withDrm({ color: toHexColor("#123456") }));
    applyKindSettings(root(), settings());
    expect(colorOf("drm")).toBe("");
    expect(root().hasAttribute("style")).toBe(false);
  });

  it("changes the color in place, and writes nothing when nothing changed", () => {
    applyKindSettings(root(), withDrm({ color: toHexColor("#111111") }));
    const setProperty = vi.spyOn(root().style, "setProperty");
    const removeProperty = vi.spyOn(root().style, "removeProperty");
    applyKindSettings(root(), withDrm({ color: toHexColor("#111111") }));
    applyKindSettings(root(), settings());
    expect(setProperty).not.toHaveBeenCalled();
    expect(removeProperty).toHaveBeenCalledTimes(1);
    applyKindSettings(root(), withDrm({ color: toHexColor("#222222") }));
    expect(colorOf("drm")).toBe("#222222");
  });

  it("keeps the color of a disabled kind, which draws nothing anyway", () => {
    applyKindSettings(root(), withDrm({ enabled: false, color: toHexColor("#333333") }));
    expect(colorOf("drm")).toBe("#333333");
  });

  it("writes nothing for a color already there, on any element", () => {
    const element = document.createElement("div");
    setColorOnce(element, "ai", toHexColor("#444444"));
    const setProperty = vi.spyOn(element.style, "setProperty");
    setColorOnce(element, "ai", toHexColor("#444444"));
    expect(setProperty).not.toHaveBeenCalled();
    setColorOnce(element, "ai", undefined);
    expect(element.style.getPropertyValue(colorProperty("ai"))).toBe("");
  });
});

describe("applyKindSettings", () => {
  it("writes a filter for every kind", () => {
    applyKindSettings(root(), settings({ filter: "dim" }));
    for (const id of KIND_IDS) {
      expect(root().getAttribute(filterAttribute(id))).toBe("dim");
    }
    applyKindSettings(root(), settings());
    for (const id of KIND_IDS) {
      expect(root().getAttribute(filterAttribute(id))).toBe("off");
    }
  });

  it("keeps each kind apart", () => {
    applyKindSettings(root(), withDrm({ filter: "hide" }));
    expect(root().getAttribute(filterAttribute("drm"))).toBe("hide");
    expect(root().getAttribute(filterAttribute("ai"))).toBe("off");
  });

  it("filters nothing for a disabled kind", () => {
    applyKindSettings(root(), settings({ enabled: false, filter: "hide" }));
    for (const id of KIND_IDS) {
      expect(root().getAttribute(filterAttribute(id))).toBe("off");
    }
  });

  it("writes no attribute for the badges, which the chips follow through their own draw", () => {
    applyKindSettings(root(), settings({ badge: false }));
    expect(root().getAttributeNames().filter((name) => name.includes("badges"))).toEqual([]);
  });

  it("writes nothing when nothing changed", () => {
    applyKindSettings(root(), settings({ filter: "dim" }));
    const setAttribute = vi.spyOn(root(), "setAttribute");
    applyKindSettings(root(), settings({ filter: "dim" }));
    expect(setAttribute).not.toHaveBeenCalled();
  });
});
