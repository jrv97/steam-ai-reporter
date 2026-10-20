import { afterEach, describe, expect, it, vi } from "vitest";
import { disclosedVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { UNKNOWN } from "../types";
import type { HostView } from "./host";
import { applyListFilter, createHostStateRenderer } from "./list-filter";
import { adoptStyles, PAGE_CSS, TOKENS_CSS } from "./styles";

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function view(element: Element, overrides: Partial<HostView> = {}): HostView {
  return {
    host: element,
    verdict: disclosedVerdict(),
    allowed: false,
    slot: undefined,
    hideable: true,
    ...overrides,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-sar-filter");
});

describe("createHostStateRenderer", () => {
  const renderer = createHostStateRenderer();

  it.each(
    [
      ["disclosed", disclosedVerdict(), false],
      ["not-disclosed", NOT_DISCLOSED, false],
      ["unknown", UNKNOWN.gated, false],
      ["allowed", disclosedVerdict(), true],
    ] as const,
  )("marks the host %s", (state, verdict, allowed) => {
    const element = host();
    renderer.render(view(element, { verdict, allowed }));
    expect(element.getAttribute("data-sar-state")).toBe(state);
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

describe("applyListFilter", () => {
  it("toggles one attribute on the root element", () => {
    applyListFilter(document.documentElement, "hide");
    expect(document.documentElement.getAttribute("data-sar-filter")).toBe("hide");
  });

  // happy-dom does not restyle descendants when a root attribute changes, so each mode gets
  // fresh hosts; browsers restyle in one pass.
  function styled(filter: "off" | "dim" | "hide") {
    adoptStyles(document, TOKENS_CSS + PAGE_CSS);
    applyListFilter(document.documentElement, filter);
    const renderer = createHostStateRenderer();
    const [disclosed, fixed, other] = [host(), host(), host()];
    renderer.render(view(disclosed));
    renderer.render(view(fixed, { hideable: false }));
    renderer.render(view(other, { verdict: NOT_DISCLOSED }));
    return {
      disclosed: getComputedStyle(disclosed),
      fixed: getComputedStyle(fixed),
      other: getComputedStyle(other),
    };
  }

  it("dims disclosed hosts through the page CSS alone", () => {
    const { disclosed, fixed, other } = styled("dim");
    expect(disclosed.opacity).toBe("0.4");
    expect(fixed.opacity).toBe("0.4");
    expect(other.opacity).not.toBe("0.4");
  });

  it("hides disclosed hosts, and dims those that must not be hidden", () => {
    const { disclosed, fixed, other } = styled("hide");
    expect(disclosed.display).toBe("none");
    expect(fixed.display).not.toBe("none");
    expect(fixed.opacity).toBe("0.4");
    expect(other.display).not.toBe("none");
  });

  it("leaves hosts alone when the filter is off", () => {
    const { disclosed } = styled("off");
    expect(disclosed.display).not.toBe("none");
    expect(disclosed.opacity).not.toBe("0.4");
  });
});
