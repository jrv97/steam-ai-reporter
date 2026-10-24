import { describe, expect, it } from "vitest";
import { KINDS, perKind } from "../kinds/registry";
import {
  DEFAULT_SETTINGS,
  encodeSettings,
  parseSettings,
  type Settings,
  withKind,
} from "./settings";

const PLAIN = { enabled: true, badge: true, banner: true, filter: "off" } as const;

describe("DEFAULT_SETTINGS", () => {
  it("follows the page language and leaves every kind on, with a plain list", () => {
    expect(DEFAULT_SETTINGS).toStrictEqual({
      locale: "auto",
      debug: false,
      kinds: perKind(() => PLAIN),
    });
  });

  it("takes each kind's defaults from its definition", () => {
    for (const kind of KINDS) {
      expect(DEFAULT_SETTINGS.kinds[kind.id]).toBe(kind.defaults);
    }
  });
});

describe("parseSettings", () => {
  it("returns the defaults when nothing valid is stored", () => {
    for (const stored of [undefined, null, 7, "dim", true, [], [{ locale: "es" }]]) {
      expect(parseSettings(stored)).toStrictEqual(DEFAULT_SETTINGS);
    }
  });

  it("fills the fields a stored object lacks with their defaults", () => {
    expect(parseSettings({})).toStrictEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ debug: true })).toStrictEqual({ ...DEFAULT_SETTINGS, debug: true });
    expect(parseSettings({ kinds: {} })).toStrictEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ kinds: { ai: { badge: false } } })).toStrictEqual(
      withKind(DEFAULT_SETTINGS, "ai", { badge: false }),
    );
  });

  it("gives each kind the stored settings do not mention the defaults of its definition", () => {
    const parsed = parseSettings({ kinds: { kernel: { badge: false }, drm: "junk" } });
    for (const kind of KINDS) {
      const expected = kind.id === "kernel" ? { ...kind.defaults, badge: false } : kind.defaults;
      expect(parsed.kinds[kind.id]).toStrictEqual(expected);
    }
  });

  it("accepts every valid value", () => {
    const stored: Settings = {
      locale: "pt_BR",
      debug: true,
      kinds: {
        ...perKind(() => ({ enabled: false, badge: false, banner: false, filter: "hide" })),
        kernel: { enabled: true, badge: false, banner: true, filter: "dim" },
      },
    };
    expect(parseSettings(stored)).toStrictEqual(stored);
    expect(parseSettings({ locale: "es" }).locale).toBe("es");
    expect(parseSettings({ locale: "zh-CN" }).locale).toBe("zh-CN");
    expect(parseSettings({ kinds: { ai: { filter: "dim" } } }).kinds.ai.filter).toBe("dim");
  });

  it("falls back to the default for each invalid field and keeps the valid ones", () => {
    expect(
      parseSettings({
        locale: "x y",
        debug: 1,
        kinds: { ai: { enabled: "yes", badge: 0, banner: false, filter: "blur" } },
      }),
    ).toStrictEqual(withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
  });

  it("falls back to the defaults of a kind whose entry is not an object", () => {
    for (const ai of [null, 7, "dim", [], true]) {
      expect(parseSettings({ locale: "es", kinds: { ai } })).toStrictEqual({
        ...DEFAULT_SETTINGS,
        locale: "es",
      });
    }
    expect(parseSettings({ locale: "es", kinds: "dim" })).toStrictEqual({
      ...DEFAULT_SETTINGS,
      locale: "es",
    });
  });

  it("rejects locales that are not codes", () => {
    for (const locale of ["", " ", "english", "e", "en US", "../en", 5, null]) {
      expect(parseSettings({ locale }).locale).toBe("auto");
    }
  });

  it("drops keys and kinds it does not know", () => {
    const stored = { ...DEFAULT_SETTINGS, theme: "dark", kinds: { future: PLAIN } };
    expect(parseSettings(stored)).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("does not read the v1 flat fields", () => {
    expect(parseSettings({ badges: false, banner: false, listFilter: "hide" })).toStrictEqual(
      DEFAULT_SETTINGS,
    );
  });
});

describe("encodeSettings", () => {
  const settings: Settings = {
    locale: "es",
    debug: true,
    kinds: {
      ...perKind(() => PLAIN),
      ai: { enabled: true, badge: false, banner: true, filter: "dim" },
    },
  };

  it("stores the global fields and one object per kind", () => {
    expect(encodeSettings(settings)).toStrictEqual({
      locale: "es",
      debug: true,
      kinds: {
        ...perKind(() => PLAIN),
        ai: { enabled: true, badge: false, banner: true, filter: "dim" },
      },
    });
  });

  it("round trips through parseSettings", () => {
    expect(parseSettings(encodeSettings(settings))).toStrictEqual(settings);
    expect(parseSettings(encodeSettings(DEFAULT_SETTINGS))).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe("withKind", () => {
  it("changes the given fields of one kind and nothing else", () => {
    const next = withKind(DEFAULT_SETTINGS, "ai", { filter: "hide", enabled: false });
    expect(next).toStrictEqual({
      ...DEFAULT_SETTINGS,
      kinds: { ...DEFAULT_SETTINGS.kinds, ai: { ...PLAIN, filter: "hide", enabled: false } },
    });
    expect(DEFAULT_SETTINGS.kinds.ai).toStrictEqual(PLAIN);
    expect(next.kinds.kernel).toStrictEqual(PLAIN);
  });
});
