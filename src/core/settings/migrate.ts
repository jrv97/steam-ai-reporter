import * as v from "valibot";
import { SarError } from "../errors";
import type { JsonValue } from "../json";
import { AI_KIND } from "../kinds/ai";
import { LIST_FILTERS } from "../kinds/kind-settings";
import type { KeyValueStore } from "../ports";
import { ALLOW_KEY, LEGACY_ALLOW_KEY, LEGACY_SETTINGS_KEY, SETTINGS_KEY } from "../storage-keys";
import { decodeAllow, decodeAllowScope, encodeAllow, perScope } from "./allow-data";
import {
  AUTO_LOCALE,
  DEFAULT_SETTINGS,
  encodeSettings,
  LocaleSchema,
  parseSettings,
  type Settings,
} from "./settings";

// Layout v1 kept one flat settings object and one list of ignored games, both about AI. The
// migration copies them to the v2 keys and leaves the v1 keys as they are.

const LegacySettingsSchema = v.fallback(
  v.object({
    badges: v.fallback(v.boolean(), true),
    banner: v.fallback(v.boolean(), true),
    listFilter: v.fallback(v.picklist(LIST_FILTERS), "off"),
    locale: v.fallback(LocaleSchema, AUTO_LOCALE),
    debug: v.fallback(v.boolean(), false),
  }),
  { badges: true, banner: true, listFilter: "off", locale: AUTO_LOCALE, debug: false },
);

/** The v2 settings for a stored v1 value: valid fields carry over, the rest take defaults. */
export function settingsFromV1(stored: unknown): Settings {
  const legacy = v.parse(LegacySettingsSchema, stored);
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

/** What a migration run did to the v2 keys: copied v1 values, or found nothing to copy. */
export type Migration = "migrated" | "current";

/** One v1 key and the v2 key that replaces it. */
interface Move {
  readonly from: string;
  readonly to: string;
  /** The v2 stored value for a stored v1 value. */
  readonly convert: (v1: unknown) => JsonValue;
  /** The v2 stored value a reader gets from a stored value: what `convert` should have written. */
  readonly canonical: (v2: unknown) => JsonValue;
}

const SETTINGS_MOVE: Move = {
  from: LEGACY_SETTINGS_KEY,
  to: SETTINGS_KEY,
  convert: (v1) => encodeSettings(settingsFromV1(v1)),
  canonical: (v2) => encodeSettings(parseSettings(v2)),
};

const ALLOW_MOVE: Move = {
  from: LEGACY_ALLOW_KEY,
  to: ALLOW_KEY,
  convert: allowFromV1,
  canonical: (v2) => encodeAllow(decodeAllow(v2)),
};

const MOVES: readonly Move[] = [SETTINGS_MOVE, ALLOW_MOVE];

interface Written {
  readonly move: Move;
  readonly value: JsonValue;
}

/** Removes the keys this run wrote that still hold what it wrote; any other value stays. */
async function undo(store: KeyValueStore, written: readonly Written[]): Promise<void> {
  const current = await store.get(written.map(({ move }) => move.to));
  const own = written
    .filter(({ move, value }) => JSON.stringify(current.get(move.to)) === JSON.stringify(value))
    .map(({ move }) => move.to);
  if (own.length > 0) {
    await store.remove(own);
  }
}

/**
 * Copies the v1 settings and ignore list to their v2 keys, one key at a time and only while the
 * v2 key is absent. The v1 keys stay. If the copies do not read back as written, the run throws.
 */
export async function migrateStorage(store: KeyValueStore): Promise<Migration> {
  const found = await store.get(MOVES.flatMap((move) => [move.from, move.to]));
  const written: Written[] = [];
  for (const move of MOVES) {
    // Another context may have written the v2 key since the first read.
    if (!found.has(move.from) || found.has(move.to) || (await store.get([move.to])).has(move.to)) {
      continue;
    }
    const value = move.convert(found.get(move.from));
    await store.set(new Map([[move.to, value]]));
    written.push({ move, value });
  }
  if (written.length === 0) {
    return "current";
  }
  const stored = await store.get(written.map(({ move }) => move.to));
  const intact = written.every(({ move, value }) =>
    stored.has(move.to)
    && JSON.stringify(move.canonical(stored.get(move.to))) === JSON.stringify(value)
  );
  if (!intact) {
    // Best effort: the run has failed already, and its error is the one to report.
    await undo(store, written).catch(() => undefined);
    throw new SarError("error_settings_load", {});
  }
  return "migrated";
}

const runs = new WeakMap<KeyValueStore, Promise<Migration>>();

/**
 * `migrateStorage` once per store in this context. A failed run is forgotten, so the next call
 * retries.
 */
export function migrateOnce(store: KeyValueStore): Promise<Migration> {
  const earlier = runs.get(store);
  if (earlier !== undefined) {
    return earlier;
  }
  const run = migrateStorage(store);
  runs.set(store, run);
  void run.catch(() => {
    runs.delete(store);
  });
  return run;
}

/**
 * The stored value of a v2 key. One read when the key exists or v1 holds nothing; when only v1
 * data exists, the first read migrates it and reads again.
 */
async function readMigrated(store: KeyValueStore, move: Move): Promise<unknown> {
  const found = await store.get([move.to, move.from]);
  if (found.has(move.to) || !found.has(move.from)) {
    return found.get(move.to);
  }
  await migrateOnce(store);
  return (await store.get([move.to])).get(move.to);
}

export function readSettingsValue(store: KeyValueStore): Promise<unknown> {
  return readMigrated(store, SETTINGS_MOVE);
}

export function readAllowValue(store: KeyValueStore): Promise<unknown> {
  return readMigrated(store, ALLOW_MOVE);
}
