import { describe, expect, it } from "vitest";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { readKey } from "../../../tests/helpers/store-read";
import type { JsonValue } from "../json";
import { UI_STATE_KEY } from "../storage-keys";
import { createUiState, decodeTab, decodeTabRequest } from "./ui-state";

function seeded(value: JsonValue) {
  return fake.countingStore(fake.store(new Map([[UI_STATE_KEY, value]])));
}

describe("decoding the stored tab", () => {
  it.each([
    [undefined, undefined, undefined],
    [{ tab: "drm" }, "drm", undefined],
    [{ tab: "general" }, "general", undefined],
    [{ tab: "pvp", asked: make.time() }, "pvp", "pvp"],
    [{ tab: "gone", asked: make.time() }, undefined, undefined],
    [{ tab: "ai", asked: String(make.time()) }, "ai", undefined],
    [{ open: { ai: false } }, undefined, undefined],
    [{ open: { ai: false }, tab: "eula" }, "eula", undefined],
    [null, undefined, undefined],
    ["drm", undefined, undefined],
    [[{ tab: "ai" }], undefined, undefined],
  ])("reads %j as the tab %s and the request %s", (stored, tab, request) => {
    expect(decodeTab(stored)).toBe(tab);
    expect(decodeTabRequest(stored)).toBe(request);
  });
});

describe("the tab memory over a store", () => {
  it("reads nothing from an empty store, and does not write", async () => {
    const store = fake.countingStore(fake.store());
    expect(await createUiState(store).read()).toBeUndefined();
    expect(store.calls.set).toBe(0);
  });

  it("stores the tab alone under one key, dropping an older build's sections", async () => {
    const store = seeded({ open: { ai: false } });
    const state = createUiState(store);
    await state.setTab("kernel");
    expect(await readKey(store, UI_STATE_KEY)).toEqual({ tab: "kernel" });
    expect(await state.read()).toBe("kernel");
  });

  it("writes one value per change, in order, and none for the stored tab", async () => {
    const store = seeded({ tab: "ai" });
    const state = createUiState(store);
    await Promise.all([state.setTab("ai"), state.setTab("drm"), state.setTab("drm")]);
    expect(store.calls.set).toBe(1);
    expect(await state.read()).toBe("drm");
  });

  it("writes a request for the stored tab too, as a new value each time", async () => {
    const store = seeded({ tab: "eula" });
    const state = createUiState(store);
    await state.requestTab("eula", make.time());
    await state.requestTab("eula", make.time());
    expect(store.calls.set).toBe(2);
    expect(decodeTabRequest(await readKey(store, UI_STATE_KEY))).toBe("eula");
    expect(await state.read()).toBe("eula");
  });

  it("rejects a failed read and keeps working once the store heals", async () => {
    const store = seeded({ tab: "ai" });
    const state = createUiState(store);
    store.break();
    await expect(state.read()).rejects.toThrow();
    await expect(state.setTab("pvp")).rejects.toThrow();
    store.heal();
    expect(await state.read()).toBe("ai");
    await state.setTab("pvp");
    expect(await state.read()).toBe("pvp");
  });
});
