import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { IAP_CATEGORY_ID, IAP_KIND } from "./iap";

function fromCategories(categories: unknown) {
  return verdictOf(IAP_KIND, {}, { categories });
}

describe("IAP_KIND.fromGetItems", () => {
  it("knows Steam's category ID for the kind", () => {
    expect(IAP_CATEGORY_ID).toBe(35);
  });

  it.each([
    [
      "disclosed when the features hold category 35",
      [22, 35, 15, 62],
      make.verdict.disclosed("iap"),
    ],
    ["disclosed for category 35 alone", [35], make.verdict.disclosed("iap")],
    [
      "not disclosed when the features lack it (Hades)",
      [22, 29, 13, 23, 41, 42, 62],
      make.verdict.notDisclosed(),
    ],
  ])("is %s", (_name, features, verdict) => {
    expect(fromCategories({ feature_categoryids: features })).toStrictEqual(verdict);
  });

  it.each([
    ["no categories", undefined],
    ["categories without a feature list", { supported_player_categoryids: [2, 49] }],
    ["an empty feature list, which Steam's JSON leaves out", { feature_categoryids: [] }],
  ])("is unknown missing for %s", (_name, categories) => {
    expect(fromCategories(categories)).toBe(make.verdict.unknown("missing"));
  });

  it.each([
    ["categories that are not an object", "in-app"],
    ["a feature list that is not a list", { feature_categoryids: "35" }],
    ["a feature list with a value that is not a number", { feature_categoryids: [35, "62"] }],
  ])("is unknown malformed for %s", (_name, categories) => {
    expect(fromCategories(categories)).toBe(make.verdict.unknown("malformed"));
  });
});
