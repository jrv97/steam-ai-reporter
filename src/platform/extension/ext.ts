import type { LocalChanges, OnLocalChanged, StorageArea, StorageChange } from "./storage-area";

export type { LocalChanges, OnLocalChanged, StorageArea, StorageChange };

// The one module that names the WebExtension APIs. Everything else in the extension takes the
// narrow interfaces of storage-area.ts, so tests pass typed fakes and the rest of the code never
// sees `chrome` or `browser`.

/**
 * Firefox's promise-based `browser`, else Chrome's `chrome`. `@types/chrome` declares `browser` as
 * always present, so the shorter `browser ?? chrome` would read as an unnecessary condition.
 */
const api: typeof chrome = "browser" in globalThis ? globalThis.browser : globalThis.chrome;

const LOCAL_AREA = "local";

export const localStorageArea: StorageArea = {
  get: (keys) => api.storage.local.get(keys),
  set: (items) => api.storage.local.set(items),
  remove: (keys) => api.storage.local.remove(keys),
};

export const onLocalChanged: OnLocalChanged = (listener) => {
  const relay = (changes: Readonly<Record<string, StorageChange>>, area: string): void => {
    if (area === LOCAL_AREA) {
      listener(changes);
    }
  };
  api.storage.onChanged.addListener(relay);
  return () => {
    api.storage.onChanged.removeListener(relay);
  };
};

/** The manifest version, which the build takes from `package.json` (rule 7). */
export function extensionVersion(): string {
  return api.runtime.getManifest().version;
}

/** Focuses the open options page, or opens it in a tab; the manifest's `options_ui` names it. */
export function openOptionsPage(): Promise<void> {
  return api.runtime.openOptionsPage();
}

/** The absolute URL of a file packaged with the extension. */
export function extensionUrl(path: string): string {
  return api.runtime.getURL(path);
}
