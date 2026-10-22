import { describe, expect, it } from "vitest";
import en from "../../locales/en/messages.json";
import es from "../../locales/es/messages.json";
import { type Catalog, DEFAULT_LOCALE } from "./catalog";
import { resolveLocale } from "./locale";
import { SHIPPED_CATALOGS } from "./shipped";
import { createI18n } from "./t";

// Repo text is ASCII (rule 8), so the Spanish characters are spelled out by code point.
const LEFT_GUILLEMET = String.fromCodePoint(0xab);
const RIGHT_GUILLEMET = String.fromCodePoint(0xbb);
const A_ACUTE = String.fromCodePoint(0xe1);
const U_ACUTE = String.fromCodePoint(0xfa);

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

  it("loads the Spanish messages", () => {
    const spanish = createI18n(SHIPPED_CATALOGS, "es");
    expect(spanish.locale).toBe("es");
    expect(spanish.t("banner_ignore")).toBe("Ignorar este juego");
    expect(spanish.t("banner_ignored")).toBe("Juego ignorado");
    expect(spanish.t("options_allow_restore_label", { name: "Fixture Game" })).toBe(
      "Dejar de ignorar Fixture Game",
    );
    expect(spanish.t("options_allow_empty", { action: spanish.t("banner_ignore") })).toBe(
      `Ninguno a${U_ACUTE}n. Usa ${LEFT_GUILLEMET}Ignorar este juego${RIGHT_GUILLEMET} en la `
        + `p${A_ACUTE}gina de un juego.`,
    );
  });

  it("resolves Spanish and Latin American store pages to the Spanish catalog", () => {
    expect(resolveLocale({ setting: "auto", pageLang: "es" }, locales)).toBe("es");
    expect(resolveLocale({ setting: "auto", pageLang: "es-419" }, locales)).toBe("es");
    expect(resolveLocale({ setting: "es", pageLang: "en" }, locales)).toBe("es");
  });

  it("keeps other store languages on English", () => {
    expect(resolveLocale({ setting: "auto", pageLang: "de" }, locales)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ setting: "auto", pageLang: "pt-br" }, locales)).toBe(DEFAULT_LOCALE);
  });

  it("falls back to English for a key the Spanish catalog lacks", () => {
    const partial = { en: shipped("en"), es: { badge_label: shipped("es")["badge_label"] } };
    const spanish = createI18n(partial, "es");
    expect(spanish.t("badge_label")).toBe("Uso de IA declarado");
    expect(spanish.t("banner_ignore")).toBe("Ignore this game");
  });
});
