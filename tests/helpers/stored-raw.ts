import type { JsonValue } from "../../src/core/json";
import { type AllowScope, perScope } from "../../src/core/settings/allow-data";
import { freshAppIds, freshName, freshTime } from "./sequence";

/** One flat settings object, as layout v1 stored it. */
export interface V1Settings {
  readonly [key: string]: JsonValue;
  readonly badges: JsonValue;
  readonly banner: JsonValue;
  readonly listFilter: JsonValue;
  readonly locale: JsonValue;
  readonly debug: JsonValue;
}

/** An ignored game, as layout v1 and every scope of layout v2 store it. */
export interface StoredAllowEntry {
  readonly [key: string]: JsonValue;
  readonly name: string;
  readonly added: number;
}

/** The v1 settings the version that wrote layout v1 started with; override what a test needs. */
export function v1Settings(overrides: Partial<V1Settings> = {}): V1Settings {
  return {
    badges: true,
    banner: true,
    listFilter: "off",
    locale: "auto",
    debug: false,
    ...overrides,
  };
}

/** v1 settings a person changed: no badges, hidden games, Spanish, debug on. */
export function v1CustomSettings(): V1Settings {
  return v1Settings({ badges: false, listFilter: "hide", locale: "es", debug: true });
}

/** A fresh ignored game entry; override what a test needs. */
export function storedAllowEntry(overrides: Partial<StoredAllowEntry> = {}): StoredAllowEntry {
  return { name: freshName(), added: freshTime(), ...overrides };
}

/** A v1 ignore list: these entries by app ID, or two fresh games when none are given. */
export function v1Allow(
  entries: Readonly<Record<string, StoredAllowEntry>> = Object.fromEntries(
    freshAppIds(2).map((id) => [String(id), storedAllowEntry()]),
  ),
): Readonly<Record<string, StoredAllowEntry>> {
  return entries;
}

/** The stored v2 ignore list with no game in any scope. */
export function noGames(): Readonly<Record<AllowScope, Readonly<Record<string, never>>>> {
  return perScope(() => ({}));
}

/** Stored values that are not objects, which every reader must treat as corrupt. */
export function junkValues(): readonly JsonValue[] {
  return ["garbage", 7, null, true, [], ["x"]];
}
