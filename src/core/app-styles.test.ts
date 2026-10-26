// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import searchItems from "../../tests/fixtures/getitems/search-roguelike-50.json";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRoute } from "../../tests/helpers/getitems";
import { memoryStore } from "../../tests/helpers/memory-store";
import { loadPage, SURFACES } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import { createSettingsSource } from "./settings/settings-source";

// Its own file, so the document has adopted no sheet from an earlier `start`.

const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
});

describe("start and the page stylesheet", () => {
  it("leaves the page stylesheet to the platform hook and still badges", async () => {
    const addPageStyles = vi.fn();
    loadPage(SURFACES.search);
    document.documentElement.lang = "en";
    const store = memoryStore();
    app = await start({
      document,
      http: fakeHttp([getItemsRoute(fixtureItems(searchItems))]),
      store,
      settings: createSettingsSource(store),
      clock: fixedClock(Date.UTC(2026, 9, 20)),
      console: quiet,
      catalogs: SHIPPED_CATALOGS,
      addPageStyles,
    });
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
    expect(addPageStyles).toHaveBeenCalledExactlyOnceWith(document);
    expect(document.adoptedStyleSheets).toHaveLength(0);
    expect(document.querySelector("style.sar-styles")).toBeNull();
  });
});
