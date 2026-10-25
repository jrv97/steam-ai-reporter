import type { KeyValueStore, SettingsSource, Unsubscribe } from "../ports";
import { createSerial } from "../serial";
import { SETTINGS_KEY } from "../storage-keys";
import { migrateSettings, readSettingsValue } from "./migrate";
import {
  applyPatch,
  encodeSettings,
  parseSettings,
  type Settings,
  type SettingsPatch,
} from "./settings";

/**
 * Reports changes made by other tabs. The platform adapter supplies it from its own change event
 * (`storage.onChanged`, `GM_addValueChangeListener`) and passes the new stored settings value; a
 * platform without one passes nothing, and settings then apply on the next page load.
 */
export type RemoteSettingsChanges = (listener: (value: unknown) => void) => Unsubscribe;

/** The stored settings: a `SettingsSource` that can also change them. */
export interface StoredSettings extends SettingsSource {
  /**
   * Replaces the fields of `patch` in the settings stored now, writes them and returns them.
   * Patches from one context run in turn; two tabs at once can still lose one.
   */
  patch(patch: SettingsPatch): Promise<Settings>;
}

/**
 * `SettingsSource` over a `KeyValueStore`. Subscribers hear this context's writes and the other
 * tabs' changes from `remote`, without telling the same value twice. A read copies v1 settings.
 */
export function createSettingsSource(
  store: KeyValueStore,
  remote?: RemoteSettingsChanges,
): StoredSettings {
  const listeners = new Set<(value: unknown) => void>();
  let lastTold: string | undefined;
  let unsubscribeRemote: Unsubscribe | undefined;
  const serial = createSerial();

  function tell(value: unknown): void {
    const signature = JSON.stringify(value);
    if (signature === lastTold) {
      return;
    }
    lastTold = signature;
    for (const listener of listeners) {
      try {
        listener(value);
      } catch {
        // A subscriber's failure is its own; the write that told it has landed.
      }
    }
  }

  async function write(settings: Settings): Promise<void> {
    // Never put defaults over v1 settings that were not copied: a failed copy rejects the write.
    await migrateSettings(store);
    const value = encodeSettings(settings);
    await store.set(new Map([[SETTINGS_KEY, value]]));
    tell(value);
  }

  return {
    async read() {
      return readSettingsValue(store);
    },

    patch(patch) {
      return serial(async () => {
        const next = applyPatch(parseSettings(await readSettingsValue(store)), patch);
        await write(next);
        return next;
      });
    },

    subscribe(listener) {
      listeners.add(listener);
      unsubscribeRemote ??= remote?.(tell);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeRemote?.();
          unsubscribeRemote = undefined;
        }
      };
    },
  };
}
