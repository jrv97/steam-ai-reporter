import type { AppId } from "../types";
import { appIdFromDataAttribute, appIdFromHref } from "./appid";
import { SAR_NODE } from "./marks";

// Elements that name an app (rq6, S5): classic surfaces put a `data-ds-appid` on the capsule
// itself; React surfaces carry only `/app/<id>` links.

/** The attribute Steam puts on a classic capsule or row, the store's own mark of an item. */
export const DATA_APPID = "data-ds-appid";

/** Capsules that say their app ID in a `data-ds-appid`. A comma list is a package or bundle. */
export const DATA_CANDIDATE = `[${DATA_APPID}]`;
/** Links that may lead to an app page; `appIdFromHref` decides. */
export const LINK_CANDIDATE = "a[href*='/app/']";
/** Links to store items that are not apps: packages, bundles and events. They name `several`. */
const OTHER_ITEM_LINK = "a[href*='/sub/'], a[href*='/bundle/'], a[href*='/news/']";
const OTHER_ITEM_PATH = /\/(?:sub|bundle|news)\//;
/**
 * The ids of app page parts that belong to the page's app: its header capsule, purchase area and
 * description. Each names the page's app (nothing off an app page), which keeps a host for another
 * app from taking one in.
 */
const PAGE_PARTS: readonly string[] = [
  "gameHeaderImageCtn",
  "game_area_purchase",
  "game_area_description",
];
export const ANY_CANDIDATE = [DATA_CANDIDATE, LINK_CANDIDATE, OTHER_ITEM_LINK]
  .concat(PAGE_PARTS.map((id) => `#${id}`))
  .join(", ");

/**
 * Regions whose app links are never capsules: the classic and React footers, the app page
 * breadcrumbs and DLC bubble, and our own nodes. The global header root is not here: it holds the
 * search suggestions, and its navigation links carry no image, so the host rule drops them.
 */
export const SKIPPED =
  `#footer, [data-featuretarget='footer'], .breadcrumbs, .game_area_dlc_bubble, ${SAR_NODE}`;

/**
 * Small capsules of other apps that a store surface nests inside one app's capsule. Inside
 * `within`, links under `region` do not count toward the naming of a capsule that holds them, so
 * that capsule still names its one app. The small capsules keep hosts of their own.
 */
export interface NestedPlacement {
  /** A stable name for tests and debug logs. */
  readonly id: string;
  /** The store container the region counts in; elsewhere its links count like any other. */
  readonly within: string;
  /** The element that wraps one nested capsule. */
  readonly region: string;
}

/** Whether `element` sits in a nested capsule of `regions` that `root` holds below itself. */
function nestedBelow(
  element: Element,
  root: Element,
  regions: readonly NestedPlacement[],
): boolean {
  for (const { region } of regions) {
    const nested = element.closest(region);
    if (nested !== null && nested !== root && root.contains(nested)) {
      return true;
    }
  }
  return false;
}

/** The nested placements whose region `root` holds, inside their container. */
function regionsIn(
  root: Element,
  nested: readonly NestedPlacement[],
): readonly NestedPlacement[] {
  return nested.filter(
    (placement) =>
      root.querySelector(placement.region) !== null && root.closest(placement.within) !== null,
  );
}

/** What an element names: one app ID, `several` (a comma list or another item), or nothing. */
export type Naming = AppId | "several" | undefined;

/**
 * The app an element names. A `data-ds-appid` wins over the element's own `href`; a comma list
 * names several apps; a link names its app when it leads to a store app page. A link to a package,
 * bundle or event names `several`, so a capsule never grows to take in such a tile.
 */
export function namingOf(element: Element, base: string): Naming {
  const data = element.getAttribute(DATA_APPID);
  if (data !== null) {
    const id = appIdFromDataAttribute(data);
    if (id !== undefined) {
      return id;
    }
    if (data.includes(",")) {
      return "several";
    }
  }
  if (element.localName !== "a") {
    return PAGE_PARTS.includes(element.id) ? appIdFromHref(base, base) : undefined;
  }
  const href = element.getAttribute("href");
  if (href === null) {
    return undefined;
  }
  return appIdFromHref(href, base) ?? (OTHER_ITEM_PATH.test(href) ? "several" : undefined);
}

/** Whether `root` or an element inside it still names `appId`. */
export function namesApp(root: Element, appId: AppId, base: string): boolean {
  if (namingOf(root, base) === appId) {
    return true;
  }
  for (const element of root.querySelectorAll(ANY_CANDIDATE)) {
    if (namingOf(element, base) === appId) {
      return true;
    }
  }
  return false;
}

/**
 * The single app every naming element in `root` (`root` included) names, `several` when they
 * disagree, or undefined when none names an app. Capsules of `nested` below `root` do not count.
 * A root that names one app or holds none of them is read once.
 */
export function uniformNaming(
  root: Element,
  base: string,
  nested: readonly NestedPlacement[],
): Naming {
  const naming = namingIn(root, base, []);
  if (naming !== "several") {
    return naming;
  }
  const regions = regionsIn(root, nested);
  return regions.length === 0 ? naming : namingIn(root, base, regions);
}

/** `uniformNaming` without the capsules of `skipped`. Stops at the first disagreement. */
function namingIn(root: Element, base: string, skipped: readonly NestedPlacement[]): Naming {
  let found = namingOf(root, base);
  if (found === "several") {
    return found;
  }
  for (const element of root.querySelectorAll(ANY_CANDIDATE)) {
    if (skipped.length > 0 && nestedBelow(element, root, skipped)) {
      continue;
    }
    const naming = namingOf(element, base);
    if (naming === undefined) {
      continue;
    }
    if (naming === "several" || (found !== undefined && naming !== found)) {
      return "several";
    }
    found = naming;
  }
  return found;
}
