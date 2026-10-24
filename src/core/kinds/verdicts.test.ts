import { describe, expect, it } from "vitest";
import { UNKNOWN, type UnknownReason } from "../types";
import { KIND_IDS } from "./id";
import { UNKNOWN_KINDS } from "./verdicts";

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
