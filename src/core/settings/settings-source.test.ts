import { describe, expect, it, vi } from "vitest";
import { countingStore } from "../../../tests/helpers/counting-store";
import { memoryStore } from "../../../tests/helpers/memory-store";
import { DEFAULT_SETTINGS, parseSettings, type Settings, withKind } from "./settings";
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

describe("createSettingsSource", () => {
  it("reads nothing before settings are written", async () => {
    expect(await createSettingsSource(memoryStore()).read()).toBeUndefined();
  });

  it("reads what was written, as a value parseSettings accepts", async () => {
    const source = createSettingsSource(memoryStore());
    await source.write(DIMMED);
    expect(parseSettings(await source.read())).toStrictEqual(DIMMED);
  });

  it("shares storage with another source over the same store", async () => {
    const store = memoryStore();
    await createSettingsSource(store).write(DIMMED);
    expect(parseSettings(await createSettingsSource(store).read())).toStrictEqual(DIMMED);
  });

  it("writes with one storage call", async () => {
    const store = countingStore(memoryStore());
    await createSettingsSource(store).write(DIMMED);
    expect(store.calls).toStrictEqual({ get: 0, set: 1, remove: 0, keys: 0 });
  });

  it("reads with one storage call once settings are stored", async () => {
    const store = countingStore(memoryStore());
    const source = createSettingsSource(store);
    await source.write(DIMMED);
    await source.read();
    expect(store.calls).toStrictEqual({ get: 1, set: 1, remove: 0, keys: 0 });
  });

  it("stores the settings under the v2 key", async () => {
    const store = memoryStore();
    await createSettingsSource(store).write(DIMMED);
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
    await source.write(DIMMED);
    await source.write(DIMMED);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(parseSettings(listener.mock.calls[0]?.[0])).toStrictEqual(DIMMED);
    await source.write(DEFAULT_SETTINGS);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops telling a subscriber that unsubscribed, even if it unsubscribes twice", async () => {
    const source = createSettingsSource(memoryStore());
    const listener = vi.fn<(value: unknown) => void>();
    const stop = source.subscribe(listener);
    stop();
    stop();
    await source.write(DIMMED);
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
    await source.write(DIMMED);
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
