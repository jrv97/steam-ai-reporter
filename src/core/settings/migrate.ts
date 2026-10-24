import * as v from "valibot";
import { SarError } from "../errors";
import { type JsonValue, parseWithDefaults } from "../json";
import { AI_KIND } from "../kinds/ai";
import { LIST_FILTERS } from "../kinds/kind-settings";
import type { KeyValueStore } from "../ports";
import { ALLOW_KEY, LEGACY_ALLOW_KEY, LEGACY_SETTINGS_KEY, SETTINGS_KEY } from "../storage-keys";
import { decodeAllowScope, encodeAllow, perScope } from "./allow-data";
import {
  AUTO_LOCALE,
  DEFAULT_SETTINGS,
  encodeSettings,
  LocaleSchema,
  type Settings,
} from "./settings";

// Layout v1 kept one flat settings object and one list of ignored games, both about AI. The
// migration copies them to the v2 keys and leaves the v1 keys as they are.

const LegacySettingsSchema = v.object({
  badges: v.fallback(v.boolean(), true),
  banner: v.fallback(v.boolean(), true),
  listFilter: v.fallback(v.picklist(LIST_FILTERS), "off"),
  locale: v.fallback(LocaleSchema, AUTO_LOCALE),
  debug: v.fallback(v.boolean(), false),
});

/** The v2 settings for a stored v1 value: valid fields carry over, the rest take defaults. */
export function settingsFromV1(stored: unknown): Settings {
  const legacy = parseWithDefaults(LegacySettingsSchema, stored);
  return {
    ...DEFAULT_SETTINGS,
    locale: legacy.locale,
    debug: legacy.debug,
    kinds: {
      ...DEFAULT_SETTINGS.kinds,
      ai: {
        ...AI_KIND.defaults,
        badge: legacy.badges,
        banner: legacy.banner,
        filter: legacy.listFilter,
      },
    },
  };
}

/** The v2 stored ignore list for a stored v1 list: every valid entry, in the AI scope. */
export function allowFromV1(stored: unknown): JsonValue {
  return encodeAllow({ ...perScope(() => new Map()), ai: decodeAllowScope(stored) });
}

/** What a migration run did to a v2 key: copied the v1 value, or found nothing to copy. */
export type Migration = "migrated" | "current";

/** One v1 key and the v2 key that replaces it. Each move runs on its own. */
interface Move {
  readonly from: string;
  readonly to: string;
  /** The v2 stored value for a stored v1 value. */
  readonly convert: (v1: unknown) => JsonValue;
}

const SETTINGS_MOVE: Move = {
  from: LEGACY_SETTINGS_KEY,
  to: SETTINGS_KEY,
  convert: (v1) => encodeSettings(settingsFromV1(v1)),
};

const ALLOW_MOVE: Move = { from: LEGACY_ALLOW_KEY, to: ALLOW_KEY, convert: allowFromV1 };

const MOVES: readonly Move[] = [SETTINGS_MOVE, ALLOW_MOVE];

const ObjectSchema = v.record(v.string(), v.unknown());

/** Whether a stored v2 value is usable: an object, of which readers take every valid field. */
function isUsable(value: unknown): boolean {
  return v.is(ObjectSchema, value) && !Array.isArray(value);
}

async function usableValue(store: KeyValueStore, key: string): Promise<boolean> {
  return isUsable((await store.get([key])).get(key));
}

/**
 * Copies one v1 value to its v2 key unless the v2 key holds a usable value, which always wins.
 * It throws when the copy is missing or unusable on read-back; any usable value passes.
 */
async function migrateMove(store: KeyValueStore, move: Move): Promise<Migration> {
  if (await usableValue(store, move.to)) {
    return "current";
  }
  const legacy = await store.get([move.from]);
  // Another context may have written the v2 key since the first read.
  if (!legacy.has(move.from) || await usableValue(store, move.to)) {
    return "current";
  }
  await store.set(new Map([[move.to, move.convert(legacy.get(move.from))]]));
  const stored = (await store.get([move.to])).get(move.to);
  if (!isUsable(stored)) {
    throw new SarError("error_settings_load", {}, { cause: { key: move.to, stored } });
  }
  return "migrated";
}

/**
 * Migrates every move on its own: one that fails does not stop or undo another. The first
 * failure is thrown, as the cause of a migration error, after all have run.
 */
export async function migrateStorage(store: KeyValueStore): Promise<Migration> {
  let result: Migration = "current";
  let failure: { readonly problem: unknown; } | undefined;
  for (const move of MOVES) {
    try {
      if (await migrateMove(store, move) === "migrated") {
        result = "migrated";
      }
    } catch (problem) {
      failure ??= { problem };
    }
  }
  if (failure !== undefined) {
    throw new SarError("error_settings_load", {}, { cause: failure.problem });
  }
  return result;
}

const running = new WeakMap<KeyValueStore, Map<Move, Promise<Migration>>>();

/** `migrateMove`, shared by the callers that ask while it runs. A settled run is forgotten. */
function migrateOnce(store: KeyValueStore, move: Move): Promise<Migration> {
  const moves = running.get(store) ?? new Map<Move, Promise<Migration>>();
  running.set(store, moves);
  const earlier = moves.get(move);
  if (earlier !== undefined) {
    return earlier;
  }
  const run = migrateMove(store, move);
  moves.set(move, run);
  const forget = (): void => {
    moves.delete(move);
  };
  void run.then(forget, forget);
  return run;
}

export function migrateSettings(store: KeyValueStore): Promise<Migration> {
  return migrateOnce(store, SETTINGS_MOVE);
}

/**
 * The stored value of a v2 key. A usable value is one read; the v1 key is read only when it is
 * absent or unusable, and its value is then copied before the key is read again.
 */
async function readMigrated(store: KeyValueStore, move: Move): Promise<unknown> {
  const stored = (await store.get([move.to])).get(move.to);
  if (isUsable(stored) || !(await store.get([move.from])).has(move.from)) {
    return stored;
  }
  await migrateOnce(store, move);
  return (await store.get([move.to])).get(move.to);
}

export function readSettingsValue(store: KeyValueStore): Promise<unknown> {
  return readMigrated(store, SETTINGS_MOVE);
}

export function readAllowValue(store: KeyValueStore): Promise<unknown> {
  return readMigrated(store, ALLOW_MOVE);
}
