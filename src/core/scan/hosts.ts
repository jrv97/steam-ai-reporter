import type { AppId } from "../types";
import { DATA_CANDIDATE, type Naming, uniformNaming } from "./candidates";
import { firstImage } from "./image";

// The host rule rq6 (S5) chose on the tag hub: the lowest image-bearing ancestor that names one
// app, then a short climb that joins image and title blocks that are siblings.

/** How far above a link its capsule image may sit (the link itself is level 0). */
export const MAX_IMAGE_LEVELS = 8;
/** How many more levels a host may climb while everything inside still names its app. */
export const MAX_JOIN_LEVELS = 3;

/** Finds capsule hosts during one scan. Its memos live as long as the scan; never keep one. */
export interface HostFinder {
  /** The capsule host for a candidate that names `appId`, or undefined when it has none. */
  hostOf(candidate: Element, appId: AppId): Element | undefined;
}

/**
 * A host finder for one scan of `document`. A `data-ds-appid` element is its own host: Steam puts
 * the attribute on the capsule. A link's host is found by the rule above, and never climbs to
 * `body`; a link with no image-bearing ancestor (text links, navigation) has none.
 */
export function createHostFinder(document: Document): HostFinder {
  const base = document.baseURI;
  const images = new Map<Element, boolean>();
  const namings = new Map<Element, Naming>();

  function hasImage(element: Element): boolean {
    let known = images.get(element);
    if (known === undefined) {
      known = firstImage(element) !== undefined;
      images.set(element, known);
    }
    return known;
  }

  function naming(element: Element): Naming {
    if (namings.has(element)) {
      return namings.get(element);
    }
    const value = uniformNaming(element, base);
    namings.set(element, value);
    return value;
  }

  /** The parent, unless it is `body` or the root, which are never hosts. */
  function parentOf(element: Element): Element | undefined {
    const parent = element.parentElement;
    return parent === null || parent === document.body || parent === document.documentElement
      ? undefined
      : parent;
  }

  return {
    hostOf(candidate, appId) {
      if (candidate.matches(DATA_CANDIDATE)) {
        return candidate;
      }
      let host: Element | undefined = candidate;
      for (let level = 0; !hasImage(host); level++) {
        host = level < MAX_IMAGE_LEVELS ? parentOf(host) : undefined;
        if (host === undefined) {
          return undefined;
        }
      }
      if (naming(host) !== appId) {
        return undefined;
      }
      for (let level = 0; level < MAX_JOIN_LEVELS; level++) {
        const parent = parentOf(host);
        if (parent === undefined || naming(parent) !== appId) {
          break;
        }
        host = parent;
      }
      return host;
    },
  };
}
