import { parseAppPage } from "../../src/core/detect/app-page";
import { GETITEMS_URL, parseGetItems } from "../../src/core/detect/getitems";
import { KIND_BY_ID, KINDS } from "../../src/core/kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../../src/core/kinds/verdicts";
import type { AppId } from "../../src/core/types";
import kinds from "../fixtures/getitems/kinds.json";
import textItems from "../fixtures/getitems/text-cases.json";
import { appId, appIds } from "./app-ids";
import { APP_PAGES, type AppPageName } from "./app-page";
import { httpResult } from "./fake-http";
import { fixtureItems, getItemsResponse } from "./getitems";

/** The apps of the batch captured for the tag kinds (tests/fixtures/README.md). */
const CAPTURED = [
  3751950,
  2807960,
  1808500,
  813230,
  730,
  570,
  105600,
  1245620,
  1172470,
  271590,
  2514910,
  646570,
];

/** The apps of `text-cases.json`: a misleading legal notice and a long AI note. */
const TEXT_CASES = [2448570, 5466110];

const captured = parseGetItems(
  appIds(...CAPTURED),
  httpResult(getItemsResponse(fixtureItems(kinds)), GETITEMS_URL),
  "english",
  // What the default settings ask for: the base sections and Early Access's release dates.
  ["basic_info", "release"],
);

const textCases = parseGetItems(
  appIds(...TEXT_CASES),
  httpResult(getItemsResponse(fixtureItems(textItems)), GETITEMS_URL),
  "english",
);

function verdictsIn(batch: ReadonlyMap<AppId, KindVerdicts>, id: number): KindVerdicts {
  const found = batch.get(appId(id));
  if (found === undefined) {
    throw new TypeError(String(id));
  }
  return found;
}

/** The verdicts GetItems gave for an app of the captured kinds batch. Throws for any other. */
export function capturedVerdicts(id: number): KindVerdicts {
  return verdictsIn(captured, id);
}

/** The verdicts GetItems gave for an app of `text-cases.json`. Throws for any other. */
export function textCaseVerdicts(id: number): KindVerdicts {
  return verdictsIn(textCases, id);
}

/** The AI notes GetItems sent for an app of `text-cases.json`. Throws when it disclosed none. */
export function textCaseNotes(id: number): string {
  const { ai } = textCaseVerdicts(id);
  if (ai.state !== "disclosed") {
    throw new TypeError(String(id));
  }
  return ai.notes;
}

/** The verdicts read from a captured English app page, with the URL it was served from. */
export function pageVerdicts(name: AppPageName, id: number): KindVerdicts {
  const doc = new DOMParser().parseFromString(APP_PAGES[name], "text/html");
  return parseAppPage(doc, `https://store.steampowered.com/app/${String(id)}/?l=english`);
}

/** The disclosed verdicts of every kind, in registry order. */
export function disclosedList(verdicts: KindVerdicts): readonly AnyDisclosed[] {
  return KINDS.flatMap((kind) => {
    const verdict = verdicts[kind.id];
    return verdict.state === "disclosed" ? [verdict] : [];
  });
}

/** The disclosed verdicts of the kinds whose banner entry starts on, as the banner lists them. */
export function bannerList(verdicts: KindVerdicts): readonly AnyDisclosed[] {
  return disclosedList(verdicts).filter((verdict) => KIND_BY_ID[verdict.kind].defaults.banner);
}
