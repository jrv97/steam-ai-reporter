import type { KindId } from "./kinds/id";
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

/** Whether the game is ignored for the kind, on its own or for all kinds. */
export function isIgnored(ignored: IgnoredGames, id: AppId, kind: KindId): boolean {
  return ignored[ALLOW_ALL].has(id) || ignored[kind].has(id);
}
