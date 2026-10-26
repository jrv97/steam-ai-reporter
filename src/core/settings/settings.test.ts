import { describe, expect, it } from "vitest";
import { plainKinds, withChipText, withKind } from "../../../tests/helpers/settings";
import { toHexColor } from "../kinds/color";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { KindSettings } from "../kinds/kind-settings";
import { KINDS, perKind } from "../kinds/registry";
import {
  applyPatch,
  DEFAULT_SETTINGS,
  encodeSettings,
  parseSettings,
  type Settings,
  wholePatch,
} from "./settings";

const PLAIN = { enabled: true, badge: true, banner: true, filter: "off" } as const;

describe("DEFAULT_SETTINGS", () => {
  it("follows the page language, leaves every kind but PvP and IAP on, with a plain list", () => {
    expect(DEFAULT_SETTINGS).toStrictEqual({
      locale: "auto",
      debug: false,
      kinds: plainKinds(PLAIN),
      order: KIND_IDS,
    });
  });

  it("is what a fresh install reads, and what a stored value without the kind reads", () => {
    expect(parseSettings(undefined)).toStrictEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ locale: "es", kinds: { ai: { badge: false } } }).kinds.pvp)
      .toStrictEqual(
        { ...PLAIN, enabled: false },
      );
  });

  it("keeps PvP on once the player turned it on", () => {
    const on = withKind(DEFAULT_SETTINGS, "pvp", { enabled: true });
    expect(parseSettings(encodeSettings(on)).kinds.pvp.enabled).toBe(true);
    expect(parseSettings(encodeSettings(on)).kinds.ai).toStrictEqual(PLAIN);
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
        ...perKind((kind): KindSettings => {
          const off: KindSettings = { enabled: false, badge: false, banner: false, filter: "hide" };
          return kind.facets === undefined
            ? off
            : { ...off, facets: kind.facets.slice(0, 1).map((facet) => facet.id) };
        }),
        kernel: { enabled: true, badge: false, banner: true, filter: "dim" },
      },
      order: KIND_IDS.toReversed(),
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
      ...plainKinds(PLAIN),
      ai: { enabled: true, badge: false, banner: true, filter: "dim" },
    },
    order: KIND_IDS,
  };

  it("stores the global fields and one object per kind", () => {
    expect(encodeSettings(settings)).toStrictEqual({
      locale: "es",
      debug: true,
      kinds: {
        ...plainKinds(PLAIN),
        ai: { enabled: true, badge: false, banner: true, filter: "dim" },
      },
    });
  });

  it("round trips through parseSettings", () => {
    expect(parseSettings(encodeSettings(settings))).toStrictEqual(settings);
    expect(parseSettings(encodeSettings(DEFAULT_SETTINGS))).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe("a tag's color", () => {
  const RED = toHexColor("#f00");

  it("is absent from the defaults, so a fresh install keeps the violet", () => {
    for (const kind of KINDS) {
      expect(DEFAULT_SETTINGS.kinds[kind.id]).not.toHaveProperty("color");
    }
  });

  it("reads old stored settings, which have no color, as before", () => {
    const old = { locale: "es", debug: false, kinds: { ai: { ...PLAIN, filter: "dim" } } };
    expect(parseSettings(old).kinds.ai).toStrictEqual({ ...PLAIN, filter: "dim" });
  });

  it("is kept per kind, stored as text and read back", () => {
    const next = withKind(DEFAULT_SETTINGS, "drm", { color: RED });
    expect(next.kinds.drm.color).toBe("#ff0000");
    expect(next.kinds.ai).not.toHaveProperty("color");
    expect(encodeSettings(next)).toMatchObject({ kinds: { drm: { color: "#ff0000" } } });
    expect(parseSettings(encodeSettings(next))).toStrictEqual(next);
  });

  it("is cleared by a patch of undefined, and left alone by any other patch", () => {
    const tinted = withKind(DEFAULT_SETTINGS, "drm", { color: RED });
    expect(applyPatch(tinted, { kinds: { drm: { badge: false } } }).kinds.drm.color).toBe(RED);
    expect(applyPatch(tinted, { kinds: { drm: { color: undefined } } })).toStrictEqual(
      DEFAULT_SETTINGS,
    );
  });
});

describe("a tag's chip text", () => {
  const NAMED = withChipText(DEFAULT_SETTINGS, {
    deck: { chip: "SD", chipCompact: "S" },
    family: { chip: "Lending" },
  });

  it("is stored only for the fields a person set, and read back", () => {
    const stored = encodeSettings(NAMED);
    expect(stored).toMatchObject({ kinds: { deck: { chip: "SD", chipCompact: "S" } } });
    expect(stored).toMatchObject({ kinds: { family: { chip: "Lending" } } });
    expect(JSON.stringify(encodeSettings(DEFAULT_SETTINGS))).not.toMatch(/"chip/);
    expect(parseSettings(stored)).toStrictEqual(NAMED);
  });

  it.each<[string, unknown]>([
    ["a number", 3],
    ["only spaces", "   "],
    ["a list", ["SD"]],
  ])("drops a stored text that is %s and keeps the kind's other fields", (_case, chip) => {
    const parsed = parseSettings({ kinds: { deck: { chip, chipCompact: "S", filter: "dim" } } });
    expect(parsed.kinds.deck).toStrictEqual({
      ...DEFAULT_SETTINGS.kinds.deck,
      filter: "dim",
      chipCompact: "S",
    });
  });

  it("is cleared by a whole patch of settings without it", () => {
    expect(applyPatch(NAMED, wholePatch(DEFAULT_SETTINGS))).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe("the tag order", () => {
  const MOVED: readonly KindId[] = ["family", ...KIND_IDS.filter((id) => id !== "family")];

  it.each<[string, unknown]>([
    ["is missing", undefined],
    ["is no list", "family"],
    ["is an object", { 0: "family" }],
  ])("reads as the registry order when the stored value %s", (_case, order) => {
    expect(parseSettings({ order }).order).toStrictEqual(KIND_IDS);
  });

  it.each<[readonly KindId[], boolean]>([[KIND_IDS, false], [MOVED, true]])(
    "is stored only when it differs from the registry",
    (order, stored) => {
      const value = encodeSettings({ ...DEFAULT_SETTINGS, order });
      expect(JSON.stringify(value).includes('"order"')).toBe(stored);
      expect(parseSettings(value).order).toStrictEqual(order);
    },
  );

  it("takes a patch's order with the kinds it leaves out last", () => {
    expect(applyPatch(DEFAULT_SETTINGS, { order: ["family"] }).order).toStrictEqual(MOVED);
    expect(applyPatch({ ...DEFAULT_SETTINGS, order: MOVED }, {}).order).toBe(MOVED);
  });

  it("is named by a whole patch", () => {
    const settings = { ...DEFAULT_SETTINGS, order: MOVED };
    expect(applyPatch(DEFAULT_SETTINGS, wholePatch(settings))).toStrictEqual(settings);
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

describe("applyPatch", () => {
  const stored: Settings = {
    locale: "es",
    debug: true,
    kinds: { ...perKind(() => PLAIN), kernel: { ...PLAIN, filter: "dim" } },
    order: KIND_IDS,
  };

  it("replaces the fields it names and keeps every other one", () => {
    const next = applyPatch(stored, { locale: "en", kinds: { drm: { badge: false } } });
    expect(next).toStrictEqual({
      locale: "en",
      debug: true,
      kinds: { ...stored.kinds, drm: { ...PLAIN, badge: false } },
      order: KIND_IDS,
    });
  });

  it("changes nothing for an empty patch, and leaves the settings it was given alone", () => {
    expect(applyPatch(stored, {})).toStrictEqual(stored);
    expect(applyPatch(stored, { kinds: {} })).toStrictEqual(stored);
    applyPatch(stored, { debug: false, kinds: { kernel: { filter: "hide" } } });
    expect(stored.debug).toBe(true);
    expect(stored.kinds.kernel.filter).toBe("dim");
  });

  it("patches several kinds at once", () => {
    const next = applyPatch(stored, { kinds: { ai: { enabled: false }, pvp: { filter: "hide" } } });
    expect(next.kinds.ai.enabled).toBe(false);
    expect(next.kinds.pvp.filter).toBe("hide");
    expect(next.kinds.kernel.filter).toBe("dim");
  });
});
