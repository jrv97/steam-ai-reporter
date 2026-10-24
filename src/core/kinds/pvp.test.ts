import { describe, expect, it } from "vitest";
import { verdictOf } from "../../../tests/helpers/getitems";
import { UNKNOWN } from "../types";
import { PVP_CATEGORY_IDS, PVP_KIND } from "./pvp";

function fromCategories(categories: unknown) {
  return verdictOf(PVP_KIND, {}, { categories });
}

function fromIds(ids: readonly unknown[]) {
  return fromCategories({ supported_player_categoryids: ids });
}

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

  it("is unknown error when the categories are malformed", () => {
    for (const categories of ["pvp", [49], { supported_player_categoryids: "49" }]) {
      expect(fromCategories(categories)).toBe(UNKNOWN.error);
    }
    expect(fromIds([49, "36"])).toBe(UNKNOWN.error);
    expect(fromIds([49, null])).toBe(UNKNOWN.error);
  });

  it("is not moved by a malformed field of another kind", () => {
    const verdict = verdictOf(PVP_KIND, { anticheat: 4, eula: "x" }, {
      categories: { supported_player_categoryids: [49] },
    });
    expect(verdict.state).toBe("disclosed");
  });
});
