import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import en from "../../locales/en/messages.json";
import es from "../../locales/es/messages.json";
import { type Catalog, DEFAULT_LOCALE, type Params, substitute } from "./catalog";
import { type LocaleContext, resolveLocale } from "./locale";
import { SHIPPED_CATALOGS } from "./shipped";
import { createI18n } from "./t";

const PLACEHOLDER = /\$[A-Za-z0-9_@]+\$/;

const locales = new Set(Object.keys(SHIPPED_CATALOGS));

// A locale without a catalog reads as empty; the first test fails on it.
function shipped(locale: string): Catalog {
  return SHIPPED_CATALOGS[locale] ?? {};
}

describe("shipped catalogs", () => {
  it("ships English and Spanish", () => {
    expect([...locales].sort()).toEqual(["en", "es"]);
  });

  it("gives Spanish the same keys as English", () => {
    expect(Object.keys(shipped("es")).sort()).toEqual(Object.keys(shipped("en")).sort());
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("gives Spanish the same placeholders as English for every message", () => {
    const names = (entry: { readonly message: string; }) =>
      [...entry.message.matchAll(new RegExp(PLACEHOLDER, "g"))].map(([name]) => name.toLowerCase())
        .sort();
    for (const [key, entry] of Object.entries(en)) {
      expect(names(shipped("es")[key] ?? { message: "" }), key).toEqual(names(entry));
    }
  });

  it("loads the Spanish messages", () => {
    const spanish = createI18n(SHIPPED_CATALOGS, "es");
    expect(spanish.locale).toBe("es");
    expect(spanish.t("banner_ignore")).toBe(es.banner_ignore.message);
    const restore = { name: make.text.name(), scope: spanish.t("options_allow_scope_all") };
    expect(spanish.t("options_allow_restore_label", restore)).toBe(
      substitute(es.options_allow_restore_label.message, restore),
    );
  });

  it("serves every Spanish message without placeholders as the catalog writes it", () => {
    const spanish = createI18n<Record<string, Params>>(SHIPPED_CATALOGS, "es");
    const bare = Object.entries(es).filter(([, entry]) => !PLACEHOLDER.test(entry.message));
    expect(bare.length).toBeGreaterThan(0);
    expect(bare.map(([key]) => [key, spanish.t(key)])).toStrictEqual(
      bare.map(([key, entry]) => [key, entry.message]),
    );
  });

  it.each<readonly [string, LocaleContext, string]>([
    ["a Spanish store page to Spanish", { setting: "auto", pageLang: "es" }, "es"],
    ["a Latin American store page to Spanish", { setting: "auto", pageLang: "es-419" }, "es"],
    ["Spanish chosen on an English page to Spanish", { setting: "es", pageLang: "en" }, "es"],
    ["a German store page to English", { setting: "auto", pageLang: "de" }, DEFAULT_LOCALE],
    ["a Brazilian store page to English", { setting: "auto", pageLang: "pt-br" }, DEFAULT_LOCALE],
  ])("resolves %s", (_name, context, locale) => {
    expect(resolveLocale(context, locales)).toBe(locale);
  });

  it("falls back to English for a key the Spanish catalog lacks", () => {
    const partial = { en: shipped("en"), es: { kind_ai_chip: shipped("es")["kind_ai_chip"] } };
    const spanish = createI18n(partial, "es");
    expect(spanish.t("kind_ai_chip")).toBe(es.kind_ai_chip.message);
    expect(spanish.t("banner_ignore")).toBe(en.banner_ignore.message);
  });
});
