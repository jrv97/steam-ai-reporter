import { CREATOR_ROLES, type CreatorKey, type CreatorRole, perRole } from "./creator";
import type { KindId } from "./kinds/id";
import type { Relations } from "./kinds/verdicts";
import type { Logger } from "./log";
import type { Clock, KeyValueStore } from "./ports";
import { ALLOW_ALL, type AllowScope, perScope } from "./settings/allow-data";
import {
  type AllowList,
  createAllowList,
  createCreatorList,
  type CreatorList,
  type ScopedList,
} from "./settings/allow-list";
import type { AppId } from "./types";

/** One set of keys per scope, in page memory. */
type ScopedSets<Key> = Readonly<Record<AllowScope, Set<Key>>>;

/** What the user ignored, in page memory. */
export interface Ignored {
  readonly games: ScopedSets<AppId>;
  /** Per role: the developers or publishers, by creator key. */
  readonly creators: Readonly<Record<CreatorRole, ScopedSets<CreatorKey>>>;
}

/** The stored lists behind `Ignored`. */
export interface IgnoreLists {
  readonly games: AllowList;
  readonly creators: Readonly<Record<CreatorRole, CreatorList>>;
}

/** The stored lists over a store. */
export function createIgnoreLists(store: KeyValueStore, clock: Clock): IgnoreLists {
  return {
    games: createAllowList(store, clock),
    creators: perRole((role) => createCreatorList(store, clock, role)),
  };
}

/** One stored list. A list that cannot be read is logged and counts as empty. */
async function loadSets<Key>(
  list: ScopedList<Key>,
  logger: Pick<Logger, "error">,
): Promise<ScopedSets<Key>> {
  try {
    const entries = await list.list();
    return perScope((scope) => new Set(entries[scope].keys()));
  } catch (problem) {
    logger.error(problem);
    return perScope(() => new Set());
  }
}

/** The stored ignore lists, each on its own: one that fails does not cost the others. */
export async function loadIgnored(
  lists: IgnoreLists,
  logger: Pick<Logger, "error">,
): Promise<Ignored> {
  const [games, developer, publisher] = await Promise.all([
    loadSets(lists.games, logger),
    loadSets(lists.creators.developer, logger),
    loadSets(lists.creators.publisher, logger),
  ]);
  return { games, creators: { developer, publisher } };
}

/** Whether the scope lists the game, its base game, or one of the creators in its own role. */
function isListed(ignored: Ignored, scope: AllowScope, id: AppId, related: Relations): boolean {
  const { parent, creators } = related;
  return ignored.games[scope].has(id)
    || (parent !== undefined && ignored.games[scope].has(parent))
    || (creators !== undefined
      && CREATOR_ROLES.some((role) =>
        creators[role].some((creator) =>
          creator.keys.some((key) => ignored.creators[role][scope].has(key))
        )
      ));
}

/**
 * Whether the game is ignored for the kind, on its own or for all kinds. A DLC follows its base
 * game (`related.parent`, from Valve's data, see `KindVerdicts`): ignoring the base game for a
 * kind, or for all kinds, ignores its DLC for it too, including a DLC released later, since no
 * list of DLC is kept. A game also follows its creators: it is ignored when one of its developers
 * is on the developer list, or one of its publishers on the publisher list, for the kind or for
 * all kinds (`related.creators`; a creator matches on its clan key or its name key). A relation
 * that is not known leaves the game on its own entries. This is the one place that decides;
 * every surface asks it.
 */
export function isIgnored(
  ignored: Ignored,
  id: AppId,
  kind: KindId,
  related: Relations = {},
): boolean {
  return isListed(ignored, ALLOW_ALL, id, related) || isListed(ignored, kind, id, related);
}
