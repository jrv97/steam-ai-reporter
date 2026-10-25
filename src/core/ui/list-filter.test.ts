import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRoot } from "../../../tests/helpers/dom";
import { hostView, type HostViewOptions } from "../../../tests/helpers/host-view";
import { strongestFilter } from "../../../tests/helpers/settings";
import {
  disclosedKinds,
  disclosedVerdict,
  FULL_DISCLOSED,
  NOT_DISCLOSED,
} from "../../../tests/helpers/verdicts";
import { KIND_IDS, type KindId } from "../kinds/id";
import { LIST_FILTERS, type ListFilter } from "../kinds/kind-settings";
import { perKind } from "../kinds/registry";
import { UNKNOWN } from "../types";
import { applyKindSettings } from "./kind-attributes";
import { createHostKindsRenderer } from "./list-filter";
import { adoptStyles, PAGE_CSS, TOKENS_CSS } from "./styles";

const DIM = "opacity(0.4)";
const ALL_KINDS = KIND_IDS.join(" ");

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function view(element: Element, options: HostViewOptions = {}) {
  return hostView(element, options);
}

afterEach(() => {
  document.body.replaceChildren();
  clearRoot();
});

describe("createHostKindsRenderer", () => {
  const renderer = createHostKindsRenderer();
  const kinds = (element: Element) => element.getAttribute("data-sar-kinds");

  it("lists every disclosed kind in registry order", () => {
    const element = host();
    renderer.render(view(element, { verdicts: FULL_DISCLOSED }));
    expect(kinds(element)).toBe(ALL_KINDS);
  });

  it("leaves out kinds that are not disclosed, unknown or ignored", () => {
    const element = host();
    const verdicts = {
      ...disclosedKinds(["ai", "drm", "pvp", "account"]),
      kernel: UNKNOWN.error,
      eula: UNKNOWN.gated,
    };
    renderer.render(view(element, { verdicts, ignored: ["pvp"] }));
    expect(kinds(element)).toBe("ai drm account");
  });

  it("marks no kind for a game that is not disclosed, unknown or ignored for every kind", () => {
    const [none, unknown, ignored] = [host(), host(), host()];
    renderer.render(view(none, { verdict: NOT_DISCLOSED }));
    renderer.render(view(unknown, { verdict: UNKNOWN.gated }));
    renderer.render(view(ignored, { verdicts: FULL_DISCLOSED, allowed: true }));
    expect([none, unknown, ignored].map((element) => element.hasAttribute("data-sar-kinds")))
      .toEqual([false, false, false]);
  });

  it("follows the verdicts when they change, and drops the attribute when none is left", () => {
    const element = host();
    renderer.render(view(element, { verdicts: disclosedKinds(["ai", "eula"]) }));
    expect(kinds(element)).toBe("ai eula");
    renderer.render(view(element, { verdicts: disclosedKinds(["eula"]) }));
    expect(kinds(element)).toBe("eula");
    renderer.render(view(element, { verdicts: disclosedKinds([]) }));
    expect(element.hasAttribute("data-sar-kinds")).toBe(false);
  });

  it("marks hosts that must not be hidden, and clears the mark", () => {
    const element = host();
    renderer.render(view(element, { hideable: false }));
    expect(element.getAttribute("data-sar-hideable")).toBe("false");
    renderer.render(view(element));
    expect(element.hasAttribute("data-sar-hideable")).toBe(false);
  });

  it("writes nothing when nothing changed", () => {
    const element = host();
    renderer.render(view(element, { hideable: false }));
    const setAttribute = vi.spyOn(element, "setAttribute");
    renderer.render(view(element, { hideable: false }));
    expect(setAttribute).not.toHaveBeenCalled();
  });
});

