import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { UNKNOWN, type UnknownReason } from "../types";
import { KIND_IDS } from "./id";
import { KINDS, perKind } from "./registry";
import { BASE_SECTIONS, SECTIONS } from "./sections";
import {
  type AnyDisclosed,
  type FoundRelations,
  isKindVerdicts,
  kindsFromGetItems,
  sameVerdicts,
  UNKNOWN_KINDS,
  withRelations,
} from "./verdicts";

const REASONS: readonly UnknownReason[] = ["gated", "missing", "error", "rate-limited"];

describe("UNKNOWN_KINDS", () => {
  it.each(REASONS)("holds the shared unknown %s verdict for every kind", (reason) => {
    expect(Object.keys(UNKNOWN_KINDS[reason])).toStrictEqual([...KIND_IDS]);
    for (const id of KIND_IDS) {
      expect(UNKNOWN_KINDS[reason][id]).toBe(UNKNOWN[reason]);
    }
  });
});

describe("withRelations", () => {
  it.each<[string, FoundRelations]>([
    ["nothing", {}],
    ["no parent", { parent: undefined }],
    ["no creators", { creators: undefined }],
    ["creators of no one", { creators: make.creator.forItem({}) }],
    ["a demo mark without a full game", { demo: true }],
  ])("returns the same verdicts when it is given %s", (_name, from) => {
    const verdicts = make.verdicts.full();
    expect(withRelations(verdicts, from)).toBe(verdicts);
  });

  it.each<[string, FoundRelations]>([
    ["the base game", { parent: make.appId() }],
    ["the creators", { creators: make.creator.forItem({ developers: [make.text.creator()] }) }],
    ["both", {
      parent: make.appId(),
      creators: make.creator.forItem({ publishers: [[make.text.creator(), make.creator.clan()]] }),
    }],
    ["the full game of a demo", { parent: make.appId(), demo: true }],
  ])("adds %s without touching the shared objects or the verdicts", (_name, from) => {
    const related = withRelations(UNKNOWN_KINDS.missing, from);
    expect(related).toMatchObject(from);
    expect(UNKNOWN_KINDS.missing).not.toHaveProperty("parent");
    expect(UNKNOWN_KINDS.missing).not.toHaveProperty("creators");
    for (const id of KIND_IDS) {
      expect(related[id]).toBe(UNKNOWN_KINDS.missing[id]);
    }
    expect(isKindVerdicts(related)).toBe(true);
  });
});

describe("sameVerdicts", () => {
  const ai = make.verdict.disclosed("ai");
  const drm = make.verdict.disclosed("drm");
  const pvp = make.verdict.disclosed("pvp");

  it.each<readonly [string, readonly AnyDisclosed[], readonly AnyDisclosed[], boolean]>([
    ["holds for two empty lists", [], [], true],
    ["holds for the very same verdicts in the same order", [ai, drm], [ai, drm], true],
    ["fails on another order", [ai, drm], [drm, ai], false],
    ["fails on a longer list", [ai], [ai, pvp], false],
    ["fails on a shorter list", [ai, drm], [ai], false],
    ["fails on a copy of a verdict", [ai], [{ ...ai }], false],
  ])("%s", (_name, a, b, same) => {
    expect(sameVerdicts(a, b)).toBe(same);
  });
});

describe("isKindVerdicts", () => {
  const full = make.verdicts.full();

  it.each<readonly [string, Parameters<typeof isKindVerdicts>[0], boolean]>([
    ["accepts verdicts for every kind", UNKNOWN_KINDS.missing, true],
    ["rejects an object without them", {}, false],
    ["accepts a disclosed verdict in the slot of its own kind", full, true],
    [
      "rejects an anti-cheat verdict in the kernel slot",
      { ...full, kernel: make.verdict.disclosed("anticheat") },
      false,
    ],
    ["rejects a PvP verdict in the AI slot", { ...full, ai: make.verdict.disclosed("pvp") }, false],
  ])("%s", (_name, value, valid) => {
    expect(isKindVerdicts(value)).toBe(valid);
  });
});

describe("a disclosed verdict", () => {
  it.each(KINDS.map((kind) => [kind.id, kind] as const))(
    "of the %s kind names its kind and is read back by its schema",
    (id, kind) => {
      const verdict = make.verdict.disclosed(id);
      expect(verdict.kind).toBe(id);
      expect(v.safeParse(kind.stored, verdict).success).toBe(true);
    },
  );
});

describe("kindsFromGetItems", () => {
  it("gives a kind whose section the request left out unknown unrequested", () => {
    const platforms = { steam_deck_compat_category: 1 };
    const { item, details } = make.item.parsed({}, { platforms });
    const verdicts = kindsFromGetItems(item, details, "english", BASE_SECTIONS);
    expect(verdicts.deck).toBe(UNKNOWN.unrequested);
    expect(verdicts.sections).toBe(BASE_SECTIONS);
  });

  it("gives every kind the verdict its definition derives from the item", () => {
    const { item, details } = make.item.parsed({ content_survey_ai_notes: make.text.note() });
    expect(kindsFromGetItems(item, details, "english", SECTIONS)).toStrictEqual({
      ...perKind((kind) => kind.fromGetItems(item, details, "english")),
      sections: SECTIONS,
    });
  });
});
