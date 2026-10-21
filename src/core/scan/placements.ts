import { LINK_CANDIDATE } from "./candidates";
import { firstImage, imageBox } from "./image";

// Where a host's badge goes, per store surface (rq6, S5; docs/design/components.mdx, sections 1,
// 2 and 5). A new surface is a new entry here, never a scanner edit (rule 11).

/** Finds the element a badge attaches to inside a host, or undefined when it does not fit. */
export type AnchorRule = (host: Element) => Element | undefined;

interface PlacementBase {
  /** A stable name for tests and debug logs. */
  readonly id: string;
  /** A selector the host must match (`Element.matches`, so descendant combinators work). */
  readonly host: string;
  /**
   * False where hiding the host would break the list (virtualized or carousel lists); the list
   * filter dims those hosts instead, through `data-sar-hideable="false"`.
   */
  readonly hideable: boolean;
  /** Reads only: it runs in the scan's read phase. */
  readonly anchor: AnchorRule;
}

/** A compact badge overlaid on the capsule image; the anchor is the image's box. */
export interface OverlayPlacement extends PlacementBase {
  readonly badge: "compact";
  readonly slot: "overlay";
}

/**
 * A full badge in a row with room for words: `last-child` makes it the anchor's last child,
 * `after` its next sibling.
 */
export interface RowPlacement extends PlacementBase {
  readonly badge: "full";
  readonly slot: "last-child" | "after";
}

export type Placement = OverlayPlacement | RowPlacement;

/** The box of the host's first capsule image. */
export const capsuleImage: AnchorRule = (host) => {
  const image = firstImage(host);
  return image === undefined ? undefined : imageBox(image);
};

/** The first element in the host matching `selector`. */
export function inside(selector: string): AnchorRule {
  return (host) => host.querySelector(selector) ?? undefined;
}

function hasText(element: Element): boolean {
  return element.textContent.trim() !== "";
}

/** The host's first element without child elements that shows text: a row's title line. */
export const firstTextLeaf: AnchorRule = (host) => {
  for (const element of host.querySelectorAll("*")) {
    if (element.childElementCount === 0 && hasText(element)) {
      return element;
    }
  }
  return undefined;
};

/** The host's first app link without an image, even before its text arrives. */
const imagelessLink: AnchorRule = (host) => {
  for (const link of host.querySelectorAll(LINK_CANDIDATE)) {
    if (firstImage(link) === undefined) {
      return link;
    }
  }
  return undefined;
};

/**
 * The wishlist row's title link, only when the host is a wishlist row (its drag ID says so). A row
 * mounts with empty links and fills them later, so the title link may still be empty here.
 */
const wishlistTitle: AnchorRule = (host) =>
  host.querySelector("[data-rfd-draggable-id^='WishlistItem-']") === null
    ? undefined
    : imagelessLink(host);

/** The default: a compact badge over the capsule image of any host. */
export const GENERIC: OverlayPlacement = {
  id: "generic",
  host: "*",
  hideable: true,
  badge: "compact",
  slot: "overlay",
  anchor: capsuleImage,
};

/** Every placement, most specific first; the first whose host and anchor match wins. */
export const PLACEMENTS: readonly Placement[] = [
  {
    // Classic search rows: after the platform icons on the line under the title, which clips its
    // overflow. The icons keep their place, so they stay aligned from row to row.
    id: "search-row",
    host: "a.search_result_row",
    hideable: true,
    badge: "full",
    slot: "last-child",
    anchor: inside(".search_platforms"),
  },
  {
    // The virtualized React wishlist mounts and unmounts rows, so hiding would make it jump.
    id: "wishlist-row",
    host: "[data-index]",
    hideable: false,
    badge: "full",
    slot: "after",
    anchor: wishlistTitle,
  },
  {
    // Search suggestions inside the header root: images too small for a compact badge.
    id: "search-suggestion",
    host: "[id^='searchSuggestions'] *",
    hideable: true,
    badge: "full",
    slot: "after",
    anchor: firstTextLeaf,
  },
  {
    // DLC rows on an app page; most have no image.
    id: "dlc-row",
    host: "a.game_area_dlc_row",
    hideable: true,
    badge: "full",
    slot: "after",
    anchor: inside(".game_area_dlc_name"),
  },
  {
    // The home page's main carousel: the image is a CSS background on a child.
    id: "home-main-carousel",
    host: "a.store_main_capsule",
    hideable: false,
    badge: "compact",
    slot: "overlay",
    anchor: capsuleImage,
  },
  {
    // The discovery queue preview: one overlay link names the first queued app over a stack of
    // capsule images. The badge goes on that first capsule, and hiding would remove the queue.
    id: "queue-preview",
    host: ".discovery_queue_content_ctn",
    hideable: false,
    badge: "compact",
    slot: "overlay",
    anchor: inside(".dq_item"),
  },
  {
    // The large carousel capsule on React sale pages (tag, category and specials hubs).
    id: "hub-carousel",
    host: ".LibraryAssetExpandedDisplay, .LibraryAssetExpandedDisplay *",
    hideable: false,
    badge: "compact",
    slot: "overlay",
    anchor: capsuleImage,
  },
  GENERIC,
];

/** A host's placement and the element its badge attaches to. */
export interface Placed {
  readonly placement: Placement;
  readonly anchor: Element;
}

/** The first placement that fits the host, or undefined when none does. Reads only. */
export function placeHost(host: Element, placements: readonly Placement[]): Placed | undefined {
  for (const placement of placements) {
    if (host.matches(placement.host)) {
      const anchor = placement.anchor(host);
      if (anchor !== undefined) {
        return { placement, anchor };
      }
    }
  }
  return undefined;
}
