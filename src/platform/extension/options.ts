import * as v from "valibot";
import { resolveLocale } from "../../core/i18n/locale";
import { SHIPPED_CATALOGS } from "../../core/i18n/shipped";
import { type BareMessageKey, createI18n, type I18n } from "../../core/i18n/t";
import { createAllowList } from "../../core/settings/allow-list";
import { AUTO_LOCALE, parseSettings } from "../../core/settings/settings";
import { ALLOW_KEY } from "../../core/storage-keys";
import { createSectionState } from "../../core/ui/section-state";
import { mountSettingsForm, type SettingsContext } from "../../core/ui/settings-form";
import { extensionUrl, extensionVersion, localStorageArea, onLocalChanged } from "./ext";
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

async function main(): Promise<void> {
  const context = pageContext();
  const store = createExtensionStore(localStorageArea);
  const settings = createExtensionSettings(store, onLocalChanged);
  const allowList = createAllowList(store, { now: () => Date.now() });
  const catalogs = SHIPPED_CATALOGS;

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

  const form = await mountSettingsForm(document.body, {
    i18n,
    settings,
    allowList,
    sectionState: createSectionState(store),
    context,
    colors: context === "page",
    locales: Object.keys(catalogs),
    header: { version: extensionVersion(), iconUrl: extensionUrl(ICONS[context]) },
    ...(context === "popup" ? { allSettingsUrl: extensionUrl(OPTIONS_PAGE) } : {}),
  });

  // The page's own copy follows a new language on the next load; reload now.
  settings.subscribe((value) => {
    if (parseSettings(value).locale !== setting) {
      location.reload();
    }
  });

  // A game stopped or marked again on a store page shows up here at once.
  onLocalChanged((changes) => {
    if (changes[ALLOW_KEY] !== undefined) {
      void form.refreshAllowList();
    }
  });
}

void main();
