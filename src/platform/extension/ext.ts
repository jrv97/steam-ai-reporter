import type { BrowserTabs } from "./browser-tabs";
import { PROGRESS_PORT, type TabPort } from "./progress-port";
import type { OnStorageChanged, StorageArea, StorageChange, StorageChanges } from "./storage-area";
import { STORE_TAB_MESSAGE } from "./store-tab";
import type { OnTabMessage, SetTabIcon } from "./store-tab-icon";

// The one module that names the WebExtension APIs. Everything else in the extension takes the
// narrow interfaces its own modules declare, such as storage-area.ts, browser-tabs.ts,
// progress-port.ts and store-tab-icon.ts, so tests pass typed fakes and never see `chrome`.

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
  focusedTabId: async () =>
    (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id,
  ownTabId: async () => (await api.tabs.getCurrent())?.id,
  windowTabCount: async () => (await api.tabs.query({ currentWindow: true })).length,
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

function tabPort(port: chrome.runtime.Port): TabPort {
  return {
    post: (progress) => {
      try {
        port.postMessage(progress);
      } catch {
        // The popup closed before its disconnect arrived; nobody is left to tell.
      }
    },
    onMessage: (listener) => {
      port.onMessage.addListener((message: unknown) => {
        listener(message);
      });
    },
    onDisconnect: (listener) => {
      port.onDisconnect.addListener(() => {
        // Chromium reports a tab with no content script here; reading it marks it handled.
        void api.runtime.lastError;
        listener();
      });
    },
    disconnect: () => {
      port.disconnect();
    },
  };
}

/** Hands each progress port a store page's content script receives to `serve`. */
export function onProgressConnect(serve: (port: TabPort) => void): void {
  api.runtime.onConnect.addListener((port) => {
    if (port.name === PROGRESS_PORT) {
      serve(tabPort(port));
    }
  });
}

/** Opens a progress port to the content script of the active tab; undefined without a tab. */
export async function connectActiveTab(): Promise<TabPort | undefined> {
  const id = await browserTabs.activeTabId();
  return id === undefined ? undefined : tabPort(api.tabs.connect(id, { name: PROGRESS_PORT }));
}

/** Names this store tab to the background script. */
export const sendStoreTab = async (): Promise<unknown> =>
  api.runtime.sendMessage(STORE_TAB_MESSAGE);

/** Hears runtime messages with the sender's tab ID, which needs no `tabs` permission. */
export const onTabMessage: OnTabMessage = (listener) => {
  api.runtime.onMessage.addListener((message: unknown, sender) => {
    listener(message, sender.tab?.id);
  });
};

export const setTabIcon: SetTabIcon = async (tabId, paths) =>
  api.action.setIcon({ tabId, path: paths });
