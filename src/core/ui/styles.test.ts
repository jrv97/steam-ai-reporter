import { describe, expect, it } from "vitest";
import { KIND_IDS } from "../kinds/id";
import { PLACEMENTS } from "../scan/placements";
import { adoptStyles, BANNER_CSS, DIALOG_CSS, PAGE_CSS, SETTINGS_CSS, TOKENS_CSS } from "./styles";

const RULES = { PAGE_CSS, BANNER_CSS, SETTINGS_CSS, DIALOG_CSS };
const DEFINED = new Set(
  [...TOKENS_CSS.matchAll(/(--sar-[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
);

describe("generated stylesheets", () => {
  it.each(Object.entries(RULES))("%s uses only tokens that tokens.css defines", (_name, css) => {
    const used = [...css.matchAll(/var\((--sar-[a-z0-9-]+)\)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !DEFINED.has(name))).toEqual([]);
  });

  it.each(Object.entries({ TOKENS_CSS, ...RULES }))("%s carries no comments", (_name, css) => {
    expect(css).not.toContain("/*");
  });

  it.each(Object.entries(RULES))("%s carries no copy", (_name, css) => {
    const contents = [...css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)].map((match) => match[1]);
    expect(contents.every((value) => value === '""')).toBe(true);
  });

  it("inlines the shared rules", () => {
    // The dialog sits beside SETTINGS_CSS in its shadow root, which already carries them
    for (const css of [PAGE_CSS, BANNER_CSS, SETTINGS_CSS]) {
      expect(css).toContain(".sar-vh {");
      expect(css).not.toContain("@import");
    }
  });
});

describe("the per-kind page rules", () => {
  // The rules list every kind, because no selector can join an attribute on the root element with
  // one on a host. A kind missing from a list fails here instead of silently never matching.
  it.each(KIND_IDS)("%s has a rule for its filters, its badges and its hosts", (id) => {
    expect(PAGE_CSS).toContain(`[data-sar-filter-${id}="dim"] [data-sar-kinds~="${id}"]`);
    expect(PAGE_CSS).toContain(`[data-sar-filter-${id}="hide"] [data-sar-kinds~="${id}"]`);
    expect(PAGE_CSS).toContain(`[data-sar-badges-${id}="off"] [data-sar-kind="${id}"]`);
  });

  it("matches no global state, filter or badge attribute", () => {
    expect(PAGE_CSS).not.toContain("data-sar-state");
    expect(PAGE_CSS).not.toMatch(/data-sar-(filter|badges)=/);
  });

  it("states each kind once per rule", () => {
    for (const id of KIND_IDS) {
      expect(PAGE_CSS.split(`[data-sar-badges-${id}="off"]`)).toHaveLength(2);
    }
  });
});

describe("the hover card rules", () => {
  const rule = (selector: string) => {
    const start = PAGE_CSS.indexOf(`${selector} {`);
    return PAGE_CSS.slice(start, PAGE_CSS.indexOf("}", start));
  };

  it("keeps the card inside the viewport and scrolls what does not fit", () => {
    expect(rule(".sar-hovercard")).toContain(
      "max-block-size: calc(100vh - 2 * var(--sar-hovercard-offset))",
    );
    expect(rule(".sar-hovercard")).toContain("overflow-y: auto");
    expect(rule(".sar-hovercard")).toContain("inline-size: var(--sar-hovercard-inline-size)");
  });

  it("clamps each detail line, a long DRM text or a EULA name among them", () => {
    expect(rule(".sar-hovercard-detail")).toContain(
      "-webkit-line-clamp: var(--sar-hovercard-detail-lines)",
    );
    expect(rule(".sar-hovercard-detail")).toContain("overflow: hidden");
  });
});

describe("the chips on a narrow row", () => {
  const rule = (selector: string) => {
    const start = PAGE_CSS.indexOf(`${selector} {`);
    return PAGE_CSS.slice(start, PAGE_CSS.indexOf("}", start));
  };

  it("lets a search row wrap and keeps its title a basis of room", () => {
    expect(rule(".search_result_row[data-sar-kinds] .search_name")).toContain("flex-wrap: wrap");
    expect(rule(".search_result_row[data-sar-kinds] .search_name > .title")).toContain(
      "flex: 1 1 var(--sar-row-title-basis)",
    );
  });

  it("lets a DLC row wrap, and the chips wrap inside their own group", () => {
    expect(rule(".game_area_dlc_row[data-sar-kinds] .game_area_dlc_name")).toContain(
      "flex-wrap: wrap",
    );
    expect(rule('.sar-chips[data-sar-chips="full"]')).toContain("flex-wrap: wrap");
    expect(rule('.sar-chips[data-sar-chips="full"]')).toContain("max-inline-size: 100%");
  });

  it("keeps the allowance of chips a constant on each placement", () => {
    expect(PLACEMENTS.every((placement) => Number.isInteger(placement.maxChips))).toBe(true);
    expect(PLACEMENTS.find((placement) => placement.id === "search-row")?.maxChips).toBe(3);
  });
});

describe("adoptStyles", () => {
  it("adopts a stylesheet once per root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    adoptStyles(shadow, BANNER_CSS);
    adoptStyles(shadow, BANNER_CSS);
    expect(shadow.adoptedStyleSheets).toHaveLength(1);
  });
});