// happy-dom does not restyle descendants when a root attribute changes, so every case builds its
// hosts after the root attributes are set; browsers restyle in one pass.
describe("the list filter styles", () => {
  function filters(modes: Partial<Record<KindId, ListFilter>>): void {
    adoptStyles(document, TOKENS_CSS + PAGE_CSS);
    applyKindSettings(
      document.documentElement,
      perKind((kind) => ({ ...kind.defaults, enabled: true, filter: modes[kind.id] ?? "off" })),
    );
  }

  /** The style of a host that carries `carried`, drawn the way the renderer draws it. */
  function carrying(
    carried: readonly KindId[],
    options: HostViewOptions = {},
  ): CSSStyleDeclaration {
    const element = host();
    const verdicts = disclosedKinds(carried);
    createHostKindsRenderer().render(view(element, { verdicts, ...options }));
    return getComputedStyle(element);
  }

  const dimmed = (style: CSSStyleDeclaration) => style.filter === DIM;
  const hidden = (style: CSSStyleDeclaration) => style.display === "none";
  const others = (id: KindId) => KIND_IDS.filter((other) => other !== id);

  it.each(KIND_IDS)("%s dims the hosts that carry it and no others", (id) => {
    filters({ [id]: "dim" });
    expect(dimmed(carrying([id]))).toBe(true);
    expect(dimmed(carrying(others(id)))).toBe(false);
  });

  it.each(KIND_IDS)("%s hides the hosts that carry it, and dims those that must stay", (id) => {
    filters({ [id]: "hide" });
    const shown = carrying([id]);
    const fixed = carrying([id], { hideable: false });
    expect([hidden(shown), dimmed(shown)]).toEqual([true, false]);
    expect([hidden(fixed), dimmed(fixed)]).toEqual([false, true]);
    expect(hidden(carrying(others(id)))).toBe(false);
  });

  it("leaves hosts alone while every filter is off", () => {
    filters({});
    const style = carrying(KIND_IDS);
    expect([hidden(style), dimmed(style)]).toEqual([false, false]);
  });

  // The strongest mode wins: hide over dim over off.
  const PAIRS = LIST_FILTERS.flatMap((ai) => LIST_FILTERS.map((drm) => [ai, drm] as const));
  const CASES = PAIRS.flatMap(([ai, drm]) => [[ai, drm, true], [ai, drm, false]] as const);

  it.each(CASES)(
    "a host with AI on %s and DRM on %s, hideable %s, follows the strongest mode",
    (ai, drm, hideable) => {
      filters({ ai, drm });
      const style = carrying(["ai", "drm"], { hideable });
      const strongest = strongestFilter([ai, drm]);
      const gone = strongest === "hide" && hideable;
      expect(hidden(style)).toBe(gone);
      // A hidden host shows nothing to dim; any other host dims for a dim or a hide that cannot.
      expect(gone || dimmed(style) === (strongest !== "off")).toBe(true);
    },
  );

  it("lets one hiding kind outrank the dims of the others on a host", () => {
    filters({ ai: "dim", kernel: "dim", pvp: "hide" });
    expect(hidden(carrying(["ai", "kernel", "pvp"]))).toBe(true);
    expect(dimmed(carrying(["ai", "kernel"]))).toBe(true);
    expect(hidden(carrying(["ai", "kernel"]))).toBe(false);
  });

  it("ignores a filter of a kind the host does not carry", () => {
    filters({ kernel: "hide", drm: "dim" });
    const style = carrying(["ai", "pvp"]);
    expect([hidden(style), dimmed(style)]).toEqual([false, false]);
  });

  it("never filters a kind that is not disclosed, unknown or ignored", () => {
    filters(Object.fromEntries(KIND_IDS.map((id) => [id, "hide"])));
    const none = carrying([]);
    const unknown = carrying([], { verdicts: perKind(() => UNKNOWN.error) });
    const ignored = carrying(KIND_IDS, { allowed: true });
    for (const style of [none, unknown, ignored]) {
      expect([hidden(style), dimmed(style)]).toEqual([false, false]);
    }
  });

  it("filters nothing for a kind that is disabled", () => {
    adoptStyles(document, TOKENS_CSS + PAGE_CSS);
    applyKindSettings(
      document.documentElement,
      perKind((kind) => ({ ...kind.defaults, enabled: kind.id !== "drm", filter: "hide" })),
    );
    expect(hidden(carrying(["drm"]))).toBe(false);
    expect(hidden(carrying(["ai"]))).toBe(true);
  });

  it("keeps a host the store hides with opacity 0 hidden when dimming", () => {
    filters({ ai: "dim" });
    const slide = host();
    slide.setAttribute("style", "opacity: 0");
    createHostKindsRenderer().render(view(slide, { verdict: disclosedVerdict(), hideable: false }));
    expect(getComputedStyle(slide).opacity).toBe("0");
    expect(getComputedStyle(slide).filter).toBe(DIM);
  });
});
