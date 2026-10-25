import type { KindId } from "./kinds/id";
import type { Relations } from "./kinds/verdicts";
import type { Logger } from "./log";
import { ALLOW_ALL, type AllowScope, perScope } from "./settings/allow-data";
import type { AllowList } from "./settings/allow-list";
import type { AppId } from "./types";

/** The games the user ignored, in page memory: one set of app IDs per scope. */
export type IgnoredGames = Readonly<Record<AllowScope, Set<AppId>>>;

/** The stored ignore list. A list that cannot be read is logged and counts as empty. */
export async function loadIgnored(
  allowList: AllowList,
  logger: Pick<Logger, "error">,
): Promise<IgnoredGames> {
  try {
    const entries = await allowList.list();
    return perScope((scope) => new Set(entries[scope].keys()));
  } catch (problem) {
    logger.error(problem);
    return perScope(() => new Set());
  }
}

/** Whether the game, or the base game it belongs to, is on the list of the scope. */
function isListed(
  ignored: IgnoredGames,
  scope: AllowScope,
  id: AppId,
  { parent }: Relations,
): boolean {
  return ignored[scope].has(id) || (parent !== undefined && ignored[scope].has(parent));
}

/**
 * Whether the game is ignored for the kind, on its own or for all kinds. A DLC follows its base
 * game (`related.parent`, from Valve's data, see `KindVerdicts`): ignoring the base game for a
 * kind, or for all kinds, ignores its DLC for it too, including a DLC released later, since no
 * list of DLC is kept. A relation that is not known leaves the game on its own entries. This is
 * the one place that decides; every surface asks it.
 */
export function isIgnored(
  ignored: IgnoredGames,
  id: AppId,
  kind: KindId,
  related: Relations = {},
): boolean {
  return isListed(ignored, ALLOW_ALL, id, related) || isListed(ignored, kind, id, related);
}
