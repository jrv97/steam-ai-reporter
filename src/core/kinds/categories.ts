import { MALFORMED, type StoreItem } from "../detect/getitems.schema";
import { UNKNOWN, type UnknownVerdict } from "../types";

/** A list of Steam category IDs on a GetItems item that a kind reads. */
export type CategoryList = "supported_player_categoryids" | "feature_categoryids";

/**
 * The IDs in the item's category list `list`, or the kind's answer without them: unknown
 * malformed when the categories or the list came in the wrong shape, missing when there is none.
 */
export function categoryIds(
  item: StoreItem,
  list: CategoryList,
): readonly number[] | UnknownVerdict {
  const { categories } = item;
  const ids = categories === MALFORMED ? MALFORMED : categories?.[list];
  if (ids === MALFORMED) {
    return UNKNOWN.malformed;
  }
  return ids ?? UNKNOWN.missing;
}
