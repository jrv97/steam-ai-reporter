// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import searchItems from "../../tests/fixtures/getitems/search-roguelike-50.json";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRequest, getItemsRoute } from "../../tests/helpers/getitems";
import { memoryStore } from "../../tests/helpers/memory-store";
import { loadPage, SURFACES } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import type { JsonValue } from "./json";
import { DEFAULT_SETTINGS } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY } from "./storage-keys";

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
  });
  return { http, settings };
}

const row = (id: string) => document.querySelector(`a.search_result_row[data-ds-appid="${id}"]`);

afterEach(() => {
  app?.stop();
  app = undefined;
  document.documentElement.removeAttribute("data-sar-filter");
  document.documentElement.removeAttribute("data-sar-badges");
});

describe("start on the search page", () => {
  it("badges the disclosed row after one GetItems request for the page", async () => {
    const { http } = await startOnSearch();
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);

    expect(http.calls).toHaveLength(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual(SEARCH_IDS);
    const badge = row(DISCLOSED)?.querySelector(".search_platforms > .sar-badge:first-child");
    expect(badge?.textContent).toBe("Discloses AI use");
    expect(row(DISCLOSED)?.getAttribute("data-sar-state")).toBe("disclosed");
    const states = SEARCH_IDS.map((id) => row(String(id))?.getAttribute("data-sar-state"));
    expect(states.filter((state) => state === "not-disclosed")).toHaveLength(7);
    expect(document.adoptedStyleSheets.length).toBeGreaterThan(0);
  });

  it("switches to hide mode when the settings change, with one root attribute", async () => {
    const { settings } = await startOnSearch();
    await expect.poll(() => row(DISCLOSED)?.getAttribute("data-sar-state")).toBe("disclosed");
    expect(document.documentElement.getAttribute("data-sar-filter")).toBe("off");

    await settings.write({ ...DEFAULT_SETTINGS, listFilter: "hide", badges: false });
    expect(document.documentElement.getAttribute("data-sar-filter")).toBe("hide");
    expect(document.documentElement.getAttribute("data-sar-badges")).toBe("off");
    const disclosed = row(DISCLOSED);
    const other = row(String(SEARCH_IDS[0]));
    expect(disclosed === null ? "" : getComputedStyle(disclosed).display).toBe("none");
    expect(other === null ? "" : getComputedStyle(other).display).not.toBe("none");
  });

  it("marks nothing for an allow-listed game, in lists or on badges", async () => {
    await startOnSearch(
      new Map<string, JsonValue>([[ALLOW_KEY, { [DISCLOSED]: { name: "Ignored", added: NOW } }]]),
    );
    await expect.poll(() => row(DISCLOSED)?.getAttribute("data-sar-state")).toBe("allowed");
    expect(document.querySelector(".sar-badge")).toBeNull();
  });
});
