import type { StorePage } from "../../src/platform/extension/store-tab";
import type {
  IconPaths,
  OnTabMessage,
  SetTabIcon,
} from "../../src/platform/extension/store-tab-icon";
import { pageTransition } from "./surfaces";

export interface FakeStorePage extends StorePage {
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
      page.dispatchEvent(pageTransition("pageshow", persisted));
    },
  });
  return page;
}

export interface FakeSender {
  readonly send: () => Promise<unknown>;
  /** How many times `send` ran. */
  readonly count: number;
}

/** A message sender that counts its calls; with `fails` each call rejects. */
export function fakeSender(options: { readonly fails: boolean; } = { fails: false }): FakeSender {
  let count = 0;
  return {
    send: () => {
      count += 1;
      return options.fails ? Promise.reject(new Error()) : Promise.resolve();
    },
    get count() {
      return count;
    },
  };
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

export interface FakeTabIcon {
  readonly set: SetTabIcon;
  /** Each icon set, in order. */
  readonly calls: readonly { readonly tabId: number; readonly paths: IconPaths; }[];
}

/** The toolbar icon call; with `fails` it rejects, as for a tab that closed. */
export function fakeTabIcon(options: { readonly fails: boolean; } = { fails: false }): FakeTabIcon {
  const calls: { tabId: number; paths: IconPaths; }[] = [];
  return {
    calls,
    set: (tabId, paths) => {
      calls.push({ tabId, paths });
      return options.fails ? Promise.reject(new Error()) : Promise.resolve();
    },
  };
}
