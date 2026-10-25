import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { KIND_IDS, KindIdSchema } from "./id";

describe("KindIdSchema", () => {
  it("accepts every kind id and nothing else", () => {
    for (const id of KIND_IDS) {
      expect(v.safeParse(KindIdSchema, id).success).toBe(true);
    }
    for (const value of ["", "all", "AI", 1, null, undefined]) {
      expect(v.safeParse(KindIdSchema, value).success).toBe(false);
    }
  });
});
