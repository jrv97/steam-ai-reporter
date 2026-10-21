// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countDomWork, type DomWork } from "../../../tests/helpers/dom-work";
import {
  type RecordingRenderer,
  recordingRenderer,
} from "../../../tests/helpers/recording-renderer";
import { loadPage, nodes, setBody, SURFACES, the } from "../../../tests/helpers/surfaces";
import { HOST_APPID, HOST_HIDEABLE, HOST_STATE } from "./marks";
import type { CapsuleHost } from "./renderer";
import { createScanner, DEBOUNCE_MS, type Scanner, type ScanReport } from "./scanner";

const SEARCH_URL = "https://store.steampowered.com/search/?term=roguelike";
/** One animation frame under fake timers. */
const FRAME_MS = 16;

let renderer: RecordingRenderer;
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
  renderer = recordingRenderer(options);
  reports = [];
  scanner = createScanner({ document, renderer, onReport: (report) => reports.push(report) });
  scanner.start();
  await vi.advanceTimersByTimeAsync(FRAME_MS);
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

function hostElements(): readonly Element[] {
  return found().map((host) => host.element);
}

describe("per-surface hosts", () => {
  it("search: each result row, badge right after the title", async () => {
    loadPage(SURFACES.search);
    await startScanner();
    const rows = [...document.querySelectorAll("a.search_result_row")];
    expect(rows).toHaveLength(8);
    expect(hostElements()).toStrictEqual(rows);
    expect(mapping()).toStrictEqual(
      [4075620, 3934270, 3784030, 1045010, 3432110, 3664320, 4461450, 2624160].map(
        (id) => [id, "search-row"] as const,
      ),
    );
    for (const host of found()) {
      expect(host.anchor).toBe(the(".search_name .title", host.element));
    }
  });

  it("home: main carousel with a CSS background, discount capsules and tab rows", async () => {
    loadPage(SURFACES.home);
    await startScanner();
    expect(mapping()).toStrictEqual([
      [4356430, "home-main-carousel"],
      [1867240, "home-main-carousel"],
      [466560, "generic"],
      [1121640, "generic"],
      [1091500, "generic"],
      [1174180, "generic"],
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
    loadPage(SURFACES.home);
    await startScanner();
    expect(the("[data-ds-packageid]").hasAttribute(HOST_APPID)).toBe(false);
  });

  it("tag hub: one host per capsule and no section-sized host", async () => {
    loadPage(SURFACES["tag-hub"]);
    await startScanner();
    const panels = [...document.querySelectorAll(".SaleSectionContainer ._1omVjlZWALGX34pum8v7SF")];
    expect(hostElements()).toStrictEqual([...panels, the(".LibraryAssetExpandedDisplay")]);
    expect(mapping()).toStrictEqual([
      [632360, "generic"],
      [3845070, "generic"],
      [2124120, "generic"],
      [632360, "hub-carousel"],
    ]);
    for (const host of hostElements()) {
      expect(host.querySelector(".SaleSectionContainer")).toBeNull();
      expect(host.matches(".SaleSectionContainer, section")).toBe(false);
    }
    expect(found()[3]?.anchor).toBe(the(".HeroCapsuleImageContainer"));
  });

  it("next fest: one host per feed card, badge over its hero capsule, never hidden", async () => {
    loadPage(SURFACES["next-fest"]);
    await startScanner();
    const cards = [...document.querySelectorAll(".LibraryAssetExpandedDisplay")];
    const perCard = cards.map((card) => found().filter((host) => card.contains(host.element)));
    expect(perCard.map((hosts) => hosts.length)).toStrictEqual([1, 1, 1]);
    expect(mapping()).toStrictEqual(
      [5053640, 4783070, 4631870].map((id) => [id, "hub-carousel"] as const),
    );
    for (const host of found()) {
      expect(host.anchor).toBe(the(".HeroCapsuleImageContainer", host.element));
      expect(host.element.getAttribute(HOST_HIDEABLE)).toBe("false");
    }
  });

  it("developer: each sale widget", async () => {
    loadPage(SURFACES.developer);
    await startScanner();
    expect(hostElements()).toStrictEqual([
      ...document.querySelectorAll(".StoreSaleWidgetOuterContainer"),
    ]);
    expect(mapping()).toStrictEqual([
      [1902490, "generic"],
      [546560, "generic"],
    ]);
  });

  it("wishlist: each virtualized row, badge after the title, never hidden", async () => {
    loadPage(SURFACES.wishlist);
    await startScanner();
    const rows = [...document.querySelectorAll("[data-index]")];
    expect(hostElements()).toStrictEqual(rows);
    expect(mapping()).toStrictEqual([
      [5072580, "wishlist-row"],
      [3664320, "wishlist-row"],
    ]);
    for (const host of found()) {
      expect(host.anchor.localName).toBe("a");
      expect(host.anchor.querySelector("img")).toBeNull();
      expect(host.element.getAttribute(HOST_HIDEABLE)).toBe("false");
    }
  });

  it("wishlist: a row mounted before its title text keeps the wishlist placement", async () => {
    loadPage(SURFACES.wishlist);
    const [row] = document.querySelectorAll("[data-index]");
    if (row === undefined) {
      throw new TypeError();
    }
    for (const link of row.querySelectorAll("a[href*='/app/']")) {
      if (link.querySelector("img") === null) {
        link.replaceChildren();
      } else {
        link.remove();
      }
    }
    const title = the("a[href*='/app/']", row);
    await startScanner();
    expect(found()[0]?.placement.id).toBe("wishlist-row");
    expect(found()[0]?.anchor).toBe(title);
    expect(row.getAttribute(HOST_HIDEABLE)).toBe("false");
  });

  it("search suggestions in the header root get hosts; its navigation links do not", async () => {
    const popup = new DOMParser().parseFromString(SURFACES["search-suggestions"], "text/html");
    setBody(
      `<div data-featuretarget="store-menu-v7"><nav>`
        + `<a href="https://store.steampowered.com/app/730/">Counter-Strike 2</a>`
        + `<a href="https://store.steampowered.com/explore/">Discovery queue</a></nav>`
        + `<div class="popup"></div></div>`,
    );
    the(".popup").replaceChildren(...popup.body.childNodes);
    await startScanner();
    expect(hostElements()).toStrictEqual([
      ...document.querySelectorAll("[id^='searchSuggestions'] a[href*='/app/']"),
    ]);
    expect(mapping()).toStrictEqual([
      [4075620, "search-suggestion"],
      [3934270, "search-suggestion"],
      [3784030, "search-suggestion"],
    ]);
    expect(found()[0]?.anchor.textContent).toBe("Combolands: Roguelike Citybuilder");
    expect(the("nav a").hasAttribute(HOST_APPID)).toBe(false);
  });

  it("discovery queue preview: badge on the first queued capsule, never hidden", async () => {
    history.replaceState(null, "", "/explore/");
    setBody(
      `<div class="page_content_ctn discovery_queue_content_ctn"><div class="page_content">`
        + `<h2>Your queue</h2><div class="discovery_queue_static">`
        + `<a class="discovery_queue_overlay" href="/app/2121510/x/?queue=1">`
        + `<div class="discovery_queue_overlay_message">Begin</div></a>`
        + `<div class="discovery_queue"><div class="dq_item dq_static_pos_2"><img></div>`
        + `<div class="dq_item dq_static_pos_3"><img></div></div></div></div></div>`,
    );
    await startScanner();
    expect(hostElements()).toStrictEqual([the(".discovery_queue_content_ctn")]);
    expect(mapping()).toStrictEqual([[2121510, "queue-preview"]]);
    expect(found()[0]?.anchor).toBe(the(".dq_static_pos_2"));
    expect(the(".discovery_queue_content_ctn").getAttribute(HOST_HIDEABLE)).toBe("false");
  });

  it("app page: DLC rows get hosts; links to the page's own app do not", async () => {
    loadPage(SURFACES["dlc-rows"]);
    history.replaceState(null, "", "/app/1808500/ARC_Raiders/");
    const own = document.createElement("a");
    own.href = "/app/1808500/";
    own.append(document.createElement("img"));
    document.body.append(own);
    await startScanner();
    expect(hostElements()).toStrictEqual([...document.querySelectorAll("a.game_area_dlc_row")]);
    expect(mapping()).toStrictEqual(
      [5201760, 3948510, 4920260, 4210150, 4424920, 4741040].map((id) => [id, "dlc-row"] as const),
    );
    expect(own.hasAttribute(HOST_APPID)).toBe(false);
  });
});

describe("host rule", () => {
  it("drops text links and links with no image within 8 levels", async () => {
    const deep = "<div>".repeat(9);
    const close = "</div>".repeat(9);
    setBody(
      `<p><a href="/app/10/">A game</a></p>`
        + `<section><img>${deep}<a href="/app/20/">Deep</a>${close}</section>`,
    );
    await startScanner();
    expect(found()).toHaveLength(0);
  });

  it("skips the footers, breadcrumbs and our own nodes", async () => {
    setBody(
      `<div id="footer"><a href="/app/10/"><img></a></div>`
        + `<div data-featuretarget="footer"><a href="/app/20/"><img></a></div>`
        + `<div class="breadcrumbs"><a href="/app/30/"><img></a></div>`
        + `<div class="sar-banner-host"><a href="/app/40/"><img></a></div>`,
    );
    await startScanner();
    expect(found()).toHaveLength(0);
    expect(reports[0]?.candidates).toBe(0);
  });

  it("stops climbing at an ancestor that names another app", async () => {
    setBody(
      `<main><div class="a"><a href="/app/10/"><img></a></div>`
        + `<div class="b"><a href="/app/20/"><img></a></div></main>`,
    );
    await startScanner();
    expect(hostElements()).toStrictEqual([the("div.a"), the("div.b")]);
  });

  it("joins an image link and a sibling title block, at most 3 levels up", async () => {
    setBody(
      `<main><div class="other"><a href="/app/99/"><img></a></div>`
        + `<div class="l3"><div class="l2"><div class="l1"><a href="/app/10/"><img></a></div>`
        + `<a href="/app/10/">Title</a></div></div></div></main>`,
    );
    await startScanner();
    expect(hostElements()).toStrictEqual([the("div.other"), the("div.l3")]);
  });

  it("does not join a tile that links to a package or an event", async () => {
    setBody(
      `<main><div class="other"><a href="/app/99/"><img></a></div>`
        + `<div class="column"><div class="package"><a href="/sub/7/"><img></a></div>`
        + `<div class="tile"><a href="/app/10/"><div class="box"><img></div></a></div>`
        + `<div class="event"><a href="/news/app/10/view/1"><img></a></div></div></main>`,
    );
    await startScanner();
    expect(mapping().filter(([id]) => id === 10)).toStrictEqual([[10, "generic"]]);
    const host = found().find((candidate) => candidate.appId === 10);
    expect(host?.element).toBe(the(".tile"));
    expect(host?.anchor).toBe(the(".tile .box"));
  });

  it("keeps one host when hosts of the same app nest", async () => {
    setBody(
      `<main><div class="x"><a href="/app/10/"><img></a></div>`
        + `<div class="row"><div class="mid"><div class="in"><a href="/app/20/"><img></a></div>`
        + `<div><img></div><a href="/app/20/">Title</a></div></div></main>`,
    );
    await startScanner();
    expect(mapping().filter(([id]) => id === 20)).toHaveLength(1);
  });

  it("finds a React capsule whose image arrives inside its link after the scan", async () => {
    loadPage(SURFACES["tag-hub"]);
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

describe("marking", () => {
  it("marks hosts once with the app ID and a pending state", async () => {
    loadPage(SURFACES.search);
    await startScanner();
    const row = the("a.search_result_row");
    expect(row.getAttribute(HOST_APPID)).toBe("4075620");
    expect(row.getAttribute(HOST_STATE)).toBe("pending");
    expect(row.hasAttribute(HOST_HIDEABLE)).toBe(false);
  });

  it("finds nothing new on a rescan", async () => {
    loadPage(SURFACES["tag-hub"]);
    await startScanner();
    expect(found()).toHaveLength(4);
    scanner.stop();
    scanner.start();
    await vi.advanceTimersByTimeAsync(FRAME_MS);
    expect(renderer.batches).toHaveLength(1);
    expect(reports.at(-1)).toMatchObject({ kind: "page", found: 0, changed: 0 });
  });
});

/** A search row like the captured ones, for app `id`. */
function searchRow(id: number): HTMLElement {
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

/** A bfcache page transition; happy-dom's `PageTransitionEvent` is a plain `Event`. */
function pageTransition(type: "pagehide" | "pageshow"): Event {
  return Object.assign(new Event(type), { persisted: true });
}

describe("observing", () => {
  it("scans 50 appended search rows once, touching only the new rows", async () => {
    loadPage(SURFACES.search);
    await startScanner();
    const container = the("#search_resultsRows");
    const added: HTMLElement[] = [];
    for (let burst = 0; burst < 5; burst++) {
      for (let n = 0; n < 10; n++) {
        const row = searchRow(1_000_000 + burst * 10 + n);
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
      roots: 50,
      candidates: 50,
      found: 50,
      changed: 0,
    });
  });

  it("scans within the maximum wait while the page keeps changing", async () => {
    setBody("<main></main>");
    await startScanner();
    const main = the("main");
    for (let n = 0; n < 12; n++) {
      main.append(searchRow(100 + n));
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    }
    expect(reports.filter((report) => report.kind === "added").length).toBeGreaterThanOrEqual(1);
    await settle();
    expect(found()).toHaveLength(12);
  });

  it("ignores mutations made only of our own nodes", async () => {
    loadPage(SURFACES.search);
    await startScanner();
    const badge = document.createElement("span");
    badge.className = "sar-badge";
    the("a.search_result_row").append(badge);
    await settle();
    expect(reports).toHaveLength(1);
  });

  it("restores a badge when a re-render replaces the host's subtree", async () => {
    loadPage(SURFACES["tag-hub"]);
    await startScanner({ badges: true });
    const host = the(".capsule_index_0");
    expect(host.querySelectorAll(".sar-badge")).toHaveLength(1);
    const fresh = new DOMParser().parseFromString(SURFACES["tag-hub"], "text/html");
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
    setBody(
      `<main><div class="other"><a href="/app/99/"><img></a></div>`
        + `<div class="slot"><div class="slide"><a href="/app/10/"><img></a>`
        + `<a href="/app/10/">Ten</a></div></div></main>`,
    );
    await startScanner({ badges: true });
    const slot = the(".slot");
    expect(slot.getAttribute(HOST_APPID)).toBe("10");
    the(".slide", slot).replaceWith(
      ...nodes(
        `<div class="slide"><a href="/app/20/"><img></a><a href="/app/20/">Twenty</a></div>`,
      ),
    );
    await settle();
    expect(renderer.batches.at(-1)?.changed).toStrictEqual([]);
    expect(renderer.batches.at(-1)?.found.map((host) => [host.element, host.appId])).toStrictEqual([
      [slot, 20],
    ]);
    expect(slot.getAttribute(HOST_APPID)).toBe("20");
    expect(slot.querySelectorAll(`[${HOST_APPID}]`)).toHaveLength(0);
    expect(slot.querySelectorAll(".sar-badge")).toHaveLength(1);
  });

  it("finds a capsule whose image arrives inside its link after the scan", async () => {
    setBody(`<main><div class="other"><a href="/app/99/"><img></a></div></main>`);
    await startScanner();
    the("main").append(
      ...nodes(`<div class="card"><a href="/app/30/"><div class="box"></div></a></div>`),
    );
    await settle();
    expect(mapping()).toStrictEqual([[99, "generic"]]);
    the(".box").append(document.createElement("img"));
    await settle();
    expect(mapping()).toStrictEqual([[99, "generic"], [30, "generic"]]);
    expect(renderer.batches.at(-1)?.found.map((host) => host.element)).toStrictEqual([
      the(".card"),
    ]);
  });

  it("keeps the badge in place when the store adds a hover popup inside the host", async () => {
    loadPage(SURFACES["tag-hub"]);
    await startScanner({ badges: true });
    const host = the(".capsule_index_0");
    const box = the(".CapsuleImageCtn", host);
    expect(box.querySelectorAll(".sar-badge")).toHaveLength(1);
    const popup = nodes(
      `<div class="popup" style="position: fixed"><a href="/app/632360/"><div class="art">`
        + `<img></div></a></div>`,
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
    loadPage(SURFACES.home);
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
    expect(clone.getAttribute(HOST_APPID)).toBe("466560");
  });

  it("cleans marks and badges left by a previous instance", async () => {
    loadPage(SURFACES.search);
    const row = the("a.search_result_row");
    row.setAttribute(HOST_APPID, "4075620");
    row.setAttribute(HOST_STATE, "disclosed");
    row.append(...nodes(`<span class="sar-badge"></span><span class="sar-badge"></span>`));
    await startScanner({ badges: true });
    expect(hostElements()).toContain(row);
    expect(row.getAttribute(HOST_STATE)).toBe("pending");
    expect(row.querySelectorAll(".sar-badge")).toHaveLength(1);
  });

  it("disconnects on pagehide and rescans the page on a bfcache pageshow", async () => {
    loadPage(SURFACES.search);
    await startScanner();
    globalThis.dispatchEvent(pageTransition("pagehide"));
    const row = searchRow(42);
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

  /** A React sale grid of `count` tag hub capsules, each for its own app. */
  function capsuleGrid(count: number): Element {
    const page = new DOMParser().parseFromString(SURFACES["tag-hub"], "text/html");
    const capsule = the(".capsule_index_0", page).parentElement;
    if (capsule === null) {
      throw new TypeError();
    }
    const grid = document.createElement("div");
    grid.className = "SaleSectionContainer";
    for (let n = 0; n < count; n++) {
      const copy = capsule.cloneNode(true);
      if (copy instanceof Element) {
        for (const link of copy.querySelectorAll("a")) {
          link.setAttribute("href", `https://store.steampowered.com/app/${String(500_000 + n)}/X`);
        }
        grid.append(copy);
      }
    }
    return grid;
  }

  it("scans a 200-capsule page with bounded DOM work, in one frame", async () => {
    document.body.replaceChildren(capsuleGrid(200));
    const work = countDomWork();
    await startScanner();
    expect(found()).toHaveLength(200);
    expect(renderer.batches).toHaveLength(1);
    expect(reports).toHaveLength(1);
    const done = work();
    expectWithin(done, PAGE_LIMITS, 200);
    expect(done.setAttribute).toBe(200 * 2);
    expect(done.removeAttribute).toBe(0);
  });

  it("scans 50 appended search rows with bounded DOM work", async () => {
    loadPage(SURFACES.search);
    await startScanner();
    const container = the("#search_resultsRows");
    const rows = Array.from({ length: 50 }, (_, n) => searchRow(2_000_000 + n));
    const work = countDomWork();
    for (const row of rows) {
      container.append(row);
    }
    await settle();
    expect(found()).toHaveLength(58);
    expect(renderer.batches).toHaveLength(2);
    expect(reports).toHaveLength(2);
    const done = work();
    expectWithin(done, ADDED_LIMITS, 50);
    expect(done.setAttribute).toBe(50 * 2);
    expect(done.removeAttribute).toBe(0);
  });
});
