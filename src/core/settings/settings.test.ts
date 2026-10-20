import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, encodeSettings, parseSettings, type Settings } from "./settings";

describe("DEFAULT_SETTINGS", () => {
  it("shows badges and the banner, leaves the list alone, follows the page language", () => {
    expect(DEFAULT_SETTINGS).toStrictEqual({
      badges: true,
      banner: true,
      listFilter: "off",
      locale: "auto",
      debug: false,
    });
  });
});

describe("parseSettings", () => {
  it("returns the defaults when nothing valid is stored", () => {
    for (const stored of [undefined, null, 7, "dim", true, [], [{ badges: false }]]) {
      expect(parseSettings(stored)).toStrictEqual(DEFAULT_SETTINGS);
    }
  });

  it("fills the fields a stored object lacks with their defaults", () => {
    expect(parseSettings({})).toStrictEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ badges: false })).toStrictEqual({ ...DEFAULT_SETTINGS, badges: false });
  });

  it("accepts every valid value", () => {
    const stored: Settings = {
      badges: false,
      banner: false,
      listFilter: "hide",
      locale: "pt_BR",
      debug: true,
    };
    expect(parseSettings(stored)).toStrictEqual(stored);
    expect(parseSettings({ listFilter: "dim" }).listFilter).toBe("dim");
    expect(parseSettings({ locale: "es" }).locale).toBe("es");
    expect(parseSettings({ locale: "zh-CN" }).locale).toBe("zh-CN");
  });

  it("falls back to the default for each invalid field and keeps the valid ones", () => {
    expect(
      parseSettings({
        badges: "yes",
        banner: false,
        listFilter: "blur",
        locale: "x y",
        debug: 1,
      }),
    ).toStrictEqual({ ...DEFAULT_SETTINGS, banner: false });
  });

  it("rejects locales that are not codes", () => {
    for (const locale of ["", " ", "english", "e", "en US", "../en", 5, null]) {
      expect(parseSettings({ locale }).locale).toBe("auto");
    }
  });

  it("drops keys it does not know", () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, theme: "dark" })).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe("encodeSettings", () => {
  it("round trips through parseSettings", () => {
    const settings: Settings = {
      badges: false,
      banner: true,
      listFilter: "dim",
      locale: "es",
      debug: true,
    };
    expect(parseSettings(encodeSettings(settings))).toStrictEqual(settings);
  });
});
