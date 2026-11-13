import { sendStoreTab } from "./ext";
import { announceStoreTab } from "./store-tab";

// Composition root of the store page's first content script, at `document_start` (ADR 0027). It
// names the tab to the background script as early as the page allows, so the icon turns normal.

announceStoreTab(window, sendStoreTab);
