import { describe, expect, it } from "vitest";
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

describe("adoptStyles", () => {
  it("adopts a stylesheet once per root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    adoptStyles(shadow, BANNER_CSS);
    adoptStyles(shadow, BANNER_CSS);
    expect(shadow.adoptedStyleSheets).toHaveLength(1);
  });
});
