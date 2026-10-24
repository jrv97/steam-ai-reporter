// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import searchItems from "../../tests/fixtures/getitems/search-roguelike-50.json";
import { clearRoot } from "../../tests/helpers/dom";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRequest, getItemsRoute } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { loadPage, SURFACES } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import type { JsonValue } from "./json";
import { DEFAULT_SETTINGS, withKind } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY } from "./storage-keys";
import { adoptPageStyles } from "./ui/styles";

const i18n = englishI18n();
const DISCLOSED = "4461450";
const SEARCH_IDS = [4075620, 3934270, 3784030, 1045010, 3432110, 3664320, 4461450, 2624160];
const NOW = Date.UTC(2026, 9, 20);

const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

async function startOnSearch(initial: ReadonlyMap<string, JsonValue> = new Map()) {
  loadPage(SURFACES.search);
  document.documentElement.lang = "en";
  const store = memoryStore(initial);
  const settings = createSettingsSource(store);
  const http = fakeHttp([getItemsRoute(fixtureItems(searchItems))]);
  app = await start({
    document,
    http,
    store,
    settings,
    clock: fixedClock(NOW),
    console: quiet,
    addPageStyles: adoptPageStyles,
  });
  return { http, settings, store };
}

const row = (id: string) => document.querySelector(`a.search_result_row[data-ds-appid="${id}"]`);
const rootMark = (name: string) => document.documentElement.getAttribute(name);

/** Waits for the page's one GetItems request, then for the draw that follows its answer. */
async function drawn(http: { readonly calls: readonly unknown[]; }): Promise<void> {
  await expect.poll(() => http.calls.length).toBe(1);
  for (let frame = 0; frame < 4; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

afterEach(() => {
  app?.stop();
  app = undefined;
  clearRoot();
});

describe("start on the search page", () => {
  it("badges the disclosed row after one GetItems request for the page", async () => {
    const { http } = await startOnSearch();
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);

    expect(http.calls).toHaveLength(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual(SEARCH_IDS);
    const badge = row(DISCLOSED)?.querySelector(".search_name > .title + .sar-badge");
    expect(badge?.querySelector(".sar-badge-label")?.textContent).toBe(i18n.t("kind_ai_chip"));
    expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai");
    const others = SEARCH_IDS.filter((id) => String(id) !== DISCLOSED);
    expect(others.map((id) => row(String(id))?.hasAttribute("data-sar-kinds"))).toEqual(
      others.map(() => false),
    );
    expect(document.adoptedStyleSheets.length).toBeGreaterThan(0);
  });

  it("switches one kind to hide mode with one root attribute per setting", async () => {
    const { settings } = await startOnSearch();
    await expect.poll(() => row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai");
    expect(rootMark("data-sar-filter-ai")).toBe("off");

    await settings.write(withKind(DEFAULT_SETTINGS, "ai", { filter: "hide", badge: false }));
    expect(rootMark("data-sar-filter-ai")).toBe("hide");
    expect(rootMark("data-sar-badges-ai")).toBe("off");
    expect(rootMark("data-sar-filter-kernel")).toBe("off");
    expect(rootMark("data-sar-badges-kernel")).toBe("on");
    const disclosed = row(DISCLOSED);
    const other = row(String(SEARCH_IDS[0]));
    expect(disclosed === null ? "" : getComputedStyle(disclosed).display).toBe("none");
    expect(other === null ? "" : getComputedStyle(other).display).not.toBe("none");
  });

  it("marks nothing for an allow-listed game, in lists or on badges", async () => {
    const { http } = await startOnSearch(
      new Map<string, JsonValue>([
        [ALLOW_KEY, { all: {}, ai: { [DISCLOSED]: { name: "Ignored", added: NOW } } }],
      ]),
    );
    await drawn(http);
    expect(row(DISCLOSED)?.hasAttribute("data-sar-kinds")).toBe(false);
    expect(document.querySelector(".sar-badge")).toBeNull();
  });

  it("marks nothing for a game ignored for all kinds", async () => {
    const { http } = await startOnSearch(
      new Map<string, JsonValue>([
        [ALLOW_KEY, { all: { [DISCLOSED]: { name: "Ignored", added: NOW } }, ai: {} }],
      ]),
    );
    await drawn(http);
    expect(row(DISCLOSED)?.hasAttribute("data-sar-kinds")).toBe(false);
    expect(document.querySelector(".sar-badge")).toBeNull();
  });

  it("shows no badge and filters nothing while the kind is disabled", async () => {
    const { settings } = await startOnSearch();
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
    await settings.write(
      withKind(DEFAULT_SETTINGS, "ai", { enabled: false, filter: "hide" }),
    );
    expect(rootMark("data-sar-badges-ai")).toBe("off");
    expect(rootMark("data-sar-filter-ai")).toBe("off");
    await settings.write(DEFAULT_SETTINGS);
    expect(rootMark("data-sar-badges-ai")).toBe("on");
  });

  it("logs a settings read that fails and starts on the defaults", async () => {
    quiet.error.mockClear();
    loadPage(SURFACES.search);
    document.documentElement.lang = "en";
    const store = memoryStore();
    const problem = new Error();
    app = await start({
      document,
      http: fakeHttp([getItemsRoute(fixtureItems(searchItems))]),
      store,
      settings: {
        read: () => Promise.reject(problem),
        subscribe: () => () => undefined,
      },
      clock: fixedClock(NOW),
      console: quiet,
      addPageStyles: adoptPageStyles,
    });
    expect(quiet.error).toHaveBeenCalledWith(
      expect.any(String),
      i18n.t("error_unexpected"),
      problem,
    );
    expect(rootMark("data-sar-filter-ai")).toBe("off");
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
  });

  it("starts on the settings and the ignored games a v1 install stored", async () => {
    const { http, store } = await startOnSearch(
      new Map<string, JsonValue>([
        ["v1:settings", { badges: false, banner: true, listFilter: "dim", locale: "auto" }],
        ["v1:allow", { [DISCLOSED]: { name: "Ignored", added: NOW } }],
      ]),
    );
    await drawn(http);
    expect(row(DISCLOSED)?.hasAttribute("data-sar-kinds")).toBe(false);
    expect(rootMark("data-sar-filter-ai")).toBe("dim");
    expect(rootMark("data-sar-badges-ai")).toBe("off");
    expect(rootMark("data-sar-filter-kernel")).toBe("off");
    const keys = await store.keys();
    expect(keys).toContain("v2:settings");
    expect(keys).toContain("v2:allow");
    expect(keys).toContain("v1:settings");
    expect(keys).toContain("v1:allow");
  });
});
