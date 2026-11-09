import * as v from "valibot";
import { readSettingsI18n } from "../../core/i18n/settings-i18n";
import type { BareMessageKey, I18n } from "../../core/i18n/t";
import { createIgnoreLists } from "../../core/ignored";
import type { KeyValueStore } from "../../core/ports";
import { parseSettings } from "../../core/settings/settings";
import { ALLOW_KEY, CREATOR_ALLOW_KEYS, UI_STATE_KEY } from "../../core/storage-keys";
import { mountSettingsForm, type SettingsContext } from "../../core/ui/settings-form";
import { parseTabHash, tabHash, type TabId } from "../../core/ui/tab-id";
import { createUiState, decodeTabRequest, type UiState } from "../../core/ui/ui-state";
import { createFileTransfer } from "../shared/file-transfer";
import {
  browserTabs,
  extensionUrl,
  extensionVersion,
  localStorageArea,
  onLocalChanged,
  onSessionChanged,
  openOptionsPage,
  sessionStorageArea,
} from "./ext";
import { CATALOGS } from "./options.catalogs.gen";
import { createGoBack, recordOrigin } from "./origin-tab";
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
 * From a popup row or the gear: asks an open options page for the tab, if there is one, and
 * focuses it, or opens the page, which reads the same request. Without the API, the link's own
 * address opens in a new tab. The popup closes either way. The store tab under the popup goes
 * first to the session area, outside the try, so a failed write opens no second settings tab.
 */
async function openSettings(
  uiState: UiState,
  session: KeyValueStore,
  id: TabId | undefined,
  optionsUrl: string,
): Promise<void> {
  await recordOrigin(browserTabs, session);
  try {
    if (id !== undefined) {
      await uiState.requestTab(id, Date.now());
    }
    await openOptionsPage();
  } catch {
    open(id === undefined ? optionsUrl : `${optionsUrl}${tabHash(id)}`, "_blank", "noopener");
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
  const session = createExtensionStore(sessionStorageArea());
  const catalogs = CATALOGS;

  // On a failed read the page renders in the browser language and the form shows the error.
  const { setting, i18n } = await readSettingsI18n(
    settings,
    catalogs,
    { browserLang: navigator.language },
    console,
  );
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
        goBack: createGoBack({
          tabs: browserTabs,
          session,
          onChanged: onSessionChanged,
          window,
        }),
        onTabChange: (id) => {
          history.replaceState(null, "", tabHash(id));
        },
      }
      : {
        allSettingsUrl: optionsUrl,
        openSettings: (id) => void openSettings(uiState, session, id, optionsUrl),
      }),
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
