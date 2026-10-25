import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { KIND_IDS } from "../kinds/id";
import { ALLOW_ALL, decodeAllow, decodeAllowScope, encodeAllow, perScope } from "./allow-data";

const T = 1_000_000_000_000;
const ENTRY = { name: "Game", added: T };

describe("perScope", () => {
  it("makes one result for the scope for all kinds and one for each kind", () => {
    const seen: string[] = [];
    const result = perScope((scope) => {
      seen.push(scope);
      return scope.length;
    });
    expect(seen).toStrictEqual([ALLOW_ALL, ...KIND_IDS]);
    expect(Object.keys(result).toSorted()).toStrictEqual([ALLOW_ALL, ...KIND_IDS].toSorted());
  });
});

describe("decodeAllowScope", () => {
  it("reads an object from app ID to name and date", () => {
    expect(decodeAllowScope({ "10": ENTRY })).toStrictEqual(new Map([[appId(10), ENTRY]]));
  });

  it("reads anything else as no games", () => {
    for (const stored of [undefined, null, "x", 3, true]) {
      expect(decodeAllowScope(stored)).toStrictEqual(new Map());
    }
  });
});

describe("decodeAllow and encodeAllow", () => {
  it("round trip the games of every scope", () => {
    const entries = decodeAllow({ all: { "20": ENTRY }, ai: { "10": ENTRY } });
    expect(entries.all.get(appId(20))).toStrictEqual(ENTRY);
    expect(entries.ai.get(appId(10))).toStrictEqual(ENTRY);
    expect(decodeAllow(encodeAllow(entries))).toStrictEqual(entries);
  });

  it("encode every scope, empty ones too", () => {
    expect(encodeAllow(decodeAllow(undefined))).toStrictEqual({ all: {}, ai: {} });
  });

  it("do not take a v1 list, which kept the games at the top level, for a scope", () => {
    const entries = decodeAllow({ "10": ENTRY });
    expect(entries.ai.size + entries.all.size).toBe(0);
  });
});
