// The toolbar icon is dimmed by the manifest's default and normal on store tabs (ADR 0027). A store
// page names its tab to the background script, which sets the normal icon there. Both browsers drop
// a tab's icon on its next cross-document navigation, which brings the dimmed default back.

/** The one message the background script takes; the sender's tab is the store tab. */
export const STORE_TAB_MESSAGE = { type: "tks-store-tab" } as const;

/** The icon of a store tab, by size; the manifest's `default_icon` names the dimmed set. */
export const STORE_TAB_ICON = { "16": "icons/icon-16.png", "32": "icons/icon-32.png" } as const;

/** The window and document of a store page, as far as the announcement listens to them. */
export interface ShownPage extends EventTarget {
  readonly document: EventTarget;
}

/** Whether the page still renders out of sight; DOM typings lack `prerendering`. */
function prerendering(page: ShownPage): boolean {
  return "prerendering" in page.document && page.document.prerendering === true;
}

/**
 * Calls `send` once the person sees the page, and again on each return from the back/forward
 * cache, which restores a page without running its content scripts.
 */
export function announceStoreTab(page: ShownPage, send: () => void): void {
  if (prerendering(page)) {
    page.document.addEventListener("prerenderingchange", send, { once: true });
  } else {
    send();
  }
  page.addEventListener("pageshow", (event) => {
    if ("persisted" in event && event.persisted === true) {
      send();
    }
  });
}
