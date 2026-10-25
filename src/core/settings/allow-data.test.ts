import { describe, expect, it } from "vitest";
import { appId } from "../../../tests/helpers/app-ids";
import { KIND_IDS } from "../kinds/id";
import {
  ALLOW_ALL,
  ALLOW_SCOPES,
  decodeAllow,
  decodeAllowScope,
  encodeAllow,
  perScope,
  toAllowScope,
} from "./allow-data";

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

describe("toAllowScope", () => {
  it("lists the scope for all kinds first, then each kind in registry order", () => {
    expect(ALLOW_SCOPES).toStrictEqual([ALLOW_ALL, ...KIND_IDS]);
  });

  it.each([ALLOW_ALL, ...KIND_IDS])("reads %s as a scope", (scope) => {
    expect(toAllowScope(scope)).toBe(scope);
  });

  it.each([null, "", "kinds", "all ", "__proto__"])("reads %j as no scope", (value) => {
    expect(toAllowScope(value)).toBeUndefined();
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

  it("read the games of the scope of any kind, and nothing for a kind not stored", () => {
    const entries = decodeAllow({ drm: { "30": ENTRY } });
    expect(entries.drm.get(appId(30))).toStrictEqual(ENTRY);
    for (const id of KIND_IDS) {
      expect(entries[id].size).toBe(id === "drm" ? 1 : 0);
    }
    expect(entries.all.size).toBe(0);
  });

  it("encode every scope, empty ones too", () => {
    expect(encodeAllow(decodeAllow(undefined))).toStrictEqual(
      Object.fromEntries([ALLOW_ALL, ...KIND_IDS].map((scope) => [scope, {}])),
    );
  });

  it("do not take a v1 list, which kept the games at the top level, for a scope", () => {
    const entries = decodeAllow({ "10": ENTRY });
    expect(entries.ai.size + entries.all.size).toBe(0);
  });
});
