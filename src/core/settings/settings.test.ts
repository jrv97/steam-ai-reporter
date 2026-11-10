import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { KindSettings } from "../kinds/kind-settings";
import { KINDS, perKind } from "../kinds/registry";
import {
  applyPatch,
  DEFAULT_SETTINGS,
  defaultsPatch,
  encodeSettings,
  parseSettings,
  type Settings,
  wholePatch,
} from "./settings";

const PLAIN = { enabled: true, badge: true, banner: true, filter: "off" } as const;
const { one, many } = make.settings.tagged;

describe("DEFAULT_SETTINGS", () => {
  it("follows the page language, leaves every kind but PvP and IAP on, with a plain list", () => {
    expect(DEFAULT_SETTINGS).toStrictEqual({
      locale: "auto",
      debug: false,
      kinds: make.settings.plain(PLAIN),
      order: KIND_IDS,
    });
  });

  it("keeps PvP on once the player turned it on", () => {
    const on = make.settings.kind("pvp", { enabled: true });
    expect(parseSettings(encodeSettings(on))).toStrictEqual(on);
  });

  it("takes each kind's defaults from its definition", () => {
    for (const kind of KINDS) {
      expect(DEFAULT_SETTINGS.kinds[kind.id]).toBe(kind.defaults);
    }
  });
});

