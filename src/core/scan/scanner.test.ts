// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countDomWork, type DomWork } from "../../../tests/helpers/dom-work";
import { make } from "../../../tests/helpers/factory";
import { fake } from "../../../tests/helpers/fakes";
import { hostView } from "../../../tests/helpers/host-view";
import { loadPage, nodes, pageTransition, setBody, the } from "../../../tests/helpers/surfaces";
import type { KindId } from "../kinds/id";
import type { AppId } from "../types";
import { createHostKindsRenderer } from "../ui/list-filter";
import { HOST_APPID, HOST_HIDEABLE, HOST_KINDS } from "./marks";
import type { CapsuleHost } from "./renderer";
import { createScanner, DEBOUNCE_MS, type Scanner, type ScanReport } from "./scanner";

const SEARCH_URL = "https://store.steampowered.com/search/?term=roguelike";
/** One animation frame under fake timers. */
const FRAME_MS = 16;
const SURFACE_APPS = make.fixture.surfaceApps;

let renderer: ReturnType<typeof fake.renderer>;
let reports: ScanReport[];
let scanner: Scanner;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  history.replaceState(null, "", SEARCH_URL);
});

afterEach(() => {
  scanner.stop();
  vi.useRealTimers();
});

/** Starts a scanner on the current page and lets its first page scan run. */
async function startScanner(options: { readonly badges?: boolean; } = {}): Promise<void> {
  renderer = fake.renderer(options);
  reports = [];
  scanner = createScanner({ document, renderer, onReport: (report) => reports.push(report) });
  scanner.start();
  await vi.advanceTimersByTimeAsync(FRAME_MS);
}

/** Opens `markup` at `path` and starts a scanner on it. */
async function startOn(path: string, markup: string): Promise<void> {
  history.replaceState(null, "", path);
  setBody(markup);
  await startScanner();
}

/** Lets a debounced scan run after the last mutation. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + FRAME_MS);
}

function found(): readonly CapsuleHost[] {
  return renderer.batches.flatMap((batch) => batch.found);
}

/** Each found host as `[appId, placement id]`, in order. */
function mapping(): (readonly [number, string])[] {
  return found().map((host) => [host.appId, host.placement.id] as const);
}

/** The mapping that `ids` give when each host takes `placement`. */
function placed(ids: readonly AppId[], placement: string): (readonly [number, string])[] {
  return ids.map((id) => [id, placement] as const);
}

function hostElements(): readonly Element[] {
  return found().map((host) => host.element);
}

/** Marks the found hosts as disclosing `kind` and returns what its list filter on dim dims. */
function dimmed(kind: KindId): readonly Element[] {
  const kindsRenderer = createHostKindsRenderer();
  for (const host of found()) {
    kindsRenderer.render(hostView(host.element, { verdicts: make.verdicts.only([kind]) }));
  }
  document.documentElement.setAttribute(`data-sar-filter-${kind}`, "dim");
  return [
    ...document.querySelectorAll(`[data-sar-filter-${kind}="dim"] [data-sar-kinds~="${kind}"]`),
  ];
}

/** The slides of the discovery queue player, in order. */
function queueSlides(): readonly Element[] {
  return [...document.querySelectorAll("[role='dialog'] [aria-labelledby]")];
}

/** A queue slide's title block: the first element its label IDs name. */
function queueTitle(slide: Element | undefined): Element | null {
  const [id] = slide?.getAttribute("aria-labelledby")?.split(" ") ?? [];
  return id === undefined ? null : document.getElementById(id);
}

/** A link to the app page of `id` around `inner`. */
function appLink(id: AppId, inner = "<img>"): string {
  return `<a href="/app/${String(id)}/">${inner}</a>`;
}

