import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRoot } from "../../../tests/helpers/dom";
import { KIND_IDS } from "../kinds/id";
import { DEFAULT_KIND_SETTINGS, type KindSettings } from "../kinds/kind-settings";
import { perKind } from "../kinds/registry";
import {
  applyKindSettings,
  badgesAttribute,
  badgesOff,
  filterAttribute,
  KIND_ATTRIBUTE,
} from "./kind-attributes";

const root = () => document.documentElement;

/** The same settings for every kind, over the defaults. */
function settings(patch: Partial<KindSettings> = {}) {
  return perKind((kind) => ({ ...kind.defaults, ...patch }));
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
    expect(badgesAttribute("pvp")).toBe("data-sar-badges-pvp");
  });
});

describe("applyKindSettings", () => {
  it("writes a filter and a badge switch for every kind", () => {
    applyKindSettings(root(), settings({ filter: "dim", badge: false }));
    for (const id of KIND_IDS) {
      expect(root().getAttribute(filterAttribute(id))).toBe("dim");
      expect(root().getAttribute(badgesAttribute(id))).toBe("off");
    }
    applyKindSettings(root(), settings());
    for (const id of KIND_IDS) {
      expect(root().getAttribute(filterAttribute(id))).toBe("off");
      expect(root().getAttribute(badgesAttribute(id))).toBe("on");
    }
  });

  it("keeps each kind apart", () => {
    applyKindSettings(root(), withDrm({ filter: "hide", badge: false }));
    expect(root().getAttribute(filterAttribute("drm"))).toBe("hide");
    expect(root().getAttribute(badgesAttribute("drm"))).toBe("off");
    expect(root().getAttribute(filterAttribute("ai"))).toBe("off");
    expect(root().getAttribute(badgesAttribute("ai"))).toBe("on");
  });

  it("filters nothing and shows no badge for a disabled kind", () => {
    applyKindSettings(root(), settings({ enabled: false, filter: "hide" }));
    for (const id of KIND_IDS) {
      expect(root().getAttribute(filterAttribute(id))).toBe("off");
      expect(root().getAttribute(badgesAttribute(id))).toBe("off");
    }
  });

  it("writes nothing when nothing changed", () => {
    applyKindSettings(root(), settings({ filter: "dim" }));
    const setAttribute = vi.spyOn(root(), "setAttribute");
    applyKindSettings(root(), settings({ filter: "dim" }));
    expect(setAttribute).not.toHaveBeenCalled();
  });
});

describe("badgesOff", () => {
  function chip(kind?: string): Element {
    const element = document.createElement("span");
    if (kind !== undefined) {
      element.setAttribute(KIND_ATTRIBUTE, kind);
    }
    return element;
  }

  it("is true only for the kind whose badges are off", () => {
    applyKindSettings(root(), withDrm({ badge: false }));
    expect(badgesOff(root(), chip("drm"))).toBe(true);
    expect(badgesOff(root(), chip("ai"))).toBe(false);
  });

  it("is false for an element that shows no kind", () => {
    applyKindSettings(root(), settings({ badge: false }));
    expect(badgesOff(root(), chip())).toBe(false);
  });
});
