import { describe, expect, it } from "vitest";
import { KIND_IDS } from "./id";
import { KINDS } from "./registry";

describe("KIND_IDS", () => {
  it("lists the id of every registered kind, in registry order, once each", () => {
    expect(KIND_IDS).toStrictEqual(KINDS.map((kind) => kind.id));
    expect(new Set(KIND_IDS).size).toBe(KIND_IDS.length);
  });

  it("holds the seven stable ids the settings store", () => {
    expect(KIND_IDS).toStrictEqual([
      "ai",
      "kernel",
      "anticheat",
      "drm",
      "account",
      "eula",
      "pvp",
    ]);
  });
});
