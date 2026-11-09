import { describe, expect, it } from "vitest";
import { KIND_IDS } from "../kinds/id";
import { PLACEMENTS } from "../scan/placements";
import { REVEAL_ATTRIBUTE } from "./hidden-notice";
import { colorProperty } from "./kind-attributes";
import { adoptStyles, BANNER_CSS, DIALOG_CSS, PAGE_CSS, SETTINGS_CSS, TOKENS_CSS } from "./styles";

const RULES = { PAGE_CSS, BANNER_CSS, SETTINGS_CSS, DIALOG_CSS };

/** The custom properties a text declares. */
function declared(css: string): ReadonlySet<string | undefined> {
  return new Set([...css.matchAll(/(--tks-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
}

const DEFINED = declared(TOKENS_CSS);
/** What the app writes on the root element, so no stylesheet declares it. */
const WRITTEN = new Set(KIND_IDS.map(colorProperty));

describe("generated stylesheets", () => {
  // A name is defined by tokens.css, by the app (a tag's color) or by the sheet itself (the shades
  // it derives from that color). A fallback counts as a use.
  it.each(Object.entries(RULES))("%s uses only tokens that tokens.css defines", (_name, css) => {
    const own = declared(css);
    const used = [...css.matchAll(/var\((--tks-[a-z0-9-]+)[,)]/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(
      used.filter((name) => !DEFINED.has(name) && !own.has(name) && !WRITTEN.has(name ?? "")),
    ).toEqual([]);
  });

  it.each(Object.entries({ TOKENS_CSS, ...RULES }))("%s carries no comments", (_name, css) => {
    expect(css).not.toContain("/*");
  });

  it.each(Object.entries(RULES))("%s carries no copy", (_name, css) => {
    const contents = [...css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)].map((match) => match[1]);
    expect(contents.every((value) => value === '""')).toBe(true);
  });

  // The dialog sits beside SETTINGS_CSS in its shadow root, which already carries them.
  it.each(Object.entries({ PAGE_CSS, BANNER_CSS, SETTINGS_CSS }))(
    "%s inlines the shared rules",
    (_name, css) => {
      expect(css).toContain(".tks-vh {");
      expect(css).not.toContain("@import");
    },
  );
});

/** One CSS rule: its selectors, whitespace squeezed, and its declarations. */
interface Rule {
  readonly selectors: readonly string[];
  readonly body: string;
}

function rulesOf(css: string): readonly Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, head = "", body = ""]) => ({
    // A comma inside parentheses, as in :is(:hover, :focus-within), does not end a selector.
    selectors: head.split(/,(?![^()]*\))/).map((selector) => selector.trim().replace(/\s+/g, " "))
      .filter((selector) => selector !== ""),
    body,
  }));
}

/** The body of the first PAGE_CSS rule written as `selector {`. */
function pageRule(selector: string): string {
  const start = PAGE_CSS.indexOf(`${selector} {`);
  return PAGE_CSS.slice(start, PAGE_CSS.indexOf("}", start));
}

/** The media condition of the fixed settings frame; smaller windows scroll the whole page. */
const FIXED_FRAME = "(min-width: 800px) and (min-height: 560px)";

/** The rules inside the `@media` block with `condition`; none when the sheet lacks that block. */
function mediaRules(css: string, condition: string): readonly Rule[] {
  const head = css.indexOf(`@media ${condition} {\n`);
  if (head === -1) {
    return [];
  }
  // The block's own closing brace is the first one at the start of a line.
  const start = css.indexOf("{", head) + 1;
  return rulesOf(css.slice(start, css.indexOf("\n}", start)));
}

/** The filter selectors of the rules that declare `declaration`, in the order written. */
function filterSelectors(declaration: string): readonly string[] {
  return rulesOf(PAGE_CSS)
    .filter((rule) => rule.body.includes(declaration))
    .flatMap((rule) => rule.selectors)
    .filter((selector) => selector.startsWith("[data-tks-filter-"));
}

