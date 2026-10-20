import * as v from "valibot";
import { describe, expect, it } from "vitest";

// Rule 4: the product reports what developers disclosed and never judges a game. A catalog in
// any locale that says a game "uses AI", is "AI-free" or has "no AI" fails here, as it fails
// scripts/check_i18n.py.
const FORBIDDEN = /\buses AI\b|\bAI-free\b|\bno AI\b/i;

const CatalogSchema = v.record(v.string(), v.object({ message: v.string() }));

const catalogs = import.meta.glob("../src/locales/*/messages.json", {
  eager: true,
  import: "default",
});

function messages(path: string): readonly (readonly [string, string])[] {
  const catalog = v.parse(CatalogSchema, catalogs[path]);
  return Object.entries(catalog).map(([key, entry]) => [key, entry.message] as const);
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
});
