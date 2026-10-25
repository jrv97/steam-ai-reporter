import { describe, expect, it } from "vitest";
import { keyValueStoreContract } from "../../../tests/contracts/key-value-store.contract";
import { migrationFaultContract } from "../../../tests/contracts/migration-faults.contract";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { fakeGm, faultyGm } from "../../../tests/helpers/gm-fake";
import type { JsonValue } from "../../core/json";
import { createAllowList } from "../../core/settings/allow-list";
import { DEFAULT_SETTINGS, encodeSettings } from "../../core/settings/settings";
import { createSettingsSource } from "../../core/settings/settings-source";
import { SETTINGS_KEY } from "../../core/storage-keys";
import { createGmStore, createRemoteSettings, type WatchValue } from "./gm-storage";

keyValueStoreContract("createGmStore over the GM fake", () => createGmStore(fakeGm()));
migrationContract("createGmStore over the GM fake", () => createGmStore(fakeGm()));
migrationFaultContract(
  "createGmStore over the GM fake",
  (faults) => createGmStore(faultyGm(faults)),
);

describe("settings and the ignore list over GM storage", () => {
  /** A GM fake that records the names `getValue` was asked for. */
  function watched(initial: Readonly<Record<string, JsonValue>>) {
    const gm = fakeGm();
    const names: string[] = [];
    const store = createGmStore({
      getValue(name) {
        names.push(name);
        return gm.getValue(name);
      },
      setValue: (name, value) => gm.setValue(name, value),
      deleteValue: (name) => gm.deleteValue(name),
      listValues: () => gm.listValues(),
    });
    return { store, names, seed: () => store.set(new Map(Object.entries(initial))) };
  }

  it("make one getValue each once v2 data exists, and never ask for the v1 keys", async () => {
    const { store, names, seed } = watched({
      "v2:settings": encodeSettings(DEFAULT_SETTINGS),
      "v2:allow": { all: {}, ai: {} },
      "v1:settings": { badges: false },
      "v1:allow": { "10": { name: "Old", added: 1 } },
    });
    await seed();
    names.length = 0;
    await createSettingsSource(store).read();
    await createAllowList(store, { now: () => 0 }).list();
    expect(names).toStrictEqual(["v2:settings", "v2:allow"]);
  });

  it("ask for the v1 key only when v2 is absent", async () => {
    const { store, names } = watched({});
    await createSettingsSource(store).read();
    expect(names).toStrictEqual(["v2:settings", "v1:settings"]);
  });
});

describe("createGmStore", () => {
  it("writes through GM.setValue once per key", async () => {
    const gm = fakeGm();
    await createGmStore(gm).set(new Map([["a", 1], ["b", 2]]));
    expect(gm.writes).toStrictEqual(["a", "b"]);
  });
});

describe("createRemoteSettings", () => {
  it("is absent where the manager has no value change listener", () => {
    expect(createRemoteSettings(undefined)).toBeUndefined();
  });

  it("passes changes of the settings value on, until unsubscribed", () => {
    const watched: string[] = [];
    let notify: (value: unknown) => void = () => undefined;
    const watch: WatchValue = (key, onChange) => {
      watched.push(key);
      notify = onChange;
    };
    const remote = createRemoteSettings(watch);
    const heard: unknown[] = [];
    const unsubscribe = remote?.((value) => heard.push(value));
    notify({ badges: false });
    unsubscribe?.();
    notify({ badges: true });

    expect(watched).toStrictEqual([SETTINGS_KEY]);
    expect(heard).toStrictEqual([{ badges: false }]);
  });
});
