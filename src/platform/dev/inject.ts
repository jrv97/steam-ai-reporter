// Dev-only composition root for injection smoke tests on live store pages (plan, "Development
// and debugging loop", layer 2). An agent pastes `dist/dev/inject.js` into a store page through
// the browser's JavaScript tool. The core runs on an in-memory store, plain `fetch` and verbose
// logging; nothing persists past the page. Never packaged (`check_bundle.py`).
import { type App, start } from "../../core/app";
import { createFetchHttp } from "../../core/http";
import { DEFAULT_LOCALE } from "../../core/i18n/catalog";
import { SHIPPED_CATALOGS } from "../../core/i18n/shipped";
import { createI18n } from "../../core/i18n/t";
import { createLogger } from "../../core/log";
import { DEFAULT_SETTINGS, encodeSettings } from "../../core/settings/settings";
import { createSettingsSource } from "../../core/settings/settings-source";
import { SETTINGS_KEY } from "../../core/storage-keys";
import { adoptPageStyles } from "../../core/ui/styles";
import { memoryStore } from "./memory-store";

declare global {
  interface Window {
    /** The running dev app; a second injection stops it first. */
    sarDev?: App;
  }
}

const store = memoryStore(
  new Map([[SETTINGS_KEY, encodeSettings({ ...DEFAULT_SETTINGS, debug: true })]]),
);

window.sarDev?.stop();
start({
  document,
  http: createFetchHttp((url, init) => fetch(url, init)),
  store,
  settings: createSettingsSource(store),
  clock: { now: () => Date.now() },
  console,
  browserLang: navigator.language,
  addPageStyles: adoptPageStyles,
}).then(
  (app) => {
    window.sarDev = app;
  },
  (problem: unknown) => {
    createLogger(createI18n(SHIPPED_CATALOGS, DEFAULT_LOCALE), console, true).error(problem);
  },
);
