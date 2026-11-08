import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { PVP_CATEGORY_IDS, PVP_KIND, pvpCategoryMessage } from "./pvp";

function fromCategories(categories: unknown) {
  return verdictOf(PVP_KIND, {}, { categories });
}

function fromIds(ids: readonly unknown[]) {
  return fromCategories({ supported_player_categoryids: ids });
}

describe("pvpCategoryMessage", () => {
  it("names each PvP category with its own catalog key", () => {
    const keys = PVP_CATEGORY_IDS.map((id) => pvpCategoryMessage(id));
    expect(keys).toStrictEqual([
      "kind_pvp_category_pvp",
      "kind_pvp_category_online",
      "kind_pvp_category_lan",
      "kind_pvp_category_split",
    ]);
  });

  it.each([1, 0])("names no other category, such as %i", (id) => {
    expect(pvpCategoryMessage(id)).toBeUndefined();
  });
});

describe("PVP_KIND.fromGetItems", () => {
  it("knows Steam's four PvP categories", () => {
    expect(PVP_CATEGORY_IDS).toStrictEqual([49, 36, 47, 37]);
  });

  it.each(PVP_CATEGORY_IDS)("is disclosed by the PvP category %i on its own", (id) => {
    expect(fromIds([2, id, 9])).toStrictEqual(make.verdict.disclosed("pvp", { categoryIds: [id] }));
  });

  it("lists the matching categories in the order Steam sent them", () => {
    expect(fromIds([2, 1, 37, 49, 36, 9, 47])).toMatchObject({ categoryIds: [37, 49, 36, 47] });
  });

  it.each<readonly [string, readonly number[]]>([
    ["other categories", [2, 1, 9, 38, 27]],
    ["no categories", []],
    ["the categories of Counter-Strike 2 and Dota 2", [1, 27]],
  ])("is not disclosed for %s", (_name, ids) => {
    expect(fromIds(ids)).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each<readonly [string, unknown]>([
    ["no categories", undefined],
    ["categories without a player list", {}],
    ["a feature list alone", { feature_categoryids: [49] }],
  ])("is unknown missing for %s", (_name, categories) => {
    expect(fromCategories(categories)).toBe(make.verdict.unknown("missing"));
  });

  it.each<readonly [string, unknown]>([
    ["categories as text", "pvp"],
    ["categories as a list", [49]],
    ["a player list as text", { supported_player_categoryids: "49" }],
    ["a player list with text in it", { supported_player_categoryids: [49, "36"] }],
    ["a player list with null in it", { supported_player_categoryids: [49, null] }],
  ])("is unknown malformed for %s", (_name, categories) => {
    expect(fromCategories(categories)).toBe(make.verdict.unknown("malformed"));
  });

  it("allows 50 category IDs and is unknown malformed at 51", () => {
    const ids = (count: number) => Array.from({ length: count }, (_, i) => 1000 + i);
    expect(fromIds([...ids(49), 49]).state).toBe("disclosed");
    expect(fromIds(ids(51))).toBe(make.verdict.unknown("malformed"));
  });

  it("is not moved by a malformed field of another kind", () => {
    const verdict = verdictOf(PVP_KIND, { anticheat: 4, eula: "x" }, {
      categories: { supported_player_categoryids: [49] },
    });
    expect(verdict.state).toBe("disclosed");
  });
});
