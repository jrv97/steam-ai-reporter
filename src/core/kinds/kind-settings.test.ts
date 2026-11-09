import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { DECK_KIND } from "./deck";
import { FAMILY_KIND } from "./family";
import {
  effectiveSettings,
  encodeKindSettings,
  type KindSettings,
  LIST_FILTERS,
  mergeKindSettings,
  parseKindSettings,
} from "./kind-settings";

const DEFAULTS: KindSettings = { enabled: true, badge: true, banner: true, filter: "off" };
const VIOLET = make.color();
const { one, many } = make.settings.tagged;

describe("LIST_FILTERS", () => {
  it("lists the three filters in the order the settings show them", () => {
    expect(LIST_FILTERS).toStrictEqual(["off", "dim", "hide"]);
  });
});

describe("parseKindSettings", () => {
  it.each<unknown>([undefined, null, 7, "dim", true, [], [{ badge: false }]])(
    "returns the defaults when %j is stored",
    (stored) => {
      expect(parseKindSettings({ defaults: DEFAULTS }, stored)).toStrictEqual(DEFAULTS);
    },
  );

  it("accepts every valid value", () => {
    const stored: KindSettings = { enabled: false, badge: false, banner: false, filter: "hide" };
    expect(parseKindSettings({ defaults: DEFAULTS }, stored)).toStrictEqual(stored);
  });

  it("falls back per field and keeps the valid ones", () => {
    expect(
      parseKindSettings({ defaults: DEFAULTS }, {
        enabled: 0,
        badge: "yes",
        banner: false,
        filter: "blur",
      }),
    ).toStrictEqual({ ...DEFAULTS, banner: false });
  });

  it("falls back to the given defaults, not to fixed ones", () => {
    const other: KindSettings = { enabled: false, badge: false, banner: true, filter: "dim" };
    expect(parseKindSettings({ defaults: other }, {})).toStrictEqual(other);
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no color stored", {}],
    ["an undefined color", { color: undefined }],
  ])("has no color key for %s", (_name, stored) => {
    expect(parseKindSettings({ defaults: DEFAULTS }, stored)).not.toHaveProperty("color");
  });

  const DIGITS = [1, 3, 5].map((index) => VIOLET.charAt(index));

  it.each<readonly [string, string, string]>([
    ["upper case", VIOLET.toUpperCase(), VIOLET],
    ["three digits without the hash", DIGITS.join(""), `#${DIGITS.map((d) => d + d).join("")}`],
  ])("reads a stored color in %s in its normal form", (_name, typed, normal) => {
    expect(parseKindSettings({ defaults: DEFAULTS }, { color: typed }).color).toBe(normal);
  });

  it.each<unknown>(["red", "#12", "#abc; x", 7, null, true, {}, []])(
    "drops the color %j and keeps the other fields",
    (color) => {
      const parsed = parseKindSettings({ defaults: DEFAULTS }, { color, filter: "dim" });
      expect(parsed).toStrictEqual({ ...DEFAULTS, filter: "dim" });
    },
  );

  it("falls back to the color of the given defaults", () => {
    const tinted = mergeKindSettings(DEFAULTS, { color: VIOLET });
    expect(parseKindSettings({ defaults: tinted }, { color: "nope" })).toStrictEqual(tinted);
  });

  it("drops keys it does not know", () => {
    expect(parseKindSettings({ defaults: DEFAULTS }, { ...DEFAULTS, theme: "dark" })).toStrictEqual(
      DEFAULTS,
    );
  });

  it("gives a kind without facets no tagged key, whatever is stored", () => {
    const stored = { facet: "verified", facets: ["verified"] };
    expect(parseKindSettings({ defaults: DEFAULTS }, stored)).toStrictEqual(DEFAULTS);
    expect(encodeKindSettings(DEFAULTS)).not.toHaveProperty("facets");
  });

  it.each([
    ["nothing", DECK_KIND, {}, one("unsupported")],
    ["one value", DECK_KIND, { facet: "playable" }, one("playable")],
    [
      "an unknown value, which takes the default",
      DECK_KIND,
      { facet: "great" },
      one("unsupported"),
    ],
    ["a list, the shape before one value: Steam's order wins", DECK_KIND, {
      facets: ["unsupported", "playable", "verified"],
    }, one("verified")],
    [
      "a list that skips Verified",
      DECK_KIND,
      { facets: ["unsupported", "playable"] },
      one("playable"),
    ],
    ["an empty list, which takes the default", DECK_KIND, { facets: [] }, one("unsupported")],
    ["a list of unknown values", DECK_KIND, { facets: ["great", 3] }, one("unsupported")],
    ["one value beside a list, where the value wins", DECK_KIND, {
      facet: "unsupported",
      facets: ["verified"],
    }, one("unsupported")],
    ["no list, which takes the defaults", FAMILY_KIND, {}, many("unsupported")],
    ["a value that is not a list", FAMILY_KIND, { facets: "supported" }, many("unsupported")],
    [
      "one value, which a kind that tags many ignores",
      FAMILY_KIND,
      { facet: "supported" },
      many(
        "unsupported",
      ),
    ],
    ["unknown values and a device rating, which are dropped", FAMILY_KIND, {
      facets: ["verified", "supported", 3],
    }, many("supported")],
    ["repeated values, kept once in the kind's order", FAMILY_KIND, {
      facets: ["unsupported", "supported", "unsupported"],
    }, many("supported", "unsupported")],
    ["an empty list, kept: the kind tags nothing", FAMILY_KIND, { facets: [] }, many()],
  ])("reads what a kind with facets tags from %s", (_name, kind, stored, tagged) => {
    expect(parseKindSettings(kind, stored).tagged).toStrictEqual(tagged);
  });
});

