import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { withKind } from "../../../tests/helpers/settings";
import {
  compatVerdict,
  disclosedKinds,
  dlcOf,
  FULL_DISCLOSED,
  lent,
  NOT_DISCLOSED,
} from "../../../tests/helpers/verdicts";
import { DEFAULT_SETTINGS } from "../settings/settings";
import { UNKNOWN } from "../types";
import { facetOf, taggedView } from "./facets";
import type { FacetId } from "./kind";

const choose = (...facets: FacetId[]) =>
  withKind(DEFAULT_SETTINGS, "deck", { enabled: true, facets }).kinds;

describe("taggedView", () => {
  it.each(
    [
      ["Unsupported, chosen", "unsupported", ["unsupported"], true],
      ["Verified, not chosen", "verified", ["unsupported"], false],
      ["Playable, among the chosen", "playable", ["verified", "playable"], true],
      ["Unsupported, with nothing chosen", "unsupported", [], false],
    ] as const,
  )("draws a rating that is %s: %s", (_name, facet, chosen, drawn) => {
    const verdicts = { ...disclosedKinds(["ai"]), deck: compatVerdict("deck", facet) };
    const view = taggedView(verdicts, choose(...chosen));
    expect(view.deck).toStrictEqual(drawn ? verdicts.deck : NOT_DISCLOSED);
    expect(view.ai).toBe(verdicts.ai);
  });

  it("returns the same object when every disclosed value is chosen, or none has values", () => {
    const verdicts = disclosedKinds(["ai", "deck"]);
    expect(taggedView(verdicts, choose("unsupported"))).toBe(verdicts);
    const plain = disclosedKinds(["drm"]);
    expect(taggedView(plain, choose())).toBe(plain);
  });

  it("keeps what an app is related to and leaves unknown and not disclosed as they are", () => {
    const verdicts = dlcOf(appId(1245620), {
      ...disclosedKinds([]),
      deck: compatVerdict("deck", "verified"),
      machine: UNKNOWN.unrequested,
    });
    const view = taggedView(verdicts, choose("unsupported"));
    expect(view.parent).toBe(verdicts.parent);
    expect(view.machine).toBe(UNKNOWN.unrequested);
    expect(view.pvp).toBe(verdicts.pvp);
  });

  it("treats a full game's rating lent to its demo like the demo's own", () => {
    const verdicts = { ...disclosedKinds([]), deck: lent(compatVerdict("deck", "verified")) };
    expect(taggedView(verdicts, choose("unsupported")).deck).toStrictEqual(NOT_DISCLOSED);
    expect(taggedView(verdicts, choose("verified")).deck).toBe(verdicts.deck);
  });
});

describe("facetOf", () => {
  it("gives a rating its definition with Steam's word, and a kind without values none", () => {
    expect(facetOf(compatVerdict("machine", "playable"))).toStrictEqual({
      id: "playable",
      word: "kind_compat_playable",
    });
    expect(facetOf(FULL_DISCLOSED.drm)).toBeUndefined();
  });
});
