import { describe, expect, it } from "vitest";
import family from "../../../tests/fixtures/getitems/family-sharing.json";
import { appId } from "../../../tests/helpers/app-ids";
import { httpResult } from "../../../tests/helpers/fake-http";
import {
  featuredItem,
  fixtureItems,
  getItemsResponse,
  itemIds,
  verdictOf,
} from "../../../tests/helpers/getitems";
import { familyVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { GETITEMS_URL, parseGetItems } from "../detect/getitems";
import { UNKNOWN, type Verdict } from "../types";
import { FAMILY_CATEGORY_ID, FAMILY_KIND, type FamilyDisclosed } from "./family";

const PAID_FEATURES = [22, 35, 41, 42];

function fromItem(item: Readonly<Record<string, unknown>>): Verdict<FamilyDisclosed> {
  return verdictOf(FAMILY_KIND, {}, item);
}

describe("FAMILY_KIND over the live capture (family-sharing.json)", () => {
  const ids = itemIds(fixtureItems(family));
  const found = parseGetItems(
    ids,
    httpResult(getItemsResponse(fixtureItems(family)), GETITEMS_URL),
    "english",
  );

  it.each<readonly [string, number, Verdict<FamilyDisclosed>]>([
    ["Cyberpunk 2077, listed", 1091500, familyVerdict("supported")],
    ["ARC Raiders, listed", 1808500, familyVerdict("supported")],
    ["Hades, listed", 1145360, familyVerdict("supported")],
    ["the unreleased ReBlade, listed before release", 3489340, familyVerdict("supported")],
    ["Red Dead Redemption 2, a paid game left out", 1174180, familyVerdict("unsupported")],
    ["Assassin's Creed Black Flag Resynced, left out", 3751950, familyVerdict("unsupported")],
    ["Counter-Strike 2, free and left out, which is never tagged", 730, NOT_DISCLOSED],
    ["a cosmetic DLC left out while its base game is listed", 5201760, NOT_DISCLOSED],
    ["a demo, which has no feature list", 4513800, UNKNOWN.missing],
    ["a large DLC that is listed", 2778580, familyVerdict("supported")],
  ])("reads %s (%i)", (_name, id, verdict) => {
    expect(found.get(appId(id))?.family).toStrictEqual(verdict);
  });
});

describe("FAMILY_KIND.fromGetItems", () => {
  it("knows Steam's category ID for the kind", () => {
    expect(FAMILY_CATEGORY_ID).toBe(62);
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>, Verdict<FamilyDisclosed>]>([
    ["listed for category 62 alone", featuredItem(1, [62]), familyVerdict("supported")],
    [
      "listed on a free game",
      featuredItem(1, [29, 62], { is_free: true }),
      familyVerdict("supported"),
    ],
    ["listed on a DLC", featuredItem(1, [22, 62], { type: 4 }), familyVerdict("supported")],
    [
      "listed whatever is_free holds",
      featuredItem(1, [22, 62], { is_free: "yes" }),
      familyVerdict("supported"),
    ],
    [
      "not available on a paid game left out",
      featuredItem(1, PAID_FEATURES),
      familyVerdict("unsupported"),
    ],
    [
      "not available when is_free is false",
      featuredItem(1, PAID_FEATURES, { is_free: false }),
      familyVerdict("unsupported"),
    ],
    [
      "not disclosed on a free game",
      featuredItem(1, PAID_FEATURES, { is_free: true }),
      NOT_DISCLOSED,
    ],
    ["not disclosed on a DLC", featuredItem(1, PAID_FEATURES, { type: 4 }), NOT_DISCLOSED],
    ["not disclosed on a demo", featuredItem(1, PAID_FEATURES, { type: 1 }), NOT_DISCLOSED],
    [
      "not disclosed without a type",
      featuredItem(1, PAID_FEATURES, { type: undefined }),
      NOT_DISCLOSED,
    ],
    [
      "not disclosed with a type that is no integer",
      featuredItem(1, PAID_FEATURES, { type: "0" }),
      NOT_DISCLOSED,
    ],
    [
      "unknown missing without categories",
      featuredItem(1, [], { categories: undefined }),
      UNKNOWN.missing,
    ],
    [
      "unknown missing without a feature list",
      featuredItem(1, [], { categories: { supported_player_categoryids: [2] } }),
      UNKNOWN.missing,
    ],
    [
      "unknown missing for an empty list, which Steam's JSON leaves out",
      featuredItem(1, []),
      UNKNOWN.missing,
    ],
    [
      "unknown malformed for categories that are no object",
      featuredItem(1, [], { categories: "62" }),
      UNKNOWN.malformed,
    ],
    [
      "unknown malformed for a feature list with text in it",
      featuredItem(1, [22, "62"]),
      UNKNOWN.malformed,
    ],
    [
      "unknown malformed when a paid game's is_free is no boolean",
      featuredItem(1, PAID_FEATURES, { is_free: "no" }),
      UNKNOWN.malformed,
    ],
  ])("is %s", (_name, item, verdict) => {
    expect(fromItem(item)).toStrictEqual(verdict);
  });

  it("is stated by Valve, needs no request section and offers Steam's two values", () => {
    expect(FAMILY_KIND.source).toBe("valve");
    expect(FAMILY_KIND.sections).toBeUndefined();
    expect(FAMILY_KIND.facets?.map((facet) => facet.id)).toStrictEqual([
      "supported",
      "unsupported",
    ]);
  });
});
