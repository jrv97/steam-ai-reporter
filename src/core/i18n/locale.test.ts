import { describe, expect, it } from "vitest";
import { type LocaleContext, resolveLocale, steamLanguage } from "./locale";

describe("steamLanguage", () => {
  it.each([
    ["en", "english"],
    ["es-419", "latam"],
    ["pt-BR", "brazilian"],
    ["zh-cn", "schinese"],
    ["ko", "koreana"],
  ])("maps Steam's <html lang> %s to the Steam language %s", (lang, language) => {
    expect(steamLanguage(lang)).toBe(language);
  });

  it("returns undefined for a language Steam does not use", () => {
    expect(steamLanguage("xx")).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  const shipped = new Set(["en", "es", "es_419", "pt_BR", "pt_PT"]);

  it.each<readonly [string, LocaleContext, ReadonlySet<string>, string]>([
    [
      "follows a regional store page for auto",
      { setting: "auto", pageLang: "es-419" },
      shipped,
      "es_419",
    ],
    [
      "follows a store page in lower case",
      { setting: "auto", pageLang: "pt-br" },
      shipped,
      "pt_BR",
    ],
    [
      "follows a store page language to its region",
      { setting: "auto", pageLang: "pt" },
      shipped,
      "pt_PT",
    ],
    [
      "prefers the page language over the browser language on store pages",
      { setting: "auto", pageLang: "es", browserLang: "pt-BR" },
      shipped,
      "es",
    ],
    [
      "follows the browser language off store pages",
      { setting: "auto", browserLang: "es-MX" },
      shipped,
      "es",
    ],
    [
      "falls back from region to language",
      { setting: "auto", pageLang: "es-419" },
      new Set(["en", "es"]),
      "es",
    ],
    [
      "falls back to English for a language without a catalog",
      { setting: "auto", pageLang: "de" },
      shipped,
      "en",
    ],
    ["falls back to English without any language", { setting: "auto" }, shipped, "en"],
    ["uses a chosen locale that has a catalog", { setting: "es", pageLang: "de" }, shipped, "es"],
    [
      "falls back to English for a chosen locale without one",
      { setting: "fr", pageLang: "es" },
      shipped,
      "en",
    ],
  ])("%s", (_name, context, catalogs, locale) => {
    expect(resolveLocale(context, catalogs)).toBe(locale);
  });
});
