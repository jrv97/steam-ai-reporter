import type { KindId } from "../../src/core/kinds/id";
import type { KindSettings } from "../../src/core/kinds/kind-settings";
import {
  applyPatch,
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsPatch,
} from "../../src/core/settings/settings";
import {
  NOT_DISCLOSED,
  UNKNOWN,
  type UnknownReason,
  type VerdictSource,
} from "../../src/core/types";
import { appId } from "./app-ids";
import {
  APP_PAGES,
  type AppPageName,
  DEV_ROWS,
  LAST_UPDATE_SCRIPT,
  SUMMARY_BOX,
  USER_TAGS,
  withDescriptionColumn,
  withLastUpdateScript,
  withSummaryBox,
} from "./app-page";
import {
  BACKUP_TIME,
  backupContents,
  backupText,
  creatorEntries,
  gameEntries,
  pickedFile,
} from "./backup";
import { bannerCreator, basicInfo, creatorNote, creatorOf, creatorsFor, keyOf } from "./creators";
import { BASE_ID, DLC_PATH, dlcPage } from "./dlc-page";
import { httpResult } from "./fake-http";
import {
  EARLY_ACCESS_RELEASED,
  FIXTURE_APPS,
  FIXTURE_CLANS,
  LAST_UPDATE_RTIME,
  SEARCH_ROWS,
  SUGGESTIONS,
} from "./fixture-ids";
import { capturedVerdicts, pageVerdicts } from "./fixture-verdicts";
import {
  demoItem,
  disclosedItem,
  earlyAccessItem,
  featuredItem,
  fixtureItems,
  getItemsResponse,
  getItemsRoute,
  invalidItem,
  itemAs,
  parsedItem,
  ratedItem,
  storeItem,
} from "./getitems";
import { ignoredSets } from "./ignored";
import { PACKAGE_PATH, packagePage } from "./package-page";
import {
  freshAppId,
  freshAppIds,
  freshChipText,
  freshColor,
  freshDuration,
  freshName,
  freshNote,
  freshService,
  freshTime,
  freshUrl,
} from "./sequence";
import { plainKinds, withChipText, withKind } from "./settings";
import {
  junkValues,
  noGames,
  storedAllowEntry,
  v1Allow,
  v1CustomSettings,
  v1Settings,
} from "./stored-raw";
import { searchRow, SURFACES } from "./surfaces";
import {
  demoOf,
  disclosed,
  disclosedKinds,
  dlcOf,
  FULL_DISCLOSED,
  lent,
  uniformVerdicts,
  verdictsWith,
} from "./verdicts";

/** Settings from the defaults, with `patch` applied. */
function settings(patch: SettingsPatch = {}): Settings {
  return applyPatch(DEFAULT_SETTINGS, patch);
}

/**
 * The only source of test data. Primitives come from one sequence, so each call gives a fresh,
 * unique value; builders take overrides for the fields a test cares about. Values bound to the
 * captured fixtures sit under `fixture`.
 */
export const make = {
  /** A fresh app ID that no fixture holds. */
  appId: freshAppId,
  /** `count` fresh app IDs. */
  appIds: freshAppIds,
  text: { name: freshName, note: freshNote, service: freshService, url: freshUrl },
  /** A fresh instant in milliseconds since the epoch, later than the one before. */
  time: freshTime,
  /** A fresh span in milliseconds. */
  duration: freshDuration,
  /** A fresh tag color in normal form. */
  color: freshColor,
  /** A fresh chip text that fits every chip text field. */
  chipText: freshChipText,
  item: {
    store: storeItem,
    disclosed: disclosedItem,
    rated: ratedItem,
    featured: featuredItem,
    earlyAccess: earlyAccessItem,
    demo: demoItem,
    invalid: invalidItem,
    response: getItemsResponse,
    route: getItemsRoute,
    parsed: parsedItem,
    creators: basicInfo,
  },
  http: { result: httpResult },
  verdict: {
    disclosed,
    notDisclosed: (source: VerdictSource = "api") => NOT_DISCLOSED[source],
    unknown: (reason: UnknownReason = "missing") => UNKNOWN[reason],
    lent,
  },
  verdicts: Object.assign(verdictsWith, {
    full: () => FULL_DISCLOSED,
    uniform: uniformVerdicts,
    only: disclosedKinds,
    demoOf,
    dlcOf,
  }),
  settings: Object.assign(settings, {
    kind: (id: KindId, patch: Partial<KindSettings>, base: Settings = DEFAULT_SETTINGS) =>
      withKind(base, id, patch),
    chipText: (
      texts: Parameters<typeof withChipText>[1],
      base: Settings = DEFAULT_SETTINGS,
    ) => withChipText(base, texts),
  }),
  allow: { games: gameEntries, creators: creatorEntries },
  backup: { time: BACKUP_TIME, contents: backupContents, text: backupText, file: pickedFile },
  creator: {
    of: creatorOf,
    key: keyOf,
    forItem: creatorsFor,
    banner: bannerCreator,
    note: creatorNote,
  },
  ignored: ignoredSets,
  page: {
    app: (name: AppPageName): string => APP_PAGES[name],
    surface: (name: keyof typeof SURFACES): string => SURFACES[name],
    withDescriptionColumn,
    withLastUpdateScript,
    withSummaryBox,
    lastUpdateScript: LAST_UPDATE_SCRIPT,
    summaryBox: SUMMARY_BOX,
    devRows: DEV_ROWS,
    userTags: USER_TAGS,
    dlc: dlcPage,
    dlcPath: DLC_PATH,
    package: packagePage,
    packagePath: PACKAGE_PATH,
    searchRow,
  },
  fixture: {
    app: FIXTURE_APPS,
    dlcBase: appId(BASE_ID),
    searchRows: SEARCH_ROWS,
    suggestions: SUGGESTIONS,
    clan: FIXTURE_CLANS,
    released: EARLY_ACCESS_RELEASED,
    updated: LAST_UPDATE_RTIME,
    items: fixtureItems,
    itemAs,
    verdicts: capturedVerdicts,
    pageVerdicts,
  },
  raw: {
    v1Settings,
    v1CustomSettings,
    v1Allow,
    allowEntry: storedAllowEntry,
    noGames,
    junk: junkValues,
    v2Kinds: plainKinds,
  },
} as const;
