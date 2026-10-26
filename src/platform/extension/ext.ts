import type { JsonValue } from "../../core/json";
import type { Unsubscribe } from "../../core/ports";

// The one module that names the WebExtension APIs. Everything else in the extension takes the
// narrow interfaces below, so tests pass typed fakes and the rest of the code never sees `chrome`
// or `browser`.

/**
 * Firefox's promise-based `browser`, else Chrome's `chrome`. `@types/chrome` declares `browser` as
 * always present, so the shorter `browser ?? chrome` would read as an unnecessary condition.
 */
const api: typeof chrome = "browser" in globalThis ? globalThis.browser : globalThis.chrome;

/**
 * The part of `storage.local` the store adapter uses. Reads stay `unknown`: the type argument of
 * `get<T>()` is never passed, since it would be an unchecked assertion (rule 10).
 */
export interface StorageArea {
  /** The stored items of `keys`, or every item for `null`. */
  get(keys: string[] | null): Promise<Readonly<Record<string, unknown>>>;
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** One key's change, as `storage.onChanged` reports it. */
export interface StorageChange {
  readonly newValue?: unknown;
}

/** The changes of one `storage.onChanged` event in the `local` area, by key. */
export type LocalChanges = Readonly<Record<string, StorageChange>>;

/** Subscribes to changes in `storage.local`, from any context of this extension. */
export type OnLocalChanged = (listener: (changes: LocalChanges) => void) => Unsubscribe;

const LOCAL_AREA = "local";

export const localStorageArea: StorageArea = {
  get: (keys) => api.storage.local.get(keys),
  set: (items) => api.storage.local.set(items),
  remove: (keys) => api.storage.local.remove(keys),
};

export const onLocalChanged: OnLocalChanged = (listener) => {
  const relay = (changes: Readonly<Record<string, StorageChange>>, area: string): void => {
    if (area === LOCAL_AREA) {
      listener(changes);
    }
  };
  api.storage.onChanged.addListener(relay);
  return () => {
    api.storage.onChanged.removeListener(relay);
  };
};

/** The manifest version, which the build takes from `package.json` (rule 7). */
export function extensionVersion(): string {
  return api.runtime.getManifest().version;
}

/** Focuses the open options page, or opens it in a tab; the manifest's `options_ui` names it. */
export function openOptionsPage(): Promise<void> {
  return api.runtime.openOptionsPage();
}

/** The absolute URL of a file packaged with the extension. */
export function extensionUrl(path: string): string {
  return api.runtime.getURL(path);
}
