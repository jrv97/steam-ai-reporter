import { describe, expect, it } from "vitest";
import { keyValueStoreContract } from "../../../tests/contracts/key-value-store.contract";
import { migrationFaultContract } from "../../../tests/contracts/migration-faults.contract";
import { migrationContract } from "../../../tests/contracts/migration.contract";
import { remoteSettingsContract } from "../../../tests/contracts/remote-settings.contract";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import type { JsonValue } from "../../core/json";
import { createAllowList } from "../../core/settings/allow-list";
import { encodeSettings } from "../../core/settings/settings";
import { createSettingsSource } from "../../core/settings/settings-source";
import {
  ALLOW_KEY,
  LEGACY_ALLOW_KEY,
  LEGACY_SETTINGS_KEY,
  SETTINGS_KEY,
} from "../../core/storage-keys";
import { createGmStore, createRemoteSettings } from "./gm-storage";

keyValueStoreContract("createGmStore over the GM fake", () => createGmStore(fake.gm()));
migrationContract("createGmStore over the GM fake", () => createGmStore(fake.gm()));
migrationFaultContract(
  "createGmStore over the GM fake",
  (faults) => createGmStore(fake.faultyGm(faults)),
);
remoteSettingsContract("the userscript manager's value change listener", () => {
  const watch = fake.watch();
  return {
    settings: createSettingsSource(createGmStore(fake.gm()), createRemoteSettings(watch.watch)),
    change: watch.notify,
  };
});

describe("settings and the ignore list over GM storage", () => {
  /** A GM store holding `entries`, and the `getValue` names asked for after seeding. */
  async function seeded(entries: ReadonlyMap<string, JsonValue>) {
    const gm = fake.gm();
    const store = createGmStore(gm);
    await store.set(entries);
    const start = gm.reads.length;
    return { store, readsSince: () => gm.reads.slice(start) };
  }

  it("make one getValue each once v2 data exists, and never ask for the v1 keys", async () => {
    const { store, readsSince } = await seeded(
      new Map<string, JsonValue>([
        [SETTINGS_KEY, encodeSettings(make.settings())],
        [ALLOW_KEY, make.raw.noGames()],
        [LEGACY_SETTINGS_KEY, make.raw.v1CustomSettings()],
        [LEGACY_ALLOW_KEY, make.raw.v1Allow()],
      ]),
    );
    await createSettingsSource(store).read();
    await createAllowList(store, fake.clock(make.time())).list();
    expect(readsSince()).toStrictEqual([SETTINGS_KEY, ALLOW_KEY]);
  });

  it("ask for the v1 key only when v2 is absent", async () => {
    const { store, readsSince } = await seeded(new Map());
    await createSettingsSource(store).read();
    expect(readsSince()).toStrictEqual([SETTINGS_KEY, LEGACY_SETTINGS_KEY]);
  });
});

describe("createGmStore", () => {
  it("writes through GM.setValue once per key", async () => {
    const gm = fake.gm();
    await createGmStore(gm).set(
      new Map<string, JsonValue>([
        [SETTINGS_KEY, encodeSettings(make.settings())],
        [ALLOW_KEY, make.raw.noGames()],
      ]),
    );
    expect(gm.writes).toStrictEqual([SETTINGS_KEY, ALLOW_KEY]);
  });
});

describe("createRemoteSettings", () => {
  it("is absent where the manager has no value change listener", () => {
    expect(createRemoteSettings(undefined)).toBeUndefined();
  });
});
