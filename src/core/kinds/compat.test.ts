import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { DECK_KIND } from "./deck";
import { MACHINE_KIND } from "./machine";

const KINDS = [
  ["deck", DECK_KIND, "steam_deck_compat_category"],
  ["machine", MACHINE_KIND, "steam_machine_compat_category"],
] as const;

describe.each(KINDS)("the %s kind's fromGetItems", (id, kind, field) => {
  const fromPlatforms = (platforms: unknown) => {
    const { item, details } = make.item.parsed({}, { platforms });
    return kind.fromGetItems(item, details, "english");
  };

  it.each(
    [
      [1, "unsupported"],
      [2, "playable"],
      [3, "verified"],
    ] as const,
  )("reads Valve's rating %s as the facet %s", (value, facet) => {
    expect(fromPlatforms({ [field]: value })).toStrictEqual(make.verdict.disclosed(id, { facet }));
  });

  it("is stated by Valve, reads the platforms section and offers Steam's three ratings", () => {
    expect(kind.source).toBe("valve");
    expect(kind.sections).toStrictEqual(["platforms"]);
    expect(kind.facets?.map((facet) => facet.id)).toStrictEqual([
      "verified",
      "playable",
      "unsupported",
    ]);
  });

  it("reads Valve's Unknown (0) as not disclosed, never as Unsupported", () => {
    expect(fromPlatforms({ [field]: 0 })).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each([
    ["no platforms section", undefined],
    ["a section without the field", { windows: true }],
  ])("is unknown missing for %s", (_name, platforms) => {
    expect(fromPlatforms(platforms)).toBe(make.verdict.unknown("missing"));
  });

  it.each([
    ["a value past 3", { [field]: 4 }],
    ["a value that is not an integer", { [field]: 1.5 }],
    ["a value as text", { [field]: "3" }],
    ["a negative value", { [field]: -1 }],
    ["a section that is not an object", "rated"],
  ])("is unknown malformed for %s", (_name, platforms) => {
    expect(fromPlatforms(platforms)).toBe(make.verdict.unknown("malformed"));
  });
});

describe("the device kinds", () => {
  it("read their own field, so one device's rating is not the other's", () => {
    const platforms = { steam_deck_compat_category: 2, steam_machine_compat_category: 0 };
    expect(verdictOf(DECK_KIND, {}, { platforms })).toStrictEqual(
      make.verdict.disclosed("deck", { facet: "playable" }),
    );
    expect(verdictOf(MACHINE_KIND, {}, { platforms })).toStrictEqual(make.verdict.notDisclosed());
  });
});
