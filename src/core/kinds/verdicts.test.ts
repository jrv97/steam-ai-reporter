import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { parsedItem } from "../../../tests/helpers/getitems";
import { ALL_DISCLOSED } from "../../../tests/helpers/verdicts";
import { UNKNOWN, type UnknownReason } from "../types";
import { KIND_IDS } from "./id";
import { KINDS } from "./registry";
import { isKindVerdicts, kindsFromGetItems, UNKNOWN_KINDS } from "./verdicts";

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

describe("isKindVerdicts", () => {
  it("accepts verdicts for every kind and nothing less", () => {
    expect(isKindVerdicts(UNKNOWN_KINDS.missing)).toBe(true);
    expect(isKindVerdicts({})).toBe(false);
  });
});

describe("a disclosed verdict", () => {
  it("names the kind it sits under, and is read back by that kind's schema", () => {
    for (const kind of KINDS) {
      const verdict = ALL_DISCLOSED[kind.id];
      expect(verdict.state === "disclosed" ? verdict.kind : undefined).toBe(kind.id);
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
