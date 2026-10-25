import * as v from "valibot";
import type { JsonValue } from "../json";
import type { KindId } from "../kinds/id";
import { KINDS, perKind } from "../kinds/registry";
import { type AppId, toAppId } from "../types";

/** One ignored game: its store name at the time and when the user ignored it. */
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

/** The ignored games of each scope, keyed by app ID. */
export type AllowEntries = Readonly<Record<AllowScope, ReadonlyMap<AppId, AllowEntry>>>;

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
 * The entries of one scope's stored value, an object from app ID to name and date. Anything but an
 * object yields nothing, and an entry that is invalid, or whose key is not an app ID, is dropped
 * on its own.
 */
export function decodeAllowScope(stored: unknown): ReadonlyMap<AppId, AllowEntry> {
  const entries = new Map<AppId, AllowEntry>();
  const record = v.safeParse(RecordSchema, stored);
  if (!record.success) {
    return entries;
  }
  for (const [key, value] of Object.entries(record.output)) {
    const id = /^[1-9]\d*$/.test(key) ? toAppId(Number(key)) : undefined;
    const entry = v.safeParse(EntrySchema, value);
    if (id !== undefined && entry.success) {
      entries.set(id, entry.output);
    }
  }
  return entries;
}

/** The ignored games in a stored value, scope by scope; a scope it lacks has none. */
export function decodeAllow(stored: unknown): AllowEntries {
  const record = v.safeParse(RecordSchema, stored);
  const scopes = record.success ? record.output : {};
  return perScope((scope) => decodeAllowScope(scopes[scope]));
}

function encodeScope(entries: ReadonlyMap<AppId, AllowEntry>): JsonValue {
  return Object.fromEntries(
    [...entries].map(([id, entry]) => [String(id), { name: entry.name, added: entry.added }]),
  );
}

/** The stored value of the ignored games: one object per scope. */
export function encodeAllow(entries: AllowEntries): JsonValue {
  return perScope((scope) => encodeScope(entries[scope]));
}
