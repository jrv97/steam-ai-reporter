import { describe, expect, it } from "vitest";
import { KIND_IDS, type KindId } from "./id";
import { kindsInOrder, parseOrder, sameOrder } from "./order";
import { KIND_BY_ID } from "./registry";

/** The registry order with `moved` taken out and put first. */
function first(...moved: readonly KindId[]): readonly KindId[] {
  return [...moved, ...KIND_IDS.filter((id) => !moved.includes(id))];
}

describe("parseOrder", () => {
  it.each<[string, readonly unknown[], readonly KindId[]]>([
    ["the registry order for an empty list", [], KIND_IDS],
    ["a whole order as stored", KIND_IDS.toReversed(), KIND_IDS.toReversed()],
    ["the kinds a list lacks after it, by registry", ["family", "drm"], first("family", "drm")],
    ["no unknown id", ["future", "drm", 7, null, { id: "ai" }], first("drm")],
    ["the first of a repeated id", ["pvp", "ai", "pvp"], first("pvp", "ai")],
  ])("keeps %s", (_case, stored, expected) => {
    expect(parseOrder(stored)).toStrictEqual(expected);
  });
});

describe("sameOrder", () => {
  it.each<[readonly KindId[], readonly KindId[], boolean]>([
    [KIND_IDS, [...KIND_IDS], true],
    [KIND_IDS, first("family"), false],
    [KIND_IDS, KIND_IDS.slice(1), false],
  ])("compares places, not lists", (a, b, same) => {
    expect(sameOrder(a, b)).toBe(same);
  });
});

describe("kindsInOrder", () => {
  it("gives the definitions in the order's places, once per order", () => {
    const order = first("iap", "deck");
    const kinds = kindsInOrder(order);
    expect(kinds).toStrictEqual(order.map((id) => KIND_BY_ID[id]));
    expect(kindsInOrder(order)).toBe(kinds);
  });
});
