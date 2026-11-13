import type { ShownPage } from "../../src/platform/extension/store-tab";
import type { OnTabMessage, ShowStoreIcon } from "../../src/platform/extension/store-tab-icon";

export interface FakeStorePage extends ShownPage {
  /** Ends prerendering, as the browser does when the person opens the page. */
  show(): void;
  /** Fires `pageshow`; `persisted` marks a return from the back/forward cache. */
  pageshow(persisted: boolean): void;
}

/** A store page's window and document over plain event targets. */
export function fakeStorePage(options: { readonly prerendering: boolean; }): FakeStorePage {
  const document = Object.assign(new EventTarget(), { prerendering: options.prerendering });
  const page = Object.assign(new EventTarget(), {
    document,
    show() {
      document.prerendering = false;
      document.dispatchEvent(new Event("prerenderingchange"));
    },
    pageshow(persisted: boolean) {
      page.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
    },
  });
  return page;
}

export interface FakeTabMessages {
  readonly onMessage: OnTabMessage;
  /** Hands a message to every listener, as sent from the tab `tabId`. */
  deliver(message: unknown, tabId: number | undefined): void;
}

/** A runtime message feed a test delivers through. */
export function fakeTabMessages(): FakeTabMessages {
  const listeners: Parameters<OnTabMessage>[0][] = [];
  return {
    onMessage: (listener) => {
      listeners.push(listener);
    },
    deliver: (message, tabId) => {
      for (const listener of listeners) {
        listener(message, tabId);
      }
    },
  };
}

export interface FakeStoreIcon {
  readonly show: ShowStoreIcon;
  /** The tabs the icon was set on, in order. */
  readonly shown: readonly number[];
}

/** The toolbar icon call; with `fails` it rejects, as for a tab that closed. */
export function fakeStoreIcon(
  options: { readonly fails: boolean; } = { fails: false },
): FakeStoreIcon {
  const shown: number[] = [];
  return {
    shown,
    show: (tabId) => {
      shown.push(tabId);
      return options.fails ? Promise.reject(new Error()) : Promise.resolve();
    },
  };
}
