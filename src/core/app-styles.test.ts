// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import searchItems from "../../tests/fixtures/getitems/search-roguelike-50.json";
import { make } from "../../tests/helpers/factory";
import { fake } from "../../tests/helpers/fakes";
import { loadPage } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import { createSettingsSource } from "./settings/settings-source";

// Its own file, so the document has adopted no sheet from an earlier `start`.

// The captured row of 4461450 carries the AI and the Early Access tags.
const DISCLOSED_BADGES = 2;

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
});

describe("start and the page stylesheet", () => {
  it("leaves the page stylesheet to the platform hook and still badges", async () => {
    const addPageStyles = vi.fn();
    loadPage(make.page.surface("search"));
    document.documentElement.lang = "en";
    const store = fake.store();
    app = await start({
      document,
      http: fake.http([make.item.route(make.fixture.items(searchItems))]),
      store,
      settings: createSettingsSource(store),
      clock: fake.clock(make.time()),
      console: fake.console(),
      catalogs: SHIPPED_CATALOGS,
      addPageStyles,
    });
    await expect.poll(() => document.querySelectorAll(".tks-badge").length).toBe(DISCLOSED_BADGES);
    expect(addPageStyles).toHaveBeenCalledExactlyOnceWith(document);
    expect(document.adoptedStyleSheets).toHaveLength(0);
    expect(document.querySelector("style.tks-styles")).toBeNull();
  });
});