describe("the per-kind page rules", () => {
  // The rules list every kind, because no selector can join an attribute on the root element with
  // one on a host. A kind missing from a group fails here instead of silently never matching.
  const dim = (id: string) => `[data-tks-filter-${id}="dim"] [data-tks-kinds~="${id}"]`;
  // A host dims for a hide where it cannot hide, and while the page shows hidden results.
  const hold = (id: string) =>
    `[data-tks-filter-${id}="hide"] [data-tks-kinds~="${id}"]`
    + `:is([data-tks-hideable="false"], [${REVEAL_ATTRIBUTE}] *)`;
  const hide = (id: string) =>
    `[data-tks-filter-${id}="hide"]:not([${REVEAL_ATTRIBUTE}]) [data-tks-kinds~="${id}"]`
    + `:not([data-tks-hideable="false"])`;
  const HOVER = ":is(:hover, :focus-within)";

  const GROUPS = [
    {
      name: "dims a host",
      declaration: "filter: opacity(var(--tks-dim-opacity)) !important",
      selectors: (id: string) => [dim(id), hold(id)],
    },
    {
      name: "restores a hovered or focused host",
      declaration: "filter: none !important",
      selectors: (id: string) => [`${dim(id)}${HOVER}`, `${hold(id)}${HOVER}`],
    },
    {
      name: "hides a host",
      declaration: "display: none !important",
      selectors: (id: string) => [hide(id)],
    },
  ];

  it.each(KIND_IDS)("%s appears exactly once in each filter rule group", (id) => {
    for (const group of GROUPS) {
      const declared = filterSelectors(group.declaration);
      for (const selector of group.selectors(id)) {
        expect(declared.filter((each) => each === selector), `${group.name}: ${selector}`)
          .toHaveLength(1);
      }
    }
  });

  it("lists no kind twice and no kind outside the registry in a group", () => {
    for (const group of GROUPS) {
      const declared = filterSelectors(group.declaration);
      expect(new Set(declared).size).toBe(declared.length);
      expect(declared, group.name).toHaveLength(KIND_IDS.length * group.selectors("x").length);
    }
  });

  it("matches no global state, filter or badge attribute", () => {
    expect(PAGE_CSS).not.toContain("data-tks-state");
    expect(PAGE_CSS).not.toContain("data-tks-badges");
    expect(PAGE_CSS).not.toMatch(/data-tks-filter=/);
  });
});

describe("the tag color rules", () => {
  const COLORED = { PAGE_CSS, BANNER_CSS, SETTINGS_CSS };
  const rule = (css: string, selector: string) =>
    rulesOf(css).find((each) => each.selectors.includes(selector));
  /** The body of the rule written as `selector {`, not of a list that also names the selector. */
  const block = (css: string, selector: string) => {
    const start = css.indexOf(`\n${selector} {`);
    return css.slice(start, css.indexOf("}", start));
  };

  // A custom property name cannot be built from an attribute, so each kind has its own rule.
  describe.each(Object.entries(COLORED))("%s", (_name, css) => {
    it.each(KIND_IDS)("reads the color of %s from its root property", (id) => {
      const own = rulesOf(css).filter((each) => each.selectors.includes(`[data-tks-kind="${id}"]`));
      expect(own).toHaveLength(1);
      expect(own[0]?.body.trim()).toBe(`--tks-kind-color: var(${colorProperty(id)});`);
    });

    it("derives every shade from that one color", () => {
      const shades = rule(css, "[data-tks-kind]")?.body ?? "";
      for (const shade of ["edge", "tint", "text", "light", "solid", "wash-start", "wash-end"]) {
        const derived = new RegExp(`--tks-tag-${shade}:[^;]*var\\(--tks-kind-color\\)`);
        expect(shades, shade).toMatch(derived);
      }
    });

    it("lists no kind outside the registry", () => {
      const listed = rulesOf(css).flatMap((each) => each.selectors).filter((selector) =>
        selector.startsWith('[data-tks-kind="')
      );
      expect(listed).toHaveLength(KIND_IDS.length);
    });
  });

  it("reads each surface through its shade, falling back to the violet tokens", () => {
    expect(block(PAGE_CSS, ".tks-badge")).toContain(
      "background: var(--tks-tag-tint, var(--tks-badge-bg))",
    );
    expect(block(PAGE_CSS, ".tks-badge")).toContain(
      "color: var(--tks-tag-text, var(--tks-badge-fg))",
    );
    const compact = block(PAGE_CSS, ".tks-compact");
    expect(compact).toContain("background: var(--tks-tag-solid, var(--tks-compact-bg))");
    expect(compact).toContain("color: var(--tks-tag-light, var(--tks-compact-fg))");
    expect(compact).toContain("1px solid var(--tks-tag-edge, var(--tks-compact-border))");
    expect(block(PAGE_CSS, ".tks-hovercard-title")).toContain(
      "color: var(--tks-tag-text, var(--tks-badge-fg))",
    );
    const banner = block(BANNER_CSS, ".tks-banner");
    expect(banner).toContain("var(--tks-tag-wash-start, var(--tks-banner-wash-start))");
    expect(banner).toContain("var(--tks-tag-wash-end, var(--tks-banner-wash-end))");
  });

  it("keeps the wash the shape of the violet wash", () => {
    const token = /--tks-banner-bg:\s*linear-gradient\(\s*(\d+deg),[^%]*?(\d+%),[^%]*?(\d+%)\s*\)/;
    const [, angle, from, to] = token.exec(TOKENS_CSS) ?? [];
    const banner = block(BANNER_CSS, ".tks-banner");
    expect(banner).toContain(`linear-gradient(\n    ${angle},`);
    expect(banner).toContain(`var(--tks-banner-wash-start)) ${from}`);
    expect(banner).toContain(`var(--tks-banner-wash-end)) ${to}`);
  });

  it("leaves forced colors in charge of the badges", () => {
    expect(PAGE_CSS.lastIndexOf("background: Canvas")).toBeGreaterThan(
      PAGE_CSS.indexOf("var(--tks-tag-tint"),
    );
  });
});