describe("per-surface hosts", () => {
  it("search: each result row, badge right after the title", async () => {
    loadPage(make.page.surface("search"));
    await startScanner();
    const rows = [...document.querySelectorAll("a.search_result_row")];
    expect(rows).toHaveLength(make.fixture.searchRows.length);
    expect(hostElements()).toStrictEqual(rows);
    expect(mapping()).toStrictEqual(placed(make.fixture.searchRows, "search-row"));
    for (const host of found()) {
      expect(host.anchor).toBe(the(".search_name .title", host.element));
    }
  });

  it("home: main carousel with a CSS background, discount capsules and tab rows", async () => {
    loadPage(make.page.surface("home"));
    await startScanner();
    expect(mapping()).toStrictEqual([
      ...placed(SURFACE_APPS.home.slice(0, 2), "home-main-carousel"),
      ...placed(SURFACE_APPS.home.slice(2), "generic"),
    ]);
    expect(hostElements()).toStrictEqual([
      ...document.querySelectorAll("a.store_main_capsule"),
      ...document.querySelectorAll("a.sale_capsule"),
      ...document.querySelectorAll("a.tab_row_item[data-ds-appid]:not([data-ds-packageid])"),
    ]);
    const [main] = found();
    expect(main?.anchor).toBe(the(".main_capsule", main?.element));
  });

  it("home: the package row with a comma list gets no host", async () => {
    loadPage(make.page.surface("home"));
    await startScanner();
    expect(the("[data-ds-packageid]").hasAttribute(HOST_APPID)).toBe(false);
  });

  it("tag hub: one host per capsule and no section-sized host", async () => {
    loadPage(make.page.surface("tag-hub"));
    await startScanner();
    const panels = [...document.querySelectorAll(".SaleSectionContainer ._1omVjlZWALGX34pum8v7SF")];
    expect(hostElements()).toStrictEqual([...panels, the(".LibraryAssetExpandedDisplay")]);
    expect(mapping()).toStrictEqual([
      ...placed(SURFACE_APPS.tagHub, "generic"),
      [make.fixture.app.hubCarousel, "hub-carousel"],
    ]);
    for (const host of hostElements()) {
      expect(host.querySelector(".SaleSectionContainer")).toBeNull();
      expect(host.matches(".SaleSectionContainer, section")).toBe(false);
    }
    expect(found().at(-1)?.anchor).toBe(the(".HeroCapsuleImageContainer"));
  });

  it("next fest: one host per feed card, badge over its hero capsule, never hidden", async () => {
    loadPage(make.page.surface("next-fest"));
    await startScanner();
    const cards = [...document.querySelectorAll(".LibraryAssetExpandedDisplay")];
    const perCard = cards.map((card) => found().filter((host) => card.contains(host.element)));
    expect(perCard.map((hosts) => hosts.length)).toStrictEqual(cards.map(() => 1));
    expect(mapping()).toStrictEqual(placed(SURFACE_APPS.nextFest, "hub-carousel"));
    for (const host of found()) {
      expect(host.anchor).toBe(the(".HeroCapsuleImageContainer", host.element));
      expect(host.element.getAttribute(HOST_HIDEABLE)).toBe("false");
    }
  });

  it("developer: each sale widget", async () => {
    loadPage(make.page.surface("developer"));
    await startScanner();
    expect(hostElements()).toStrictEqual([
      ...document.querySelectorAll(".StoreSaleWidgetOuterContainer"),
    ]);
    expect(mapping()).toStrictEqual(placed(SURFACE_APPS.developer, "generic"));
  });

  it("wishlist: each virtualized row, badge after the title, never hidden", async () => {
    loadPage(make.page.surface("wishlist"));
    await startScanner();
    const rows = [...document.querySelectorAll("[data-index]")];
    expect(hostElements()).toStrictEqual(rows);
    expect(mapping()).toStrictEqual(placed(SURFACE_APPS.wishlist, "wishlist-row"));
    for (const host of found()) {
      expect(host.anchor.localName).toBe("a");
      expect(host.anchor.querySelector("img")).toBeNull();
      expect(host.element.getAttribute(HOST_HIDEABLE)).toBe("false");
    }
  });

  it("wishlist: a row mounted before its title text keeps the wishlist placement", async () => {
    loadPage(make.page.surface("wishlist"));
    const row = the("[data-index]");
    const links = [...row.querySelectorAll("a[href*='/app/']")];
    for (const link of links.filter((candidate) => candidate.querySelector("img") !== null)) {
      link.remove();
    }
    for (const link of row.querySelectorAll("a[href*='/app/']")) {
      link.replaceChildren();
    }
    const title = the("a[href*='/app/']", row);
    await startScanner();
    expect(found()[0]?.placement.id).toBe("wishlist-row");
    expect(found()[0]?.anchor).toBe(title);
    expect(row.getAttribute(HOST_HIDEABLE)).toBe("false");
  });

  it("suggestions under the header search get hosts; its navigation links do not", async () => {
    const popup = new DOMParser().parseFromString(
      make.page.surface("search-suggestions"),
      "text/html",
    );
    setBody(
      `<div data-featuretarget="store-menu-v7"><nav>`
        + `<a href="https://store.steampowered.com/app/${String(make.appId())}/">`
        + `${make.text.name()}</a>`
        + `<a href="https://store.steampowered.com/explore/">${make.text.name()}</a></nav>`
        + `<div class="popup"></div></div>`,
    );
    the(".popup").replaceChildren(...popup.body.childNodes);
    await startScanner();
    expect(hostElements()).toStrictEqual([
      ...document.querySelectorAll("[id^='searchSuggestions'] a[href*='/app/']"),
    ]);
    expect(mapping()).toStrictEqual(placed(make.fixture.suggestions, "search-suggestion"));
    // The title block of the first suggestion.
    expect(found()[0]?.anchor).toBe(the("._2c8KHMFOeIi4TVcVN6qeIi"));
    expect(the("nav a").hasAttribute(HOST_APPID)).toBe(false);
  });

  it("discovery queue preview: badge on the first queued capsule, never hidden", async () => {
    const id = make.appId();
    await startOn(
      "/explore/",
      `<div class="page_content_ctn discovery_queue_content_ctn"><div class="page_content">`
        + `<h2>${make.text.name()}</h2><div class="discovery_queue_static">`
        + `<a class="discovery_queue_overlay" href="/app/${String(id)}/x/?queue=1">`
        + `<div class="discovery_queue_overlay_message">${make.text.note()}</div></a>`
        + `<div class="discovery_queue"><div class="dq_item dq_static_pos_2"><img></div>`
        + `<div class="dq_item dq_static_pos_3"><img></div></div></div></div></div>`,
    );
    expect(hostElements()).toStrictEqual([the(".discovery_queue_content_ctn")]);
    expect(mapping()).toStrictEqual([[id, "queue-preview"]]);
    expect(found()[0]?.anchor).toBe(the(".dq_static_pos_2"));
    expect(the(".discovery_queue_content_ctn").getAttribute(HOST_HIDEABLE)).toBe("false");
  });

  it("queue player: each slide's slot, badge ends its title block, never hidden", async () => {
    loadPage(make.page.surface("discovery-queue"));
    await startScanner();
    const slides = queueSlides();
    const player = found().filter((host) => host.placement.id === "queue-player");
    expect(player.map((host) => [host.element, host.appId, host.anchor])).toStrictEqual(
      SURFACE_APPS.queue.map((id, index) => [
        slides[index]?.parentElement,
        id,
        queueTitle(slides[index]),
      ]),
    );
    expect(player.map((host) => host.element.getAttribute(HOST_HIDEABLE))).toStrictEqual(
      SURFACE_APPS.queue.map(() => "false"),
    );
  });

  it("app page: DLC rows get hosts, badge at the end of the name; own links do not", async () => {
    const base = make.fixture.app.arcRaiders;
    loadPage(make.page.surface("dlc-rows"));
    history.replaceState(null, "", `/app/${String(base)}/ARC_Raiders/`);
    const own = document.createElement("a");
    own.href = `/app/${String(base)}/`;
    own.append(document.createElement("img"));
    document.body.append(own);
    await startScanner();
    expect(hostElements()).toStrictEqual([...document.querySelectorAll("a.game_area_dlc_row")]);
    expect(mapping()).toStrictEqual(placed(SURFACE_APPS.dlcRows, "dlc-row"));
    for (const host of found()) {
      expect(host.anchor).toBe(the(".game_area_dlc_name", host.element));
      expect(host.placement).toMatchObject({ badge: "full", slot: "end" });
    }
    expect(own.hasAttribute(HOST_APPID)).toBe(false);
  });
});

