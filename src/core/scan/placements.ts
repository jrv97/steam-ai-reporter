import { OVERLAY_CHIPS } from "../kinds/order";
import { LINK_CANDIDATE } from "./candidates";
import { firstImage, imageBox } from "./image";

// Where a host's badge goes, per store surface (rq6, S5; docs/design/components.mdx, sections 1,
// 2 and 5). A new surface is a new entry here, never a scanner edit (rule 11).

/** Chips a row with room for words shows beside its title. */
const ROW_CHIPS = 3;
/** Chips a search suggestion shows: its row is the smallest. */
const SUGGESTION_CHIPS = 2;

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
  /**
   * How many kind chips the surface shows before one "+N" chip stands for the rest. A constant to
   * tune by the room the surface leaves.
   */
  readonly maxChips: number;
  /** Reads only: it runs in the scan's read phase. */
  readonly anchor: AnchorRule;
}

/** A compact badge overlaid on the capsule image; the anchor is the image's box. */
export interface OverlayPlacement extends PlacementBase {
  readonly badge: "compact";
  readonly slot: "overlay";
}

/**
 * A full badge in a row with room for words. `after` makes it the anchor's next sibling. `end`
 * makes it the anchor's last child, after its text.
 */
export interface RowPlacement extends PlacementBase {
  readonly badge: "full";
  readonly slot: "after" | "end";
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
  maxChips: OVERLAY_CHIPS,
  badge: "compact",
  slot: "overlay",
  anchor: capsuleImage,
};

/** Every placement, most specific first; the first whose host and anchor match wins. */
export const PLACEMENTS: readonly Placement[] = [
  {
    // Classic search rows: right after the title. The title line clips its overflow, so CSS
    // turns it into a flex row where the title shrinks and the badge stays whole.
    id: "search-row",
    host: "a.search_result_row",
    hideable: true,
    maxChips: ROW_CHIPS,
    badge: "full",
    slot: "after",
    anchor: inside(".search_name .title"),
  },
  {
    // The virtualized React wishlist mounts and unmounts rows, so hiding would make it jump.
    id: "wishlist-row",
    host: "[data-index]",
    hideable: false,
    maxChips: ROW_CHIPS,
    badge: "full",
    slot: "after",
    anchor: wishlistTitle,
  },
  {
    // Search suggestions inside the header root: images too small for a compact badge.
    id: "search-suggestion",
    host: "[id^='searchSuggestions'] *",
    hideable: true,
    maxChips: SUGGESTION_CHIPS,
    badge: "full",
    slot: "after",
    anchor: firstTextLeaf,
  },
  {
    // DLC rows on an app page; most have no image. The row spreads its children apart. The
    // badge goes inside the name, so it follows the text.
    id: "dlc-row",
    host: "a.game_area_dlc_row",
    hideable: true,
    maxChips: ROW_CHIPS,
    badge: "full",
    slot: "end",
    anchor: inside(".game_area_dlc_name"),
  },
  {
    // The home page's main carousel: the image is a CSS background on a child.
    id: "home-main-carousel",
    host: "a.store_main_capsule",
    hideable: false,
    maxChips: OVERLAY_CHIPS,
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
    maxChips: OVERLAY_CHIPS,
    badge: "compact",
    slot: "overlay",
    anchor: inside(".dq_item"),
  },
  {
    // The large carousel capsule on React sale pages (tag, category and specials hubs).
    id: "hub-carousel",
    host: ".LibraryAssetExpandedDisplay, .LibraryAssetExpandedDisplay *",
    hideable: false,
    maxChips: OVERLAY_CHIPS,
    badge: "compact",
    slot: "overlay",
    anchor: capsuleImage,
  },
  GENERIC,
];

/**
 * A list surface where a block of ours counts the hosts the renderers drew: the hidden results
 * notice (`LIST_PLACEMENTS`, `ui/hidden-notice.ts`) or the package summary (`SUMMARY_PLACEMENTS`,
 * `ui/package-summary.ts`). A new surface is a new entry in one of them.
 */
export interface ListPlacement {
  /** A stable name for tests and debug logs. */
  readonly id: string;
  /** The element that holds the list's hosts; the block goes right before it. */
  readonly list: string;
  /** A store element above the list; when the page has it, the block goes right after it. */
  readonly after?: string;
}

/** Every list surface with a notice, most specific first; the first in the page wins. */
export const LIST_PLACEMENTS: readonly ListPlacement[] = [
  // Classic search results: under the store's sort bar and its notice bar, above the first row.
  {
    id: "search-results",
    list: "#search_resultsRows",
    after: "#search_results_filtered_warning_persistent",
  },
];

/** Every list surface with a summary of its games' tags; the first in the page wins. */
export const SUMMARY_PLACEMENTS: readonly ListPlacement[] = [
  // A package page (`/sub/<id>/`): under the package header, above the included games.
  {
    id: "package-items",
    list: ".package_landing_page_item_list",
    after: "#package_header_container",
  },
];

/** A list surface in the page, and the store element above it that our block follows, if any. */
export interface FoundList {
  readonly list: Element;
  readonly after: Element | null;
}

/** The first of `placements` whose list is in the page, or undefined. Reads only. */
export function findList(
  doc: Document,
  placements: readonly ListPlacement[],
): FoundList | undefined {
  for (const placement of placements) {
    const list = doc.querySelector(placement.list);
    if (list !== null) {
      const after = placement.after === undefined ? null : doc.querySelector(placement.after);
      return { list, after };
    }
  }
  return undefined;
}

/** Puts `block` where its list surface wants it, and writes nothing when it is there already. */
export function placeAbove(found: FoundList, block: Element): void {
  const { list, after } = found;
  if (after === null) {
    if (list.previousElementSibling !== block) {
      list.before(block);
    }
  } else if (after.nextElementSibling !== block) {
    after.after(block);
  }
}

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
