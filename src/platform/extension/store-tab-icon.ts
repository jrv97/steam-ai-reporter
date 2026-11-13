import * as v from "valibot";
import { STORE_TAB_MESSAGE } from "./store-tab";

// The background script's only job (rule 3, ADR 0027): set the normal toolbar icon on the tab a
// store page names. It holds no state and answers nothing.

const StoreTabMessageSchema = v.strictObject({ type: v.literal(STORE_TAB_MESSAGE.type) });

/** Hears each runtime message with the ID of the tab that sent it, if a tab sent it. */
export type OnTabMessage = (
  listener: (message: unknown, tabId: number | undefined) => void,
) => void;

/** Sets the normal icon on a store tab. */
export type ShowStoreIcon = (tabId: number) => Promise<unknown>;

/** Sets the normal icon on each tab whose store page announces itself. */
export function serveStoreTabs(onMessage: OnTabMessage, showStoreIcon: ShowStoreIcon): void {
  onMessage((message, tabId) => {
    if (tabId !== undefined && v.is(StoreTabMessageSchema, message)) {
      // A tab closed before its icon changed keeps nothing to fix.
      showStoreIcon(tabId).catch(() => undefined);
    }
  });
}
