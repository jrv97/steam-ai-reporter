import * as v from "valibot";
import { resolveLocale } from "../../core/i18n/locale";
import { type BareMessageKey, createI18n, type I18n } from "../../core/i18n/t";
import { createIgnoreLists } from "../../core/ignored";
import { AUTO_LOCALE, parseSettings } from "../../core/settings/settings";
import { ALLOW_KEY, CREATOR_ALLOW_KEYS, UI_STATE_KEY } from "../../core/storage-keys";
import { mountSettingsForm, type SettingsContext } from "../../core/ui/settings-form";
import { parseTabHash, tabHash, type TabId } from "../../core/ui/tab-id";
import { createUiState, decodeTabRequest, type UiState } from "../../core/ui/ui-state";
import { createFileTransfer } from "../shared/file-transfer";
import {
  extensionUrl,
  extensionVersion,
  localStorageArea,
  onLocalChanged,
  openOptionsPage,
} from "./ext";
import { CATALOGS } from "./options.catalogs.gen";
import { createExtensionSettings, createExtensionStore } from "./store";

// The options page and the toolbar popup: one page, options.html, which the manifest opens as
// `options.html?context=popup` from the toolbar button. It mounts core's settings form into the
// body; options.html itself holds no copy, only `data-i18n` keys (rule 9).

const OPTIONS_PAGE = "options.html";
const CONTEXT_PARAM = "context";
const ICONS: Readonly<Record<SettingsContext, string>> = {
  page: "icons/icon-48.png",
  popup: "icons/icon-32.png",
};

/** The catalog keys options.html may name in `data-i18n`. */
const PAGE_KEYS = ["ext_name"] as const satisfies readonly BareMessageKey[];
const PageKeySchema = v.picklist(PAGE_KEYS);

const ContextSchema = v.picklist(["page", "popup"]);

function pageContext(): SettingsContext {
  const requested = new URLSearchParams(location.search).get(CONTEXT_PARAM);
  const parsed = v.safeParse(ContextSchema, requested);
  return parsed.success ? parsed.output : "page";
}

function fillText(doc: Document, i18n: I18n): void {
  doc.documentElement.lang = i18n.locale.replaceAll("_", "-");
  for (const node of doc.querySelectorAll("[data-i18n]")) {
    const key = v.safeParse(PageKeySchema, node.getAttribute("data-i18n"));
    if (key.success) {
      node.textContent = i18n.t(key.output);
    }
  }
}

/**
 * From a popup row: asks an open options page for the tab and focuses it, or opens the page,
 * which reads the same request. Without the API, the row's own link opens the tab.
 */
async function openTab(uiState: UiState, id: TabId, optionsUrl: string): Promise<void> {
  try {
    await uiState.requestTab(id, Date.now());
    await openOptionsPage();
  } catch {
    open(`${optionsUrl}${tabHash(id)}`, "_blank", "noopener");
  }
  close();
}

async function main(): Promise<void> {
  const context = pageContext();
  const store = createExtensionStore(localStorageArea);
  const settings = createExtensionSettings(store, onLocalChanged);
  const clock = { now: () => Date.now() };
  const lists = createIgnoreLists(store, clock);
  const uiState = createUiState(store);
  const catalogs = CATALOGS;

  let setting: string = AUTO_LOCALE;
  try {
    setting = parseSettings(await settings.read()).locale;
  } catch {
    // The form shows the load error; the page still renders in the browser language.
  }
  const locale = resolveLocale(
    { setting, browserLang: navigator.language },
    new Set(Object.keys(catalogs)),
  );
  const i18n = createI18n(catalogs, locale);
  fillText(document, i18n);

  const page = context === "page";
  const initialTab = page ? parseTabHash(location.hash) : undefined;
  const optionsUrl = extensionUrl(OPTIONS_PAGE);
  const form = await mountSettingsForm(document.body, {
    i18n,
    settings,
    lists,
    uiState,
    context,
    layout: page ? "tabs" : "list",
    colors: page,
    locales: Object.keys(catalogs),
    header: { version: extensionVersion(), iconUrl: extensionUrl(ICONS[context]) },
    ...(initialTab === undefined ? {} : { initialTab }),
    // A file chooser can close the toolbar popup before the file arrives, so backup is page only
    ...(page
      ? {
        backup: { files: createFileTransfer(document.body), clock },
        onTabChange: (id) => {
          history.replaceState(null, "", tabHash(id));
        },
      }
      : { allSettingsUrl: optionsUrl, openTab: (id) => void openTab(uiState, id, optionsUrl) }),
  });

  // The page's own copy follows a new language on the next load; reload now.
  settings.subscribe((value) => {
    if (parseSettings(value).locale !== setting) {
      location.reload();
    }
  });

  // A game, developer or publisher ignored or restored on a store page shows up here at once,
  // as does a tab the popup asks for.
  const listKeys = [ALLOW_KEY, ...Object.values(CREATOR_ALLOW_KEYS)];
  onLocalChanged((changes) => {
    if (listKeys.some((key) => changes[key] !== undefined)) {
      void form.refreshAllowList();
    }
    const asked = page ? decodeTabRequest(changes[UI_STATE_KEY]?.newValue) : undefined;
    if (asked !== undefined) {
      form.selectTab(asked);
    }
  });
  if (page) {
    addEventListener("hashchange", () => {
      const id = parseTabHash(location.hash);
      if (id !== undefined) {
        form.selectTab(id);
      }
    });
  }
}

void main();
