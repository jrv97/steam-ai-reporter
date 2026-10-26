import { type Creator, CREATOR_ROLES, type CreatorKey, type CreatorRole } from "./creator";
import { createTransientRetry, type Delay } from "./detect/retry";
import type { SteamLanguage } from "./i18n/locale";
import { type Ignored, type IgnoreLists, isIgnored } from "./ignored";
import type { KindId } from "./kinds/id";
import { effectiveSettings } from "./kinds/kind-settings";
import { KINDS, perKind } from "./kinds/registry";
import {
  isKindVerdicts,
  type KindVerdict,
  type KindVerdicts,
  UNKNOWN_KINDS,
  withRelations,
} from "./kinds/verdicts";
import type { Logger } from "./log";
import type { Detector, MessageCatalog } from "./ports";
import { ALLOW_SCOPES, type AllowScope, perScope } from "./settings/allow-data";
import type { Settings } from "./settings/settings";
import type { AppId } from "./types";
import { type AppPageView, createAppPageUi } from "./ui/app-page";
import type { BannerCreator } from "./ui/banner";
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
 * reported. The data wins when it discloses, and the page when only the page does. On a demo's
 * page the full game's disclosure is no disagreement, and the demo's own wins over it.
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
  if (data.state === "disclosed" && data.fullGame === true) {
    return page.state === "disclosed" ? page : data;
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
 * What the app is related to comes from the data alone, as the page does not carry it.
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
  return isKindVerdicts(merged) ? withRelations(merged, data) : data;
}

/**
 * Whether the AI kind holds the app's own disclosure from the API in another language than the
 * page's. The developer's notes are the only text that comes in a language.
 */
function needsTranslation(verdicts: KindVerdicts, language: SteamLanguage): boolean {
  const { ai } = verdicts;
  return ai.state === "disclosed" && ai.fullGame !== true && ai.source === "api"
    && ai.language !== language;
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
  // A demo's AI verdict may carry its full game's name.
  const fromVerdict = ai.state === "disclosed" && ai.fullGame !== true ? ai.name : undefined;
  const fromPage = doc.querySelector(APP_NAME_SELECTOR)?.textContent.trim();
  return fromVerdict ?? (fromPage === undefined || fromPage === "" ? String(id) : fromPage);
}

/** What the app page needs from the running app. */
export interface AppPageDeps {
  readonly language: SteamLanguage;
  readonly detectors: PageDetectors;
  /** The verdicts of the open page read from its document, when it is English. */
  readonly live: KindVerdicts | undefined;
  /** What the user ignored, kept current by the banner's buttons. */
  readonly ignored: Ignored;
  /** The stored lists behind `ignored`. */
  readonly lists: IgnoreLists;
  readonly settings: () => Settings;
  /**
   * Called after the banner ignores or restores something, so the capsules draw again: the
   * game's ID after a change to the game, none after a change to a developer or publisher.
   */
  readonly onAllowChange: (id?: AppId) => void;
  readonly card: CardTriggers;
  readonly logger: Pick<Logger, "debug" | "error">;
  /** Waits out a retry round after a transient answer; `setTimeout` by default. */
  readonly delay?: Delay;
}

/** A running app page. */
export interface AppPage {
  /** Draws again from the known verdicts and the current settings. */
  render(): void;
  /** Stops a lookup that has not finished from drawing, and cancels a pending retry. */
  stop(): void;
}

/**
 * Draws the game's own page: the banner with an entry per disclosed kind and the tag section.
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
  /** The open page as the one item of its retry rounds. */
  const page = { id };
  const retry = createTransientRetry<typeof page>(() => {
    lookUp();
  }, deps.delay);

  /** The game's developers and publishers, with the scopes each is ignored in for its role. */
  function creatorRows(): readonly BannerCreator[] {
    return CREATOR_ROLES.flatMap((role) =>
      (known.creators?.[role] ?? []).map((creator) => ({
        role,
        creator,
        ignored: ALLOW_SCOPES.flatMap((scope) => {
          const key = creator.keys.find((each) => deps.ignored.creators[role][scope].has(each));
          return key === undefined ? [] : [{ scope, key }];
        }),
      }))
    );
  }

  function view(): AppPageView {
    const { kinds } = deps.settings();
    return {
      verdicts: known,
      creators: creatorRows(),
      ignored: perScope((scope) => deps.ignored.games[scope].has(id)),
      suppressed: perKind((kind) => isIgnored(deps.ignored, id, kind.id, known)),
      badge: perKind((kind) => effectiveSettings(kinds[kind.id]).badge),
      banner: perKind((kind) => effectiveSettings(kinds[kind.id]).banner),
    };
  }

  const ui = createAppPageUi(doc, i18n, {
    async ignore(scope) {
      await deps.lists.games.add(scope, id, appName(doc, known, id));
      deps.ignored.games[scope].add(id);
      deps.onAllowChange(id);
      render();
    },
    async restore(scope) {
      await deps.lists.games.remove(scope, id);
      deps.ignored.games[scope].delete(id);
      deps.onAllowChange(id);
      render();
    },
    async ignoreCreator(role: CreatorRole, creator: Creator, scope: AllowScope) {
      await deps.lists.creators[role].add(scope, creator.key, creator.name);
      deps.ignored.creators[role][scope].add(creator.key);
      deps.onAllowChange();
      render();
    },
    async restoreCreator(role: CreatorRole, key: CreatorKey, scope: AllowScope) {
      await deps.lists.creators[role].remove(scope, key);
      deps.ignored.creators[role][scope].delete(key);
      deps.onAllowChange();
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
      retry.offer(page, detected);
    }
  }

  function lookUp(): void {
    settle().catch((problem: unknown) => {
      logger.error(problem);
    });
  }

  render();
  lookUp();
  return {
    render,
    stop() {
      stopped = true;
      retry.cancel();
    },
  };
}
