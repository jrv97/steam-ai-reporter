import type { BrowserTabs } from "./browser-tabs";
import type { OnStorageChanged, StorageArea, StorageChange, StorageChanges } from "./storage-area";

// The one module that names the WebExtension APIs. Everything else in the extension takes the
// narrow interfaces of storage-area.ts and browser-tabs.ts, so tests pass typed fakes and the rest
// of the code never sees `chrome` or `browser`.

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

export const onLocalChanged: OnStorageChanged = (listener) => {
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

/** `storage.session`: in memory, cleared when the browser closes or the extension reloads. */
export function sessionStorageArea(): StorageArea {
  return api.storage.session;
}

/** Hears `storage.session` through the area's own event, which needs no area name. */
export function onSessionChanged(listener: (changes: StorageChanges) => void): void {
  api.storage.session.onChanged.addListener(listener);
}

// Async arrows turn a missing API's TypeError into a rejection.
export const browserTabs: BrowserTabs = {
  activeTabId: async () => (await api.tabs.query({ active: true, currentWindow: true }))[0]?.id,
  ownTabId: async () => (await api.tabs.getCurrent())?.id,
  activate: async (id) => (await api.tabs.update(id, { active: true }))?.windowId,
  focusWindow: async (id) => api.windows.update(id, { focused: true }),
  close: async (id) => api.tabs.remove(id),
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
