import { type AppId, toAppId } from "./types";

// The storage layout. Every key carries the layout version `v1`. Step 7's breaker key
// (`v1:breaker`) lives next to these but is owned by the breaker; nothing here touches it.

/**
 * Bump to discard every cached verdict on the next start (and only verdicts). Version 2 stores
 * one entry per tag kind in each verdict.
 */
export const CACHE_SCHEMA = 2;

const VERDICT_PREFIX = "v1:a:";

export const SETTINGS_KEY = "v1:settings";
export const ALLOW_KEY = "v1:allow";
export const META_KEY = "v1:meta";

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
