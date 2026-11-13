import { ignore } from "./ignore";

// The toolbar icon is dimmed by the manifest's default and normal on store tabs (ADR 0027). A store
// page names its tab to the background script, which sets the normal icon there. Both browsers drop
// a tab's icon on its next cross-document navigation, which brings the dimmed default back.

/** The one message the background script takes; the sender's tab is the store tab. */
export const STORE_TAB_MESSAGE = "tks-store-tab";

/** The window of a store page, as far as the announcement listens to it. */
export interface StorePage extends Pick<Window, "addEventListener"> {
  readonly document: EventTarget;
}

/** Whether the page still renders out of sight; DOM typings lack `prerendering`. */
function prerendering(page: StorePage): boolean {
  return "prerendering" in page.document && page.document.prerendering === true;
}

/**
 * Calls `send` once the person sees the page, and again on each return from the back/forward
 * cache, which restores a page without running its content scripts.
 */
export function announceStoreTab(page: StorePage, send: () => Promise<unknown>): void {
  // A lost message, such as one from a page that outlived an extension update, leaves the dim icon.
  const announce = (): void => {
    send().catch(ignore);
  };
  if (prerendering(page)) {
    page.document.addEventListener("prerenderingchange", announce, { once: true });
  } else {
    announce();
  }
  page.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      announce();
    }
  });
}
