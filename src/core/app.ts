import { cachedDetector } from "./cache/cached-detector";
import { maintainCache } from "./cache/maintenance";
import { createVerdictCache } from "./cache/verdict-cache";
import { createAppPageDetector, parseLiveAppPage } from "./detect/app-page";
import { API_BREAKER_KEY, createBreaker, HTML_BREAKER_KEY } from "./detect/breaker";
import { createBudgetDetector } from "./detect/budget";
import { createChainDetector } from "./detect/chain";
import { createDedupingDetector } from "./detect/dedupe";
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
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import { createI18n, type I18n } from "./i18n/t";
import { type ConsoleSink, createLogger, type Logger } from "./log";
import type { Clock, Http, KeyValueStore, SettingsSource, Unsubscribe } from "./ports";
import { appIdFromHref } from "./scan/appid";
import { createScanner } from "./scan/scanner";
import { createAllowList } from "./settings/allow-list";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./settings/settings";
import { type AppId, type Detector, UNKNOWN, type Verdict } from "./types";
import { createAppPageUi } from "./ui/app-page";
import { applyBadgeSetting, createBadgeRenderer } from "./ui/badge";
import { createCapsuleUi } from "./ui/capsules";
import { applyListFilter, createHostStateRenderer } from "./ui/list-filter";
import { adoptStyles, PAGE_CSS, TOKENS_CSS } from "./ui/styles";

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
  /** Defaults to the catalogs this build ships. */
  readonly catalogs?: Catalogs;
}

/** A running app on one store page. */
export interface App {
  /** Stops scanning and listening; what is drawn stays. */
  stop(): void;
}

/** The store app page name element, the fallback when the verdict carries no name. */
const APP_NAME_SELECTOR = "#appHubAppName";

