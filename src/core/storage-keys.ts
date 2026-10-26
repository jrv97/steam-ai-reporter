import type { CreatorRole } from "./creator";
import { type AppId, toAppId } from "./types";

// Settings and the ignore list use layout `v2`, with one entry per tag kind, and so does the small
// record of which settings sections are open. The verdict cache, its meta record and the breaker
// keep `v1`. `CACHE_SCHEMA` versions the cache; the breaker owns `v1:breaker`.

/**
 * Bump to discard every cached verdict on the next start (and only verdicts). Version 2 stores
 * one entry per tag kind in each verdict. Version 3 adds the base game of a DLC, which an older
 * entry lacks, so a DLC cached before would never learn its parent. Version 4 adds the developers
 * and publishers, which an older entry lacks for the same reason.
 */
export const CACHE_SCHEMA = 4;

const VERDICT_PREFIX = "v1:a:";

export const SETTINGS_KEY = "v2:settings";
export const ALLOW_KEY = "v2:allow";
/** The ignored developers and publishers, shaped like `v2:allow` and keyed by creator key. */
export const CREATOR_ALLOW_KEYS: Readonly<Record<CreatorRole, string>> = {
  developer: "v2:allow-developers",
  publisher: "v2:allow-publishers",
};
/** Which settings sections the user closed or opened again; interface state, not a setting. */
export const SECTION_STATE_KEY = "v2:ui";
export const META_KEY = "v1:meta";

/** The layout `v1` keys of settings and the ignore list; only the migration reads them. */
export const LEGACY_SETTINGS_KEY = "v1:settings";
export const LEGACY_ALLOW_KEY = "v1:allow";

export function verdictKey(id: AppId): string {
  return `${VERDICT_PREFIX}${id}`;
}

export function isVerdictKey(key: string): boolean {
  return key.startsWith(VERDICT_PREFIX);
}

/** The app ID of a verdict key; undefined for any other key or a malformed ID. */
export function appIdOfVerdictKey(key: string): AppId | undefined {
  if (!isVerdictKey(key)) {
    return undefined;
  }
  const digits = key.slice(VERDICT_PREFIX.length);
  return /^[1-9]\d*$/.test(digits) ? toAppId(Number(digits)) : undefined;
}
