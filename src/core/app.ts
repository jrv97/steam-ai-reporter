import { type AppPage, startAppPage } from "./app-page";
import { cachedDetector } from "./cache/cached-detector";
import { maintainCache } from "./cache/maintenance";
import { createVerdictCache } from "./cache/verdict-cache";
import { createAppPageDetector, type OpenPage, parseLiveAppPage } from "./detect/app-page";
import { API_BREAKER_KEY, createBreaker, HTML_BREAKER_KEY } from "./detect/breaker";
import { createBudgetDetector } from "./detect/budget";
import { createChainDetector } from "./detect/chain";
import { createDedupingDetector } from "./detect/dedupe";
import { createFullGameDetector } from "./detect/full-game";
import { createGetItemsDetector } from "./detect/getitems";
import { createThrottledHttp } from "./detect/throttle";
import type { Catalogs } from "./i18n/catalog";
import {
  DEFAULT_STEAM_LANGUAGE,
  type LocaleContext,
  resolveLocale,
  type SteamLanguage,
  steamLanguage,
} from "./i18n/locale";
import { createI18n } from "./i18n/t";
import { createIgnoreLists, isIgnored, loadIgnored } from "./ignored";
import { taggedView } from "./kinds/facets";
import { effectiveSettings, type KindSettings } from "./kinds/kind-settings";
import { kindsInOrder, sameOrder } from "./kinds/order";
import { KINDS } from "./kinds/registry";
import { coversSections, requestSections, type Section } from "./kinds/sections";
import { type ConsoleSink, createLogger, type Logger } from "./log";
import type { Clock, Http, KeyValueStore, SettingsSource, Unsubscribe } from "./ports";
import { appIdFromHref } from "./scan/appid";
import { createScanner } from "./scan/scanner";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./settings/settings";
import { createBadgeRenderer } from "./ui/badge";
import { createCapsuleUi } from "./ui/capsules";
import { createHiddenNotice } from "./ui/hidden-notice";
import { createHoverCard } from "./ui/hover-card";
import { applyKindSettings } from "./ui/kind-attributes";
import { createHostKindsRenderer } from "./ui/list-filter";
import { createPackageSummary } from "./ui/package-summary";

/** What a composition root hands to core: the ports, already built for its platform. */
export interface AppDeps {
  readonly document: Document;
  /** Plain HTTP (`createFetchHttp`); `start` throttles it per host. */
  readonly http: Http;
  readonly store: KeyValueStore;
  readonly settings: SettingsSource;
  readonly clock: Clock;
  readonly console: ConsoleSink;
  /** `navigator.language`, which the `auto` locale follows off store pages. */
  readonly browserLang?: string;
  /**
   * The catalogs this bundle carries. A root hands in its own, so no bundle carries the messages
   * of another surface, much as `addPageStyles` keeps the CSS text out of the extension's bundle.
   */
  readonly catalogs: Catalogs;
  /**
   * Puts the store page stylesheet (`TOKENS_CSS` and `PAGE_CSS`) on the page: `adoptPageStyles`,
   * or nothing where the platform loads it itself, as the extension's manifest `content.css` does.
   * A platform hook rather than a default, so that bundle carries no copy of the CSS text.
   */
  readonly addPageStyles: (doc: Document) => void;
}

/** A running app on one store page. */
export interface App {
  /** Stops scanning and listening; what is drawn stays. */
  stop(): void;
}

/** The stored settings, or the defaults and the failure to read them. */
interface SettingsRead {
  readonly settings: Settings;
  readonly failure: { readonly problem: unknown; } | undefined;
}

async function readSettings(source: SettingsSource): Promise<SettingsRead> {
  try {
    return { settings: parseSettings(await source.read()), failure: undefined };
  } catch (problem) {
    return { settings: DEFAULT_SETTINGS, failure: { problem } };
  }
}

/**
 * The detector stack (hand-overs of steps 7 and 8): a demo's full game outside, asked through the
 * stack below it; the verdict cache, so cache hits never touch the network; in-flight dedupe; then
 * the chain of GetItems and, for what it leaves unknown, the English app page within a per-page
 * budget. Each host has its own throttle and breaker. `sections` names what GetItems asks for
 * and what a cached entry must hold.
 */
function createDetector(
  deps: AppDeps,
  logger: Logger,
  language: SteamLanguage,
  open: OpenPage | undefined,
  sections: () => readonly Section[],
) {
  const { http, store, clock } = deps;
  const throttled = (key: string) =>
    createThrottledHttp({ http, clock, breaker: createBreaker({ store, clock, logger, key }) });
  const getItems = createGetItemsDetector({ http: throttled(API_BREAKER_KEY), language, sections });
  const appPage = createBudgetDetector(createAppPageDetector(throttled(HTML_BREAKER_KEY), open));
  const chain = createDedupingDetector(createChainDetector([getItems, appPage]));
  const cached = cachedDetector(chain, createVerdictCache(store, clock), logger, sections);
  return { getItems, detector: createFullGameDetector(cached) };
}

