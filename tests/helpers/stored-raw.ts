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

/** A stored v2 ignore list, of games or of creators, holding `keys` in one scope. */
export function v2Allow(
  scope: AllowScope,
  ...keys: readonly (number | string)[]
): Readonly<Record<string, Readonly<Record<string, StoredAllowEntry>>>> {
  return { [scope]: Object.fromEntries(keys.map((key) => [String(key), storedAllowEntry()])) };
}

/** A fresh stored value with nesting: an object holding a string, a number and a list. */
export function storedJson(): Readonly<Record<string, JsonValue>> {
  return { name: freshName(), added: freshTime(), list: [freshName()] };
}

/** A text that no stored field takes as its value. */
export function corruptText(): string {
  return "garbage";
}

/** A number that no stored field takes as its value. */
export function corruptNumber(): number {
  return 7;
}

/** Stored locales that are not language codes. */
export function badLocales(): readonly JsonValue[] {
  return ["", " ", "english", "e", "en US", "../en", 5, null];
}

/** Texts that name no app ID: empty, zero, a leading zero, a fraction, negative, past 32 bits. */
export function badGameKeys(): readonly string[] {
  return ["", "0", "012", "1.5", "-3", "abc", "4294967296"];
}

/** Stored ignore entries without a date, without a text name, or not an object. */
export function badAllowEntries(): readonly JsonValue[] {
  return [{ name: freshName() }, { name: 5, added: freshTime() }, corruptText(), null];
}

/** Stored values that name no ignore scope. */
export function badScopes(): readonly (string | null)[] {
  return [null, "", "kinds", "all ", "__proto__"];
}

/** Stored chip texts that are not text, or blank. */
export function badChipTexts(): readonly JsonValue[] {
  return [corruptNumber(), "   ", [corruptText()]];
}

/** The smallest and the largest app ID. */
export function appIdBounds(): readonly number[] {
  return [1, 0xff_ff_ff_ff];
}

/** Values that are no app ID: zero, negative, a fraction, past 32 bits, not a number. */
export function badAppIds(): readonly unknown[] {
  return [0, -1, 1.5, 0x1_00_00_00_00, Number.NaN, "10", null, undefined];
}

/** Stored values that are no browser tab ID: a string, `TAB_ID_NONE` (-1), a fraction, null. */
export function badTabIds(): readonly JsonValue[] {
  return ["5", -1, 1.5, null];
}
