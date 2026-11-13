import * as v from "valibot";
import { APP_PAGE_ORIGIN } from "../../core/detect/app-page";
import type { KeyValueStore } from "../../core/ports";
import { ORIGIN_KEY } from "../../core/storage-keys";
import type { BrowserTabs } from "./browser-tabs";
import { ignore } from "./ignore";
import type { StorageChanges } from "./storage-area";

// The settings page's way back to the store tab it was opened from (ADR 0019). The popup writes
// the active tab's ID to `storage.session`; the settings tab in front takes it and removes it.

/** A browser tab ID: a non-negative integer, which leaves out `TAB_ID_NONE` (-1). */
const BrowserTabIdSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.brand("BrowserTabId"),
);

type BrowserTabId = v.InferOutput<typeof BrowserTabIdSchema>;

function toTabId(value: unknown): BrowserTabId | undefined {
  const parsed = v.safeParse(BrowserTabIdSchema, value);
  return parsed.success ? parsed.output : undefined;
}

/** Writes the active tab's ID before the popup opens the settings. Never rejects. */
export async function recordOrigin(
  tabs: Pick<BrowserTabs, "activeTabId">,
  session: KeyValueStore,
): Promise<void> {
  // Without an origin the settings page's button closes the tab or opens the store home
  const id = toTabId(await tabs.activeTabId().catch(ignore));
  if (id !== undefined) {
    await session.set(new Map([[ORIGIN_KEY, id]])).catch(ignore);
  }
}

export interface GoBackDeps {
  readonly tabs: Pick<
    BrowserTabs,
    "ownTabId" | "focusedTabId" | "activate" | "focusWindow" | "close" | "windowTabCount"
  >;
  /** The store over `storage.session`, where the popup leaves the origin. */
  readonly session: KeyValueStore;
  /** Hears changes in the session area for the life of the page. */
  readonly onChanged: (listener: (changes: StorageChanges) => void) => void;
  /** The page's window: its `focus` event fires when the page comes to the front. */
  readonly window: EventTarget & { readonly location: Pick<Location, "assign">; };
}

/**
 * The settings page's Go back action. It switches to the origin tab, focuses its window and closes
 * the settings tab. With no reachable origin it closes the settings tab when its window holds
 * another tab, and else opens the store home in this tab.
 */
export function createGoBack(deps: GoBackDeps): () => void {
  const { tabs, session } = deps;
  let own: BrowserTabId | undefined;
  let origin: BrowserTabId | undefined;
  let run: Promise<void> | undefined;

  /**
   * Takes a stored origin once this tab is in front of the last-focused window: Chromium opens a
   * second settings tab in another window, and only that tab may take it. An origin equal to the
   * own tab means the popup sat on this tab, and the origin held before stays.
   */
  async function claim(): Promise<void> {
    const stored = await session.get([ORIGIN_KEY]).catch(ignore);
    if (stored?.has(ORIGIN_KEY) === true) {
      const front = await tabs.focusedTabId().catch(ignore);
      if (front === undefined || front === own) {
        const id = toTabId(stored.get(ORIGIN_KEY));
        origin = id === undefined || id === own ? origin : id;
        void session.remove([ORIGIN_KEY]).catch(ignore);
      }
    }
  }

  /** Queues a claim after the ones before it. */
  function wake(): void {
    claims = claims.then(claim);
  }

  async function start(): Promise<void> {
    own = toTabId(await tabs.ownTabId().catch(ignore));
    // Listen before the read, so a write between the two is not missed
    deps.onChanged(wake);
    // Firefox focuses an open settings tab after the popup writes the origin
    deps.window.addEventListener("focus", wake);
    await claim();
  }

  // A browser without the session area still gets a way out
  let claims = start().catch(ignore);

  /** Closes this tab when its window keeps another one open; true when it closed. */
  async function closeAmongOthers(): Promise<boolean> {
    const count = own === undefined ? undefined : await tabs.windowTabCount().catch(ignore);
    if (own === undefined || count === undefined || count < 2) {
      return false;
    }
    return tabs.close(own).then(() => true, () => false);
  }

  async function goBack(): Promise<void> {
    await claims;
    const windowId = origin === undefined ? undefined : await tabs.activate(origin).catch(ignore);
    if (windowId === undefined) {
      // The window's only tab stays open, on the store home
      if (!(await closeAmongOthers())) {
        deps.window.location.assign(`${APP_PAGE_ORIGIN}/`);
      }
      return;
    }
    // The person is on the tab they asked for, so these two failures do not matter
    await tabs.focusWindow(windowId).catch(ignore);
    if (own !== undefined) {
      await tabs.close(own).catch(ignore);
    }
  }

  // One run at a time
  return () => {
    run ??= goBack().finally(() => {
      run = undefined;
    });
  };
}
