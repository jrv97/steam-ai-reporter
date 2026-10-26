import { describe, expect, it } from "vitest";
import { countingStore } from "../../../tests/helpers/counting-store";
import { memoryStore } from "../../../tests/helpers/memory-store";
import type { JsonValue } from "../json";
import { UI_STATE_KEY } from "../storage-keys";
import {
  createSectionState,
  decodeSectionStates,
  encodeSectionStates,
  isSectionOpen,
  SECTION_DEFAULT_OPEN,
  SECTION_IDS,
} from "./section-state";

function seeded(value: JsonValue) {
  return countingStore(memoryStore(new Map([[UI_STATE_KEY, value]])));
}

describe("decoding the stored section states", () => {
  it("holds nothing for a store that has no value", () => {
    expect(decodeSectionStates(undefined).size).toBe(0);
  });

  it("opens every section nobody toggled", () => {
    expect(SECTION_DEFAULT_OPEN).toBe(true);
    for (const id of SECTION_IDS) {
      expect(isSectionOpen(decodeSectionStates(undefined), id)).toBe(true);
    }
  });

  it("reads the state each section was left in", () => {
    const states = decodeSectionStates({ open: { ai: false, kernel: true } });
    expect(isSectionOpen(states, "ai")).toBe(false);
    expect(isSectionOpen(states, "kernel")).toBe(true);
    expect(states.size).toBe(2);
  });

  it("falls back to the default for anything that is not the stored shape", () => {
    for (const bad of [null, 7, "x", true, [], [false], { open: null }, { open: [false] }]) {
      expect(decodeSectionStates(bad).size).toBe(0);
    }
  });

  it("drops a bad entry on its own and leaves the others", () => {
    const states = decodeSectionStates({ open: { ai: "no", kernel: false, pvp: 0 } });
    expect([...states]).toEqual([["kernel", false]]);
  });

  it("ignores sections it does not know", () => {
    const states = decodeSectionStates({ open: { gone: false, ai: false } });
    expect([...states]).toEqual([["ai", false]]);
  });

  it("round trips through the encoded value, in section order", () => {
    const states = new Map([["kernel" as const, false], ["ai" as const, true]]);
    const encoded = encodeSectionStates(states);
    expect(encoded).toEqual({ open: { ai: true, kernel: false } });
    expect(decodeSectionStates(encoded)).toEqual(states);
  });
});

describe("the section state over a store", () => {
  it("reads nothing from an empty store, and does not write", async () => {
    const store = countingStore(memoryStore());
    expect((await createSectionState(store).read()).size).toBe(0);
    expect(store.calls.set).toBe(0);
  });

  it("stores a closed section under one key and reads it back", async () => {
    const store = countingStore(memoryStore());
    const state = createSectionState(store);
    await state.setOpen("ai", false);
    expect(await store.get([UI_STATE_KEY])).toEqual(
      new Map([[UI_STATE_KEY, { open: { ai: false } }]]),
    );
    expect(isSectionOpen(await state.read(), "ai")).toBe(false);
    expect(isSectionOpen(await state.read(), "kernel")).toBe(true);
  });

  it("keeps the other sections when one changes", async () => {
    const state = createSectionState(memoryStore());
    await state.setOpen("ai", false);
    await state.setOpen("kernel", false);
    await state.setOpen("ai", true);
    expect([...(await state.read())]).toEqual([["ai", true], ["kernel", false]]);
  });

  it("writes nothing when the state already holds", async () => {
    const store = seeded({ open: { ai: false } });
    const state = createSectionState(store);
    await state.setOpen("ai", false);
    await state.setOpen("kernel", true);
    expect(store.calls.set).toBe(0);
  });

  it("writes one value per change, not per call", async () => {
    const store = countingStore(memoryStore());
    const state = createSectionState(store);
    await Promise.all([
      state.setOpen("ai", false),
      state.setOpen("ai", false),
      state.setOpen("ai", true),
    ]);
    expect(store.calls.set).toBe(2);
    expect(isSectionOpen(await state.read(), "ai")).toBe(true);
  });

  it("applies quick changes in order, so none is lost", async () => {
    const state = createSectionState(memoryStore());
    await Promise.all(SECTION_IDS.map((id) => state.setOpen(id, false)));
    for (const id of SECTION_IDS) {
      expect(isSectionOpen(await state.read(), id)).toBe(false);
    }
  });

  it("repairs a bad stored value on the next change", async () => {
    const store = seeded({ open: { ai: "no", kernel: false } });
    const state = createSectionState(store);
    await state.setOpen("pvp", false);
    expect(await state.read()).toEqual(
      new Map([["kernel", false], ["pvp", false]]),
    );
  });

  it("rejects a read the store fails, and a write after it does not clobber", async () => {
    const store = seeded({ open: { ai: false } });
    const state = createSectionState(store);
    store.break();
    await expect(state.read()).rejects.toThrow();
    await expect(state.setOpen("kernel", false)).rejects.toThrow();
    store.heal();
    expect([...(await state.read())]).toEqual([["ai", false]]);
  });

  it("keeps working after a rejected write", async () => {
    const store = countingStore(memoryStore());
    const state = createSectionState(store);
    store.break();
    await expect(state.setOpen("ai", false)).rejects.toThrow();
    store.heal();
    await state.setOpen("ai", false);
    expect(isSectionOpen(await state.read(), "ai")).toBe(false);
  });
});
