import type { JsonValue } from "../../core/json";
import type { KeyValueStore, Unsubscribe } from "../../core/ports";
import type { RemoteSettingsChanges } from "../../core/settings/settings-source";
import { SETTINGS_KEY } from "../../core/storage-keys";

/** The storage calls of the `GM` object, as the composition root hands them over. */
export interface GmStorage {
  getValue(name: string): Promise<unknown>;
  setValue(name: string, value: JsonValue): Promise<void>;
  deleteValue(name: string): Promise<void>;
  listValues(): Promise<readonly string[]>;
}

/**
 * The `KeyValueStore` over `GM.getValue`, `GM.setValue`, `GM.deleteValue` and `GM.listValues`. A
 * key the manager has no value for reads as `undefined` and is absent from the result; the manager
 * stores serialized values, so what goes in and out is copied.
 */
export function createGmStore(gm: GmStorage): KeyValueStore {
  return {
    async get(keys) {
      const values = await Promise.all(keys.map((key) => gm.getValue(key)));
      const found = new Map<string, unknown>();
      keys.forEach((key, index) => {
        const value = values[index];
        if (value !== undefined) {
          found.set(key, value);
        }
      });
      return found;
    },
    async set(entries) {
      await Promise.all([...entries].map(([key, value]) => gm.setValue(key, value)));
    },
    async remove(keys) {
      await Promise.all(keys.map((key) => gm.deleteValue(key)));
    },
    async keys() {
      return [...(await gm.listValues())];
    },
  };
}

/** Starts watching one stored value for changes made in any tab. */
export type WatchValue = (key: string, onChange: (value: unknown) => void) => void;

/**
 * Settings changes from other tabs through `GM_addValueChangeListener`. Managers without it give
 * `undefined`, and settings then apply on the next page load. The API has no removal in the
 * grants, so an unsubscribed listener stays registered and ignores what it hears.
 */
export function createRemoteSettings(
  watch: WatchValue | undefined,
): RemoteSettingsChanges | undefined {
  if (watch === undefined) {
    return undefined;
  }
  return (listener): Unsubscribe => {
    let active = true;
    watch(SETTINGS_KEY, (value) => {
      if (active) {
        listener(value);
      }
    });
    return () => {
      active = false;
    };
  };
}
