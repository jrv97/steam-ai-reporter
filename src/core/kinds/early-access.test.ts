import { describe, expect, it } from "vitest";
import { appId, appIds } from "../../../tests/helpers/app-ids";
import { httpResult } from "../../../tests/helpers/fake-http";
import {
  earlyAccessItem,
  getItemsResponse,
  storeItem,
  verdictOf,
} from "../../../tests/helpers/getitems";
import { earlyAccessVerdict, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { decodeVerdicts, encodeVerdicts } from "../cache/stored";
import { GETITEMS_URL, parseGetItems } from "../detect/getitems";
import { MAX_TEXT_LENGTH } from "../detect/getitems.schema";
import { UNKNOWN, type Verdict } from "../types";
import { EARLY_ACCESS_KIND, type EarlyAccessDisclosed } from "./early-access";
import { perKind } from "./registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "./verdicts";

const NOTE = "We ship early to hear from players.";
const RELEASED = 1731596424;

/** The disclosed verdict with only these details, as the kind builds it. */
function flagged(details: { note?: string; released?: number; } = {}): EarlyAccessDisclosed {
  const { note: _note, released: _released, ...bare } = earlyAccessVerdict();
  return { ...bare, ...details };
}

/** What the kind answers for an item with these keys over a plain one with `extra_details`. */
function fromItem(
  item: Readonly<Record<string, unknown>>,
  details: Readonly<Record<string, unknown>> = {},
): Verdict<EarlyAccessDisclosed> {
  return verdictOf(EARLY_ACCESS_KIND, details, item);
}

describe("EARLY_ACCESS_KIND.fromGetItems", () => {
  it.each<readonly [string, Verdict<EarlyAccessDisclosed>, EarlyAccessDisclosed]>([
    ["a flag alone", fromItem({ is_early_access: true }), flagged()],
    [
      "a note trimmed of its outer blanks, its inner line breaks kept",
      fromItem({ is_early_access: true }, {
        early_access: { why_bbcode: ` \r\n${NOTE}\r\nMore.\u200b ` },
      }),
      flagged({ note: `${NOTE}\r\nMore.` }),
    ],
    [
      "the release date",
      fromItem({ is_early_access: true, release: { steam_release_date: RELEASED } }),
      flagged({ released: RELEASED }),
    ],
    [
      "the note and the release date",
      fromItem(
        { is_early_access: true, release: { steam_release_date: RELEASED } },
        { early_access: { why_bbcode: NOTE } },
      ),
      flagged({ note: NOTE, released: RELEASED }),
    ],
  ])("is disclosed for a flag with %s", (_name, verdict, expected) => {
    expect(verdict).toStrictEqual(expected);
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>]>([
    ["no flag", {}, {}],
    ["a false flag", { is_early_access: false }, {}],
    [
      "no flag but the note and the release date a game keeps after early access",
      { release: { steam_release_date: RELEASED } },
      { early_access: { why_bbcode: NOTE } },
    ],
    [
      "a false flag beside a note",
      { is_early_access: false },
      { early_access: { why_bbcode: NOTE } },
    ],
  ])("is not disclosed for %s", (_name, item, details) => {
    expect(fromItem(item, details)).toStrictEqual(NOT_DISCLOSED);
  });

  it.each<readonly [string, unknown]>([
    ["text", "true"],
    ["a number", 1],
    ["null", null],
    ["a list", [true]],
  ])("is unknown malformed for a flag that is %s", (_name, flag) => {
    expect(fromItem({ is_early_access: flag })).toBe(UNKNOWN.malformed);
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["a note over the text limit", {
      early_access: { why_bbcode: "x".repeat(MAX_TEXT_LENGTH + 1) },
    }],
    ["a note that is no text", { early_access: { why_bbcode: 5 } }],
    ["a blank note", { early_access: { why_bbcode: " \r\n\u200b " } }],
    ["an early_access value that is no object", { early_access: "yes" }],
  ])("keeps the flag and drops the detail for %s", (_name, details) => {
    expect(fromItem({ is_early_access: true }, details)).toStrictEqual(flagged());
  });

  it.each<readonly [string, unknown]>([
    ["a negative time", { steam_release_date: -1 }],
    ["a fraction", { steam_release_date: 1.5 }],
    ["text", { steam_release_date: "1731596424" }],
    ["null", { steam_release_date: null }],
    ["a release section that is no object", "2024"],
  ])("keeps the flag and drops a release date that is %s", (_name, release) => {
    expect(fromItem({ is_early_access: true, release })).toStrictEqual(flagged());
  });
});

describe("EARLY_ACCESS_KIND over a parsed response", () => {
  const ID = appId(1);

  /** The kind's verdict for one item as parsed with these sections. */
  function parsed(item: unknown, sections: Parameters<typeof parseGetItems>[3]) {
    const result = httpResult(getItemsResponse([item]), GETITEMS_URL);
    return parseGetItems(appIds(1), result, "english", sections).get(ID)?.earlyaccess;
  }

  it("reads the release section: unknown unrequested while the request left it out", () => {
    const item = earlyAccessItem(1, { note: NOTE, released: RELEASED });
    expect(parsed(item, ["basic_info"])).toBe(UNKNOWN.unrequested);
    expect(parsed(item, ["basic_info", "release"])).toStrictEqual(
      earlyAccessVerdict({ note: NOTE, released: RELEASED }),
    );
    expect(EARLY_ACCESS_KIND.sections).toStrictEqual(["release"]);
  });

  it("leaves an item without extra_details unknown missing, flagged or not", () => {
    const item = storeItem(1, { extra_details: undefined, is_early_access: true });
    expect(parsed(item, ["basic_info", "release"])).toBe(UNKNOWN.missing);
  });

  it("is declared by the developer, so the card names no Valve source", () => {
    expect(EARLY_ACCESS_KIND.source).toBeUndefined();
  });
});

describe("EARLY_ACCESS_KIND in storage", () => {
  const T = 1_000_000_000_000;
  const of = (earlyaccess: KindVerdicts["earlyaccess"]): KindVerdicts => ({
    ...UNKNOWN_KINDS.missing,
    earlyaccess,
  });

  it.each<readonly [string, KindVerdicts["earlyaccess"]]>([
    ["a flag alone", flagged()],
    ["a note and a release date", flagged({ note: NOTE, released: RELEASED })],
    ["not disclosed", NOT_DISCLOSED],
    ["unknown missing", UNKNOWN.missing],
  ])("round trips %s", (_name, verdict) => {
    const verdicts = of(verdict);
    expect(decodeVerdicts(encodeVerdicts(verdicts, T))).toStrictEqual({ verdicts, time: T });
  });

  it("reads an entry without the latest update the app page added", () => {
    const entry = encodeVerdicts(of(earlyAccessVerdict({ updated: 1793121240 })), T);
    expect(decodeVerdicts(entry)?.verdicts.earlyaccess).toStrictEqual(earlyAccessVerdict());
  });

  it.each<readonly [string, Readonly<Record<string, unknown>>]>([
    ["an empty note", { note: "" }],
    ["a note that is no text", { note: 5 }],
    ["a negative release date", { released: -1 }],
    ["a release date with a fraction", { released: 1.5 }],
    ["a release date no date format can show", { released: 9_000_000_000_000 }],
  ])("discards an entry that holds %s, so the app is fetched again", (_name, fields) => {
    const kinds = {
      ...perKind(() => ({ state: "not-disclosed", source: "api" })),
      earlyaccess: { state: "disclosed", kind: "earlyaccess", source: "api", ...fields },
    };
    expect(decodeVerdicts({ time: T, kinds })).toBeUndefined();
  });
});