async function readSettings(source: SettingsSource): Promise<Settings> {
  try {
    return parseSettings(await source.read());
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * The detector stack (hand-overs of steps 7 and 8): the verdict cache outside, so cache hits never
 * touch the network, then in-flight dedupe, then the chain of GetItems and, for what it leaves
 * unknown, the English app page within a per-page budget. Each host has its own throttle and
 * breaker.
 */
function createDetector(deps: AppDeps, logger: Logger, language: SteamLanguage) {
  const { http, store, clock } = deps;
  const throttled = (key: string) =>
    createThrottledHttp({ http, clock, breaker: createBreaker({ store, clock, logger, key }) });
  const getItems = createGetItemsDetector({ http: throttled(API_BREAKER_KEY), language });
  const appPage = createBudgetDetector(createAppPageDetector(throttled(HTML_BREAKER_KEY)));
  const chain = createDedupingDetector(createChainDetector([getItems, appPage]));
  return { getItems, detector: cachedDetector(chain, createVerdictCache(store, clock), logger) };
}

/**
 * The verdict for the app page the user is on: read from the page itself when it is English (no
 * request), else from the detector. A cached disclosure in another language than the page's is
 * fetched again for this one app, so the banner quotes the developer's own translation.
 */
async function pageVerdict(
  doc: Document,
  id: AppId,
  language: SteamLanguage,
  detectors: { readonly getItems: Detector; readonly detector: Detector; },
): Promise<Verdict> {
  const live = parseLiveAppPage(doc, doc.URL);
  if (live !== undefined) {
    return live;
  }
  const verdict = (await detectors.detector.detect([id])).get(id) ?? UNKNOWN.missing;
  if (verdict.state !== "disclosed" || verdict.source !== "api" || verdict.language === language) {
    return verdict;
  }
  const translated = (await detectors.getItems.detect([id])).get(id);
  return translated?.state === "disclosed" ? translated : verdict;
}

function appName(doc: Document, verdict: Verdict, id: AppId): string {
  const fromVerdict = verdict.state === "disclosed" ? verdict.name : undefined;
  const fromPage = doc.querySelector(APP_NAME_SELECTOR)?.textContent.trim();
  return fromVerdict ?? (fromPage === undefined || fromPage === "" ? String(id) : fromPage);
}

/** The app page: its banner and summary row, wired to the allow-list. */
async function startAppPage(
  doc: Document,
  id: AppId,
  i18n: I18n,
  verdict: Promise<Verdict>,
  context: {
    readonly allowed: Set<AppId>;
    readonly allowList: ReturnType<typeof createAllowList>;
    readonly settings: () => Settings;
    readonly onAllowChange: (id: AppId) => void;
  },
): Promise<() => void> {
  const known = await verdict;
  const ui = createAppPageUi(doc, i18n, {
    async stopMarking() {
      await context.allowList.add(id, appName(doc, known, id));
      context.allowed.add(id);
      context.onAllowChange(id);
    },
    async markAgain() {
      await context.allowList.remove(id);
      context.allowed.delete(id);
      context.onAllowChange(id);
    },
  });
  const render = (): void => {
    ui.render({
      verdict: known,
      allowed: context.allowed.has(id),
      banner: context.settings().banner,
    });
  };
  render();
  return render;
}

/**
 * Starts AI Reporter for Steam on one store page: settings, locale and logger, cache upkeep, the
 * detector stack, the allow-list, the page stylesheet, the scanner with its renderers, and the app
 * page's banner. Settings changes from any tab re-render at once: badges and the list filter are
 * one root attribute each, the banner is drawn again from the known verdict.
 */
export async function start(deps: AppDeps): Promise<App> {
  const { document: doc, store, clock } = deps;
  const catalogs = deps.catalogs ?? SHIPPED_CATALOGS;
  const root = doc.documentElement;

  let settings = await readSettings(deps.settings);
  const { browserLang } = deps;
  const localeContext: LocaleContext = browserLang === undefined
    ? { setting: settings.locale, pageLang: root.lang }
    : { setting: settings.locale, pageLang: root.lang, browserLang };
  const locale = resolveLocale(localeContext, new Set(Object.keys(catalogs)));
  const i18n = createI18n(catalogs, locale);
  const logger = createLogger(i18n, deps.console, settings.debug);
  await maintainCache(store, clock).catch((problem: unknown) => {
    logger.error(problem);
  });

  const language = steamLanguage(root.lang) ?? DEFAULT_STEAM_LANGUAGE;
  const detectors = createDetector(deps, logger, language);
  const allowList = createAllowList(store, clock);
  const allowed = new Set<AppId>();
  try {
    for (const id of (await allowList.list()).keys()) {
      allowed.add(id);
    }
  } catch (problem) {
    logger.error(problem);
  }

  adoptStyles(doc, TOKENS_CSS + PAGE_CSS);
  applyBadgeSetting(root, settings.badges);
  applyListFilter(root, settings.listFilter);

  const capsules = createCapsuleUi({
    document: doc,
    detector: detectors.detector,
    renderers: [createHostStateRenderer(), createBadgeRenderer(doc, i18n)],
    isAllowed: (id) => allowed.has(id),
  });
  const scanner = createScanner({ document: doc, renderer: capsules });

  scanner.start();

  const pageId = appIdFromHref(doc.URL, doc.URL);
  let renderAppPage: () => void = () => undefined;
  if (pageId !== undefined) {
    renderAppPage = await startAppPage(
      doc,
      pageId,
      i18n,
      pageVerdict(doc, pageId, language, detectors),
      {
        allowed,
        allowList,
        settings: () => settings,
        onAllowChange: (id) => {
          capsules.refresh(new Set([id]));
        },
      },
    );
  }

  const unsubscribe: Unsubscribe = deps.settings.subscribe((value) => {
    const next = parseSettings(value);
    applyBadgeSetting(root, next.badges);
    applyListFilter(root, next.listFilter);
    const bannerChanged = next.banner !== settings.banner;
    settings = next;
    if (bannerChanged) {
      renderAppPage();
    }
  });

  return {
    stop() {
      scanner.stop();
      unsubscribe();
    },
  };
}
