import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { parsedItem } from "../../../tests/helpers/getitems";
import { FULL_DISCLOSED } from "../../../tests/helpers/verdicts";
import { UNKNOWN, type UnknownReason } from "../types";
import { KIND_IDS } from "./id";
import { KINDS } from "./registry";
import {
  isKindVerdicts,
  kindsFromGetItems,
  sameVerdicts,
  UNKNOWN_KINDS,
  withRelations,
} from "./verdicts";

const REASONS: readonly UnknownReason[] = ["gated", "missing", "error", "rate-limited"];

describe("UNKNOWN_KINDS", () => {
  it("holds the shared unknown verdict of its reason for every kind", () => {
    for (const reason of REASONS) {
      expect(Object.keys(UNKNOWN_KINDS[reason])).toStrictEqual([...KIND_IDS]);
      for (const id of KIND_IDS) {
        expect(UNKNOWN_KINDS[reason][id]).toBe(UNKNOWN[reason]);
      }
    }
  });
});

describe("withRelations", () => {
  it("returns the same verdicts when there is nothing related", () => {
    expect(withRelations(FULL_DISCLOSED, {})).toBe(FULL_DISCLOSED);
    expect(withRelations(FULL_DISCLOSED, { parent: undefined })).toBe(FULL_DISCLOSED);
  });

  it("adds the base game without touching the shared objects or the verdicts", () => {
    const dlc = withRelations(UNKNOWN_KINDS.missing, { parent: appId(7) });
    expect(dlc.parent).toBe(7);
    expect(UNKNOWN_KINDS.missing).not.toHaveProperty("parent");
    for (const id of KIND_IDS) {
      expect(dlc[id]).toBe(UNKNOWN_KINDS.missing[id]);
    }
    expect(isKindVerdicts(dlc)).toBe(true);
  });
});

describe("sameVerdicts", () => {
  const { ai, drm, pvp } = FULL_DISCLOSED;

  it("holds for lists of the very same verdicts in the same order", () => {
    expect(sameVerdicts([], [])).toBe(true);
    expect(sameVerdicts([ai, drm], [ai, drm])).toBe(true);
  });

  it("fails on another order, another length or a copy of a verdict", () => {
    expect(sameVerdicts([ai, drm], [drm, ai])).toBe(false);
    expect(sameVerdicts([ai], [ai, pvp])).toBe(false);
    expect(sameVerdicts([ai, drm], [ai])).toBe(false);
    expect(sameVerdicts([ai], [{ ...ai }])).toBe(false);
  });
});

describe("isKindVerdicts", () => {
  it("accepts verdicts for every kind and nothing less", () => {
    expect(isKindVerdicts(UNKNOWN_KINDS.missing)).toBe(true);
    expect(isKindVerdicts({})).toBe(false);
  });

  it("accepts a disclosed verdict in the slot of its own kind", () => {
    expect(isKindVerdicts(FULL_DISCLOSED)).toBe(true);
  });

  it("rejects a disclosed verdict in the slot of another kind", () => {
    expect(isKindVerdicts({ ...FULL_DISCLOSED, kernel: FULL_DISCLOSED.anticheat })).toBe(false);
    expect(isKindVerdicts({ ...FULL_DISCLOSED, ai: FULL_DISCLOSED.pvp })).toBe(false);
  });
});

describe("a disclosed verdict", () => {
  it("names the kind it sits under, and is read back by that kind's schema", () => {
    for (const kind of KINDS) {
      const verdict = FULL_DISCLOSED[kind.id];
      expect(verdict.kind).toBe(kind.id);
      expect(v.safeParse(kind.stored, verdict).success).toBe(true);
    }
  });
});

describe("kindsFromGetItems", () => {
  it("gives every kind the verdict its definition derives from the item", () => {
    const { item, details } = parsedItem({ content_survey_ai_notes: "Concept art." });
    const verdicts = kindsFromGetItems(item, details, "english");
    expect(Object.keys(verdicts)).toStrictEqual([...KIND_IDS]);
    for (const kind of KINDS) {
      expect(verdicts[kind.id]).toStrictEqual(kind.fromGetItems(item, details, "english"));
    }
  });
});
