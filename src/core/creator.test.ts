import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { ClanIdSchema, makeCreator, makeCreators, toCreatorKey } from "./creator";

const clan = (value: number) => v.parse(ClanIdSchema, value);

describe("toCreatorKey", () => {
  it.each(["c:4", "c:32989758", "c:4294967295", "n:Valve", "n: padded name ", "n:c:4"])(
    "reads %j as a key",
    (text) => {
      expect(toCreatorKey(text)).toBe(text);
    },
  );

  it.each([
    "",
    "c:",
    "n:",
    "c:0",
    "c:04",
    "c:4294967296",
    "c:-1",
    "c:4x",
    "Valve",
    `n:${"x".repeat(201)}`,
    4,
    null,
  ])("reads %j as no key", (value) => {
    expect(toCreatorKey(value)).toBeUndefined();
  });
});

describe("makeCreator", () => {
  it("keys a creator with a clan ID by the ID first and the name second", () => {
    const creator = makeCreator({ name: "Valve", clan: clan(4) });
    expect(creator).toStrictEqual({
      name: "Valve",
      clan: 4,
      key: "c:4",
      keys: ["c:4", "n:Valve"],
    });
  });

  it("keys a creator without a clan ID by the exact name", () => {
    expect(makeCreator({ name: " Embark Studios" })).toStrictEqual({
      name: " Embark Studios",
      key: "n: Embark Studios",
      keys: ["n: Embark Studios"],
    });
  });

  it.each(["", "x".repeat(201)])("drops a creator named %j", (name) => {
    expect(makeCreator({ name })).toBeUndefined();
  });
});

describe("makeCreators", () => {
  it("keeps Steam's order and collapses a repeated key into its first entry", () => {
    const creators = makeCreators([
      { name: "B" },
      { name: "A", clan: clan(1) },
      { name: "B" },
      { name: "A again", clan: clan(1) },
    ]);
    expect(creators.map((creator) => creator.name)).toStrictEqual(["B", "A"]);
  });

  it("keeps the same name apart when one has a clan ID", () => {
    expect(makeCreators([{ name: "A" }, { name: "A", clan: clan(1) }])).toHaveLength(2);
  });

  it("keeps eight creators at most", () => {
    const inputs = Array.from({ length: 10 }, (_, index) => ({ name: `S${String(index)}` }));
    expect(makeCreators(inputs)).toHaveLength(8);
  });
});
