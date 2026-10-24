import { steamLanguage } from "../i18n/locale";
import { type KindVerdicts, UNKNOWN_KINDS } from "../kinds/verdicts";
import type { Http, HttpResult } from "../ports";
import {
  type AppId,
  type Detector,
  type NotDisclosedVerdict,
  UNKNOWN,
  type Verdict,
} from "../types";
import { trimNotes } from "./notes";

// Detection from the English app page (ADR 0001, the fallback when GetItems cannot answer). Rules
// from rq6: S7 for the redirects and the duplicated block ID, S2 for the age gate.

export const APP_PAGE_ORIGIN = "https://store.steampowered.com";

/** Steam's own heading of the AI block; the mature content block uses the same element ID. */
const DISCLOSURE_HEADING = "AI Generated Content Disclosure";
const BLOCK_SELECTOR = "#game_area_content_descriptors";
const NAME_SELECTOR = "#appHubAppName";
const NOTES_SELECTOR = "p > i";
const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const APP_PATH = /^\/app\/\d+(?:\/|$)/;

const NOT_DISCLOSED: NotDisclosedVerdict = { state: "not-disclosed", source: "html" };

/** `/app/<id>` is the only path of an app page; `/agecheck/`, `/login/` and `/` are gates. */
function isAppPage(finalUrl: string): boolean {
  try {
    return APP_PATH.test(new URL(finalUrl).pathname);
  } catch {
    // An unparsable URL is not an app page.
    return false;
  }
}

/** The notes of the AI block among the blocks sharing the ID, or undefined when there is none. */
function disclosureNotes(doc: Document): string | undefined {
  for (const block of doc.querySelectorAll(BLOCK_SELECTOR)) {
    if (block.querySelector("h2")?.textContent.trim() === DISCLOSURE_HEADING) {
      return trimNotes(block.querySelector(NOTES_SELECTOR)?.textContent ?? "");
    }
  }
  return undefined;
}

/**
 * The verdict an English app page gives. `finalUrl` is where the request ended up after redirects:
 * unknown `gated` when that is not an app page, or when the page has no app name (age gate, sign-in
 * and home redirects, rq6 S2 and S7). A page without the AI block, or with an empty one, is not
 * disclosed. Notes keep their line breaks: each `<br>` is followed by a newline in the source.
 */
export function parseAppPage(doc: Document, finalUrl: string): Verdict {
  if (!isAppPage(finalUrl)) {
    return UNKNOWN.gated;
  }
  const name = trimNotes(doc.querySelector(NAME_SELECTOR)?.textContent ?? "");
  if (name === "") {
    return UNKNOWN.gated;
  }
  const notes = disclosureNotes(doc);
  if (notes === undefined || notes === "") {
    return NOT_DISCLOSED;
  }
  return { state: "disclosed", notes, language: "english", source: "html", name };
}

/**
 * The page only carries the AI block, so the AI kind gets its verdict and the other kinds share
 * the page's unknown reason, or are unknown `missing` when the page did answer.
 */
function aiVerdicts(verdict: Verdict): KindVerdicts {
  const rest = UNKNOWN_KINDS[verdict.state === "unknown" ? verdict.reason : "missing"];
  return { ...rest, ai: verdict };
}

/**
 * The verdicts of the app page the user is on, with no request. It answers only when the page is
 * English, because the notes of a localized page would be labelled as English; otherwise undefined.
 */
export function parseLiveAppPage(doc: Document, pageUrl: string): KindVerdicts | undefined {
  return steamLanguage(doc.documentElement.lang) === "english"
    ? aiVerdicts(parseAppPage(doc, pageUrl))
    : undefined;
}

export function appPageUrl(id: AppId): string {
  return `${APP_PAGE_ORIGIN}/app/${id}/?l=english`;
}

function verdictOf(result: HttpResult, parse: (body: string, url: string) => Verdict): Verdict {
  switch (result.kind) {
    case "response":
      if (result.status === HTTP_TOO_MANY_REQUESTS) {
        return UNKNOWN["rate-limited"];
      }
      return result.status === HTTP_OK ? parse(result.body, result.url) : UNKNOWN.error;
    case "failed":
      return UNKNOWN.error;
    case "withheld":
      return UNKNOWN["rate-limited"];
  }
}

/**
 * The HTML detector: one request per app, one after another. Spacing, the per-page budget and the
 * breaker come from the `Http` it is given (a throttling decorator) or from a chain around it.
 */
export function createAppPageDetector(http: Http): Detector {
  const parser = new DOMParser();
  const parse = (body: string, url: string): Verdict =>
    parseAppPage(parser.parseFromString(body, "text/html"), url);
  return {
    async detect(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, KindVerdicts>> {
      const verdicts = new Map<AppId, KindVerdicts>();
      for (const id of new Set(ids)) {
        // Sequential on purpose: one request in flight (rule 13).
        verdicts.set(id, aiVerdicts(verdictOf(await http.get(appPageUrl(id)), parse)));
      }
      return verdicts;
    },
  };
}
