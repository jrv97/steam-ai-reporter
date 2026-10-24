import { describe, expect, it } from "vitest";
import { keyValueStoreContract } from "../../../tests/contracts/key-value-store.contract";
import { migrationFaultContract } from "../../../tests/contracts/migration-faults.contract";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { fakeGm, faultyGm } from "../../../tests/helpers/gm-fake";
import { SETTINGS_KEY } from "../../core/storage-keys";
import { createGmStore, createRemoteSettings, type WatchValue } from "./gm-storage";

keyValueStoreContract("createGmStore over the GM fake", () => createGmStore(fakeGm()));
migrationContract("createGmStore over the GM fake", () => createGmStore(fakeGm()));
migrationFaultContract(
  "createGmStore over the GM fake",
  (faults) => createGmStore(faultyGm(faults)),
);

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
