import { describe, expect, it } from "vitest";
import { verdictOf } from "../../../tests/helpers/getitems";
import { UNKNOWN } from "../types";
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

  it("names no other category", () => {
    expect(pvpCategoryMessage(1)).toBeUndefined();
    expect(pvpCategoryMessage(0)).toBeUndefined();
  });
});

describe("PVP_KIND.fromGetItems", () => {
  it("knows Steam's four PvP categories", () => {
    expect(PVP_CATEGORY_IDS).toStrictEqual([49, 36, 47, 37]);
  });

  it("is disclosed by each PvP category on its own", () => {
    for (const id of PVP_CATEGORY_IDS) {
      expect(fromIds([2, id, 9])).toStrictEqual({
        state: "disclosed",
        kind: "pvp",
        source: "api",
        categoryIds: [id],
      });
    }
  });

  it("lists the matching categories in the order Steam sent them", () => {
    expect(fromIds([2, 1, 37, 49, 36, 9, 47])).toMatchObject({ categoryIds: [37, 49, 36, 47] });
  });

  it("is not disclosed when no category is a PvP one", () => {
    const none = { state: "not-disclosed", source: "api" };
    expect(fromIds([2, 1, 9, 38, 27])).toStrictEqual(none);
    expect(fromIds([])).toStrictEqual(none);
    // Counter-Strike 2 and Dota 2 carry no PvP category.
    expect(fromIds([1, 27])).toStrictEqual(none);
  });

  it("is unknown missing when the item has no player categories", () => {
    expect(verdictOf(PVP_KIND)).toBe(UNKNOWN.missing);
    expect(fromCategories({})).toBe(UNKNOWN.missing);
    expect(fromCategories({ feature_categoryids: [49] })).toBe(UNKNOWN.missing);
  });

  it("is unknown malformed when the categories are malformed", () => {
    for (const categories of ["pvp", [49], { supported_player_categoryids: "49" }]) {
      expect(fromCategories(categories)).toBe(UNKNOWN.malformed);
    }
    expect(fromIds([49, "36"])).toBe(UNKNOWN.malformed);
    expect(fromIds([49, null])).toBe(UNKNOWN.malformed);
  });

  it("allows 50 category IDs and is unknown malformed at 51", () => {
    const ids = (count: number) => Array.from({ length: count }, (_, i) => 1000 + i);
    expect(fromIds([...ids(49), 49]).state).toBe("disclosed");
    expect(fromIds(ids(51))).toBe(UNKNOWN.malformed);
  });

  it("is not moved by a malformed field of another kind", () => {
    const verdict = verdictOf(PVP_KIND, { anticheat: 4, eula: "x" }, {
      categories: { supported_player_categoryids: [49] },
    });
    expect(verdict.state).toBe("disclosed");
  });
});
