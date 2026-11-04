import type { KindVerdicts } from "../kinds/verdicts";

// The open app page embeds the time of the developer's latest community event of the update type
// (ADR 0018). It sits in an inline script as `"last_update_event":{"rtime":<unix seconds>,...}`.

const MARKER = "last_update_event";
const UPDATE_TIME = /"last_update_event":\{[^{}]*?"rtime":(\d{1,10})\b/;

/** The time in Unix seconds of the page's latest update post, or undefined when it has none. */
export function pageLastUpdate(doc: Document): number | undefined {
  for (const script of doc.querySelectorAll("script:not([src])")) {
    const text = script.textContent;
    if (!text.includes(MARKER)) {
      continue;
    }
    const time = UPDATE_TIME.exec(text)?.[1];
    if (time !== undefined) {
      return Number(time);
    }
  }
  return undefined;
}

/**
 * The verdicts with the page's latest update added to the game's own Early Access disclosure; the
 * same object when the game is not in Early Access, the disclosure is a demo's lent full-game one,
 * or the page has no update time. The page is read only for a disclosed verdict.
 */
export function withLastUpdate(verdicts: KindVerdicts, doc: Document): KindVerdicts {
  const own = verdicts.earlyaccess;
  if (own.state !== "disclosed" || own.fullGame === true) {
    return verdicts;
  }
  const updated = pageLastUpdate(doc);
  return updated === undefined ? verdicts : { ...verdicts, earlyaccess: { ...own, updated } };
}
