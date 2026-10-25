import type { IgnoredGames } from "../../src/core/ignored";
import { type AllowScope, perScope } from "../../src/core/settings/allow-data";
import { appIds } from "./app-ids";

/** The ignored games of each scope, from plain app IDs; a scope left out has none. */
export function ignoredGames(
  listed: Partial<Record<AllowScope, readonly number[]>> = {},
): IgnoredGames {
  return perScope((scope) => new Set(appIds(...(listed[scope] ?? []))));
}
