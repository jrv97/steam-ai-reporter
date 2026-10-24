import { describe, expect, it } from "vitest";
import { keyValueStoreContract } from "../../../tests/contracts/key-value-store.contract";
import { migrationFaultContract } from "../../../tests/contracts/migration-faults.contract";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { fakeArea, faultyArea } from "../../../tests/helpers/fake-area";
import type { Unsubscribe } from "../../core/ports";
import { DEFAULT_SETTINGS, encodeSettings, withKind } from "../../core/settings/settings";
import { SETTINGS_KEY } from "../../core/storage-keys";
import type { LocalChanges } from "./ext";
import { createExtensionSettings, createExtensionStore } from "./store";

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
migrationContract("extension storage.local", () => createExtensionStore(fakeArea()));
migrationFaultContract(
  "extension storage.local",
  (faults) => createExtensionStore(faultyArea(faults)),
);

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
    const hidden = encodeSettings(withKind(DEFAULT_SETTINGS, "ai", { filter: "hide" }));
    changes.fire({ "v2:allow": { newValue: {} } });
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
    const next = withKind(DEFAULT_SETTINGS, "ai", { banner: false });
    await settings.write(next);
    changes.fire({ [SETTINGS_KEY]: { newValue: encodeSettings(next) } });
    expect(seen).toStrictEqual([encodeSettings(next)]);
  });
});
