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

  it("reads an absent or false link flag as no link", () => {
    for (const link of [{}, { user_account_third_party_link_to_steam: false }]) {
      expect(fromDetails({ user_account_third_party: "Battle.net Account", ...link }))
        .toMatchObject(
          { linksToSteam: false },
        );
    }
  });

  it("keeps the text verbatim, markup and spacing included", () => {
    const text = " <i>Rockstar</i> Games\n";
    expect(fromDetails({ user_account_third_party: text })).toMatchObject({ text });
  });

  it("is not disclosed when the text is absent or holds only blanks, link flag or not", () => {
    const none = { state: "not-disclosed", source: "api" };
    expect(fromDetails({})).toStrictEqual(none);
    expect(fromDetails({ user_account_third_party: "" })).toStrictEqual(none);
    expect(fromDetails({ user_account_third_party: "\n " })).toStrictEqual(none);
    expect(fromDetails({ user_account_third_party_link_to_steam: true })).toStrictEqual(none);
  });

  it("is unknown malformed when a field it reads is malformed, and only then", () => {
    expect(fromDetails({ user_account_third_party: 7 })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ user_account_third_party: "x".repeat(4001) })).toBe(UNKNOWN.malformed);
    expect(fromDetails({ user_account_third_party: "EA", anticheat: 5 }).state).toBe("disclosed");
  });

  it("allows 4,000 characters of text", () => {
    const text = "x".repeat(4000);
    expect(fromDetails({ user_account_third_party: text })).toMatchObject({ text });
  });

  it("stays disclosed, with no link, when the link flag is malformed", () => {
    for (const link of ["yes", 1, []]) {
      const verdict = fromDetails({
        user_account_third_party: "EA",
        user_account_third_party_link_to_steam: link,
      });
      expect(verdict).toMatchObject({ state: "disclosed", linksToSteam: false });
    }
  });

  it("is not disclosed on a malformed link flag alone", () => {
    expect(fromDetails({ user_account_third_party_link_to_steam: 1 }).state).toBe("not-disclosed");
  });
});
