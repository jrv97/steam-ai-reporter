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
// migration reads them into the v2 shape and writes them to the v2 keys.

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

/** What a migration run did to the v2 keys: moved v1 values, or found nothing to move. */
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

const MOVES: readonly Move[] = [
  {
    from: LEGACY_SETTINGS_KEY,
    to: SETTINGS_KEY,
    convert: (v1) => encodeSettings(settingsFromV1(v1)),
    canonical: (v2) => encodeSettings(parseSettings(v2)),
  },
  {
    from: LEGACY_ALLOW_KEY,
    to: ALLOW_KEY,
    convert: allowFromV1,
    canonical: (v2) => encodeAllow(decodeAllow(v2)),
  },
];

/**
 * Moves the v1 settings and ignore list to their v2 keys. A v1 value is converted only while its
 * v2 key is absent, so a run that finds v2 data leaves it alone and a second run changes nothing.
 * The v1 keys go only after the v2 values read back as written; when they do not, the v2 keys are
 * cleared again, the v1 data stays, and the run throws.
 */
export async function migrateStorage(store: KeyValueStore): Promise<Migration> {
  const found = await store.get(MOVES.flatMap((move) => [move.from, move.to]));
  const writes = MOVES
    .filter((move) => found.has(move.from) && !found.has(move.to))
    .map((move) => ({ move, value: move.convert(found.get(move.from)) }));
  if (writes.length > 0) {
    const targets = writes.map(({ move }) => move.to);
    await store.set(new Map(writes.map(({ move, value }) => [move.to, value])));
    const stored = await store.get(targets);
    const intact = writes.every(({ move, value }) =>
      stored.has(move.to)
      && JSON.stringify(move.canonical(stored.get(move.to))) === JSON.stringify(value)
    );
    if (!intact) {
      await store.remove(targets);
      throw new SarError("error_settings_load", {});
    }
  }
  const stale = MOVES.filter((move) => found.has(move.from)).map((move) => move.from);
  if (stale.length > 0) {
    await store.remove(stale);
  }
  return writes.length > 0 ? "migrated" : "current";
}

const runs = new WeakMap<KeyValueStore, Promise<Migration>>();

/**
 * `migrateStorage` once per store in this context: the settings source and the allow-list both
 * call it before their first read or write. A failed run is forgotten, so the next call retries.
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
