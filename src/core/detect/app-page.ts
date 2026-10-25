import { steamLanguage } from "../i18n/locale";
import type { KindId } from "../kinds/id";
import { KINDS } from "../kinds/registry";
import {
  isKindVerdicts,
  type KindVerdict,
  type KindVerdicts,
  UNKNOWN_KINDS,
} from "../kinds/verdicts";
import type { Http, HttpResult } from "../ports";
import type { Detector } from "../ports";
import { type AppId, UNKNOWN } from "../types";
import { trimNotes } from "./notes";

// Detection from the English app page (ADR 0001, the fallback when GetItems cannot answer). Rules
// from rq6: S7 for the redirects and the duplicated block ID, S2 for the age gate.

export const APP_PAGE_ORIGIN = "https://store.steampowered.com";

const NAME_SELECTOR = "#appHubAppName";
const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const APP_PATH = /^\/app\/\d+(?:\/|$)/;

/** `/app/<id>` is the only path of an app page; `/agecheck/`, `/login/` and `/` are gates. */
function isAppPage(finalUrl: string): boolean {
  try {
    return APP_PATH.test(new URL(finalUrl).pathname);
  } catch {
    // An unparsable URL is not an app page.
    return false;
  }
}

/**
 * The verdicts an English app page gives. `finalUrl` is where the request ended after redirects.
 * Every kind is unknown `gated` when that is no app page, or the page has no app name.
 * A kind that cannot be read from the page is unknown `missing`.
 */
export function parseAppPage(doc: Document, finalUrl: string): KindVerdicts {
  if (!isAppPage(finalUrl)) {
    return UNKNOWN_KINDS.gated;
  }
  const name = trimNotes(doc.querySelector(NAME_SELECTOR)?.textContent ?? "");
  if (name === "") {
    return UNKNOWN_KINDS.gated;
  }
  const verdicts: Partial<Record<KindId, KindVerdict>> = {};
  for (const kind of KINDS) {
    verdicts[kind.id] = kind.fromAppPage?.(doc, name) ?? UNKNOWN.missing;
  }
  return isKindVerdicts(verdicts) ? verdicts : UNKNOWN_KINDS.error;
}

/**
 * The verdicts of the app page the user is on, with no request. It answers only when the page is
 * English, because the notes of a localized page would be labelled as English; otherwise undefined.
 */
export function parseLiveAppPage(doc: Document, pageUrl: string): KindVerdicts | undefined {
  return steamLanguage(doc.documentElement.lang) === "english"
    ? parseAppPage(doc, pageUrl)
    : undefined;
}

export function appPageUrl(id: AppId): string {
  return `${APP_PAGE_ORIGIN}/app/${id}/?l=english`;
}

function verdictsOf(
  result: HttpResult,
  parse: (body: string, url: string) => KindVerdicts,
): KindVerdicts {
  switch (result.kind) {
    case "response":
      if (result.status === HTTP_TOO_MANY_REQUESTS) {
        return UNKNOWN_KINDS["rate-limited"];
      }
      return result.status === HTTP_OK ? parse(result.body, result.url) : UNKNOWN_KINDS.error;
    case "failed":
      return UNKNOWN_KINDS.error;
    case "withheld":
      return UNKNOWN_KINDS["rate-limited"];
  }
}

/** The app page the visitor has open: its verdicts are in the document, so no request is needed. */
export interface OpenPage {
  readonly id: AppId;
  readonly verdicts: KindVerdicts;
}

/**
 * The HTML detector: one request per app, one after another, except for the open page, which it
 * reads from the document. Spacing, the per-page budget and the breaker come from the `Http` it is
 * given (a throttling decorator) or from a chain around it.
 */
export function createAppPageDetector(http: Http, open?: OpenPage): Detector {
  const parser = new DOMParser();
  const parse = (body: string, url: string): KindVerdicts =>
    parseAppPage(parser.parseFromString(body, "text/html"), url);
  return {
    async detect(ids: readonly AppId[]): Promise<ReadonlyMap<AppId, KindVerdicts>> {
      const verdicts = new Map<AppId, KindVerdicts>();
      for (const id of new Set(ids)) {
        if (id === open?.id) {
          verdicts.set(id, open.verdicts);
          continue;
        }
        // Sequential on purpose: one request in flight (rule 13).
        verdicts.set(id, verdictsOf(await http.get(appPageUrl(id)), parse));
      }
      return verdicts;
    },
  };
}
