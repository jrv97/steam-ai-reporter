import { describe, expect, it } from "vitest";
import { KIND_IDS } from "./id";
import { kindOf, KINDS, perKind } from "./registry";

describe("KINDS", () => {
  it("holds one definition for each kind id, in order, and each one knows its id", () => {
    expect(KINDS.map((kind) => kind.id)).toStrictEqual([...KIND_IDS]);
  });

  it("starts every kind enabled, with badge and banner on and the list untouched", () => {
    for (const kind of KINDS) {
      expect(kind.defaults).toStrictEqual({
        enabled: true,
        badge: true,
        banner: true,
        filter: "off",
      });
    }
  });
});

describe("kindOf", () => {
  it("finds the definition of each id", () => {
    for (const id of KIND_IDS) {
      expect(kindOf(id).id).toBe(id);
    }
  });
});

describe("perKind", () => {
  it("calls make once for each registered kind and keys the results by kind id", () => {
    const seen: string[] = [];
    const result = perKind((kind) => {
      seen.push(kind.id);
      return kind.messages.label;
    });
    expect(seen).toStrictEqual([...KIND_IDS]);
    expect(Object.keys(result)).toStrictEqual([...KIND_IDS]);
    expect(result.ai).toBe(kindOf("ai").messages.label);
  });
});
