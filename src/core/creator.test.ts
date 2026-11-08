import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { make } from "../../tests/helpers/factory";
import { ClanIdSchema, makeCreator, makeCreators, toCreatorKey } from "./creator";

/** A fresh clan ID as the creator schema brands it. */
const freshClan = () => v.parse(ClanIdSchema, make.creator.clan());

describe("toCreatorKey", () => {
  it.each(make.creator.keyTexts())("reads %j as a key", (text) => {
    expect(toCreatorKey(text)).toBe(text);
  });

  it.each([...make.creator.badKeyTexts(), ...make.raw.junk()])("reads %j as no key", (value) => {
    expect(toCreatorKey(value)).toBeUndefined();
  });
});

describe("makeCreator", () => {
  it("keys a creator with a clan ID by the ID first and the name second", () => {
    const name = make.text.creator();
    const clan = freshClan();
    expect(makeCreator({ name, clan })).toStrictEqual({
      name,
      clan,
      key: `c:${String(clan)}`,
      keys: [`c:${String(clan)}`, `n:${name}`],
    });
  });

  it("keys a creator without a clan ID by the exact name", () => {
    const name = ` ${make.text.creator()}`;
    expect(makeCreator({ name })).toStrictEqual({ name, key: `n:${name}`, keys: [`n:${name}`] });
  });

  it.each(make.creator.badNames())("drops a creator named %j", (name) => {
    expect(makeCreator({ name })).toBeUndefined();
  });
});

describe("makeCreators", () => {
  it("keeps Steam's order and collapses a repeated key into its first entry", () => {
    const [named, clanned] = [make.text.creator(), make.text.creator()] as const;
    const clan = freshClan();
    const creators = makeCreators([
      { name: named },
      { name: clanned, clan },
      { name: named },
      { name: make.text.creator(), clan },
    ]);
    expect(creators.map((creator) => creator.name)).toStrictEqual([named, clanned]);
  });

  it("keeps the same name apart when one has a clan ID", () => {
    const name = make.text.creator();
    expect(makeCreators([{ name }, { name, clan: freshClan() }])).toHaveLength(2);
  });

  it("keeps eight creators at most", () => {
    const inputs = Array.from({ length: 10 }, () => ({ name: make.text.creator() }));
    expect(makeCreators(inputs)).toHaveLength(8);
  });
});
