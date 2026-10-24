import { parseLiveAppPage } from "./detect/app-page";
import { type PageInput, parsePageDetails } from "./detect/page-details";
import type { SteamLanguage } from "./i18n/locale";
import type { IgnoredGames } from "./ignored";
import { AI_KIND } from "./kinds/ai";
import { effectiveSettings } from "./kinds/kind-settings";
import { perKind } from "./kinds/registry";
import { type KindVerdicts, UNKNOWN_KINDS } from "./kinds/verdicts";
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

/**
 * Whether the AI kind holds a disclosure from the API in another language than the page's. The
 * developer's notes are the only text that comes in a language.
 */
function needsTranslation(verdicts: KindVerdicts, language: SteamLanguage): boolean {
  const { ai } = verdicts;
  return ai.state === "disclosed" && ai.source === "api" && ai.language !== language;
}

/**
 * The verdicts for the app page the user is on. An English page gives the AI kind's verdict
 * itself, with no request, and every other kind comes from the detector, because the page text
 * holds nothing the other kinds can be read from. Another language takes every kind from the
 * detector; a cached disclosure in another language than the page's is fetched again for this one
 * app, so the banner quotes the developer's own translation.
 */
export async function pageVerdicts(
  doc: Document,
  id: AppId,
  language: SteamLanguage,
  detectors: PageDetectors,
): Promise<KindVerdicts> {
  const live = parseLiveAppPage(doc, doc.URL);
  const detected = (await detectors.detector.detect([id])).get(id) ?? UNKNOWN_KINDS.missing;
  if (live !== undefined) {
    return { ...detected, ai: live.ai };
  }
  if (!needsTranslation(detected, language)) {
    return detected;
  }
  const fresh = (await detectors.getItems.detect([id])).get(id)?.ai;
  return fresh?.state === "disclosed" ? { ...detected, ai: fresh } : detected;
}

/** What the data layer says that tells the page's lines apart (see `parsePageDetails`). */
export function pageInput(verdicts: KindVerdicts): PageInput {
  const { kernel, drm } = verdicts;
  return {
    bootProtection: kernel.state === "disclosed" && kernel.bootProtection !== undefined,
    drmText: drm.state === "disclosed" ? drm.text : undefined,
  };
}

function appName(doc: Document, verdicts: KindVerdicts, id: AppId): string {
  const { ai } = verdicts;
  const fromVerdict = ai.state === "disclosed" ? ai.name : undefined;
  const fromPage = doc.querySelector(APP_NAME_SELECTOR)?.textContent.trim();
  return fromVerdict ?? (fromPage === undefined || fromPage === "" ? String(id) : fromPage);
}

/** What the app page needs from the running app. */
export interface AppPageContext {
  /** The games the user ignored, kept current by the banner's buttons. */
  readonly ignored: IgnoredGames;
  readonly allowList: AllowList;
  readonly settings: () => Settings;
  /** Called after the banner ignores or restores the game, so the capsules draw again. */
  readonly onAllowChange: (id: AppId) => void;
  readonly card: CardTriggers;
}

/**
 * Draws the game's own page: the banner with one entry per disclosed kind, the page's details
 * for those entries, and the summary row for the AI kind. The banner's buttons ignore the game
 * for one kind or for all of them. Returns the function that draws again from the known verdicts
 * and the current settings.
 */
export async function startAppPage(
  doc: Document,
  id: AppId,
  i18n: MessageCatalog,
  language: SteamLanguage,
  detectors: PageDetectors,
  context: AppPageContext,
): Promise<() => void> {
  const known = await pageVerdicts(doc, id, language, detectors);
  const details = parsePageDetails(doc, pageInput(known));

  function view(): AppPageView {
    const { kinds } = context.settings();
    return {
      verdicts: known,
      details,
      ignored: perScope((scope) => context.ignored[scope].has(id)),
      banner: perKind((kind) => effectiveSettings(kinds[kind.id]).banner),
    };
  }

  const ui = createAppPageUi(doc, i18n, AI_KIND, {
    async ignore(scope) {
      await context.allowList.add(scope, id, appName(doc, known, id));
      context.ignored[scope].add(id);
      context.onAllowChange(id);
      render();
    },
    async restore(scope) {
      await context.allowList.remove(scope, id);
      context.ignored[scope].delete(id);
      context.onAllowChange(id);
      render();
    },
  }, { card: context.card });

  function render(): void {
    ui.render(view());
  }

  render();
  return render;
}
