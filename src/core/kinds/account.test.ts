import { describe, expect, it } from "vitest";
import { verdictOf } from "../../../tests/helpers/getitems";
import { UNKNOWN } from "../types";
import { ACCOUNT_KIND } from "./account";

function fromDetails(details: Readonly<Record<string, unknown>>) {
  return verdictOf(ACCOUNT_KIND, details);
}

describe("ACCOUNT_KIND.fromGetItems", () => {
  it("is disclosed with the developer's text and the link to Steam", () => {
    const verdict = fromDetails({
      user_account_third_party: "Ubisoft Account",
      user_account_third_party_link_to_steam: true,
    });
    expect(verdict).toStrictEqual({
      state: "disclosed",
      kind: "account",
      source: "api",
      text: "Ubisoft Account",
      linksToSteam: true,
    });
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["an absent", {}],
    ["a false", { user_account_third_party_link_to_steam: false }],
    ["a text", { user_account_third_party_link_to_steam: "yes" }],
    ["a number", { user_account_third_party_link_to_steam: 1 }],
    ["a list", { user_account_third_party_link_to_steam: [] }],
  ])("stays disclosed and reads %s link flag as no link", (_name, link) => {
    expect(fromDetails({ user_account_third_party: "EA", ...link })).toMatchObject({
      state: "disclosed",
      linksToSteam: false,
    });
  });

  it.each([
    ["markup and spacing", " <i>Rockstar</i> Games\n"],
    ["4,000 characters", "x".repeat(4000)],
  ])("keeps the text verbatim, %s included", (_name, text) => {
    expect(fromDetails({ user_account_third_party: text })).toMatchObject({ text });
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["no text", {}],
    ["empty text", { user_account_third_party: "" }],
    ["blank text", { user_account_third_party: "\n " }],
    ["a link flag alone", { user_account_third_party_link_to_steam: true }],
    ["a malformed link flag alone", { user_account_third_party_link_to_steam: 1 }],
  ])("is not disclosed for %s", (_name, details) => {
    expect(fromDetails(details)).toStrictEqual({ state: "not-disclosed", source: "api" });
  });

  it("is unknown malformed when a field it reads is malformed, and only then", () => {
    expect(fromDetails({ user_account_third_party: 7 })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ user_account_third_party: "x".repeat(4001) })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ user_account_third_party: "EA", anticheat: 5 }).state).toBe("disclosed");
  });
});
