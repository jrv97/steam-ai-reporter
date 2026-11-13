import { ignore } from "./ignore";
import { STORE_TAB_MESSAGE } from "./store-tab";

// The background script's only job (rule 3, ADR 0027): set the normal toolbar icon on the tab a
// store page names. It holds no state and answers nothing.

/** The icon of a store tab, by size; the manifest's `default_icon` names the dimmed set. */
export const STORE_TAB_ICON = { "16": "icons/icon-16.png", "32": "icons/icon-32.png" } as const;

/** Icon files by size in pixels, as the manifest names them. */
export type IconPaths = Readonly<Record<string, string>>;

/** Hears each runtime message with the ID of the tab that sent it, if a tab sent it. */
export type OnTabMessage = (
  listener: (message: unknown, tabId: number | undefined) => void,
) => void;

/** Sets the toolbar icon of one tab until that tab loads another document. */
export type SetTabIcon = (tabId: number, paths: IconPaths) => Promise<unknown>;

/** Sets the normal icon on each tab whose store page announces itself. */
export function serveStoreTabs(onMessage: OnTabMessage, setTabIcon: SetTabIcon): void {
  onMessage((message, tabId) => {
    // Equality with the constant is the whole check; the message carries no value to parse.
    if (tabId !== undefined && message === STORE_TAB_MESSAGE) {
      // A tab closed before its icon changed keeps nothing to fix.
      setTabIcon(tabId, STORE_TAB_ICON).catch(ignore);
    }
  });
}
