import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRoot } from "../../../tests/helpers/dom";
import { KIND_IDS } from "../kinds/id";
import { DEFAULT_KIND_SETTINGS, type KindSettings } from "../kinds/kind-settings";
import { perKind } from "../kinds/registry";
import { applyKindSettings, filterAttribute, KIND_ATTRIBUTE } from "./kind-attributes";

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
