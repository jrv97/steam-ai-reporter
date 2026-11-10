import { start } from "../../core/app";
import { createFetchHttp } from "../../core/http";
import { followProgress } from "../../core/progress";
import { CATALOGS } from "./content.catalogs.gen";
import { localStorageArea, onLocalChanged, onProgressConnect } from "./ext";
import { serveProgress } from "./progress-port";
import { createExtensionSettings, createExtensionStore } from "./store";

// Composition root of the extension content script (ADR 0003: content script only). It builds the
// ports over `storage.local`, `storage.onChanged` and plain `fetch`, which the store page's origin
// lets read GetItems (rq6, S4), and hands them to core. The scanner itself pauses on `pagehide` and
// resumes from the bfcache. The toolbar popup reads the page's load progress through a port.

const store = createExtensionStore(localStorageArea);

const app = start({
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

// Listening from the first moment, so a popup opened while the app starts still connects
const progress = followProgress(
  app.then((running) => running.progress, (problem: unknown) => {
    console.error(problem);
    return undefined;
  }),
);
onProgressConnect((port) => {
  serveProgress(progress, port);
});
