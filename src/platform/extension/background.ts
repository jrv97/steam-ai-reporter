import { onTabMessage, setTabIcon } from "./ext";
import { serveStoreTabs } from "./store-tab-icon";

// Composition root of the background script: a service worker in Chromium, an event page in Gecko
// (ADR 0027). The listener is added at the top level, so the event that wakes the script finds it.

serveStoreTabs(onTabMessage, setTabIcon);