describe("host rule", () => {
  it("drops text links and links with no image within 8 levels", async () => {
    const deep = "<div>".repeat(9);
    const close = "</div>".repeat(9);
    setBody(
      `<p>${appLink(make.appId(), make.text.name())}</p>`
        + `<section><img>${deep}${appLink(make.appId(), make.text.name())}${close}</section>`,
    );
    await startScanner();
    expect(found()).toHaveLength(0);
  });

  it("skips the footers, breadcrumbs and our own nodes", async () => {
    setBody(
      `<div id="footer">${appLink(make.appId())}</div>`
        + `<div data-featuretarget="footer">${appLink(make.appId())}</div>`
        + `<div class="breadcrumbs">${appLink(make.appId())}</div>`
        + `<div class="sar-banner-host">${appLink(make.appId())}</div>`,
    );
    await startScanner();
    expect(found()).toHaveLength(0);
    expect(reports[0]?.candidates).toBe(0);
  });

  it("stops climbing at an ancestor that names another app", async () => {
    setBody(
      `<main><div class="a">${appLink(make.appId())}</div>`
        + `<div class="b">${appLink(make.appId())}</div></main>`,
    );
    await startScanner();
    expect(hostElements()).toStrictEqual([the("div.a"), the("div.b")]);
  });

  it("joins an image link and a sibling title block, at most 3 levels up", async () => {
    const id = make.appId();
    setBody(
      `<main><div class="other">${appLink(make.appId())}</div>`
        + `<div class="l3"><div class="l2"><div class="l1">${appLink(id)}</div>`
        + `${appLink(id, make.text.name())}</div></div></div></main>`,
    );
    await startScanner();
    expect(hostElements()).toStrictEqual([the("div.other"), the("div.l3")]);
  });

  it("does not join a tile that links to a package or an event", async () => {
    const id = make.appId();
    setBody(
      `<main><div class="other">${appLink(make.appId())}</div>`
        + `<div class="column"><div class="package"><a href="/sub/${String(make.appId())}/">`
        + `<img></a></div>`
        + `<div class="tile">${appLink(id, `<div class="box"><img></div>`)}</div>`
        + `<div class="event"><a href="/news/app/${String(id)}/view/${String(make.appId())}">`
        + `<img></a></div></div></main>`,
    );
    await startScanner();
    expect(mapping().filter(([host]) => host === id)).toStrictEqual([[id, "generic"]]);
    const host = found().find((candidate) => candidate.appId === id);
    expect(host?.element).toBe(the(".tile"));
    expect(host?.anchor).toBe(the(".tile .box"));
  });

  it.each([
    ["joins a card around other apps' small capsules in a store dialog", " role='dialog'", ".card"],
    ["stops below them anywhere else", "", ".cover"],
  ])("%s", async (_name, role, host) => {
    const id = make.appId();
    setBody(
      `<section${role}><div class="other">${appLink(make.appId())}</div>`
        + `<div class="card"><div class="cover">${appLink(id)}</div>`
        + appLink(id, make.text.name())
        + `<div data-key="hover div">${appLink(make.appId())}</div></div></section>`,
    );
    await startScanner();
    expect(found().find((candidate) => candidate.appId === id)?.element).toBe(the(host));
  });

  it("keeps one host when hosts of the same app nest", async () => {
    const id = make.appId();
    setBody(
      `<main><div class="x">${appLink(make.appId())}</div>`
        + `<div class="row"><div class="mid"><div class="in">${appLink(id)}</div>`
        + `<div><img></div>${appLink(id, make.text.name())}</div></div></main>`,
    );
    await startScanner();
    expect(mapping().filter(([host]) => host === id)).toHaveLength(1);
  });

  it("finds a React capsule whose image arrives inside its link after the scan", async () => {
    loadPage(make.page.surface("tag-hub"));
    const panel = the(".SaleSectionContainer ._1omVjlZWALGX34pum8v7SF");
    const image = the(".CapsuleImageCtn img", panel);
    image.remove();
    setBody("<main></main>");
    await startScanner();
    the("main").append(panel);
    await settle();
    expect(hostElements()).toStrictEqual([panel]);
    expect(found()[0]?.anchor).toBe(the(".CapsuleImageCtn", panel));
    the(".CapsuleImageCtn", panel).append(image);
    await settle();
    expect(found()).toHaveLength(1);
  });
});

