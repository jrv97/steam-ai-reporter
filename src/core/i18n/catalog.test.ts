import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { type Params, substitute } from "./catalog";

describe("substitute", () => {
  const name = make.text.name();

  it.each<readonly [string, string, Params, string]>([
    [
      "replaces named placeholders, ignoring case",
      "$Name$ and $NAME$",
      { name },
      `${name} and ${name}`,
    ],
    ["turns $$ into a dollar sign", "$$5 for $name$", { name }, `$5 for ${name}`],
    ["leaves a placeholder without a value visible", "Hello, $name$!", {}, "Hello, $name$!"],
    [
      "inserts values verbatim, without reading placeholders inside them",
      "$a$",
      { a: "$b$", b: name },
      "$b$",
    ],
  ])("%s", (_name, template, params, text) => {
    expect(substitute(template, params)).toBe(text);
  });
});
