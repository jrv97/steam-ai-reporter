import dlcRows from "../fixtures/app-page/1808500-ai-only.html?raw";
import developer from "../fixtures/surfaces/developer/widgets.html?raw";
import discoveryQueue from "../fixtures/surfaces/discovery-queue/player.html?raw";
import home from "../fixtures/surfaces/home/capsules.html?raw";
import nextFest from "../fixtures/surfaces/next-fest/feed.html?raw";
import searchSuggestions from "../fixtures/surfaces/search-suggestions/popup.html?raw";
import search from "../fixtures/surfaces/search/rows.html?raw";
import tagHub from "../fixtures/surfaces/tag-hub/capsules.html?raw";
import wishlist from "../fixtures/surfaces/wishlist/rows.html?raw";

/** The captured store surfaces (tests/fixtures/README.md), plus the app page with DLC rows. */
export const SURFACES = {
  "search": search,
  "home": home,
  "tag-hub": tagHub,
  "next-fest": nextFest,
  "developer": developer,
  "wishlist": wishlist,
  "search-suggestions": searchSuggestions,
  "dlc-rows": dlcRows,
  "discovery-queue": discoveryQueue,
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

/** A search row like the captured ones, for app `id`. */
export function searchRow(id: number): HTMLElement {
  const row = document.createElement("a");
  row.className = "search_result_row";
  row.href = `https://store.steampowered.com/app/${String(id)}/Game/`;
  row.dataset["dsAppid"] = String(id);
  row.append(
    ...nodes(
      `<div class="search_capsule"><img></div><div class="search_name">`
        + `<span class="title"></span></div><div class="search_platforms"></div>`,
    ),
  );
  return row;
}

/**
 * A discovery queue player slide like the captured current one, for app `id`. Its label IDs get a
 * prefix of their own, as React gives each mounted slide new ones.
 */
export function queueSlide(id: number): Element {
  const page = new DOMParser().parseFromString(discoveryQueue, "text/html");
  const [, current] = page.querySelectorAll("[role='dialog'] [aria-labelledby]");
  if (current === undefined) {
    throw new TypeError(String(id));
  }
  for (const link of current.querySelectorAll("a[href*='/app/']")) {
    link.setAttribute("href", `https://store.steampowered.com/app/${String(id)}/Game/`);
  }
  const prefix = `q${String(id)}-`;
  for (const labelled of current.querySelectorAll("[id]")) {
    labelled.id = prefix + labelled.id;
  }
  const labels = current.getAttribute("aria-labelledby")?.split(" ") ?? [];
  current.setAttribute("aria-labelledby", labels.map((label) => prefix + label).join(" "));
  return document.importNode(current, true);
}

/**
 * A page transition, from or into the bfcache unless `persisted` is false; happy-dom's
 * `PageTransitionEvent` is a plain `Event`.
 */
export function pageTransition(type: "pagehide" | "pageshow", persisted = true): Event {
  return Object.assign(new Event(type), { persisted });
}

/** The element `selector` matches, failing the test when there is none. */
export function the(selector: string, root: ParentNode = document): Element {
  const element = root.querySelector(selector);
  if (element === null) {
    throw new TypeError(selector);
  }
  return element;
}
