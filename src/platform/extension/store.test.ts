import { describe, expect, it } from "vitest";
import { keyValueStoreContract } from "../../../tests/contracts/key-value-store.contract";
import type { JsonValue } from "../../core/json";
import type { Unsubscribe } from "../../core/ports";
import { DEFAULT_SETTINGS, encodeSettings } from "../../core/settings/settings";
import { SETTINGS_KEY } from "../../core/storage-keys";
import type { LocalChanges, StorageArea } from "./ext";
import { createExtensionSettings, createExtensionStore } from "./store";

/** A typed `storage.local` fake that clones values in and out, as the browsers serialize them. */
function fakeArea(): StorageArea & { readonly calls: string[]; } {
  const items = new Map<string, JsonValue>();
  const calls: string[] = [];
  return {
    calls,
    get(keys) {
      calls.push("get");
      const found: Record<string, unknown> = {};
      for (const [key, value] of items) {
        if (keys === null || keys.includes(key)) {
          found[key] = structuredClone(value);
        }
      }
      return Promise.resolve(found);
    },
    set(entries) {
      calls.push("set");
      for (const [key, value] of Object.entries(entries)) {
        items.set(key, structuredClone(value));
      }
      return Promise.resolve();
    },
    remove(keys) {
      calls.push("remove");
      for (const key of keys) {
        items.delete(key);
      }
      return Promise.resolve();
    },
  };
}

/** A fake `onChanged` that the test fires by hand. */
function fakeChanges() {
  const listeners = new Set<(changes: LocalChanges) => void>();
  return {
    subscribe: (listener: (changes: LocalChanges) => void): Unsubscribe => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire(changes: LocalChanges) {
      for (const listener of listeners) {
        listener(changes);
      }
    },
    get size() {
      return listeners.size;
    },
  };
}

keyValueStoreContract("extension storage.local", () => createExtensionStore(fakeArea()));

describe("createExtensionStore", () => {
  it("makes no storage call for empty batches", async () => {
    const area = fakeArea();
    const store = createExtensionStore(area);
    await store.get([]);
    await store.set(new Map());
    await store.remove([]);
    expect(area.calls).toStrictEqual([]);
  });
});

describe("createExtensionSettings", () => {
  it("relays settings changes from other contexts and ignores other keys", () => {
    const changes = fakeChanges();
    const settings = createExtensionSettings(createExtensionStore(fakeArea()), changes.subscribe);
    const seen: unknown[] = [];
    const unsubscribe = settings.subscribe((value) => {
      seen.push(value);
    });
    const hidden = encodeSettings({ ...DEFAULT_SETTINGS, listFilter: "hide" });
    changes.fire({ "v1:allow": { newValue: {} } });
    changes.fire({ [SETTINGS_KEY]: { newValue: hidden } });
    expect(seen).toStrictEqual([hidden]);
    unsubscribe();
    expect(changes.size).toBe(0);
  });

  it("tells its own write once, although onChanged reports it too", async () => {
    const changes = fakeChanges();
    const settings = createExtensionSettings(createExtensionStore(fakeArea()), changes.subscribe);
    const seen: unknown[] = [];
    settings.subscribe((value) => {
      seen.push(value);
    });
    const next = { ...DEFAULT_SETTINGS, banner: false };
    await settings.write(next);
    changes.fire({ [SETTINGS_KEY]: { newValue: encodeSettings(next) } });
    expect(seen).toStrictEqual([encodeSettings(next)]);
  });
});
