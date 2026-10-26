import type { Ignored } from "../../src/core/ignored";
import { type AllowScope, perScope } from "../../src/core/settings/allow-data";
import { appIds } from "./app-ids";
import { keyOf } from "./creators";

type Listed<Key> = Partial<Record<AllowScope, readonly Key[]>>;

/** What a test ignored: app IDs, and creator keys such as `c:4` or `n:Valve`, by scope. */
export interface IgnoredSpec {
  readonly games?: Listed<number>;
  readonly developers?: Listed<string>;
  readonly publishers?: Listed<string>;
}

function creatorSets(listed: Listed<string> = {}) {
  return perScope((scope) => new Set((listed[scope] ?? []).map((key) => keyOf(key))));
}

/** The ignored sets for these specs; a scope or list left out has none. */
export function ignoredSets(spec: IgnoredSpec = {}): Ignored {
  return {
    games: perScope((scope) => new Set(appIds(...(spec.games?.[scope] ?? [])))),
    creators: { developer: creatorSets(spec.developers), publisher: creatorSets(spec.publishers) },
  };
}
