import type { AppId } from "../types";
import { appIdFromDataAttribute, appIdFromHref } from "./appid";
import { SAR_NODE } from "./marks";

// Elements that name an app (rq6, S5): classic surfaces put a `data-ds-appid` on the capsule
// itself; React surfaces carry only `/app/<id>` links.

const DATA_APPID = "data-ds-appid";

/** Capsules that say their app ID in a `data-ds-appid`. A comma list is a package or bundle. */
export const DATA_CANDIDATE = `[${DATA_APPID}]`;
/** Links that may lead to an app page; `appIdFromHref` decides. */
export const LINK_CANDIDATE = "a[href*='/app/']";
export const ANY_CANDIDATE = `${DATA_CANDIDATE}, ${LINK_CANDIDATE}`;

/**
 * Regions whose app links are never capsules: the classic and React footers, the app page
 * breadcrumbs, and our own nodes. The global header root is not here: it holds the search
 * suggestions, and its navigation links carry no image, so the host rule drops them.
 */
export const SKIPPED = `#footer, [data-featuretarget='footer'], .breadcrumbs, ${SAR_NODE}`;

/** What an element says about apps: one app ID, `several` (a comma list), or nothing. */
export type Naming = AppId | "several" | undefined;

/**
 * The app an element names. A `data-ds-appid` wins over the element's own `href`; a comma list
 * names several apps; a link names its app when it leads to a store app page.
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
    return undefined;
  }
  const href = element.getAttribute("href");
  return href === null ? undefined : appIdFromHref(href, base);
}

/**
 * The single app every naming element in `root` (`root` included) names, `several` when they
 * disagree, or undefined when none names an app. Stops at the first disagreement.
 */
export function uniformNaming(root: Element, base: string): Naming {
  let found = namingOf(root, base);
  if (found === "several") {
    return found;
  }
  for (const element of root.querySelectorAll(ANY_CANDIDATE)) {
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
