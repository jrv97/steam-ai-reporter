import type { KindId } from "../../src/core/kinds/id";
import type { FacetId } from "../../src/core/kinds/kind";
import type { KindSettings, TaggedFacets } from "../../src/core/kinds/kind-settings";
import type { KindVerdicts } from "../../src/core/kinds/verdicts";
import type { LoadProgress } from "../../src/core/progress";
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
  clanRow,
  creatorEntries,
  gameEntries,
  gameRow,
  nameRow,
  pickedFile,
  SAMPLE_CONFIG,
  unreadableFile,
} from "./backup";
import {
  badCreatorKeyTexts,
  badCreatorNames,
  bannerCreator,
  basicInfo,
  creatorKeyTexts,
  creatorNote,
  creatorOf,
  creatorsFor,
  keyOf,
} from "./creators";
import { BASE_ID, DLC_PATH, dlcPage } from "./dlc-page";
import { httpResult } from "./fake-http";
import { tabIds } from "./fake-tabs";
import {
  EARLY_ACCESS_RELEASED,
  FIXTURE_APPS,
  FIXTURE_CLANS,
  KINDS_DECLARING_NOTHING,
  KINDS_WITHOUT_DETAILS,
  LAST_UPDATE_RTIME,
  ROGUELIKE_DISCLOSED,
  SEARCH_ROWS,
  SUGGESTIONS,
  SURFACE_APPS,
} from "./fixture-ids";
import { capturedVerdicts, pageVerdicts } from "./fixture-verdicts";
import {
  DECLARING_CATEGORIES,
  DECLARING_PLATFORMS,
  declaringItem,
  demoItem,
  detailedItem,
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
  freshBody,
  freshChipText,
  freshClanId,
  freshColor,
  freshCount,
  freshCreator,
  freshDuration,
  freshFileName,
  freshMarkup,
  freshName,
  freshNote,
  freshService,
  freshTextOfLength,
  freshTime,
  freshToken,
  freshUrl,
  freshVersion,
  largestAppIds,
} from "./sequence";
import { plainKinds, storedKinds, switchedOnKinds, withChipText, withKind } from "./settings";
import {
  appIdBounds,
  badAllowEntries,
  badAppIds,
  badChipTexts,
  badGameKeys,
  badLocales,
  badScopes,
  badTabIds,
  corruptNumber,
  corruptText,
  junkValues,
  noGames,
  storedAllowEntry,
  storedJson,
  v1Allow,
  v1CustomSettings,
  v1Settings,
  v2Allow,
} from "./stored-raw";
import { queueSlide, searchRow, SURFACES } from "./surfaces";
import {
  bareDisclosed,
  demoOf,
  disclosed,
  disclosedKinds,
  dlcOf,
  fullDisclosed,
  lent,
  minimalDisclosed,
  uniformVerdicts,
  verdictsWith,
} from "./verdicts";

