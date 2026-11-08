import { describe, expect, it } from "vitest";
import family from "../../../tests/fixtures/getitems/family-sharing.json";
import { make } from "../../../tests/helpers/factory";
import { itemIds, verdictOf } from "../../../tests/helpers/getitems";
import { GETITEMS_URL, parseGetItems } from "../detect/getitems";
import type { AppId, Verdict } from "../types";
import { FAMILY_CATEGORY_ID, FAMILY_KIND, type FamilyDisclosed } from "./family";

const PAID_FEATURES = [22, 35, 41, 42];

function fromItem(item: Readonly<Record<string, unknown>>): Verdict<FamilyDisclosed> {
  return verdictOf(FAMILY_KIND, {}, item);
}

describe("FAMILY_KIND over the live capture (family-sharing.json)", () => {
  const items = make.fixture.items(family);
  const found = parseGetItems(
    itemIds(items),
    make.http.result(make.item.response(items), GETITEMS_URL),
    "english",
  );
  const app = make.fixture.app;

  it.each<readonly [string, AppId, Verdict<FamilyDisclosed>]>([
    [
      "Cyberpunk 2077, listed",
      app.verified,
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
    [
      "ARC Raiders, listed",
      app.arcRaiders,
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
    ["Hades, listed", app.verifiedOther, make.verdict.disclosed("family", { facet: "supported" })],
    [
      "the unreleased ReBlade, listed before release",
      app.demoParent,
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
    [
      "Red Dead Redemption 2, a paid game left out",
      app.familyLeftOut,
      make.verdict.disclosed("family", { facet: "unsupported" }),
    ],
    [
      "Assassin's Creed Black Flag Resynced, left out",
      app.drmAccountEula,
      make.verdict.disclosed("family", { facet: "unsupported" }),
    ],
    [
      "Counter-Strike 2, free and left out, which is never tagged",
      app.vac,
      make.verdict.notDisclosed(),
    ],
    ["a cosmetic DLC left out while its base game is listed", app.dlc, make.verdict.notDisclosed()],
    ["a demo, which has no feature list", app.demo, make.verdict.unknown("missing")],
    [
      "a large DLC that is listed",
      app.largeDlc,
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
  ])("reads %s (%i)", (_name, id, verdict) => {
    expect(found.get(id)?.family).toStrictEqual(verdict);
  });
});

describe("FAMILY_KIND.fromGetItems", () => {
  it("knows Steam's category ID for the kind", () => {
    expect(FAMILY_CATEGORY_ID).toBe(62);
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>, Verdict<FamilyDisclosed>]>([
    [
      "listed for category 62 alone",
      make.item.featured(make.appId(), [62]),
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
    [
      "listed on a free game",
      make.item.featured(make.appId(), [29, 62], { is_free: true }),
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
    [
      "listed on a DLC",
      make.item.featured(make.appId(), [22, 62], { type: 4 }),
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
    [
      "listed whatever is_free holds",
      make.item.featured(make.appId(), [22, 62], { is_free: "yes" }),
      make.verdict.disclosed("family", { facet: "supported" }),
    ],
    [
      "not available on a paid game left out",
      make.item.featured(make.appId(), PAID_FEATURES),
      make.verdict.disclosed("family", { facet: "unsupported" }),
    ],
    [
      "not available when is_free is false",
      make.item.featured(make.appId(), PAID_FEATURES, { is_free: false }),
      make.verdict.disclosed("family", { facet: "unsupported" }),
    ],
    [
      "not disclosed on a free game",
      make.item.featured(make.appId(), PAID_FEATURES, { is_free: true }),
      make.verdict.notDisclosed(),
    ],
    [
      "not disclosed on a DLC",
      make.item.featured(make.appId(), PAID_FEATURES, { type: 4 }),
      make.verdict.notDisclosed(),
    ],
    [
      "not disclosed on a demo",
      make.item.featured(make.appId(), PAID_FEATURES, { type: 1 }),
      make.verdict.notDisclosed(),
    ],
    [
      "not disclosed without a type",
      make.item.featured(make.appId(), PAID_FEATURES, { type: undefined }),
      make.verdict.notDisclosed(),
    ],
    [
      "not disclosed with a type that is no integer",
      make.item.featured(make.appId(), PAID_FEATURES, { type: "0" }),
      make.verdict.notDisclosed(),
    ],
    [
      "unknown missing without categories",
      make.item.featured(make.appId(), [], { categories: undefined }),
      make.verdict.unknown("missing"),
    ],
    [
      "unknown missing without a feature list",
      make.item.featured(make.appId(), [], { categories: { supported_player_categoryids: [2] } }),
      make.verdict.unknown("missing"),
    ],
    [
      "unknown missing for an empty list, which Steam's JSON leaves out",
      make.item.featured(make.appId(), []),
      make.verdict.unknown("missing"),
    ],
    [
      "unknown malformed for categories that are no object",
      make.item.featured(make.appId(), [], { categories: "62" }),
      make.verdict.unknown("malformed"),
    ],
    [
      "unknown malformed for a feature list with text in it",
      make.item.featured(make.appId(), [22, "62"]),
      make.verdict.unknown("malformed"),
    ],
    [
      "unknown malformed when a paid game's is_free is no boolean",
      make.item.featured(make.appId(), PAID_FEATURES, { is_free: "no" }),
      make.verdict.unknown("malformed"),
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
