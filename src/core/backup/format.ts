import * as v from "valibot";
import {
  CREATOR_ROLES,
  type CreatorKey,
  type CreatorRole,
  perRole,
  toCreatorKey,
} from "../creator";
import { type JsonValue, parseJson } from "../json";
import { type AllowEntries, decodeScopes, encodeAllow, parseGameKey } from "../settings/allow-data";
import { encodeSettings, parseSettings, type Settings } from "../settings/settings";

/** Names the file as a backup of ours: an identifier like the `sar-` prefix, never shown. */
export const BACKUP_FORMAT = "sar-backup";

/**
 * Each step turns the body of one format version into the next: index 0 upgrades version 1 to 2.
 * A new version appends its step, and `BACKUP_VERSION` follows.
 */
const UPGRADES: readonly ((body: unknown) => unknown)[] = [];

/** The format version this build writes, and the newest it reads. */
export const BACKUP_VERSION = UPGRADES.length + 1;

/** The largest backup restore reads, in bytes; a file with thousands of entries stays far below. */
export const MAX_BACKUP_SIZE = 1024 * 1024;

/** What the person configured: the settings and the three ignore lists. */
export interface BackupContents {
  /** When the backup was made, in milliseconds since the Unix epoch. */
  readonly created: number;
  readonly settings: Settings;
  readonly games: AllowEntries;
  readonly creators: Readonly<Record<CreatorRole, AllowEntries<CreatorKey>>>;
}

/** A file read as a backup, or why it is none. */
export type BackupReading =
  | {
    readonly kind: "backup";
    readonly contents: BackupContents;
    /** Ignore list entries in the file that could not be read, and that restore leaves out. */
    readonly skipped: number;
  }
  | { readonly kind: "invalid"; }
  | { readonly kind: "newer"; };

const INVALID = { kind: "invalid" } as const;
const NEWER = { kind: "newer" } as const;

const HeadSchema = v.object({
  format: v.literal(BACKUP_FORMAT),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

// The settings and the lists stay unknown here: the stored schemas read them, field by field and
// entry by entry, exactly as they read storage.
const BodySchema = v.object({
  created: v.pipe(v.number(), v.finite(), v.minValue(0)),
  // Not a record schema: it takes an array too, which would read as all defaults
  settings: v.custom<object>(isPlainObject),
  ignored: v.fallback(
    v.object({
      games: v.optional(v.unknown()),
      developer: v.optional(v.unknown()),
      publisher: v.optional(v.unknown()),
    }),
    {},
  ),
});

function isPlainObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How many entries a list's value holds, valid or not: one per key of each scope's object. */
function rawEntries(list: unknown): number {
  const scopes = v.safeParse(v.record(v.string(), v.unknown()), list);
  if (!scopes.success) {
    return 0;
  }
  let count = 0;
  for (const scope of Object.values(scopes.output)) {
    if (typeof scope === "object" && scope !== null) {
      count += Object.keys(scope).length;
    }
  }
  return count;
}

/** How many entries the lists hold, over every scope. */
export function countEntries(lists: readonly AllowEntries<unknown>[]): number {
  let count = 0;
  for (const entries of lists) {
    for (const scoped of Object.values(entries)) {
      count += scoped.size;
    }
  }
  return count;
}

/** The text of a backup file. */
export function encodeBackup(contents: BackupContents): string {
  const value: JsonValue = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created: contents.created,
    settings: encodeSettings(contents.settings),
    ignored: {
      games: encodeAllow(contents.games),
      ...perRole((role) => encodeAllow(contents.creators[role])),
    },
  };
  return JSON.stringify(value, null, 2);
}

/**
 * Reads untrusted text as a backup. Text that is too long, not JSON or not our format is invalid,
 * and a later format version is newer. A bad settings field takes its default, and a bad list
 * entry is left out and counted, as when storage holds one.
 */
export function readBackup(text: string): BackupReading {
  if (text.length > MAX_BACKUP_SIZE) {
    return INVALID;
  }
  let raw: unknown;
  try {
    raw = parseJson(text);
  } catch {
    return INVALID;
  }
  const head = v.safeParse(HeadSchema, raw);
  if (!head.success) {
    return INVALID;
  }
  if (head.output.version > BACKUP_VERSION) {
    return NEWER;
  }
  const upgraded = UPGRADES.slice(head.output.version - 1).reduce((body, step) => step(body), raw);
  const body = v.safeParse(BodySchema, upgraded);
  if (!body.success) {
    return INVALID;
  }
  const { created, settings, ignored } = body.output;
  const games = decodeScopes(ignored.games, parseGameKey);
  const creators = perRole((role) => decodeScopes(ignored[role], toCreatorKey));
  const found = rawEntries(ignored.games)
    + CREATOR_ROLES.reduce((sum, role) => sum + rawEntries(ignored[role]), 0);
  const read = countEntries([games, creators.developer, creators.publisher]);
  return {
    kind: "backup",
    contents: { created, settings: parseSettings(settings), games, creators },
    skipped: found - read,
  };
}
