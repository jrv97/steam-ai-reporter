import { describe, expect, it } from "vitest";
import { keyValueStoreContract } from "../../../tests/contracts/key-value-store.contract";
import { migrationFaultContract } from "../../../tests/contracts/migration-faults.contract";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { remoteSettingsContract } from "../../../tests/contracts/remote-settings.contract";
import { fake } from "../../../tests/helpers/fakes";
import { createExtensionSettings, createExtensionStore } from "./store";

keyValueStoreContract("extension storage.local", () => createExtensionStore(fake.area()));
migrationContract("extension storage.local", () => createExtensionStore(fake.area()));
migrationFaultContract(
  "extension storage.local",
  (faults) => createExtensionStore(fake.faultyArea(faults)),
);
remoteSettingsContract("extension storage.onChanged", () => {
  const changes = fake.changes();
  return {
    settings: createExtensionSettings(createExtensionStore(fake.area()), changes.subscribe),
    change(key, value) {
      changes.fire({ [key]: { newValue: value } });
    },
  };
});

describe("createExtensionStore", () => {
  it("makes no storage call for empty batches", async () => {
    const area = fake.area();
    const store = createExtensionStore(area);
    await store.get([]);
    await store.set(new Map());
    await store.remove([]);
    expect(area.calls).toStrictEqual([]);
  });
});

describe("createExtensionSettings", () => {
  it("releases its onChanged listener when the last subscriber leaves", () => {
    const changes = fake.changes();
    const settings = createExtensionSettings(createExtensionStore(fake.area()), changes.subscribe);
    const unsubscribe = settings.subscribe(() => undefined);
    const listening = changes.size();
    unsubscribe();
    expect([listening, changes.size()]).toStrictEqual([1, 0]);
  });
});
