import type { SteamLanguage } from "./i18n/locale";
import type { IgnoredGames } from "./ignored";
import { AI_KIND } from "./kinds/ai";
import type { KindId } from "./kinds/id";
import { effectiveSettings } from "./kinds/kind-settings";
import { KINDS, perKind } from "./kinds/registry";
import {
  isKindVerdicts,
  type KindVerdict,
  type KindVerdicts,
  UNKNOWN_KINDS,
} from "./kinds/verdicts";
import type { Logger } from "./log";
import type { MessageCatalog } from "./ports";
import { perScope } from "./settings/allow-data";
import type { AllowList } from "./settings/allow-list";
import type { Settings } from "./settings/settings";
import type { AppId, Detector } from "./types";
import { type AppPageView, createAppPageUi } from "./ui/app-page";
import type { CardTriggers } from "./ui/hover-card";

/** The store app page name element, the fallback when the verdict carries no name. */
const APP_NAME_SELECTOR = "#appHubAppName";

/** The detectors the app page asks: the cached stack, and GetItems alone for a translation. */
export interface PageDetectors {
  readonly getItems: Detector;
  readonly detector: Detector;
}

/** Called when the open page and Steam's data give different answers for one kind. */
export type Disagree = (kind: KindId, page: KindVerdict, data: KindVerdict) => void;

/**
 * One kind from the page and from Steam's data. A kind the page cannot say, or Steam could not
 * answer, takes the other. When both know, a disclosure wins over none, and a disagreement is
 * reported. The data wins when it discloses, and the page when only the page does.
 */
function mergeKind(
  kind: KindId,
  page: KindVerdict,
  data: KindVerdict,
  disagree: Disagree,
): KindVerdict {
  if (page.state === "unknown" && page.reason === "missing") {
    return data;
  }
  if (data.state === "disclosed") {
    if (page.state !== "disclosed") {
      disagree(kind, page, data);
    }
    return data;
  }
  if (data.state === "unknown") {
    return page;
  }
  if (page.state === "disclosed") {
    disagree(kind, page, data);
    return page;
  }
  return data;
}

/**
 * The verdicts of an English page read from its own document, merged with Steam's data for the
 * game. Only a kind that can be read from the page (`fromAppPage`) takes the page into account.
 */
export function mergeVerdicts(
  page: KindVerdicts,
  data: KindVerdicts,
  disagree: Disagree,
): KindVerdicts {
  const merged: Partial<Record<KindId, KindVerdict>> = {};
  for (const kind of KINDS) {
    merged[kind.id] = kind.fromAppPage === undefined
      ? data[kind.id]
      : mergeKind(kind.id, page[kind.id], data[kind.id], disagree);
  }
  return isKindVerdicts(merged) ? merged : data;
}

/**
 * Whether the AI kind holds a disclosure from the API in another language than the page's. The
 * developer's notes are the only text that comes in a language.
 */
function needsTranslation(verdicts: KindVerdicts, language: SteamLanguage): boolean {
  const { ai } = verdicts;
  return ai.state === "disclosed" && ai.source === "api" && ai.language !== language;
}

/**
 * The verdicts of a page in another language than English: Steam's data, with the AI notes asked
 * for again when the cached ones are in a different language than the page's.
 */
export async function translatedVerdicts(
  id: AppId,
  language: SteamLanguage,
  detected: KindVerdicts,
  getItems: Detector,
): Promise<KindVerdicts> {
  if (!needsTranslation(detected, language)) {
    return detected;
  }
  const fresh = (await getItems.detect([id])).get(id)?.ai;
  return fresh?.state === "disclosed" ? { ...detected, ai: fresh } : detected;
}

function appName(doc: Document, verdicts: KindVerdicts, id: AppId): string {
  const { ai } = verdicts;
  const fromVerdict = ai.state === "disclosed" ? ai.name : undefined;
  const fromPage = doc.querySelector(APP_NAME_SELECTOR)?.textContent.trim();
  return fromVerdict ?? (fromPage === undefined || fromPage === "" ? String(id) : fromPage);
}

/** What the app page needs from the running app. */
export interface AppPageDeps {
  readonly language: SteamLanguage;
  readonly detectors: PageDetectors;
  /** The verdicts of the open page read from its document, when it is English. */
  readonly live: KindVerdicts | undefined;
  /** The games the user ignored, kept current by the banner's buttons. */
  readonly ignored: IgnoredGames;
  readonly allowList: AllowList;
  readonly settings: () => Settings;
  /** Called after the banner ignores or restores the game, so the capsules draw again. */
  readonly onAllowChange: (id: AppId) => void;
  readonly card: CardTriggers;
  readonly logger: Pick<Logger, "debug" | "error">;
}

/** A running app page. */
export interface AppPage {
  /** Draws again from the known verdicts and the current settings. */
  render(): void;
  /** Stops a lookup that has not finished from drawing. */
  stop(): void;
}

/**
 * Draws the game's own page: the banner with an entry per disclosed kind and the AI summary row.
 * An English page draws at once from its own document; Steam's data for the game, which arrives
 * later and from the cache when it can, fills in the other kinds and draws again.
 */
export function startAppPage(
  doc: Document,
  id: AppId,
  i18n: MessageCatalog,
  deps: AppPageDeps,
): AppPage {
  const { detectors, live, logger } = deps;
  let known: KindVerdicts = live ?? UNKNOWN_KINDS.missing;
  let stopped = false;

  function view(): AppPageView {
    const { kinds } = deps.settings();
    return {
      verdicts: known,
      ignored: perScope((scope) => deps.ignored[scope].has(id)),
      banner: perKind((kind) => effectiveSettings(kinds[kind.id]).banner),
    };
  }

  const ui = createAppPageUi(doc, i18n, AI_KIND, {
    async ignore(scope) {
      await deps.allowList.add(scope, id, appName(doc, known, id));
      deps.ignored[scope].add(id);
      deps.onAllowChange(id);
      render();
    },
    async restore(scope) {
      await deps.allowList.remove(scope, id);
      deps.ignored[scope].delete(id);
      deps.onAllowChange(id);
      render();
    },
  }, { card: deps.card });

  function render(): void {
    ui.render(view());
  }

  function disagree(kind: KindId, page: KindVerdict, data: KindVerdict): void {
    logger.debug("notice_page_disagrees", {
      kind,
      app: String(id),
      page: page.state,
      data: data.state,
    });
  }

  async function settle(): Promise<void> {
    const detected = (await detectors.detector.detect([id])).get(id) ?? UNKNOWN_KINDS.missing;
    const next = live === undefined
      ? await translatedVerdicts(id, deps.language, detected, detectors.getItems)
      : mergeVerdicts(live, detected, disagree);
    if (!stopped) {
      known = next;
      render();
    }
  }

  render();
  settle().catch((problem: unknown) => {
    logger.error(problem);
  });
  return {
    render,
    stop() {
      stopped = true;
    },
  };
}