describe("the page rule declarations", () => {
  it.each([
    // The hover card stays inside the viewport and scrolls what does not fit.
    [".tks-hovercard", "max-block-size: calc(100vh - 2 * var(--tks-hovercard-offset))"],
    [".tks-hovercard", "overflow-y: auto"],
    [".tks-hovercard", "inline-size: var(--tks-hovercard-inline-size)"],
    // Each detail line clamps, a long DRM text or a EULA name among them.
    [".tks-hovercard-detail", "-webkit-line-clamp: var(--tks-hovercard-detail-lines)"],
    [".tks-hovercard-detail", "overflow: hidden"],
    // A search or DLC row wraps and keeps its title room; the chips wrap inside their group.
    [".search_result_row[data-tks-kinds] .search_name", "flex-wrap: wrap"],
    [
      ".search_result_row[data-tks-kinds] .search_name > .title",
      "flex: 1 1 var(--tks-row-title-basis)",
    ],
    [".game_area_dlc_row[data-tks-kinds] .game_area_dlc_name", "flex-wrap: wrap"],
    ['.tks-chips[data-tks-chips="full"]', "flex-wrap: wrap"],
    ['.tks-chips[data-tks-chips="full"]', "max-inline-size: 100%"],
    // The tag section label is muted and its chips take the store's tag font.
    [".tks-tag-section-label", "color: var(--tks-color-text-muted)"],
    [".tks-tag-section .tks-badge", "font: var(--tks-summary-tag-font)"],
    // The hidden results notice hides when told and takes the store's notice bar look.
    [".tks-list-notice[hidden]", "display: none !important"],
    [".tks-list-notice", "background: var(--tks-store-notice-bg)"],
    [".tks-list-notice", "color: var(--tks-store-notice-fg)"],
    [".tks-list-notice", "padding: var(--tks-store-notice-pad)"],
    [".tks-list-notice", "margin-block-end: var(--tks-store-notice-margin-block-end)"],
    [".tks-list-notice", "font: var(--tks-store-notice-font)"],
    [".tks-list-notice-button", "color: var(--tks-store-notice-fg)"],
    [".tks-list-notice-button", "text-decoration: underline"],
  ])("%s has %s", (selector, declaration) => {
    expect(pageRule(selector)).toContain(declaration);
  });
});

describe("the chips on a narrow row", () => {
  it("keeps the allowance of chips a constant on each placement", () => {
    expect(PLACEMENTS.every((placement) => Number.isInteger(placement.maxChips))).toBe(true);
    expect(PLACEMENTS.find((placement) => placement.id === "search-row")?.maxChips).toBe(3);
  });
});

