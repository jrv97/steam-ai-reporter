import { type AppId, toAppId } from "./types";

// Settings and the ignore list use layout `v2`, with one entry per tag kind. The verdict cache,
// its meta record and the breaker keep `v1`. `CACHE_SCHEMA` versions the cache; the breaker owns
// `v1:breaker`.

/**
 * Bump to discard every cached verdict on the next start (and only verdicts). Version 2 stores
 * one entry per tag kind in each verdict.
 */
export const CACHE_SCHEMA = 2;

const VERDICT_PREFIX = "v1:a:";

export const SETTINGS_KEY = "v2:settings";
export const ALLOW_KEY = "v2:allow";
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
