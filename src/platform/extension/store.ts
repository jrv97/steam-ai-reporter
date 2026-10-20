import type { JsonValue } from "../../core/json";
import type { KeyValueStore } from "../../core/ports";
import { createSettingsSource, type StoredSettings } from "../../core/settings/settings-source";
import { SETTINGS_KEY } from "../../core/storage-keys";
import type { OnLocalChanged, StorageArea } from "./ext";

/**
 * The `KeyValueStore` port over `storage.local`. The browser serializes values on the way in and
 * out, so they are copies on both sides. `keys()` reads every item, because `getKeys()` is not in
 * every supported browser; core calls it only for the daily cache sweep.
 */
export function createExtensionStore(area: StorageArea): KeyValueStore {
  return {
    async get(keys) {
      if (keys.length === 0) {
        return new Map();
      }
      const items = await area.get([...keys]);
      const found = new Map<string, unknown>();
      for (const key of keys) {
        if (Object.hasOwn(items, key)) {
          found.set(key, items[key]);
        }
      }
      return found;
    },
    async set(entries) {
      if (entries.size > 0) {
        const items: Record<string, JsonValue> = {};
        for (const [key, value] of entries) {
          items[key] = value;
        }
        await area.set(items);
      }
    },
    async remove(keys) {
      if (keys.length > 0) {
        await area.remove([...keys]);
      }
    },
    async keys() {
      return Object.keys(await area.get(null));
    },
  };
}

/** The stored settings, with changes from other tabs and the options page through `onChanged`. */
export function createExtensionSettings(
  store: KeyValueStore,
  onChanged: OnLocalChanged,
): StoredSettings {
  return createSettingsSource(store, (listener) =>
    onChanged((changes) => {
      const change = changes[SETTINGS_KEY];
      if (change !== undefined) {
        listener(change.newValue);
      }
    }));
}
