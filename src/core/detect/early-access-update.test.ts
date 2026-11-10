import { describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { pageLastUpdate, withLastUpdate } from "./early-access-update";

const UPDATED = make.fixture.updated;
const SCRIPT = make.page.lastUpdateScript;

/** A fresh `rtime`: an instant in Unix seconds. */
function rtime(): number {
  return Math.floor(make.time() / 1000);
}

/** A document holding these inline scripts, then any extra body markup. */
function pageOf(scripts: readonly string[], body = ""): Document {
  const markup = scripts.map((text) => `<script>${text}</script>`).join("") + body;
  return new DOMParser().parseFromString(`<body>${markup}</body>`, "text/html");
}

/** An inline script holding this `last_update_event` JSON. */
function event(json: string): string {
  return `{"last_update_event":${json}}`;
}

describe("pageLastUpdate", () => {
  const [first, second, only, afterFields, other] = [rtime(), rtime(), rtime(), rtime(), rtime()];

  it.each<readonly [string, Document, number | undefined]>([
    ["the page's own embed", pageOf([SCRIPT]), UPDATED],
    ["a later script, after one without the marker", pageOf(["var a = 1;", SCRIPT]), UPDATED],
    [
      "the first script that holds a time",
      pageOf([
        event('{"event_gid":"1"}'),
        event(`{"rtime":${String(first)},"event_gid":"1"}`),
        event(`{"rtime":${String(second)}}`),
      ]),
      first,
    ],
    ["a time that is the only field", pageOf([event(`{"rtime":${String(only)}}`)]), only],
    [
      "a time after other fields of the event",
      pageOf([event(`{"a":"b","rtime":${String(afterFields)}}`)]),
      afterFields,
    ],
    ["a page without the event", pageOf(['{"EventWebRowEmbed":{}}']), undefined],
    ["an event that is null", pageOf([event("null")]), undefined],
    ["an event without a time", pageOf([event('{"event_gid":"1"}')]), undefined],
    [
      "a time of another object after the event",
      pageOf([`{"last_update_event":{},"x":{"rtime":${String(other)}}}`]),
      undefined,
    ],
    [
      "a time inside a nested object",
      pageOf([event(`{"x":{"rtime":${String(other)}}}`)]),
      undefined,
    ],
    ["a time written as text", pageOf([event(`{"rtime":"${String(other)}"}`)]), undefined],
    ["a time past ten digits", pageOf([event(`{"rtime":${String(other)}1}`)]), undefined],
    ["a negative time", pageOf([event(`{"rtime":-${String(other)}}`)]), undefined],
    [
      "a script that loads from a source",
      new DOMParser().parseFromString(
        `<body><script src="${make.text.url()}">${SCRIPT}</script></body>`,
        "text/html",
      ),
      undefined,
    ],
    ["the marker in the page text, outside a script", pageOf([], `<p>${SCRIPT}</p>`), undefined],
    ["a page with no script", pageOf([]), undefined],
  ])("reads %s", (_name, doc, time) => {
    expect(pageLastUpdate(doc)).toBe(time);
  });
});

describe("withLastUpdate", () => {
  const own = make.verdict.disclosed("earlyaccess");
  const disclosed = make.verdicts({ earlyaccess: own });
  const withTime = pageOf([SCRIPT]);

  it("adds the page's time to the game's own disclosure and leaves the other kinds alone", () => {
    const result = withLastUpdate(disclosed, withTime);
    expect(result.earlyaccess).toStrictEqual({ ...own, updated: UPDATED });
    expect(result.ai).toBe(disclosed.ai);
    expect(disclosed.earlyaccess).toStrictEqual(make.verdict.disclosed("earlyaccess"));
  });

  it.each([
    [
      "a game not in early access",
      { ...disclosed, earlyaccess: make.verdict.notDisclosed() },
      withTime,
    ],
    ["an unknown answer", { ...disclosed, earlyaccess: make.verdict.unknown() }, withTime],
    [
      "a demo's disclosure lent by its full game",
      { ...disclosed, earlyaccess: make.verdict.lent(own) },
      withTime,
    ],
    ["a page without the time", disclosed, pageOf([])],
  ])("returns the same verdicts for %s", (_name, verdicts, doc) => {
    expect(withLastUpdate(verdicts, doc)).toBe(verdicts);
  });

  it("reads the page only for a disclosed verdict of the game itself", () => {
    const read = vi.spyOn(withTime, "querySelectorAll");
    const others = [make.verdict.notDisclosed(), make.verdict.unknown(), make.verdict.lent(own)];
    for (const earlyaccess of others) {
      withLastUpdate({ ...disclosed, earlyaccess }, withTime);
    }
    expect(read).not.toHaveBeenCalled();
    withLastUpdate(disclosed, withTime);
    expect(read).toHaveBeenCalledOnce();
  });
});
