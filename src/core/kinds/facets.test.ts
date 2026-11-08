import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import type { CompatFacet } from "./compat";
import { facetOf, taggedView } from "./facets";
import type { FacetId } from "./kind";

const choose = (...facets: FacetId[]) =>
  make.settings.kind("deck", { enabled: true, facets }).kinds;

describe("taggedView", () => {
  const withDeck = (facet: CompatFacet) => ({
    ...make.verdicts.only(["ai"]),
    deck: make.verdict.disclosed("deck", { facet }),
  });

  it.each<readonly [string, CompatFacet, readonly FacetId[]]>([
    ["Unsupported, chosen", "unsupported", ["unsupported"]],
    ["Playable, among the chosen", "playable", ["verified", "playable"]],
  ])("draws a rating that is %s", (_name, facet, chosen) => {
    const verdicts = withDeck(facet);
    const view = taggedView(verdicts, choose(...chosen));
    expect(view.deck).toBe(verdicts.deck);
    expect(view.ai).toBe(verdicts.ai);
  });

  it.each<readonly [string, CompatFacet, readonly FacetId[]]>([
    ["Verified, not chosen", "verified", ["unsupported"]],
    ["Unsupported, with nothing chosen", "unsupported", []],
  ])("shows a rating that is %s as not disclosed", (_name, facet, chosen) => {
    const verdicts = withDeck(facet);
    const view = taggedView(verdicts, choose(...chosen));
    expect(view.deck).toStrictEqual(make.verdict.notDisclosed());
    expect(view.ai).toBe(verdicts.ai);
  });

  it("returns the same object when every disclosed value is chosen, or none has values", () => {
    const verdicts = make.verdicts.only(["ai", "deck"]);
    expect(taggedView(verdicts, choose("unsupported"))).toBe(verdicts);
    const plain = make.verdicts.only(["drm"]);
    expect(taggedView(plain, choose())).toBe(plain);
  });

  it("keeps what an app is related to and leaves unknown and not disclosed as they are", () => {
    const verdicts = make.verdicts.dlcOf(make.appId(), {
      ...make.verdicts.only([]),
      deck: make.verdict.disclosed("deck", { facet: "verified" }),
      machine: make.verdict.unknown("unrequested"),
    });
    const view = taggedView(verdicts, choose("unsupported"));
    expect(view.parent).toBe(verdicts.parent);
    expect(view.machine).toBe(make.verdict.unknown("unrequested"));
    expect(view.pvp).toBe(verdicts.pvp);
  });

  it("treats a full game's rating lent to its demo like the demo's own", () => {
    const verdicts = {
      ...make.verdicts.only([]),
      deck: make.verdict.lent(make.verdict.disclosed("deck", { facet: "verified" })),
    };
    expect(taggedView(verdicts, choose("unsupported")).deck).toStrictEqual(
      make.verdict.notDisclosed(),
    );
    expect(taggedView(verdicts, choose("verified")).deck).toBe(verdicts.deck);
  });
});

describe("facetOf", () => {
  it("gives a rating its definition with Steam's word", () => {
    expect(facetOf(make.verdict.disclosed("machine", { facet: "playable" }))).toStrictEqual({
      id: "playable",
      word: "kind_compat_playable",
    });
  });

  it("gives a kind without values no definition", () => {
    expect(facetOf(make.verdict.disclosed("drm"))).toBeUndefined();
  });
});