describe("package page", () => {
  const ROW = ".tab_item[data-ds-appid]";
  const OUTSIDE = [
    "div.leftcol",
    "div.page_content",
    "#package_header_container",
    "img.package_header",
  ];

  it.each([["one included game", 1], ["two included games", 2]])(
    "%s: each row is a host, its capsule image the anchor, nothing around them",
    async (_name, count) => {
      const ids = make.appIds(count);
      await startOn(make.page.packagePath, make.page.package(ids));
      const rows = [...document.querySelectorAll(ROW)];
      expect(hostElements()).toStrictEqual(rows);
      expect(mapping()).toStrictEqual(placed(ids, "generic"));
      expect(rows.map((row) => row.getAttribute(HOST_APPID))).toStrictEqual(ids.map(String));
      for (const host of found()) {
        expect(host.anchor).toBe(the(".tab_item_cap", host.element));
        expect(host.anchor.contains(the("img.tab_item_cap_img", host.element))).toBe(true);
      }
      for (const selector of OUTSIDE) {
        expect(the(selector).hasAttribute(HOST_APPID)).toBe(false);
        expect(the(selector).hasAttribute(HOST_KINDS)).toBe(false);
      }
    },
  );

  it("with the DRM filter on dim, only the included game's row dims", async () => {
    await startOn(make.page.packagePath, make.page.package([make.appId()]));
    expect(dimmed("drm")).toStrictEqual([the(ROW)]);
    for (const selector of OUTSIDE) {
      expect(the(selector).hasAttribute(HOST_KINDS)).toBe(false);
    }
  });
});

