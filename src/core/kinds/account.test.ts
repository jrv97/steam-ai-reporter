import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { verdictOf } from "../../../tests/helpers/getitems";
import { ACCOUNT_KIND } from "./account";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(ACCOUNT_KIND, details);
}

describe("ACCOUNT_KIND.fromGetItems", () => {
  it("is disclosed with the developer's text and the link to Steam", () => {
    const text = make.text.service();
    const verdict = fromDetails({
      user_account_third_party: text,
      user_account_third_party_link_to_steam: true,
    });
    expect(verdict).toStrictEqual(make.verdict.disclosed("account", { text, linksToSteam: true }));
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["an absent", {}],
    ["a false", { user_account_third_party_link_to_steam: false }],
    ["a text", { user_account_third_party_link_to_steam: "yes" }],
    ["a number", { user_account_third_party_link_to_steam: 1 }],
    ["a list", { user_account_third_party_link_to_steam: [] }],
  ])("stays disclosed and reads %s link flag as no link", (_name, link) => {
    const text = make.text.service();
    expect(fromDetails({ user_account_third_party: text, ...link })).toStrictEqual(
      make.verdict.disclosed("account", { text, linksToSteam: false }),
    );
  });

  it.each<readonly [string, () => string]>([
    ["markup and spacing", () => ` ${make.text.markup()}\n`],
    ["4,000 characters", () => "x".repeat(4000)],
  ])("keeps the text verbatim, %s included", (_name, textOf) => {
    const text = textOf();
    expect(fromDetails({ user_account_third_party: text })).toMatchObject({ text });
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no text", {}],
    ["empty text", { user_account_third_party: "" }],
    ["blank text", { user_account_third_party: "\n " }],
    ["a link flag alone", { user_account_third_party_link_to_steam: true }],
    ["a malformed link flag alone", { user_account_third_party_link_to_steam: 1 }],
  ])("is not disclosed for %s", (_name, details) => {
    expect(fromDetails(details)).toStrictEqual(make.verdict.notDisclosed());
  });

  it.each<readonly [string, unknown]>([
    ["a number", 7],
    ["text over 4,000 characters", "x".repeat(4001)],
  ])("is unknown malformed for text that is %s", (_name, text) => {
    expect(fromDetails({ user_account_third_party: text })).toBe(make.verdict.unknown("malformed"));
  });

  it("ignores a malformed field of another kind", () => {
    const details = { user_account_third_party: make.text.service(), anticheat: 5 };
    expect(fromDetails(details).state).toBe("disclosed");
  });
});
