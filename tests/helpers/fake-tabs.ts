import type { BrowserTabs } from "../../src/platform/extension/browser-tabs";
import { freshBrowserId } from "./sequence";

/** The IDs the tab calls answer with. */
export interface TabIds {
  /** The active tab, where the popup sat. */
  readonly origin: number;
  /** The tab the settings page runs in. */
  readonly own: number;
  /** The window that activating a tab resolves. */
  readonly window: number;
  /** The active tab of the last-focused window: the settings tab until a test moves it. */
  readonly front: number;
}

/** What the calls of `fakeTabs` answer; `undefined` stands for a call that gives no ID. */
export type TabAnswers = { readonly [Key in keyof TabIds]: TabIds[Key] | undefined; };

/** One of the tab calls, by name. */
export type TabCall = keyof BrowserTabs;

/**
 * Fresh IDs for the origin tab, the settings tab and the origin's window, with the settings tab in
 * front of the last-focused window.
 */
export function tabIds(): TabIds {
  const own = freshBrowserId();
  return { origin: freshBrowserId(), own, window: freshBrowserId(), front: own };
}

/**
 * A typed fake of the tab calls that records each one with its argument. Each call answers from
 * `answers`; a call named in `fails` rejects, as Firefox's `tabs.update` does for a closed tab.
 * `toFront` puts another tab in front of the last-focused window.
 */
export function fakeTabs(
  answers: TabAnswers,
  fails: readonly TabCall[] = [],
): BrowserTabs & { readonly calls: readonly string[]; toFront(id: number): void; } {
  const calls: string[] = [];
  let front = answers.front;
  function answer<T>(call: TabCall, record: string, value: T): Promise<T> {
    calls.push(record);
    return fails.includes(call) ? Promise.reject(new Error()) : Promise.resolve(value);
  }
  return {
    calls,
    activeTabId: () => answer("activeTabId", "activeTabId", answers.origin),
    ownTabId: () => answer("ownTabId", "ownTabId", answers.own),
    focusedTabId: () => answer("focusedTabId", "focusedTabId", front),
    activate: (id) => answer("activate", `activate ${String(id)}`, answers.window),
    focusWindow: (id) => answer("focusWindow", `focusWindow ${String(id)}`, undefined),
    close: (id) => answer("close", `close ${String(id)}`, undefined),
    toFront: (id) => {
      front = id;
    },
  };
}
