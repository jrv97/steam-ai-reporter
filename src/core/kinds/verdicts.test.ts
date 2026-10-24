import { describe, expect, it } from "vitest";
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

describe("kindsFromGetItems", () => {
  it("gives every kind the verdict its definition derives from the item", () => {
    const details = { content_survey_ai_notes: "Concept art." };
    const verdicts = kindsFromGetItems(details, "Fixture Game", "english");
    expect(Object.keys(verdicts)).toStrictEqual([...KIND_IDS]);
    for (const kind of KINDS) {
      expect(verdicts[kind.id]).toStrictEqual(
        kind.fromGetItems(details, "Fixture Game", "english"),
      );
    }
  });
});
