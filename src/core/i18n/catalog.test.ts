import { describe, expect, it } from "vitest";
import { substitute } from "./catalog";

describe("substitute", () => {
  it("replaces named placeholders, ignoring case", () => {
    expect(substitute("$Name$ and $NAME$", { name: "Ana" })).toBe("Ana and Ana");
  });

  it("turns $$ into a dollar sign", () => {
    expect(substitute("$$5 for $item$", { item: "a game" })).toBe("$5 for a game");
  });

  it("leaves a placeholder without a value visible", () => {
    expect(substitute("Hello, $name$!", {})).toBe("Hello, $name$!");
  });

  it("inserts values verbatim, without reading placeholders inside them", () => {
    expect(substitute("$a$", { a: "$b$", b: "no" })).toBe("$b$");
  });
});
