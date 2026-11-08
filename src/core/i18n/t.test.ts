import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
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

function i18n(locale: string, from: Catalogs = catalogs) {
  return createI18n<MessageParams, PluralParams>(from, locale);
}

const name = make.text.name();
const list = make.text.name();

describe("t", () => {
  it.each([
    ["en", `Hello, ${name}!`],
    ["es", `${INVERTED_EXCLAMATION}Hola, ${name}!`],
    ["xx", `[xx Hello, ${name}! xx]`],
  ])("fills named placeholders in %s", (locale, text) => {
    expect(i18n(locale).t("greeting", { name })).toBe(text);
  });

  it("takes no params for a message without placeholders", () => {
    expect(i18n("es").t("farewell")).toBe(es.farewell.message);
  });

  it.each(["xx", "es"])("falls back to English for a key %s lacks", (locale) => {
    expect(i18n(locale).t("only_english")).toBe(en.only_english.message);
  });

  it("falls back to English for a locale without a catalog", () => {
    const french = i18n("fr");
    expect(french.locale).toBe("en");
    expect(french.t("farewell")).toBe(en.farewell.message);
  });

  it("returns the key when even English lacks it", () => {
    expect(i18n("en", { en: {} }).t("farewell")).toBe("farewell");
  });
});

describe("plural", () => {
  it.each([
    ["en", 1, `1 game in ${list}`],
    ["en", 0, `0 games in ${list}`],
    ["en", 1200, `1,200 games in ${list}`],
    ["es", 1, `1 juego en ${list}`],
    ["es", 3, `3 juegos en ${list}`],
  ])("picks the %s form for %i by the locale's rules and formats the number", (
    locale,
    count,
    text,
  ) => {
    expect(i18n(locale).plural("games", count, { list })).toBe(text);
  });

  it("falls back to the _other form for a category the locale leaves out", () => {
    // Spanish selects "many" for a million; the catalog has only _one and _other.
    expect(new Intl.PluralRules("es").select(1_000_000)).toBe("many");
    expect(i18n("es").plural("games", 1_000_000, { list })).toBe(`1.000.000 juegos en ${list}`);
  });

  it.each([
    [1, `[xx 1 game in ${list} xx]`],
    [2, `[xx 2 games in ${list} xx]`],
  ])("uses English rules for %i in a locale Intl does not know", (count, text) => {
    expect(i18n("xx").plural("games", count, { list })).toBe(text);
  });

  it("falls back to English when the locale lacks the plural", () => {
    const partial: Catalogs = { en, xx: { farewell: { message: "[xx Bye xx]" } } };
    expect(i18n("xx", partial).plural("games", 2, { list })).toBe(`2 games in ${list}`);
  });
});
