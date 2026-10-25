import * as v from "valibot";
import { type JsonValue, parseWithDefaults } from "../json";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { KeyValueStore } from "../ports";
import { createSerial } from "../serial";
import { SECTION_STATE_KEY } from "../storage-keys";

/** A settings section the user can close. Today each tag has one, named by its kind id. */
export type SectionId = KindId;

/** Every collapsible section, in the order the form shows them. */
export const SECTION_IDS: readonly SectionId[] = KIND_IDS;

/** A section nobody has closed or opened stays open, so a first visit shows every control. */
export const SECTION_DEFAULT_OPEN = true;

/** The sections the user has toggled, with the state each was left in. */
export type SectionStates = ReadonlyMap<SectionId, boolean>;

/** Whether a section is open: the state it was left in, or the default. */
export function isSectionOpen(states: SectionStates, id: SectionId): boolean {
  return states.get(id) ?? SECTION_DEFAULT_OPEN;
}

/** Which sections are open, kept across visits and shared by the popup, the page and the dialog. */
export interface SectionState {
  /** The state of each toggled section. Rejects when the store cannot be read. */
  read(): Promise<SectionStates>;
  /** Remembers the state of one section. Writes nothing when it already holds. */
  setOpen(id: SectionId, open: boolean): Promise<void>;
}

// Each field falls back on its own, and each entry is checked on its own, so one bad value (an
// old version, a hand-edited value) does not reset the sections around it.
const StoredSchema = v.object({
  open: v.fallback(v.record(v.string(), v.unknown()), {}),
});

/** The states in a stored value: every valid entry of a known section, nothing else. */
export function decodeSectionStates(stored: unknown): SectionStates {
  const { open } = parseWithDefaults(StoredSchema, stored);
  const states = new Map<SectionId, boolean>();
  for (const id of SECTION_IDS) {
    const state = v.safeParse(v.boolean(), open[id]);
    if (state.success) {
      states.set(id, state.output);
    }
  }
  return states;
}

/** The stored value of the section states, in section order. */
export function encodeSectionStates(states: SectionStates): JsonValue {
  const open: Record<string, boolean> = {};
  for (const id of SECTION_IDS) {
    const state = states.get(id);
    if (state !== undefined) {
      open[id] = state;
    }
  }
  return { open };
}

/**
 * The section state over a `KeyValueStore`, stored as `v2:ui`. Changes read the stored value
 * first and run one after another in this context, so quick toggles all apply and a failed read
 * never writes over what other sections hold. Two tabs at once can still lose one.
 */
export function createSectionState(store: KeyValueStore): SectionState {
  async function read(): Promise<SectionStates> {
    const stored = await store.get([SECTION_STATE_KEY]);
    return decodeSectionStates(stored.get(SECTION_STATE_KEY));
  }

  const serial = createSerial();

  return {
    read,

    setOpen: (id, open) =>
      serial(async () => {
        const states = await read();
        if (isSectionOpen(states, id) === open) {
          return;
        }
        const next = new Map(states).set(id, open);
        await store.set(new Map([[SECTION_STATE_KEY, encodeSectionStates(next)]]));
      }),
  };
}
