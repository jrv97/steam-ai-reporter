import { describe, expect, it } from "vitest";
import en from "../../../tests/locales/en/messages.json";
import es from "../../../tests/locales/es/messages.json";
import type { MessageParams, PluralParams } from "../../../tests/locales/keys.gen";
import xx from "../../../tests/locales/xx/messages.json";
import type { Catalogs } from "./catalog";
import { createI18n } from "./t";

// Test-only catalogs: `xx` is a pseudo-locale for fallback, plurals and placeholders, `es` a
// realistic translation. All three are test-only; src/locales holds the shipped catalogs.
const catalogs: Catalogs = { en, es, xx };

// Repo text is ASCII (rule 8), so the Spanish characters are spelled out by code point.
const INVERTED_EXCLAMATION = String.fromCodePoint(0xa1);
const O_ACUTE = String.fromCodePoint(0xf3);

function i18n(locale: string, from: Catalogs = catalogs) {
  return createI18n<MessageParams, PluralParams>(from, locale);
}

describe("t", () => {
  it("fills named placeholders", () => {
    expect(i18n("en").t("greeting", { name: "Ana" })).toBe("Hello, Ana!");
    expect(i18n("es").t("greeting", { name: "Ana" })).toBe(`${INVERTED_EXCLAMATION}Hola, Ana!`);
    expect(i18n("xx").t("greeting", { name: "Ana" })).toBe("[xx Hello, Ana! xx]");
  });

  it("takes no params for a message without placeholders", () => {
    expect(i18n("es").t("farewell")).toBe(`Adi${O_ACUTE}s.`);
  });

  it("falls back to English for a key the locale lacks", () => {
    expect(i18n("xx").t("only_english")).toBe("Only in English.");
    expect(i18n("es").t("only_english")).toBe("Only in English.");
  });

  it("falls back to English for a locale without a catalog", () => {
    const french = i18n("fr");
    expect(french.locale).toBe("en");
    expect(french.t("farewell")).toBe("Goodbye.");
  });

  it("returns the key when even English lacks it", () => {
    expect(i18n("en", { en: {} }).t("farewell")).toBe("farewell");
  });
});

describe("plural", () => {
  it("picks the English form by count and formats the number", () => {
    const english = i18n("en");
    expect(english.plural("games", 1, { list: "Wishlist" })).toBe("1 game in Wishlist");
    expect(english.plural("games", 0, { list: "Wishlist" })).toBe("0 games in Wishlist");
    expect(english.plural("games", 1200, { list: "Wishlist" })).toBe("1,200 games in Wishlist");
  });

  it("uses the locale's plural rules and number format", () => {
    const spanish = i18n("es");
    expect(spanish.plural("games", 1, { list: "Deseados" })).toBe("1 juego en Deseados");
    expect(spanish.plural("games", 3, { list: "Deseados" })).toBe("3 juegos en Deseados");
  });

  it("falls back to the _other form for a category the locale leaves out", () => {
    // Spanish selects "many" for a million; the catalog has only _one and _other.
    expect(new Intl.PluralRules("es").select(1_000_000)).toBe("many");
    expect(i18n("es").plural("games", 1_000_000, { list: "Deseados" })).toBe(
      "1.000.000 juegos en Deseados",
    );
  });

  it("uses English rules for a locale Intl does not know", () => {
    expect(i18n("xx").plural("games", 1, { list: "W" })).toBe("[xx 1 game in W xx]");
    expect(i18n("xx").plural("games", 2, { list: "W" })).toBe("[xx 2 games in W xx]");
  });

  it("falls back to English when the locale lacks the plural", () => {
    const partial: Catalogs = { en, xx: { farewell: { message: "[xx Bye xx]" } } };
    expect(i18n("xx", partial).plural("games", 2, { list: "W" })).toBe("2 games in W");
  });
});
