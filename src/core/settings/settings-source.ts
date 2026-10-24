import type { KeyValueStore, SettingsSource, Unsubscribe } from "../ports";
import { SETTINGS_KEY } from "../storage-keys";
import { migrateOnce } from "./migrate";
import { encodeSettings, type Settings } from "./settings";

/**
 * Reports changes made by other tabs. The platform adapter supplies it from its own change event
 * (`storage.onChanged`, `GM_addValueChangeListener`) and passes the new stored settings value; a
 * platform without one passes nothing, and settings then apply on the next page load.
 */
export type RemoteSettingsChanges = (listener: (value: unknown) => void) => Unsubscribe;

/** The stored settings: a `SettingsSource` that can also write them. */
export interface StoredSettings extends SettingsSource {
  /** Replaces the stored settings and tells this context's subscribers. */
  write(settings: Settings): Promise<void>;
}

/**
 * `SettingsSource` over a `KeyValueStore`. Subscribers hear this context's writes and, when
 * `remote` is given, the other tabs' changes. A platform that reports its own writes through
 * `remote` too does not notify twice: a value equal to the last one told is not told again. The
 * first read or write moves v1 settings to the v2 key (see `migrateOnce`).
 */
export function createSettingsSource(
  store: KeyValueStore,
  remote?: RemoteSettingsChanges,
): StoredSettings {
  const listeners = new Set<(value: unknown) => void>();
  let lastTold: string | undefined;
  let unsubscribeRemote: Unsubscribe | undefined;

  function tell(value: unknown): void {
    const signature = JSON.stringify(value);
    if (signature === lastTold) {
      return;
    }
    lastTold = signature;
    for (const listener of listeners) {
      listener(value);
    }
  }

  return {
    async read() {
      await migrateOnce(store);
      return (await store.get([SETTINGS_KEY])).get(SETTINGS_KEY);
    },

    async write(settings) {
      await migrateOnce(store);
      const value = encodeSettings(settings);
      await store.set(new Map([[SETTINGS_KEY, value]]));
      tell(value);
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