describe("effectiveSettings", () => {
  it("keeps the color of a disabled kind", () => {
    const tinted = mergeKindSettings({ ...DEFAULTS, enabled: false }, { color: VIOLET });
    expect(effectiveSettings(tinted).color).toBe(VIOLET);
  });

  it("keeps the settings of an enabled kind as they are", () => {
    const settings: KindSettings = { enabled: true, badge: false, banner: true, filter: "dim" };
    expect(effectiveSettings(settings)).toBe(settings);
  });

  it("shows no badge or banner and filters nothing while the kind is disabled", () => {
    expect(
      effectiveSettings({ enabled: false, badge: true, banner: true, filter: "hide" }),
    ).toStrictEqual({ enabled: false, badge: false, banner: false, filter: "off" });
  });
});

describe("mergeKindSettings", () => {
  it("replaces the fields of the patch and keeps the others", () => {
    expect(mergeKindSettings(DEFAULTS, { badge: false })).toStrictEqual({
      ...DEFAULTS,
      badge: false,
    });
  });

  it("keeps every field without a patch", () => {
    expect(mergeKindSettings(DEFAULTS, undefined)).toStrictEqual(DEFAULTS);
  });

  it("sets a color, keeps it through other patches and clears it with undefined", () => {
    const tinted = mergeKindSettings(DEFAULTS, { color: VIOLET });
    expect(tinted.color).toBe(VIOLET);
    expect(mergeKindSettings(tinted, { filter: "dim" }).color).toBe(VIOLET);
    const cleared = mergeKindSettings(tinted, { color: undefined });
    expect(cleared).toStrictEqual(DEFAULTS);
    expect(cleared).not.toHaveProperty("color");
  });
});

describe("encodeKindSettings", () => {
  it("stores every field and reads back through parseKindSettings", () => {
    const settings: KindSettings = { enabled: false, badge: true, banner: false, filter: "hide" };
    expect(encodeKindSettings(settings)).toStrictEqual({
      enabled: false,
      badge: true,
      banner: false,
      filter: "hide",
    });
    expect(parseKindSettings({ defaults: DEFAULTS }, encodeKindSettings(settings))).toStrictEqual(
      settings,
    );
  });

  it.each([
    { kind: DECK_KIND, tagged: one("playable"), stored: { facet: "playable" } },
    {
      kind: FAMILY_KIND,
      tagged: many("supported", "unsupported"),
      stored: { facets: ["supported", "unsupported"] },
    },
  ])("stores what $kind.id tags and reads it back", ({ kind, tagged, stored }) => {
    const settings: KindSettings = { ...kind.defaults, tagged };
    // Both kinds start off, with no banner entry
    expect(encodeKindSettings(settings)).toStrictEqual({
      enabled: false,
      badge: true,
      banner: false,
      filter: "off",
      ...stored,
    });
    expect(parseKindSettings(kind, encodeKindSettings(settings))).toStrictEqual(settings);
  });

  it("stores a color as the text #rrggbb, and no key at all without one", () => {
    expect(encodeKindSettings(DEFAULTS)).not.toHaveProperty("color");
    const tinted = mergeKindSettings(DEFAULTS, { color: VIOLET });
    expect(encodeKindSettings(tinted)).toStrictEqual({ ...DEFAULTS, color: VIOLET });
    expect(parseKindSettings({ defaults: DEFAULTS }, encodeKindSettings(tinted))).toStrictEqual(
      tinted,
    );
  });
});
