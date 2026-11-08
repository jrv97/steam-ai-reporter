import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { KIND_IDS } from "../kinds/id";
import {
  ALLOW_ALL,
  ALLOW_SCOPES,
  decodeAllow,
  decodeAllowScope,
  decodeScope,
  encodeAllow,
  perScope,
  toAllowScope,
} from "./allow-data";

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

  it.each(make.raw.badScopes())("reads %j as no scope", (value) => {
    expect(toAllowScope(value)).toBeUndefined();
  });
});

describe("decodeAllowScope", () => {
  it("reads an object from app ID to name and date", () => {
    const id = make.appId();
    const entry = make.raw.allowEntry();
    expect(decodeAllowScope({ [String(id)]: entry })).toStrictEqual(new Map([[id, entry]]));
  });

  it.each([undefined, ...make.raw.junk()])("reads %j as no games", (stored) => {
    expect(decodeAllowScope(stored)).toStrictEqual(new Map());
  });
});

describe("decodeScope", () => {
  const tagged = (text: string) => (text.startsWith("t:") ? text.slice(2) : undefined);

  it("keeps the entries whose key the parser reads, under the key it returns", () => {
    const entry = make.raw.allowEntry();
    expect(
      decodeScope({ "t:a": entry, "b": entry, "t:c": make.raw.corruptNumber() }, tagged),
    ).toStrictEqual(new Map([["a", entry]]));
  });

  it("is written back under the text of the key", () => {
    const entry = make.raw.allowEntry();
    const entries = {
      ...perScope(() => new Map<string, typeof entry>()),
      ai: new Map([["t:a", entry]]),
    };
    expect(encodeAllow(entries)).toMatchObject({ ai: { "t:a": entry } });
  });
});

describe("decodeAllow and encodeAllow", () => {
  it("round trip the games of every scope", () => {
    const all = make.appId();
    const ai = make.appId();
    const entry = make.raw.allowEntry();
    const entries = decodeAllow({ all: { [String(all)]: entry }, ai: { [String(ai)]: entry } });
    expect(entries.all.get(all)).toStrictEqual(entry);
    expect(entries.ai.get(ai)).toStrictEqual(entry);
    expect(decodeAllow(encodeAllow(entries))).toStrictEqual(entries);
  });

  it("read the games of the scope of any kind, and nothing for a kind not stored", () => {
    const id = make.appId();
    const entry = make.raw.allowEntry();
    expect(decodeAllow({ drm: { [String(id)]: entry } })).toStrictEqual({
      ...perScope(() => new Map()),
      drm: new Map([[id, entry]]),
    });
  });

  it("encode every scope, empty ones too", () => {
    expect(encodeAllow(decodeAllow(undefined))).toStrictEqual(make.raw.noGames());
  });

  it("do not take a v1 list, which kept the games at the top level, for a scope", () => {
    expect(decodeAllow(make.raw.v1Allow())).toStrictEqual(perScope(() => new Map()));
  });
});