/** A page's load progress with fresh counts, one game still loading; overrides win. */
function loadProgress(overrides: Partial<LoadProgress> = {}): LoadProgress {
  const total = freshCount();
  return { total, answered: total - 1, unknown: 0, ...overrides };
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
  /** The largest valid app IDs, largest first. */
  largestAppIds,
  text: {
    name: freshName,
    note: freshNote,
    service: freshService,
    ofLength: freshTextOfLength,
    url: freshUrl,
    creator: freshCreator,
    markup: freshMarkup,
    token: freshToken,
    version: freshVersion,
    fileName: freshFileName,
  },
  /** Fresh browser IDs: the origin tab, the settings tab and the origin's window. */
  tabs: tabIds,
  /** A fresh instant in milliseconds since the epoch, later than the one before. */
  time: freshTime,
  /** A fresh span in milliseconds. */
  duration: freshDuration,
  /** A fresh tag color in normal form. */
  color: freshColor,
  /** A page's load progress with fresh counts, one game still loading; overrides win. */
  progress: loadProgress,
  /** A fresh chip text that fits every chip text field. */
  chipText: freshChipText,
  /** Browser windows in CSS pixels, both inside the settings page's fixed frame. */
  viewport: {
    /** Tall enough for every settings tab. */
    tall: { width: 1600, height: 2000 },
    /** Too short for the General tab. */
    short: { width: 1280, height: 640 },
  },
  item: {
    store: storeItem,
    details: detailedItem,
    declaring: declaringItem,
    declaringCategories: DECLARING_CATEGORIES,
    declaringPlatforms: DECLARING_PLATFORMS,
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
  http: { result: httpResult, body: freshBody },
  verdict: {
    disclosed,
    bare: bareDisclosed,
    minimal: minimalDisclosed,
    notDisclosed: (source: VerdictSource = "api") => NOT_DISCLOSED[source],
    unknown: (reason: UnknownReason = "missing") => UNKNOWN[reason],
    lent,
  },
  verdicts: Object.assign((given?: Partial<KindVerdicts>) => verdictsWith(given), {
    full: fullDisclosed,
    uniform: uniformVerdicts,
    only: disclosedKinds,
    demoOf,
    dlcOf,
  }),
  /** Settings from the defaults, with `patch` applied. */
  settings: Object.assign((patch: SettingsPatch = {}) => applyPatch(DEFAULT_SETTINGS, patch), {
    kind: (id: KindId, patch: Partial<KindSettings>, base: Settings = DEFAULT_SETTINGS) =>
      withKind(base, id, patch),
    chipText: (
      texts: Parameters<typeof withChipText>[1],
      base: Settings = DEFAULT_SETTINGS,
    ) => withChipText(base, texts),
    /** Every kind's settings, switched on, as `applyKindSettings` takes them. */
    kinds: switchedOnKinds,
    /** Every kind's settings as `plain`, but for the kinds that start off or without a banner. */
    plain: plainKinds,
    /** What a kind with facets tags: one value of a rating, or any set of values. */
    tagged: {
      one: (facet: FacetId): TaggedFacets => ({ pick: "one", facet }),
      many: (...facets: FacetId[]): TaggedFacets => ({ pick: "many", facets }),
    },
  }),
  allow: {
    games: gameEntries,
    creators: creatorEntries,
    gameRow,
    clanRow,
    nameRow,
  },
  backup: {
    time: BACKUP_TIME,
    contents: backupContents,
    text: backupText,
    sample: SAMPLE_CONFIG,
    file: pickedFile,
    unreadableFile,
  },
  creator: {
    of: creatorOf,
    key: keyOf,
    forItem: creatorsFor,
    banner: bannerCreator,
    note: creatorNote,
    /** A fresh clan ID that no fixture holds. */
    clan: freshClanId,
    keyTexts: creatorKeyTexts,
    badKeyTexts: badCreatorKeyTexts,
    badNames: badCreatorNames,
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
    queueSlide,
  },
  fixture: {
    app: FIXTURE_APPS,
    dlcBase: appId(BASE_ID),
    searchRows: SEARCH_ROWS,
    suggestions: SUGGESTIONS,
    surfaceApps: SURFACE_APPS,
    clan: FIXTURE_CLANS,
    kindsDeclaringNothing: KINDS_DECLARING_NOTHING,
    kindsWithoutDetails: KINDS_WITHOUT_DETAILS,
    roguelikeDisclosed: ROGUELIKE_DISCLOSED,
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
    v2Allow,
    allowEntry: storedAllowEntry,
    noGames,
    junk: junkValues,
    corruptText,
    corruptNumber,
    badLocales,
    badGameKeys,
    badAllowEntries,
    badScopes,
    badChipTexts,
    appIdBounds,
    badAppIds,
    badTabIds,
    json: storedJson,
    v2Kinds: storedKinds,
  },
} as const;
