import * as v from "valibot";
import type { JsonValue } from "../json";
import type { KindId } from "../kinds/id";
import { KINDS, perKind } from "../kinds/registry";
import { type AppId, toAppId } from "../types";

/** One ignored item, a game or a creator: its name at the time and when the user ignored it. */
export interface AllowEntry {
  readonly name: string;
  /** Milliseconds since the Unix epoch. */
  readonly added: number;
}

/** The scope that ignores a game for every kind. */
export const ALLOW_ALL = "all";

/** Where an ignore applies: one tag kind, or every kind. */
export type AllowScope = typeof ALLOW_ALL | KindId;

/** Every scope, in the order a list shows them: all kinds, then each kind in registry order. */
export const ALLOW_SCOPES: readonly AllowScope[] = [ALLOW_ALL, ...KINDS.map((kind) => kind.id)];

/** The scope a stored or attribute value names, or undefined when it is none. */
export function toAllowScope(value: string | null): AllowScope | undefined {
  return ALLOW_SCOPES.find((scope) => scope === value);
}

/** The ignored items of each scope, keyed by app ID for games. */
export type AllowEntries<Key = AppId> = Readonly<Record<AllowScope, ReadonlyMap<Key, AllowEntry>>>;

/** The key a stored text names, or undefined when it is none; stored keys are `String(key)`. */
export type ParseKey<Key> = (text: string) => Key | undefined;

/** The app ID a stored game key names. */
export function parseGameKey(text: string): AppId | undefined {
  return /^[1-9]\d*$/.test(text) ? toAppId(Number(text)) : undefined;
}

/** One `make(scope)` result for every scope. */
export function perScope<T>(make: (scope: AllowScope) => T): Readonly<Record<AllowScope, T>> {
  return { [ALLOW_ALL]: make(ALLOW_ALL), ...perKind((kind) => make(kind.id)) };
}

const EntrySchema = v.pipe(
  v.object({ name: v.string(), added: v.pipe(v.number(), v.finite()) }),
  v.readonly(),
);

const RecordSchema = v.record(v.string(), v.unknown());

/**
 * The entries of one scope's stored value, an object from key to name and date. Anything but an
 * object yields nothing, and an entry that is invalid, or whose key `parseKey` rejects, is
 * dropped on its own.
 */
export function decodeScope<Key>(
  stored: unknown,
  parseKey: ParseKey<Key>,
): ReadonlyMap<Key, AllowEntry> {
  const entries = new Map<Key, AllowEntry>();
  const record = v.safeParse(RecordSchema, stored);
  if (!record.success) {
    return entries;
  }
  for (const [key, value] of Object.entries(record.output)) {
    const parsed = parseKey(key);
    const entry = v.safeParse(EntrySchema, value);
    if (parsed !== undefined && entry.success) {
      entries.set(parsed, entry.output);
    }
  }
  return entries;
}

/** The entries in a stored value, scope by scope; a scope it lacks has none. */
export function decodeScopes<Key>(stored: unknown, parseKey: ParseKey<Key>): AllowEntries<Key> {
  const record = v.safeParse(RecordSchema, stored);
  const scopes = record.success ? record.output : {};
  return perScope((scope) => decodeScope(scopes[scope], parseKey));
}

/** The ignored games of one scope's stored value. */
export function decodeAllowScope(stored: unknown): ReadonlyMap<AppId, AllowEntry> {
  return decodeScope(stored, parseGameKey);
}

/** The ignored games in a stored value, scope by scope; a scope it lacks has none. */
export function decodeAllow(stored: unknown): AllowEntries {
  return decodeScopes(stored, parseGameKey);
}

function encodeScope<Key>(entries: ReadonlyMap<Key, AllowEntry>): JsonValue {
  return Object.fromEntries(
    [...entries].map(([key, entry]) => [String(key), { name: entry.name, added: entry.added }]),
  );
}

/** The stored value of the ignored items: one object per scope. */
export function encodeAllow<Key>(entries: AllowEntries<Key>): JsonValue {
  return perScope((scope) => encodeScope(entries[scope]));
}