/** Whether some kind's setting, as it takes effect, differs between two settings. */
function changed(
  before: Settings,
  after: Settings,
  pick: (settings: KindSettings) => boolean,
): boolean {
  return KINDS.some((kind) =>
    pick(effectiveSettings(before.kinds[kind.id])) !== pick(effectiveSettings(after.kinds[kind.id]))
  );
}

const SHOWS_BADGE = (settings: KindSettings): boolean => settings.badge;
const SHOWS_BANNER = (settings: KindSettings): boolean => settings.banner;

/** Whether some kind tags other values in `after` than in `before`. */
function facetsChanged(before: Settings, after: Settings): boolean {
  return KINDS.some((kind) =>
    String(before.kinds[kind.id].facets) !== String(after.kinds[kind.id].facets)
  );
}

/** The sections `after` asks for that `before` did not, as when a kind that reads one turns on. */
function addedSections(before: Settings, after: Settings): readonly Section[] {
  const had = requestSections(before.kinds);
  return requestSections(after.kinds).filter((section) => !had.includes(section));
}

/**
 * Starts Tag Kit for Steam on one store page: settings, locale and logger, cache upkeep, the
 * detector stack, the allow-list, the page stylesheet, the scanner with its renderers (the package
 * summary among them), the hidden results notice and the app page's banner. Settings changes from
 * any tab re-render at once: badges, the list filter and the tag colors are one root attribute or
 * custom property each, the banner is drawn again from the known verdicts. A kind that turns on
 * and reads a section the answers on screen lack asks for them again, once.
 */
export async function start(deps: AppDeps): Promise<App> {
  const { document: doc, store, clock } = deps;
  const { catalogs } = deps;
  const root = doc.documentElement;

  const read = await readSettings(deps.settings);
  let { settings } = read;
  const { browserLang } = deps;
  const localeContext: LocaleContext = browserLang === undefined
    ? { setting: settings.locale, pageLang: root.lang }
    : { setting: settings.locale, pageLang: root.lang, browserLang };
  const locale = resolveLocale(localeContext, new Set(Object.keys(catalogs)));
  const i18n = createI18n(catalogs, locale);
  const logger = createLogger(i18n, deps.console, settings.debug);
  if (read.failure !== undefined) {
    logger.error(read.failure.problem);
  }
  await maintainCache(store, clock).catch((problem: unknown) => {
    logger.error(problem);
  });

  const language = steamLanguage(root.lang) ?? DEFAULT_STEAM_LANGUAGE;
  const pageId = appIdFromHref(doc.URL, doc.URL);
  // An English app page holds its own verdicts, so nothing fetches the page that is open.
  const live = pageId === undefined ? undefined : parseLiveAppPage(doc, doc.URL);
  const open = pageId === undefined || live === undefined
    ? undefined
    : { id: pageId, verdicts: live };
  const detectors = createDetector(
    deps,
    logger,
    language,
    open,
    () => requestSections(settings.kinds),
  );
  const lists = createIgnoreLists(store, clock);
  const ignored = await loadIgnored(lists, logger);

  deps.addPageStyles(doc);
  applyKindSettings(root, settings.kinds);

  const card = createHoverCard(doc, i18n);
  const order = () => kindsInOrder(settings.order);
  const capsules = createCapsuleUi({
    document: doc,
    detector: detectors.detector,
    renderers: [
      createHostKindsRenderer(),
      createBadgeRenderer(doc, i18n, card, order),
      createPackageSummary(doc, i18n, order),
    ],
    isAllowed: (id, forKind, related) => isIgnored(ignored, id, forKind, related),
    isBadged: (forKind) => effectiveSettings(settings.kinds[forKind]).badge,
    tagged: (verdicts) => taggedView(verdicts, settings.kinds),
  });
  const scanner = createScanner({ document: doc, renderer: capsules });
  const notice = createHiddenNotice({ document: doc, i18n });

  scanner.start();
  notice.start();

  let appPage: AppPage | undefined;
  const unsubscribe: Unsubscribe = deps.settings.subscribe((value) => {
    const before = settings;
    settings = parseSettings(value);
    applyKindSettings(root, settings.kinds);
    // Chosen values decide which hosts carry a kind and the order places chips: both draw again
    const badges = changed(before, settings, SHOWS_BADGE) || facetsChanged(before, settings)
      || !sameOrder(before.order, settings.order);
    if (badges) {
      capsules.refresh();
    }
    if (badges || changed(before, settings, SHOWS_BANNER)) {
      appPage?.render();
    }
    const added = addedSections(before, settings);
    if (added.length > 0) {
      capsules.redetect((verdicts) => !coversSections(verdicts.sections, added));
      appPage?.redetect();
    }
  });

  if (pageId !== undefined) {
    appPage = startAppPage(doc, pageId, i18n, {
      language,
      detectors,
      live,
      ignored,
      lists,
      settings: () => settings,
      onAllowChange: (id) => {
        capsules.refresh(id === undefined ? undefined : new Set([id]));
      },
      card,
      logger,
    });
  }

  return {
    stop() {
      scanner.stop();
      capsules.stop();
      notice.stop();
      card.stop();
      appPage?.stop();
      unsubscribe();
    },
  };
}
