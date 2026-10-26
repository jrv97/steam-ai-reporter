import { type App, start } from "../../core/app";
import { createFetchHttp, type Fetch } from "../../core/http";
import { SHIPPED_CATALOGS } from "../../core/i18n/shipped";
import { createIgnoreLists } from "../../core/ignored";
import { type ConsoleSink, createLogger } from "../../core/log";
import { createSettingsSource } from "../../core/settings/settings-source";
import { createSectionState } from "../../core/ui/section-state";
import { adoptPageStyles, PAGE_CSS, TOKENS_CSS } from "../../core/ui/styles";
import { createGmStore, createRemoteSettings, type GmStorage, type WatchValue } from "./gm-storage";
import { currentI18n } from "./locale";
import { openSettingsDialog } from "./settings-dialog";

/** What the userscript manager gives the script; `main.ts` builds it from the `GM` globals. */
export interface UserscriptEnv {
  readonly document: Document;
  readonly storage: GmStorage;
  readonly fetch: Fetch;
  readonly console: ConsoleSink;
  readonly browserLang?: string;
  /** `GM_addStyle`; absent, CSS goes in through core's own `style` fallback. */
  readonly addStyle: ((css: string) => unknown) | undefined;
  /** `GM_addValueChangeListener`; absent, settings apply on the next page load. */
  readonly watchValue: WatchValue | undefined;
  /** `GM.registerMenuCommand`; absent, the settings dialog has no way to open. */
  readonly registerMenuCommand: ((caption: string, run: () => void) => void) | undefined;
}

/**
 * Wires the ports over the manager's APIs, registers the settings menu command and starts the app.
 * A failure is logged and ends the script quietly: it never breaks the store page.
 */
export async function startUserscript(env: UserscriptEnv): Promise<App | undefined> {
  const { document: doc, addStyle, browserLang } = env;
  const store = createGmStore(env.storage);
  const remote = createRemoteSettings(env.watchValue);
  const settings = createSettingsSource(store, remote);
  const clock = { now: () => Date.now() };
  const i18n = await currentI18n(doc, settings, SHIPPED_CATALOGS, browserLang);
  const logger = createLogger(i18n, env.console, false);

  // The page stylesheet goes in through GM_addStyle; core's own adoption is the fallback
  const addPageStyles = (page: Document): void => {
    try {
      if (addStyle === undefined) {
        adoptPageStyles(page);
      } else {
        addStyle(TOKENS_CSS + PAGE_CSS);
      }
    } catch {
      adoptPageStyles(page);
    }
  };

  env.registerMenuCommand?.(i18n.t("userscript_menu_settings"), () => {
    void (async () => {
      await openSettingsDialog({
        document: doc,
        i18n: await currentI18n(doc, settings, SHIPPED_CATALOGS, browserLang),
        catalogs: SHIPPED_CATALOGS,
        settings,
        lists: createIgnoreLists(store, clock),
        sectionState: createSectionState(store),
        clock,
        live: remote !== undefined,
      });
    })().catch((problem: unknown) => {
      logger.error(problem);
    });
  });

  try {
    return await start({
      document: doc,
      http: createFetchHttp(env.fetch),
      store,
      settings,
      clock,
      console: env.console,
      addPageStyles,
      ...(browserLang === undefined ? {} : { browserLang }),
    });
  } catch (problem) {
    logger.error(problem);
    return undefined;
  }
}
