import { describe, expect, it } from "vitest";
import type { Catalogs } from "../src/core/i18n/catalog";
import { SHIPPED_CATALOGS } from "../src/core/i18n/shipped";
import { CATALOGS as CONTENT } from "../src/platform/extension/content.catalogs.gen";
import { CATALOGS as OPTIONS } from "../src/platform/extension/options.catalogs.gen";
import { CATALOGS as USERSCRIPT } from "../src/platform/userscript/main.catalogs.gen";

// Each shipped bundle carries only the messages its code reads (scripts/gen_catalogs.py), and
// scripts/check_bundle.py checks the built bundles. These tests pin the projection from the
// source catalogs: same locales, same messages, each key only on the surfaces that show it.
const SURFACES: Readonly<Record<string, Catalogs>> = {
  content: CONTENT,
  options: OPTIONS,
  userscript: USERSCRIPT,
};

const LOCALES = Object.keys(SHIPPED_CATALOGS);

/** The surfaces whose English catalog carries `key`. */
function surfacesWith(key: string): readonly string[] {
  return Object.entries(SURFACES)
    .filter(([, catalogs]) => catalogs["en"]?.[key] !== undefined)
    .map(([surface]) => surface);
}

/** A locale's catalog as key and message pairs, sorted by key. */
function messages(catalogs: Catalogs, locale: string): readonly (readonly [string, string])[] {
  return Object.entries(catalogs[locale] ?? {})
    .map(([key, entry]) => [key, entry?.message ?? ""] as const)
    .sort(([a], [b]) => a.localeCompare(b));
}

describe("surface catalogs", () => {
  it.each(Object.keys(SURFACES))("%s ships every locale with the same keys", (surface) => {
    const catalogs = SURFACES[surface] ?? {};
    const english = messages(catalogs, "en").map(([key]) => key);
    expect(english.length).toBeGreaterThan(0);
    expect(Object.keys(catalogs)).toEqual(LOCALES);
    for (const locale of LOCALES) {
      expect(messages(catalogs, locale).map(([key]) => key), locale).toEqual(english);
    }
  });

  it.each(Object.keys(SURFACES))("%s copies each message from the source catalog", (surface) => {
    const catalogs = SURFACES[surface] ?? {};
    for (const locale of LOCALES) {
      const source = new Map(messages(SHIPPED_CATALOGS, locale));
      const projected = messages(catalogs, locale);
      expect(projected, locale).toEqual(projected.map(([key]) => [key, source.get(key)]));
    }
  });

  it.each([
    ["badge_tags_title", ["content", "userscript"]],
    ["kind_ai_heading", ["content", "options", "userscript"]],
    ["options_color_label", ["options", "userscript"]],
    ["options_chip_label", ["options", "userscript"]],
    ["notice_settings_saved", ["options", "userscript"]],
    ["userscript_menu_settings", ["userscript"]],
    ["ext_description", []],
  ])("ships %s only on the surfaces that show it", (key, expected) => {
    expect(SHIPPED_CATALOGS["en"]?.[key]).toBeDefined();
    expect(surfacesWith(key)).toEqual(expected);
  });
});