describe("the compact badge placement", () => {
  const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(TOKENS_CSS)?.[1];
  const group = PAGE_CSS.slice(PAGE_CSS.indexOf('.tks-chips[data-tks-chips="compact"] {'));

  it("sits the same distance from the top and the end edge", () => {
    expect(token("--tks-compact-inset-inline")).toBe(token("--tks-compact-inset-block"));
    expect(group).toContain("inset-block-start: var(--tks-compact-inset-block)");
    expect(group).toContain("inset-inline-end: var(--tks-compact-inset-inline)");
  });

  it("keeps the group inside the image by subtracting the end inset once", () => {
    expect(group).toContain("max-inline-size: calc(100% - var(--tks-compact-inset-inline))");
  });

  // The home carousel stacks its hidden slides over the shown one, with no pointer on them.
  // A chip that took the pointer there would open the card of a game no one can see.
  it("gives a chip no more pointer than its capsule link has", () => {
    const pointers = rulesOf(PAGE_CSS)
      .filter((rule) => rule.selectors.some((selector) => /\.tks-(chips|compact)\b/.test(selector)))
      .flatMap((rule) => [...rule.body.matchAll(/pointer-events:\s*([^;]+);/g)])
      .map((match) => match[1]);
    expect(pointers.length).toBeGreaterThan(0);
    expect(pointers.filter((value) => value !== "none" && value !== "inherit")).toEqual([]);
    const inherits = (selector: string) =>
      rulesOf(PAGE_CSS).some((rule) =>
        rule.selectors.includes(selector) && rule.body.includes("pointer-events: inherit")
      );
    const linked = [
      '.tks-chips[data-tks-chips="compact"][data-tks-in-link="true"]',
      '.tks-chips[data-tks-in-link="true"] > .tks-compact',
    ];
    expect(linked.filter((selector) => !inherits(selector))).toEqual([]);
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

describe("the hidden results notice rules", () => {
  it("resets the notice like the other light-DOM components", () => {
    expect(PAGE_CSS).toMatch(/\.tks-list-notice,\n\.tks-list-notice \*/);
  });

  it("keeps the notice a distinct region in forced colors", () => {
    const forced = PAGE_CSS.slice(PAGE_CSS.lastIndexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.tks-list-notice \{\n\s+border: 1px solid CanvasText/);
  });
});

describe("the settings tab rules", () => {
  const tabRules = rulesOf(SETTINGS_CSS).filter((rule) =>
    rule.selectors.some((selector) => selector.includes(".tks-tab"))
  );

  it("marks the selected tab with strong text, and with system colors when forced", () => {
    const selected = tabRules.filter((rule) =>
      rule.selectors.includes('.tks-tab[aria-selected="true"]')
    );
    expect(selected.map((rule) => rule.body).join("")).toMatch(/font-weight: var\(--tks-weight/);
    const forced = SETTINGS_CSS.slice(SETTINGS_CSS.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.tks-tab\[aria-selected="true"\] \{\n\s+border-color: Highlight;/);
  });

  it("moves nothing: no transition or animation on a tab", () => {
    expect(tabRules.length).toBeGreaterThan(3);
    expect(tabRules.filter((rule) => /transition|animation/.test(rule.body))).toEqual([]);
  });

  it.each(
    [
      ["SETTINGS_CSS", '.tks-options[data-tks-context="page"]', /block-size: 100dvh/],
      ["SETTINGS_CSS", '.tks-options[data-tks-context="page"]', /margin-block: 0/],
      ["SETTINGS_CSS", ".tks-tabpanel", /overflow-y: auto/],
      ["SETTINGS_CSS", ".tks-tabpanel", /position: relative/],
      ["SETTINGS_CSS", ".tks-tabpanel > :last-child", /margin-block-end: 0/],
      ["SETTINGS_CSS", ".tks-tab", /flex: none/],
      ["DIALOG_CSS", "dialog[open]", /block-size: calc\(100vh/],
    ] as const,
  )("fixes the frame only from 800 by 560: %s %s", (sheet, selector, declaration) => {
    const found = mediaRules(RULES[sheet], FIXED_FRAME).find(
      (rule) => rule.selectors.includes(selector) && declaration.test(rule.body),
    );
    expect(found?.selectors).toContain(selector);
  });
});

describe("the tag section rules", () => {
  it("leaves no rule for the summary row it replaced", () => {
    expect(PAGE_CSS).not.toContain("tks-summary-row");
    expect(TOKENS_CSS).not.toContain("--tks-summary-chip-inset-inline");
  });

  it("resets the section and its label like the other light-DOM components", () => {
    expect(PAGE_CSS).toMatch(/\.tks-tag-section,\n\.tks-tag-section \*,/);
  });
});

describe("the focus ring", () => {
  it.each(
    [
      ["SETTINGS_CSS", ".tks-tab:focus-visible"],
      ["PAGE_CSS", ".tks-list-notice-button:focus-visible"],
      ["PAGE_CSS", ".tks-tag-section .tks-badge:focus-visible"],
    ] as const,
  )("%s gives %s the shared ring", (sheet, selector) => {
    const found = rulesOf(RULES[sheet]).find((each) => each.selectors.includes(selector));
    expect(found?.body).toContain("outline: var(--tks-focus-width) solid var(--tks-focus-color)");
  });
});
