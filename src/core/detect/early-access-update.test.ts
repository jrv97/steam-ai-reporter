import { describe, expect, it, vi } from "vitest";
import { LAST_UPDATE_SCRIPT } from "../../../tests/helpers/app-page";
import { earlyAccessVerdict, lent, NOT_DISCLOSED } from "../../../tests/helpers/verdicts";
import { UNKNOWN_KINDS } from "../kinds/verdicts";
import { UNKNOWN } from "../types";
import { pageLastUpdate, withLastUpdate } from "./early-access-update";

const UPDATED = 1793121240;

/** A document holding these inline scripts, then any extra body markup. */
function pageOf(scripts: readonly string[], body = ""): Document {
  const markup = scripts.map((text) => `<script>${text}</script>`).join("") + body;
  return new DOMParser().parseFromString(`<body>${markup}</body>`, "text/html");
}

describe("pageLastUpdate", () => {
  it.each<readonly [string, Document, number | undefined]>([
    ["the page's own embed", pageOf([LAST_UPDATE_SCRIPT]), UPDATED],
    [
      "a later script, after one without the marker",
      pageOf(["var a = 1;", LAST_UPDATE_SCRIPT]),
      UPDATED,
    ],
    [
      "the first script that holds a time",
      pageOf([
        '{"last_update_event":{"event_gid":"1"}}',
        '{"last_update_event":{"rtime":11,"event_gid":"1"}}',
        '{"last_update_event":{"rtime":22}}',
      ]),
      11,
    ],
    ["a time that is the only field", pageOf(['{"last_update_event":{"rtime":5}}']), 5],
    [
      "a time after other fields of the event",
      pageOf(['{"last_update_event":{"a":"b","rtime":7}}']),
      7,
    ],
    ["a page without the event", pageOf(['{"EventWebRowEmbed":{}}']), undefined],
    ["an event that is null", pageOf(['{"last_update_event":null}']), undefined],
    ["an event without a time", pageOf(['{"last_update_event":{"event_gid":"1"}}']), undefined],
    [
      "a time of another object after the event",
      pageOf(['{"last_update_event":{},"x":{"rtime":9}}']),
      undefined,
    ],
    [
      "a time inside a nested object",
      pageOf(['{"last_update_event":{"x":{"rtime":9}}}']),
      undefined,
    ],
    ["a time written as text", pageOf(['{"last_update_event":{"rtime":"5"}}']), undefined],
    ["a time past ten digits", pageOf(['{"last_update_event":{"rtime":12345678901}}']), undefined],
    ["a negative time", pageOf(['{"last_update_event":{"rtime":-5}}']), undefined],
    [
      "a script that loads from a source",
      new DOMParser().parseFromString(
        `<body><script src="/x.js">${LAST_UPDATE_SCRIPT}</script></body>`,
        "text/html",
      ),
      undefined,
    ],
    [
      "the marker in the page text, outside a script",
      pageOf([], `<p>${LAST_UPDATE_SCRIPT}</p>`),
      undefined,
    ],
    ["a page with no script", pageOf([]), undefined],
  ])("reads %s", (_name, doc, time) => {
    expect(pageLastUpdate(doc)).toBe(time);
  });
});

describe("withLastUpdate", () => {
  const disclosed = { ...UNKNOWN_KINDS.missing, earlyaccess: earlyAccessVerdict() };
  const withTime = pageOf([LAST_UPDATE_SCRIPT]);

  it("adds the page's time to the game's own disclosure and leaves the other kinds alone", () => {
    const result = withLastUpdate(disclosed, withTime);
    expect(result.earlyaccess).toStrictEqual(earlyAccessVerdict({ updated: UPDATED }));
    expect(result.ai).toBe(disclosed.ai);
    expect(disclosed.earlyaccess).toStrictEqual(earlyAccessVerdict());
  });

  it.each([
    ["a game not in early access", { ...disclosed, earlyaccess: NOT_DISCLOSED }, withTime],
    ["an unknown answer", { ...disclosed, earlyaccess: UNKNOWN.missing }, withTime],
    ["a demo's lent disclosure of its full game", {
      ...disclosed,
      earlyaccess: lent(earlyAccessVerdict()),
    }, withTime],
    ["a page without the time", disclosed, pageOf([])],
  ])("returns the same verdicts for %s", (_name, verdicts, doc) => {
    expect(withLastUpdate(verdicts, doc)).toBe(verdicts);
  });

  it("reads the page only for a disclosed verdict of the game itself", () => {
    const read = vi.spyOn(withTime, "querySelectorAll");
    for (const earlyaccess of [NOT_DISCLOSED, UNKNOWN.missing, lent(earlyAccessVerdict())]) {
      withLastUpdate({ ...disclosed, earlyaccess }, withTime);
    }
    expect(read).not.toHaveBeenCalled();
    withLastUpdate(disclosed, withTime);
    expect(read).toHaveBeenCalledOnce();
  });
});