describe("DLC page", () => {
  const HEADER = "#gameHeaderImageCtn";
  /** The glance box, which holds the base game's logo link: the largest host the page allows. */
  const GLANCE = ".glance_details";
  /** Page areas no host may be. */
  const AREAS = [
    "div.rightcol",
    "div.leftcol",
    "div.page_content",
    "#game_area_purchase",
    "#game_area_description",
  ].join(", ");

  /** Whether `element` is a page area or holds the header capsule or the glance box. */
  function tooLarge(element: Element): boolean {
    const glance = the(GLANCE);
    return element.matches(AREAS) || element.contains(the(HEADER))
      || (element !== glance && element.contains(glance));
  }

  it.each(
    [
      { links: ["glance"], hosts: [GLANCE] },
      { links: ["bubble"], hosts: [] },
      { links: ["glance", "bubble"], hosts: [GLANCE] },
      { links: ["description"], hosts: [] },
    ] as const,
  )("a base game link in $links: hosts $hosts", async ({ links, hosts }) => {
    await startOn(make.page.dlcPath, make.page.dlc(links));
    expect(hostElements()).toStrictEqual(hosts.map((selector) => the(selector)));
    expect(hostElements().filter(tooLarge)).toStrictEqual([]);
    expect(found().every((host) => host.appId === make.fixture.dlcBase)).toBe(true);
  });

  it("with the AI filter on dim, nothing that holds the header capsule dims", async () => {
    await startOn(make.page.dlcPath, make.page.dlc(["glance", "bubble", "description"]));
    const faded = dimmed("ai");
    expect(faded.filter(tooLarge)).toStrictEqual([]);
    expect(faded).toStrictEqual([the(GLANCE)]);
  });
});

describe("marking", () => {
  it("marks hosts once with the app ID and no kinds yet", async () => {
    loadPage(make.page.surface("search"));
    await startScanner();
    const row = the("a.search_result_row");
    expect(row.getAttribute(HOST_APPID)).toBe(String(make.fixture.searchRows[0]));
    expect(row.hasAttribute(HOST_KINDS)).toBe(false);
    expect(row.hasAttribute(HOST_HIDEABLE)).toBe(false);
  });

  it("finds nothing new on a rescan", async () => {
    loadPage(make.page.surface("tag-hub"));
    await startScanner();
    expect(found()).toHaveLength(4);
    scanner.stop();
    scanner.start();
    await vi.advanceTimersByTimeAsync(FRAME_MS);
    expect(renderer.batches).toHaveLength(1);
    expect(reports.at(-1)).toMatchObject({ kind: "page", found: 0, changed: 0 });
  });
});

