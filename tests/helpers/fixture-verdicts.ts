import { parseAppPage } from "../../src/core/detect/app-page";
import { GETITEMS_URL, parseGetItems } from "../../src/core/detect/getitems";
import { KIND_IDS } from "../../src/core/kinds/id";
import { KIND_BY_ID, KINDS } from "../../src/core/kinds/registry";
import type { AnyDisclosed, KindVerdicts } from "../../src/core/kinds/verdicts";
import kinds from "../fixtures/getitems/kinds.json";
import { appId, appIds } from "./app-ids";
import { APP_PAGES, type AppPageName } from "./app-page";
import { httpResult } from "./fake-http";
import { fixtureItems, getItemsResponse } from "./getitems";

/** The apps of the batch captured for the tag kinds (tests/fixtures/README.md). */
const CAPTURED = [3751950, 2807960, 1808500, 813230, 730, 570, 105600, 1245620, 1172470, 271590];

const captured = parseGetItems(
  appIds(...CAPTURED),
  httpResult(getItemsResponse(fixtureItems(kinds)), GETITEMS_URL),
  "english",
);

/** The verdicts GetItems gave for an app of the captured kinds batch. Throws for any other. */
export function capturedVerdicts(id: number): KindVerdicts {
  const found = captured.get(appId(id));
  if (found === undefined) {
    throw new TypeError(String(id));
  }
  return found;
}

/** The verdicts read from a captured English app page, with the URL it was served from. */
export function pageVerdicts(name: AppPageName, id: number): KindVerdicts {
  const doc = new DOMParser().parseFromString(APP_PAGES[name], "text/html");
  return parseAppPage(doc, `https://store.steampowered.com/app/${String(id)}/?l=english`);
}

/** The kinds a verdict list discloses, in registry order. */
export function disclosedIds(verdicts: KindVerdicts): readonly string[] {
  return KIND_IDS.filter((id) => verdicts[id].state === "disclosed");
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
