import { describe, expect, it, vi } from "vitest";
import { countingStore } from "../../../tests/helpers/counting-store";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { withKind, writeSettings } from "../../../tests/helpers/settings";
import { DEFAULT_SETTINGS, encodeSettings, parseSettings, type Settings } from "./settings";
import { createSettingsSource, type RemoteSettingsChanges } from "./settings-source";

const DIMMED: Settings = withKind(DEFAULT_SETTINGS, "ai", { filter: "dim" });

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
    const source = createSettingsSource(memoryStore());
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
    const source = createSettingsSource(memoryStore(), events.remote);
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
    const store = memoryStore();
    const source = createSettingsSource(store);
    await writeSettings(source, { ...DEFAULT_SETTINGS, locale: "es" });
    await source.patch({ kinds: { drm: { badge: false } } });
    expect(parseSettings(await source.read())).toStrictEqual({
      ...withKind(DEFAULT_SETTINGS, "drm", { badge: false }),
      locale: "es",
    });
  });

  it("keeps what another source stored since this one last read", async () => {
    const store = memoryStore();
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
    const source = createSettingsSource(memoryStore());
    const written = await source.patch({ kinds: { pvp: { enabled: false } } });
    expect(written).toStrictEqual(withKind(DEFAULT_SETTINGS, "pvp", { enabled: false }));
    expect(parseSettings(await source.read())).toStrictEqual(written);
  });

  it("starts from the defaults when nothing is stored", async () => {
    const source = createSettingsSource(memoryStore());
    await source.patch({ debug: true });
    expect(parseSettings(await source.read())).toStrictEqual({ ...DEFAULT_SETTINGS, debug: true });
  });

  it("copies v1 settings before it patches, so a patch never puts defaults over them", async () => {
    const store = memoryStore(
      new Map([["v1:settings", { badges: false, banner: true, listFilter: "hide", locale: "es" }]]),
    );
    const source = createSettingsSource(store);
    await source.patch({ kinds: { kernel: { enabled: false } } });
    const stored = parseSettings(await source.read());
    expect(stored.locale).toBe("es");
    expect(stored.kinds.ai).toStrictEqual({
      enabled: true,
      badge: false,
      banner: true,
      filter: "hide",
    });
    expect(stored.kinds.kernel.enabled).toBe(false);
  });

  it("runs patches from one context one after another, losing none", async () => {
    const source = createSettingsSource(memoryStore());
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
    const inner = memoryStore(new Map([["v2:settings", encodeSettings(DIMMED)]]));
    const store = countingStore(inner);
    const source = createSettingsSource(store);
    store.break();
    await expect(source.patch({ debug: true })).rejects.toBeInstanceOf(Error);
    store.heal();
    await source.patch({ debug: true });
    expect(parseSettings(await source.read())).toStrictEqual({ ...DIMMED, debug: true });
  });

  it("tells this context's subscribers the patched settings", async () => {
    const source = createSettingsSource(memoryStore());
    const heard = vi.fn();
    source.subscribe(heard);
    await source.patch({ kinds: { pvp: { filter: "dim" } } });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(parseSettings(heard.mock.calls[0]?.[0]).kinds.pvp.filter).toBe("dim");
  });
});

describe("createSettingsSource", () => {
  it("reads nothing before settings are written", async () => {
    expect(await createSettingsSource(memoryStore()).read()).toBeUndefined();
  });

  it("reads what was written, as a value parseSettings accepts", async () => {
    const source = createSettingsSource(memoryStore());
    await writeSettings(source, DIMMED);
    expect(parseSettings(await source.read())).toStrictEqual(DIMMED);
  });

  it("shares storage with another source over the same store", async () => {
    const store = memoryStore();
    await writeSettings(createSettingsSource(store), DIMMED);
    expect(parseSettings(await createSettingsSource(store).read())).toStrictEqual(DIMMED);
  });

  it("reads with one storage call and writes with one once settings are stored", async () => {
    const store = countingStore(memoryStore(new Map([["v2:settings", encodeSettings(DIMMED)]])));
    const source = createSettingsSource(store);
    await source.read();
    expect(store.calls).toStrictEqual({ get: 1, set: 0, remove: 0, keys: 0 });
    await writeSettings(source, DEFAULT_SETTINGS);
    expect(store.calls.set).toBe(1);
  });

  it("rejects a write while v1 settings cannot be copied, and writes nothing", async () => {
    const inner = memoryStore(new Map([["v1:settings", { badges: false }]]));
    const store = countingStore(inner);
    const source = createSettingsSource(store);
    store.break();
    await expect(writeSettings(source, DEFAULT_SETTINGS)).rejects.toThrow();
    store.heal();
    expect(await inner.keys()).toStrictEqual(["v1:settings"]);
    expect(parseSettings(await source.read()).kinds.ai.badge).toBe(false);
  });

  it("stores the settings under the v2 key", async () => {
    const store = memoryStore();
    await writeSettings(createSettingsSource(store), DIMMED);
    expect([...(await store.keys())]).toStrictEqual(["v2:settings"]);
  });

  it("copies v1 settings to the v2 key on the first read", async () => {
    const store = memoryStore(
      new Map([["v1:settings", { badges: false, banner: true, listFilter: "hide", locale: "es" }]]),
    );
    const source = createSettingsSource(store);
    const expected = withKind(
      { ...DEFAULT_SETTINGS, locale: "es" },
      "ai",
      { badge: false, filter: "hide" },
    );
    expect(parseSettings(await source.read())).toStrictEqual(expected);
    expect([...(await store.keys())].toSorted()).toStrictEqual(["v1:settings", "v2:settings"]);
  });

  it("reads again after a migration that failed, instead of remembering the failure", async () => {
    const store = countingStore(memoryStore(new Map([["v1:settings", { badges: false }]])));
    const source = createSettingsSource(store);
    store.break();
    await expect(source.read()).rejects.toBeInstanceOf(Error);
    store.heal();
    expect(parseSettings(await source.read()).kinds.ai.badge).toBe(false);
  });

  it("tells subscribers about this context's writes, once per change", async () => {
    const source = createSettingsSource(memoryStore());
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
    const source = createSettingsSource(memoryStore());
    const listener = vi.fn<(value: unknown) => void>();
    const stop = source.subscribe(listener);
    stop();
    stop();
    await writeSettings(source, DIMMED);
    expect(listener).not.toHaveBeenCalled();
  });

  it("forwards the other tabs' changes unvalidated", () => {
    const events = remoteEvents();
    const source = createSettingsSource(memoryStore(), events.remote);
    const listener = vi.fn<(value: unknown) => void>();
    source.subscribe(listener);
    events.fire({ kinds: { ai: { filter: "hide" } } });
    events.fire("garbage");
    expect(listener.mock.calls).toStrictEqual([
      [{ kinds: { ai: { filter: "hide" } } }],
      ["garbage"],
    ]);
  });

  it("does not tell twice when the platform echoes this context's own write", async () => {
    const events = remoteEvents();
    const source = createSettingsSource(memoryStore(), events.remote);
    const listener = vi.fn<(value: unknown) => void>();
    source.subscribe(listener);
    await writeSettings(source, DIMMED);
    events.fire(await source.read());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("listens to the platform only while someone is subscribed", () => {
    const events = remoteEvents();
    const source = createSettingsSource(memoryStore(), events.remote);
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

  it("never calls a subscriber when the platform reports no changes", () => {
    const source = createSettingsSource(memoryStore());
    const listener = vi.fn<(value: unknown) => void>();
    source.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
  });
});
