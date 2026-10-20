import dlcRows from "../fixtures/app-page/1808500-ai-only.html?raw";
import developer from "../fixtures/surfaces/developer/widgets.html?raw";
import home from "../fixtures/surfaces/home/capsules.html?raw";
import searchSuggestions from "../fixtures/surfaces/search-suggestions/popup.html?raw";
import search from "../fixtures/surfaces/search/rows.html?raw";
import tagHub from "../fixtures/surfaces/tag-hub/capsules.html?raw";
import wishlist from "../fixtures/surfaces/wishlist/rows.html?raw";

/** The captured store surfaces (tests/fixtures/README.md), plus the app page with DLC rows. */
export const SURFACES = {
  "search": search,
  "home": home,
  "tag-hub": tagHub,
  "developer": developer,
  "wishlist": wishlist,
  "search-suggestions": searchSuggestions,
  "dlc-rows": dlcRows,
} as const;

/** Replaces the global document's head and body with those of `html`. */
export function loadPage(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.head.replaceChildren(...parsed.head.childNodes);
  document.body.replaceChildren(...parsed.body.childNodes);
}

/** The nodes `markup` parses to, as a body's children. */
export function nodes(markup: string): readonly Node[] {
  return [...new DOMParser().parseFromString(markup, "text/html").body.childNodes];
}

/** Replaces the global document's body with `markup`. */
export function setBody(markup: string): void {
  document.body.replaceChildren(...nodes(markup));
}

/** The element `selector` matches, failing the test when there is none. */
export function the(selector: string, root: ParentNode = document): Element {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new TypeError(selector);
  }
  return element;
}