describe("parseSettings", () => {
  it.each([undefined, ...make.raw.junk()])("returns the defaults for %j", (stored) => {
    expect(parseSettings(stored)).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("fills the fields a stored object lacks with their defaults", () => {
    expect(parseSettings({})).toStrictEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ debug: true })).toStrictEqual(make.settings({ debug: true }));
    expect(parseSettings({ kinds: {} })).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("gives each kind the stored settings do not mention the defaults of its definition", () => {
    const parsed = parseSettings({
      kinds: { kernel: { badge: false }, drm: make.raw.corruptText() },
    });
    expect(parsed.kinds).toStrictEqual({
      ...perKind((kind) => kind.defaults),
      kernel: { ...DEFAULT_SETTINGS.kinds.kernel, badge: false },
    });
  });

  it("accepts every valid value", () => {
    const stored: Settings = {
      locale: "pt_BR",
      debug: true,
      kinds: {
        ...perKind((kind): KindSettings => {
          const off: KindSettings = { enabled: false, badge: false, banner: false, filter: "hide" };
          const [facet] = kind.facets ?? [];
          const pick = kind.defaults.tagged?.pick;
          return facet === undefined || pick === undefined
            ? off
            : { ...off, tagged: { one: one(facet.id), many: many(facet.id) }[pick] };
        }),
        kernel: { enabled: true, badge: false, banner: true, filter: "dim" },
      },
      order: KIND_IDS.toReversed(),
    };
    expect(parseSettings(encodeSettings(stored))).toStrictEqual(stored);
    expect(parseSettings({ locale: "es" }).locale).toBe("es");
    expect(parseSettings({ locale: "zh-CN" }).locale).toBe("zh-CN");
  });

  it("falls back to the default for each invalid field and keeps the valid ones", () => {
    const text = make.raw.corruptText();
    const number = make.raw.corruptNumber();
    expect(
      parseSettings({
        locale: text,
        debug: number,
        kinds: { ai: { enabled: text, badge: number, banner: false, filter: text } },
      }),
    ).toStrictEqual(make.settings.kind("ai", { banner: false }));
  });

  it.each(make.raw.junk())(
    "falls back to the defaults of a kind whose entry is %j",
    (ai) => {
      expect(parseSettings({ debug: true, kinds: { ai } })).toStrictEqual(
        make.settings({ debug: true }),
      );
    },
  );

  it("falls back to the defaults of every kind when the kinds are not an object", () => {
    expect(parseSettings({ debug: true, kinds: make.raw.corruptText() })).toStrictEqual(
      make.settings({ debug: true }),
    );
  });

  it.each(make.raw.badLocales())("reads the locale %j as auto", (locale) => {
    expect(parseSettings({ locale }).locale).toBe("auto");
  });

  it("drops keys and kinds it does not know", () => {
    const stored = { ...DEFAULT_SETTINGS, theme: make.raw.corruptText(), kinds: { future: PLAIN } };
    expect(parseSettings(stored)).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("does not read the v1 flat fields", () => {
    const v1 = make.raw.v1Settings({ badges: false, banner: false, listFilter: "hide" });
    expect(parseSettings(v1)).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe("encodeSettings", () => {
  const settings = make.settings.kind(
    "ai",
    { badge: false, filter: "dim" },
    make.settings({ locale: "es", debug: true }),
  );

  it("stores the global fields and one object per kind", () => {
    expect(encodeSettings(settings)).toStrictEqual({
      locale: "es",
      debug: true,
      kinds: { ...make.raw.v2Kinds(PLAIN), ai: { ...PLAIN, badge: false, filter: "dim" } },
    });
  });

  it("round trips through parseSettings", () => {
    expect(parseSettings(encodeSettings(settings))).toStrictEqual(settings);
    expect(parseSettings(encodeSettings(DEFAULT_SETTINGS))).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe("a tag's color", () => {
  const color = make.color();

  it("is kept per kind, stored as text and read back", () => {
    const next = make.settings.kind("drm", { color });
    expect(next.kinds.ai).not.toHaveProperty("color");
    expect(encodeSettings(next)).toMatchObject({ kinds: { drm: { color: String(color) } } });
    expect(parseSettings(encodeSettings(next))).toStrictEqual(next);
  });

  it("is cleared by a patch of undefined, and left alone by any other patch", () => {
    const tinted = make.settings.kind("drm", { color });
    expect(applyPatch(tinted, { kinds: { drm: { badge: false } } }).kinds.drm.color).toBe(color);
    expect(applyPatch(tinted, { kinds: { drm: { color: undefined } } })).toStrictEqual(
      DEFAULT_SETTINGS,
    );
  });
});

describe("a tag's chip text", () => {
  const chip = make.chipText();
  const compact = make.chipText();
  const family = make.chipText();
  const NAMED = make.settings.chipText({
    deck: { chip, chipCompact: compact },
    family: { chip: family },
  });

  it("is stored only for the fields a person set, and read back", () => {
    const stored = encodeSettings(NAMED);
    expect(stored).toMatchObject({ kinds: { deck: { chip, chipCompact: compact } } });
    expect(stored).toMatchObject({ kinds: { family: { chip: family } } });
    expect(JSON.stringify(encodeSettings(DEFAULT_SETTINGS))).not.toMatch(/"chip/);
    expect(parseSettings(stored)).toStrictEqual(NAMED);
  });

  it.each(make.raw.badChipTexts())(
    "drops a stored text %j and keeps the kind's other fields",
    (stored) => {
      const parsed = parseSettings({
        kinds: { deck: { chip: stored, chipCompact: compact, filter: "dim" } },
      });
      expect(parsed.kinds.deck).toStrictEqual({
        ...DEFAULT_SETTINGS.kinds.deck,
        filter: "dim",
        chipCompact: compact,
      });
    },
  );

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

describe("defaultsPatch", () => {
  it("puts every tag and the order back to the defaults, and keeps language and debug", () => {
    const own: Settings = {
      ...make.settings.chipText({ ai: { chip: make.chipText() } }),
      locale: "es",
      debug: true,
      order: [...KIND_IDS].reverse(),
    };
    const changed = make.settings.kind("drm", { filter: "hide", color: make.color() }, own);
    expect(applyPatch(changed, defaultsPatch())).toStrictEqual({
      ...DEFAULT_SETTINGS,
      locale: "es",
      debug: true,
    });
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
    expect(next.kinds).toStrictEqual({
      ...stored.kinds,
      ai: { ...PLAIN, enabled: false },
      pvp: { ...PLAIN, filter: "hide" },
    });
  });
});