describe("observing", () => {
  it("scans 50 appended search rows once, touching only the new rows", async () => {
    loadPage(make.page.surface("search"));
    await startScanner();
    const container = the("#search_resultsRows");
    const added: HTMLElement[] = [];
    for (let burst = 0; burst < 5; burst++) {
      for (const id of make.appIds(10)) {
        const row = make.page.searchRow(id);
        added.push(row);
        container.append(row);
      }
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 4);
    }
    expect(renderer.batches).toHaveLength(1);
    await settle();
    expect(renderer.batches).toHaveLength(2);
    expect(renderer.batches[1]?.found.map((host) => host.element)).toStrictEqual(added);
    expect(renderer.batches[1]?.changed).toStrictEqual([]);
    expect(reports[1]).toStrictEqual({
      kind: "added",
      roots: added.length,
      candidates: added.length,
      found: added.length,
      changed: 0,
    });
  });

  it("scans within the maximum wait while the page keeps changing", async () => {
    setBody("<main></main>");
    await startScanner();
    const main = the("main");
    const ids = make.appIds(12);
    for (const id of ids) {
      main.append(make.page.searchRow(id));
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    }
    expect(reports.filter((report) => report.kind === "added").length).toBeGreaterThanOrEqual(1);
    await settle();
    expect(found()).toHaveLength(ids.length);
  });

  it("ignores mutations made only of our own nodes", async () => {
    loadPage(make.page.surface("search"));
    await startScanner();
    const badge = document.createElement("span");
    badge.className = "sar-badge";
    the("a.search_result_row").append(badge);
    await settle();
    expect(reports).toHaveLength(1);
  });

  it("restores a badge when a re-render replaces the host's subtree", async () => {
    loadPage(make.page.surface("tag-hub"));
    await startScanner({ badges: true });
    const host = the(".capsule_index_0");
    expect(host.querySelectorAll(".sar-badge")).toHaveLength(1);
    const fresh = new DOMParser().parseFromString(make.page.surface("tag-hub"), "text/html");
    const rendered = the(".capsule_index_0", fresh);
    host.replaceChildren(...rendered.childNodes);
    expect(host.querySelectorAll(".sar-badge")).toHaveLength(0);
    await settle();
    expect(renderer.batches.at(-1)?.found).toStrictEqual([]);
    expect(renderer.batches.at(-1)?.changed.map((changed) => changed.element)).toStrictEqual([
      host,
    ]);
    expect(host.querySelectorAll(".sar-badge")).toHaveLength(1);
    expect(the(".sar-badge", host).parentElement).toBe(the(".CapsuleImageCtn", host));
  });

  it("resets a host reused for another app and finds the new app's host", async () => {
    const [before, after] = [make.appId(), make.appId()];
    setBody(
      `<main><div class="other">${appLink(make.appId())}</div>`
        + `<div class="slot"><div class="slide">${appLink(before)}`
        + `${appLink(before, make.text.name())}</div></div></main>`,
    );
    await startScanner({ badges: true });
    const slot = the(".slot");
    expect(slot.getAttribute(HOST_APPID)).toBe(String(before));
    the(".slide", slot).replaceWith(
      ...nodes(`<div class="slide">${appLink(after)}${appLink(after, make.text.name())}</div>`),
    );
    await settle();
    expect(renderer.batches.at(-1)?.changed).toStrictEqual([]);
    expect(renderer.batches.at(-1)?.found.map((host) => [host.element, host.appId])).toStrictEqual([
      [slot, after],
    ]);
    expect(slot.getAttribute(HOST_APPID)).toBe(String(after));
    expect(slot.querySelectorAll(`[${HOST_APPID}]`)).toHaveLength(0);
    expect(slot.querySelectorAll(".sar-badge")).toHaveLength(1);
  });

  it("keeps each queue player slot's badge on its own game when a new slide mounts", async () => {
    loadPage(make.page.surface("discovery-queue"));
    await startScanner({ badges: true });
    const next = make.appId();
    const track = the("[role='dialog'] [aria-labelledby]").parentElement?.parentElement;
    // Next: Steam drops the first slot, mounts the new game in the empty last slot, adds a slot.
    track?.firstElementChild?.remove();
    track?.lastElementChild?.append(make.page.queueSlide(next));
    track?.append(document.createElement("div"));
    await settle();
    const slides = queueSlides();
    expect(slides.map((slide) => slide.parentElement?.getAttribute(HOST_APPID))).toStrictEqual(
      [...SURFACE_APPS.queue, next].map(String),
    );
    expect(slides.map((slide) => queueTitle(slide)?.lastElementChild?.className)).toStrictEqual(
      slides.map(() => "sar-badge"),
    );
  });

  it("finds a capsule whose image arrives inside its link after the scan", async () => {
    const [other, late] = [make.appId(), make.appId()];
    setBody(`<main><div class="other">${appLink(other)}</div></main>`);
    await startScanner();
    the("main").append(
      ...nodes(`<div class="card">${appLink(late, `<div class="box"></div>`)}</div>`),
    );
    await settle();
    expect(mapping()).toStrictEqual([[other, "generic"]]);
    the(".box").append(document.createElement("img"));
    await settle();
    expect(mapping()).toStrictEqual([[other, "generic"], [late, "generic"]]);
    expect(renderer.batches.at(-1)?.found.map((host) => host.element)).toStrictEqual([
      the(".card"),
    ]);
  });

  it("keeps the badge in place when the store adds a hover popup inside the host", async () => {
    loadPage(make.page.surface("tag-hub"));
    await startScanner({ badges: true });
    const host = the(".capsule_index_0");
    const box = the(".CapsuleImageCtn", host);
    expect(box.querySelectorAll(".sar-badge")).toHaveLength(1);
    const popup = nodes(
      `<div class="popup" style="position: fixed">`
        + `${appLink(make.fixture.app.hubCarousel, `<div class="art"><img></div>`)}</div>`,
    );
    the(".ImpressionTrackedElement", host).prepend(...popup);
    await settle();
    expect(renderer.batches.at(-1)?.changed.map((changed) => changed.anchor)).toStrictEqual([box]);
    expect(box.querySelectorAll(".sar-badge")).toHaveLength(1);
    expect(the(".popup", host).querySelectorAll(".sar-badge")).toHaveLength(0);
    the(".popup", host).remove();
    await settle();
    expect(box.querySelectorAll(".sar-badge")).toHaveLength(1);
  });

  it("gives a carousel clone its own host and removes the copied badge", async () => {
    loadPage(make.page.surface("home"));
    await startScanner({ badges: true });
    const original = the("a.sale_capsule");
    const clone = original.cloneNode(true);
    if (!(clone instanceof Element)) {
      throw new TypeError();
    }
    expect(clone.querySelectorAll(".sar-badge")).toHaveLength(1);
    original.after(clone);
    await settle();
    expect(renderer.batches.at(-1)?.found.map((host) => host.element)).toStrictEqual([clone]);
    expect(original.querySelectorAll(".sar-badge")).toHaveLength(1);
    expect(clone.querySelectorAll(".sar-badge")).toHaveLength(1);
    // The first discount capsule.
    expect(clone.getAttribute(HOST_APPID)).toBe(String(SURFACE_APPS.home[2]));
  });

  it("cleans marks and badges left by a previous instance", async () => {
    loadPage(make.page.surface("search"));
    const row = the("a.search_result_row");
    row.setAttribute(HOST_APPID, String(make.fixture.searchRows[0]));
    row.setAttribute(HOST_KINDS, "ai");
    row.append(...nodes(`<span class="sar-badge"></span><span class="sar-badge"></span>`));
    await startScanner({ badges: true });
    expect(hostElements()).toContain(row);
    expect(row.hasAttribute(HOST_KINDS)).toBe(false);
    expect(row.querySelectorAll(".sar-badge")).toHaveLength(1);
  });

  it("disconnects on pagehide and rescans the page on a bfcache pageshow", async () => {
    loadPage(make.page.surface("search"));
    await startScanner();
    globalThis.dispatchEvent(pageTransition("pagehide"));
    const row = make.page.searchRow(make.appId());
    the("#search_resultsRows").append(row);
    await settle();
    expect(reports).toHaveLength(1);
    globalThis.dispatchEvent(pageTransition("pageshow"));
    await vi.advanceTimersByTimeAsync(FRAME_MS);
    expect(reports.at(-1)).toMatchObject({ kind: "page", found: 1 });
    expect(found().at(-1)?.element).toBe(row);
  });
});

