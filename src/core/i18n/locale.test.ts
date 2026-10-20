import { describe, expect, it } from "vitest";
import { resolveLocale, steamLanguage } from "./locale";

describe("steamLanguage", () => {
  it("maps Steam's <html lang> values to Steam language names", () => {
    expect(steamLanguage("en")).toBe("english");
    expect(steamLanguage("es-419")).toBe("latam");
    expect(steamLanguage("pt-BR")).toBe("brazilian");
    expect(steamLanguage("zh-cn")).toBe("schinese");
    expect(steamLanguage("ko")).toBe("koreana");
  });

  it("returns undefined for a language Steam does not use", () => {
    expect(steamLanguage("xx")).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  const shipped = new Set(["en", "es", "es_419", "pt_BR", "pt_PT"]);

  it("follows the store page language for auto", () => {
    expect(resolveLocale({ setting: "auto", pageLang: "es-419" }, shipped)).toBe("es_419");
    expect(resolveLocale({ setting: "auto", pageLang: "pt-br" }, shipped)).toBe("pt_BR");
    expect(resolveLocale({ setting: "auto", pageLang: "pt" }, shipped)).toBe("pt_PT");
  });

  it("prefers the page language over the browser language on store pages", () => {
    const context = { setting: "auto", pageLang: "es", browserLang: "pt-BR" };
    expect(resolveLocale(context, shipped)).toBe("es");
  });

  it("follows the browser language off store pages", () => {
    expect(resolveLocale({ setting: "auto", browserLang: "es-MX" }, shipped)).toBe("es");
  });

  it("falls back from region to language, then to English", () => {
    expect(resolveLocale({ setting: "auto", pageLang: "es-419" }, new Set(["en", "es"]))).toBe(
      "es",
    );
    expect(resolveLocale({ setting: "auto", pageLang: "de" }, shipped)).toBe("en");
    expect(resolveLocale({ setting: "auto" }, shipped)).toBe("en");
  });

  it("uses a chosen locale when it has a catalog", () => {
    expect(resolveLocale({ setting: "es", pageLang: "de" }, shipped)).toBe("es");
    expect(resolveLocale({ setting: "fr", pageLang: "es" }, shipped)).toBe("en");
  });
});
