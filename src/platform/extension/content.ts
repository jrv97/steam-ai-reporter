import { start } from "../../core/app";
import { createFetchHttp } from "../../core/http";
import { CATALOGS } from "./content.catalogs.gen";
import { localStorageArea, onLocalChanged } from "./ext";
import { createExtensionSettings, createExtensionStore } from "./store";

// Composition root of the extension content script (ADR 0003: content script only). It builds the
// ports over `storage.local`, `storage.onChanged` and plain `fetch`, which the store page's origin
// lets read GetItems (rq6, S4), and hands them to core. The scanner itself pauses on `pagehide` and
// resumes from the bfcache.

const store = createExtensionStore(localStorageArea);

void start({
  document,
  http: createFetchHttp((url, init) => fetch(url, init)),
  store,
  settings: createExtensionSettings(store, onLocalChanged),
  clock: { now: () => Date.now() },
  console,
  browserLang: navigator.language,
  catalogs: CATALOGS,
  // The manifest's content.css carries the page stylesheet.
  addPageStyles: () => undefined,
});
