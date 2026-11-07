import { KIND_IDS, type KindId } from "../kinds/id";

/** The tab of the settings that are not a tag's: language, colors, ignore lists, backup. */
export const GENERAL_TAB = "general";

/** A settings tab: General, or one tag kind's. */
export type TabId = typeof GENERAL_TAB | KindId;

/** Every tab id, General first, then each kind in registry order. */
export const TAB_IDS: readonly TabId[] = [GENERAL_TAB, ...KIND_IDS];

/** The fragment parameter that names a tab: `#tab=<id>`. */
const TAB_PARAM = "tab";

/** The tab a value names, or undefined for anything else. */
export function toTabId(value: string | null | undefined): TabId | undefined {
  return TAB_IDS.find((id) => id === value);
}

/** The tab a location fragment names (`#tab=drm`), or undefined when it names none we know. */
export function parseTabHash(hash: string): TabId | undefined {
  return toTabId(new URLSearchParams(hash.replace(/^#/, "")).get(TAB_PARAM));
}

/** The fragment that opens a tab, for a link to the options page. */
export function tabHash(id: TabId): string {
  return `#${new URLSearchParams({ [TAB_PARAM]: id }).toString()}`;
}

/** The order of the tabs: General first, outside the order, then the kinds in the tag order. */
export function tabsInOrder(order: readonly KindId[]): readonly TabId[] {
  return [GENERAL_TAB, ...order];
}
