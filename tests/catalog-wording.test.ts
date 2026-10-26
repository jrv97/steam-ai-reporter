import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { KINDS } from "../src/core/kinds/registry";

// Rule 4: the product reports what developers disclosed and never judges a game. A catalog in
// any locale that says a game "uses AI", is "AI-free" or has "no AI" fails here, as it fails
// scripts/check_i18n.py.
const FORBIDDEN = /\buses AI\b|\bAI-free\b|\bno AI\b/i;

// Rule 4 for every tag: no message says "no" and a tag's name, and none that names a tag says
// "none", "free of" or "<tag>-free". Names are each kind's heading and chip in the same catalog.
const ABSENCE = /(?<![\p{L}\p{N}])(?:none|free of)(?![\p{L}\p{N}])|-free(?![\p{L}\p{N}])/iu;

const CatalogSchema = v.record(v.string(), v.object({ message: v.string() }));

const catalogs = import.meta.glob("../src/locales/*/messages.json", {
  eager: true,
  import: "default",
});

function messages(path: string): readonly (readonly [string, string])[] {
  const catalog = v.parse(CatalogSchema, catalogs[path]);
  return Object.entries(catalog).map(([key, entry]) => [key, entry.message] as const);
}

/** Each kind's heading and chip as the catalog at `path` words them. */
function tagNames(path: string): readonly string[] {
  const catalog = new Map(messages(path));
  return KINDS.flatMap((kind) => [kind.messages.heading, kind.messages.chip]).flatMap((key) => {
    const name = catalog.get(key);
    return name === undefined ? [] : [name];
  });
}

/** Whether a message states a tag's absence as a claim, given the tags' names. */
function claimsAbsence(message: string, names: readonly string[]): boolean {
  const name = names.map((each) => each.replaceAll(/[$()*+.?[\\\]^{|}]/g, "\\$&")).join("|");
  const named = new RegExp(`(?<![\\p{L}\\p{N}])(?:${name})(?![\\p{L}\\p{N}])`, "iu");
  const bare = new RegExp(`(?<![\\p{L}\\p{N}])no\\s+(?:${name})(?![\\p{L}\\p{N}])`, "iu");
  return bare.test(message) || (named.test(message) && ABSENCE.test(message));
}

describe("catalog wording", () => {
  it("finds the shipped catalogs", () => {
    expect(Object.keys(catalogs)).toContain("../src/locales/en/messages.json");
  });

  it.each(Object.keys(catalogs))(
    "%s never says a game uses AI, is AI-free or has no AI",
    (path) => {
      const offending = messages(path).filter(([, message]) => FORBIDDEN.test(message));
      expect(offending).toEqual([]);
    },
  );

  it.each(["This game uses AI.", "AI-free!", "Contains no AI"])("catches %j", (message) => {
    expect(FORBIDDEN.test(message)).toBe(true);
  });

  it.each(Object.keys(catalogs))("%s never states a tag's absence as a claim", (path) => {
    const names = tagNames(path);
    expect(names).toHaveLength(KINDS.length * 2);
    const offending = messages(path).filter(([, message]) => claimsAbsence(message, names));
    expect(offending).toEqual([]);
  });

  const english = tagNames("../src/locales/en/messages.json");
  it.each<readonly [string, (name: string) => string]>([
    ["a bare negative", (name) => `No ${name}`],
    ["a negative in a sentence", (name) => `This game has no ${name}.`],
    ["none after the name", (name) => `${name}: none`],
    ["free of the tag", (name) => `Free of ${name}`],
    ["the tag with -free", (name) => `${name}-free`],
  ])("catches %s for every tag", (_name, phrase) => {
    for (const name of english) {
      expect(claimsAbsence(phrase(name), english)).toBe(true);
    }
  });
});
