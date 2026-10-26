import * as v from "valibot";
import { parseWithDefaults } from "../json";
import type { KeyValueStore } from "../ports";
import { createSerial } from "../serial";
import { UI_STATE_KEY } from "../storage-keys";
import { TAB_IDS, type TabId } from "./tab-id";

/** The settings tab last shown, kept across visits and shared by the popup and the page. */
export interface UiState {
  /** The tab last shown, or undefined for none. Rejects when the store cannot be read. */
  read(): Promise<TabId | undefined>;
  /** Remembers the tab shown. Writes nothing for the tab stored now. */
  setTab(id: TabId): Promise<void>;
  /**
   * Asks an open options page to show a tab, and remembers it for one that opens next. `at`
   * makes each request a new value, so the store reports it even for the stored tab.
   */
  requestTab(id: TabId, at: number): Promise<void>;
}

// Each field falls back on its own. An older build's `open` map is not read, and the first write
// leaves it out.
const StoredSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TAB_IDS)), undefined),
  asked: v.fallback(v.optional(v.number()), undefined),
});

/** The tab a stored value remembers, or undefined. */
export function decodeTab(stored: unknown): TabId | undefined {
  return parseWithDefaults(StoredSchema, stored).tab;
}

/** The tab a stored value asks an open page to show; undefined when it is no request. */
export function decodeTabRequest(stored: unknown): TabId | undefined {
  const { tab, asked } = parseWithDefaults(StoredSchema, stored);
  return asked === undefined ? undefined : tab;
}

/**
 * The tab memory over a `KeyValueStore`, stored as `v2:ui`. Writes run one after another in this
 * context and read the stored value first, which spares the write for the tab stored now.
 */
export function createUiState(store: KeyValueStore): UiState {
  async function read(): Promise<TabId | undefined> {
    const stored = await store.get([UI_STATE_KEY]);
    return decodeTab(stored.get(UI_STATE_KEY));
  }

  const serial = createSerial();

  return {
    read,

    setTab: (id) =>
      serial(async () => {
        if ((await read()) !== id) {
          await store.set(new Map([[UI_STATE_KEY, { tab: id }]]));
        }
      }),

    requestTab: (id, at) =>
      serial(() => store.set(new Map([[UI_STATE_KEY, { tab: id, asked: at }]]))),
  };
}
