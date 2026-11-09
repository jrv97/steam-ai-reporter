import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import type { CompatFacet } from "./compat";
import { facetOf, taggedView } from "./facets";
import type { TaggedFacets } from "./kind-settings";

const { one } = make.settings.tagged;
const choose = (tagged: TaggedFacets) =>
  make.settings.kind("deck", { enabled: true, tagged }).kinds;

describe("taggedView", () => {
  const withDeck = (facet: CompatFacet) => ({
    ...make.verdicts.only(["ai"]),
    deck: make.verdict.disclosed("deck", { facet }),
  });

  it.each<readonly [string, CompatFacet, TaggedFacets]>([
    ["Unsupported, chosen", "unsupported", one("unsupported")],
    ["Playable, chosen", "playable", one("playable")],
  ])("draws a rating that is %s", (_name, facet, chosen) => {
    const verdicts = withDeck(facet);
    const view = taggedView(verdicts, choose(chosen));
    expect(view.deck).toBe(verdicts.deck);
    expect(view.ai).toBe(verdicts.ai);
  });

  it.each<readonly [string, CompatFacet, TaggedFacets]>([
    ["Verified, with Unsupported chosen", "verified", one("unsupported")],
    ["Unsupported, with Verified chosen", "unsupported", one("verified")],
  ])("shows a rating that is %s as not disclosed", (_name, facet, chosen) => {
    const verdicts = withDeck(facet);
    const view = taggedView(verdicts, choose(chosen));
    expect(view.deck).toStrictEqual(make.verdict.notDisclosed());
    expect(view.ai).toBe(verdicts.ai);
  });

  it("returns the same object when every disclosed value is chosen, or none has values", () => {
    const verdicts = make.verdicts.only(["ai", "deck"]);
    expect(taggedView(verdicts, choose(one("unsupported")))).toBe(verdicts);
    const plain = make.verdicts.only(["drm"]);
    expect(taggedView(plain, choose(one("verified")))).toBe(plain);
  });

  it("keeps what an app is related to and leaves unknown and not disclosed as they are", () => {
    const verdicts = make.verdicts.dlcOf(make.appId(), {
      ...make.verdicts.only([]),
      deck: make.verdict.disclosed("deck", { facet: "verified" }),
      machine: make.verdict.unknown("unrequested"),
    });
    const view = taggedView(verdicts, choose(one("unsupported")));
    expect(view.parent).toBe(verdicts.parent);
    expect(view.machine).toBe(make.verdict.unknown("unrequested"));
    expect(view.pvp).toBe(verdicts.pvp);
  });

  it("treats a full game's rating lent to its demo like the demo's own", () => {
    const verdicts = {
      ...make.verdicts.only([]),
      deck: make.verdict.lent(make.verdict.disclosed("deck", { facet: "verified" })),
    };
    expect(taggedView(verdicts, choose(one("unsupported"))).deck).toStrictEqual(
      make.verdict.notDisclosed(),
    );
    expect(taggedView(verdicts, choose(one("verified"))).deck).toBe(verdicts.deck);
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
