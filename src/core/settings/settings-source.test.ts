import { describe, expect, it, vi } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { writeSettings } from "../../../tests/helpers/settings";
import { DEFAULT_SETTINGS, encodeSettings, parseSettings, type Settings } from "./settings";
import { createSettingsSource, type RemoteSettingsChanges } from "./settings-source";

const DIMMED: Settings = make.settings.kind("ai", { filter: "dim" });
/** Settings as layout v1 stored them: AI badge off, its filter on hide, Spanish, debug on. */
const V1_SETTINGS = make.raw.v1CustomSettings();
/** What a read makes of `V1_SETTINGS`. */
const FROM_V1 = make.settings.kind(
  "ai",
  { badge: false, filter: "hide" },
  make.settings({ locale: "es", debug: true }),
);

/** A platform change event that the test can fire, and that counts its subscribers. */
function remoteEvents() {
  const listeners = new Set<(value: unknown) => void>();
  const remote: RemoteSettingsChanges = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    remote,
    fire(value: unknown) {
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribers: () => listeners.size,
  };
}

describe("a subscriber that throws", () => {
  it("does not reject a patch that was saved, and the others still hear it", async () => {
    const source = createSettingsSource(fake.store());
    const heard = vi.fn();
    source.subscribe(() => {
      throw new Error();
    });
    source.subscribe(heard);
    const written = await source.patch({ debug: true });
    expect(written.debug).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(parseSettings(await source.read()).debug).toBe(true);
  });

  it("does not stop a change from another tab reaching the others", () => {
    const events = remoteEvents();
    const source = createSettingsSource(fake.store(), events.remote);
    const heard = vi.fn();
    source.subscribe(() => {
      throw new Error();
    });
    source.subscribe(heard);
    events.fire(encodeSettings(DIMMED));
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("patch", () => {
  it("changes only the fields it names in what is stored now", async () => {
    const store = fake.store();
    const source = createSettingsSource(store);
    await writeSettings(source, make.settings({ locale: "es" }));
    await source.patch({ kinds: { drm: { badge: false } } });
    expect(parseSettings(await source.read())).toStrictEqual(
      make.settings.kind("drm", { badge: false }, make.settings({ locale: "es" })),
    );
  });

  it("keeps what another source stored since this one last read", async () => {
    const store = fake.store();
    const first = createSettingsSource(store);
    const second = createSettingsSource(store);
    await writeSettings(first, DEFAULT_SETTINGS);
    await second.patch({ kinds: { kernel: { filter: "hide" } } });
    await first.patch({ kinds: { drm: { banner: false } } });
    const stored = parseSettings(await first.read());
    expect(stored.kinds.kernel.filter).toBe("hide");
    expect(stored.kinds.drm.banner).toBe(false);
  });

  it("returns the settings it wrote", async () => {
    const source = createSettingsSource(fake.store());
    const written = await source.patch({ kinds: { pvp: { enabled: false } } });
    expect(written).toStrictEqual(make.settings.kind("pvp", { enabled: false }));
    expect(parseSettings(await source.read())).toStrictEqual(written);
  });

  it("copies v1 settings before it patches, so a patch never puts defaults over them", async () => {
    const store = fake.store(new Map([["v1:settings", V1_SETTINGS]]));
    const source = createSettingsSource(store);
    await source.patch({ kinds: { kernel: { enabled: false } } });
    expect(parseSettings(await source.read())).toStrictEqual(
      make.settings.kind("kernel", { enabled: false }, FROM_V1),
    );
  });

  it("runs patches from one context one after another, losing none", async () => {
    const source = createSettingsSource(fake.store());
    await Promise.all([
      source.patch({ kinds: { ai: { badge: false } } }),
      source.patch({ kinds: { drm: { badge: false } } }),
      source.patch({ kinds: { eula: { badge: false } } }),
    ]);
    const { kinds } = parseSettings(await source.read());
    expect([kinds.ai.badge, kinds.drm.badge, kinds.eula.badge, kinds.pvp.badge]).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("rejects when the stored settings cannot be read, and the next patch still runs", async () => {
    const inner = fake.store(new Map([["v2:settings", encodeSettings(DIMMED)]]));
    const store = fake.countingStore(inner);
    const source = createSettingsSource(store);
    store.break();
    await expect(source.patch({ debug: true })).rejects.toBeInstanceOf(Error);
    store.heal();
    await source.patch({ debug: true });
    expect(parseSettings(await source.read())).toStrictEqual({ ...DIMMED, debug: true });
  });
});

describe("createSettingsSource", () => {
  it("reads nothing before settings are written", async () => {
    expect(await createSettingsSource(fake.store()).read()).toBeUndefined();
  });

  it("reads what another source over the same store wrote", async () => {
    const store = fake.store();
    await writeSettings(createSettingsSource(store), DIMMED);
    expect(parseSettings(await createSettingsSource(store).read())).toStrictEqual(DIMMED);
  });

  it("reads with one storage call and writes with one once settings are stored", async () => {
    const store = fake.countingStore(
      fake.store(new Map([["v2:settings", encodeSettings(DIMMED)]])),
    );
    const source = createSettingsSource(store);
    await source.read();
    expect(store.calls).toStrictEqual({ get: 1, set: 0, remove: 0, keys: 0 });
    await writeSettings(source, DEFAULT_SETTINGS);
    expect(store.calls.set).toBe(1);
  });

  it("rejects a write while v1 settings cannot be copied, and writes nothing", async () => {
    const inner = fake.store(new Map([["v1:settings", make.raw.v1Settings({ badges: false })]]));
    const store = fake.countingStore(inner);
    const source = createSettingsSource(store);
    store.break();
    await expect(writeSettings(source, DEFAULT_SETTINGS)).rejects.toThrow();
    store.heal();
    expect(await inner.keys()).toStrictEqual(["v1:settings"]);
    expect(parseSettings(await source.read()).kinds.ai.badge).toBe(false);
  });

  it("stores the settings under the v2 key", async () => {
    const store = fake.store();
    await writeSettings(createSettingsSource(store), DIMMED);
    expect([...(await store.keys())]).toStrictEqual(["v2:settings"]);
  });

  it("copies v1 settings to the v2 key on the first read", async () => {
    const store = fake.store(new Map([["v1:settings", V1_SETTINGS]]));
    const source = createSettingsSource(store);
    expect(parseSettings(await source.read())).toStrictEqual(FROM_V1);
    expect([...(await store.keys())].toSorted()).toStrictEqual(["v1:settings", "v2:settings"]);
  });

  it("reads again after a migration that failed, instead of remembering the failure", async () => {
    const store = fake.countingStore(
      fake.store(new Map([["v1:settings", make.raw.v1Settings({ badges: false })]])),
    );
    const source = createSettingsSource(store);
    store.break();
    await expect(source.read()).rejects.toBeInstanceOf(Error);
    store.heal();
    expect(parseSettings(await source.read()).kinds.ai.badge).toBe(false);
  });

  it("tells subscribers about this context's writes, once per change", async () => {
    const source = createSettingsSource(fake.store());
    const listener = vi.fn<(value: unknown) => void>();
    source.subscribe(listener);
    await writeSettings(source, DIMMED);
    await writeSettings(source, DIMMED);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(parseSettings(listener.mock.calls[0]?.[0])).toStrictEqual(DIMMED);
    await writeSettings(source, DEFAULT_SETTINGS);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops telling a subscriber that unsubscribed, even if it unsubscribes twice", async () => {
    const source = createSettingsSource(fake.store());
    const listener = vi.fn<(value: unknown) => void>();
    const stop = source.subscribe(listener);
    stop();
    stop();
    await writeSettings(source, DIMMED);
    expect(listener).not.toHaveBeenCalled();
  });

  it("forwards the other tabs' changes unvalidated", () => {
    const events = remoteEvents();
    const source = createSettingsSource(fake.store(), events.remote);
    const listener = vi.fn<(value: unknown) => void>();
    source.subscribe(listener);
    const changes = [encodeSettings(DIMMED), ...make.raw.junk()];
    for (const change of changes) {
      events.fire(change);
    }
    expect(listener.mock.calls).toStrictEqual(changes.map((change) => [change]));
  });

  it("does not tell twice when the platform echoes this context's own write", async () => {
    const events = remoteEvents();
    const source = createSettingsSource(fake.store(), events.remote);
    const listener = vi.fn<(value: unknown) => void>();
    source.subscribe(listener);
    await writeSettings(source, DIMMED);
    events.fire(await source.read());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("listens to the platform only while someone is subscribed", () => {
    const events = remoteEvents();
    const source = createSettingsSource(fake.store(), events.remote);
    expect(events.subscribers()).toBe(0);
    const stopA = source.subscribe(vi.fn());
    const stopB = source.subscribe(vi.fn());
    expect(events.subscribers()).toBe(1);
    stopA();
    expect(events.subscribers()).toBe(1);
    stopB();
    expect(events.subscribers()).toBe(0);
    source.subscribe(vi.fn());
    expect(events.subscribers()).toBe(1);
  });
});
