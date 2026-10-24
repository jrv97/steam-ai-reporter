import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { storedDisclosed } from "./stored-disclosed";

describe("storedDisclosed", () => {
  const schema = storedDisclosed("demo", { text: v.string() });
  const valid = { state: "disclosed", kind: "demo", source: "api", text: "x" };

  it("reads the common fields and the kind's own, and drops other keys", () => {
    expect(v.parse(schema, { ...valid, extra: 1 })).toStrictEqual(valid);
  });

  it("rejects another state, another kind, a bad source and a missing field", () => {
    const bad = [
      { ...valid, state: "not-disclosed" },
      { ...valid, kind: "other" },
      { ...valid, source: "guess" },
      { state: "disclosed", kind: "demo", source: "api" },
      { ...valid, text: 3 },
    ];
    for (const stored of bad) {
      expect(v.safeParse(schema, stored).success).toBe(false);
    }
  });
});
