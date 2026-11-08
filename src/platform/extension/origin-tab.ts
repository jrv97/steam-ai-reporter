import * as v from "valibot";
import { APP_PAGE_ORIGIN } from "../../core/detect/app-page";
import type { KeyValueStore } from "../../core/ports";
import { ORIGIN_KEY } from "../../core/storage-keys";
import type { BrowserTabs } from "./browser-tabs";
import type { StorageChanges } from "./storage-area";

// The settings page's way back to the store tab it was opened from (ADR 0019). The popup writes
// the active tab's ID to `storage.session`; the page takes it once and removes it.

/** A browser tab ID: a non-negative integer, which leaves out `TAB_ID_NONE` (-1). */
export const BrowserTabIdSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.brand("BrowserTabId"),
);

export type BrowserTabId = v.InferOutput<typeof BrowserTabIdSchema>;

/** A failure the caller can do without. */
const ignore = (): undefined => undefined;

function toTabId(value: unknown): BrowserTabId | undefined {
  const parsed = v.safeParse(BrowserTabIdSchema, value);
  return parsed.success ? parsed.output : undefined;
}

/** Writes the active tab's ID before the popup opens the settings. Never rejects. */
export async function recordOrigin(
  tabs: Pick<BrowserTabs, "activeTabId">,
  session: KeyValueStore,
): Promise<void> {
  // Without an origin the settings page's button opens the store home
  const id = toTabId(await tabs.activeTabId().catch(ignore));
  if (id !== undefined) {
    await session.set(new Map([[ORIGIN_KEY, id]])).catch(ignore);
  }
}

export interface GoBackDeps {
  readonly tabs: Pick<BrowserTabs, "ownTabId" | "activate" | "focusWindow" | "close">;
  /** The store over `storage.session`, where the popup leaves the origin. */
  readonly session: KeyValueStore;
  /** Hears changes in the session area for the life of the page. */
  readonly onChanged: (listener: (changes: StorageChanges) => void) => void;
  /** Loads a URL in this tab. */
  readonly navigate: (url: string) => void;
}

/**
 * The settings page's Go back to Steam action. It switches to the origin tab, focuses its window
 * and closes the settings tab; with no reachable origin it opens the store home in this tab.
 */
export function createGoBack(deps: GoBackDeps): () => void {
  const { tabs, session } = deps;
  let own: BrowserTabId | undefined;
  let origin: BrowserTabId | undefined;
  let run: Promise<void> | undefined;

  /** Holds a valid origin and removes the key. The own tab's ID means the popup sat on this tab. */
  function take(value: unknown): void {
    const id = toTabId(value);
    if (id !== undefined && id !== own) {
      origin = id;
    }
    void session.remove([ORIGIN_KEY]).catch(ignore);
  }

  async function start(): Promise<void> {
    own = toTabId(await tabs.ownTabId().catch(ignore));
    // Subscribe before the read, so a write between the two is not missed
    deps.onChanged((changes) => {
      const value = changes[ORIGIN_KEY]?.newValue;
      if (value !== undefined) {
        take(value);
      }
    });
    const stored = await session.get([ORIGIN_KEY]).catch(ignore);
    if (stored?.has(ORIGIN_KEY) === true) {
      take(stored.get(ORIGIN_KEY));
    }
  }

  // A browser without the session area still gets the store home
  const ready = start().catch(ignore);

  async function goBack(): Promise<void> {
    await ready;
    const windowId = origin === undefined ? undefined : await tabs.activate(origin).catch(ignore);
    if (windowId === undefined) {
      deps.navigate(`${APP_PAGE_ORIGIN}/`);
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