describe("work budget", () => {
  // Scan cost as counted DOM calls, which do not depend on the machine running the tests. Each
  // limit is per scanned capsule, a little above what the scanner does today, so a change that
  // makes the scan superlinear or re-reads old content fails here. The real time budget (under
  // 4 ms per mutation batch) is the manual sale-page profile in the checklist.

  const LIMITED = [
    "querySelectorAll",
    "queried",
    "querySelector",
    "closest",
    "matches",
    "parentSteps",
  ] as const;
  type Limits = Readonly<Record<(typeof LIMITED)[number], number>>;

  /** Per capsule on a page scan; measured 7, 6, 0, 3, 10 and 46. */
  const PAGE_LIMITS: Limits = {
    querySelectorAll: 8,
    queried: 8,
    querySelector: 1,
    closest: 4,
    matches: 12,
    parentSteps: 60,
  };

  /**
   * Per appended row; measured 4, 0, 1, 2, 5 and 20. `queried` stays under one per new row, so
   * the scan never lists the rows that were already there.
   */
  const ADDED_LIMITS: Limits = {
    querySelectorAll: 5,
    queried: 1,
    querySelector: 1,
    closest: 3,
    matches: 6,
    parentSteps: 30,
  };

  function expectWithin(work: DomWork, limits: Limits, count: number): void {
    for (const name of LIMITED) {
      expect.soft(work[name], name).toBeLessThanOrEqual(limits[name] * count);
    }
  }

  /** A React sale grid of tag hub capsules, one for each app in `ids`. */
  function capsuleGrid(ids: readonly AppId[]): string {
    const page = new DOMParser().parseFromString(make.page.surface("tag-hub"), "text/html");
    // The wrapper of the first capsule.
    const capsule = the("._3r4Ny9tQdQZc50XDM5B2q2", page);
    const copies = ids.map((id) => {
      for (const link of capsule.querySelectorAll("a")) {
        link.setAttribute("href", `https://store.steampowered.com/app/${String(id)}/X`);
      }
      return capsule.outerHTML;
    });
    return `<div class="SaleSectionContainer">${copies.join("")}</div>`;
  }

  it("scans a 200-capsule page with bounded DOM work, in one frame", async () => {
    const ids = make.appIds(200);
    setBody(capsuleGrid(ids));
    const work = countDomWork();
    await startScanner();
    expect(found()).toHaveLength(ids.length);
    expect(renderer.batches).toHaveLength(1);
    expect(reports).toHaveLength(1);
    const done = work();
    expectWithin(done, PAGE_LIMITS, ids.length);
    expect(done.setAttribute).toBe(ids.length);
    expect(done.removeAttribute).toBe(0);
  });

  it("scans 50 appended search rows with bounded DOM work", async () => {
    loadPage(make.page.surface("search"));
    await startScanner();
    const container = the("#search_resultsRows");
    const rows = make.appIds(50).map((id) => make.page.searchRow(id));
    const work = countDomWork();
    for (const row of rows) {
      container.append(row);
    }
    await settle();
    expect(found()).toHaveLength(make.fixture.searchRows.length + rows.length);
    expect(renderer.batches).toHaveLength(2);
    expect(reports).toHaveLength(2);
    const done = work();
    expectWithin(done, ADDED_LIMITS, rows.length);
    expect(done.setAttribute).toBe(rows.length);
    expect(done.removeAttribute).toBe(0);
  });
});
