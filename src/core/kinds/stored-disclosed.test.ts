import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { storedDisclosed } from "./stored-disclosed";

describe("storedDisclosed", () => {
  const schema = storedDisclosed("demo", { text: v.string() });
  const valid = { state: "disclosed", kind: "demo", source: "api", text: make.text.note() };

  it("reads the common fields and the kind's own, and drops other keys", () => {
    expect(v.parse(schema, { ...valid, extra: 1 })).toStrictEqual(valid);
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["another state", { ...valid, state: "not-disclosed" }],
    ["another kind", { ...valid, kind: "other" }],
    ["a bad source", { ...valid, source: "guess" }],
    ["a missing field", { state: "disclosed", kind: "demo", source: "api" }],
    ["a field of the wrong type", { ...valid, text: 3 }],
  ])("rejects %s", (_name, stored) => {
    expect(v.safeParse(schema, stored).success).toBe(false);
  });
});
