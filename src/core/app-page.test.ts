// @vitest-environment-options {"url":"https://store.steampowered.com/app/5072580/"}
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "../../tests/helpers/app-page";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { memoryStore } from "../../tests/helpers/memory-store";
import { loadPage } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { DEFAULT_SETTINGS } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY } from "./storage-keys";

const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
});

const banner = () => document.getElementById("sar-banner")?.shadowRoot ?? null;

describe("start on an English app page", () => {
  it("shows the banner from the page, stops marking and follows the setting", async () => {
    loadPage(APP_PAGES["5072580-ai-first.html"]);
    document.documentElement.lang = "en";
    const store = memoryStore();
    const settings = createSettingsSource(store);
    const http = fakeHttp([]);
    app = await start({
      document,
      http,
      store,
      settings,
      clock: fixedClock(0),
      console: quiet,
    });

    expect(http.calls).toEqual([]);
    const column = document.querySelector(".game_description_column");
    expect(column?.firstElementChild?.id).toBe("sar-banner");
    expect(banner()?.querySelector("blockquote")?.textContent).not.toBe("");

    banner()?.querySelector<HTMLElement>('[data-sar-action="stop"]')?.click();
    await expect
      .poll(() => banner()?.querySelector("aside")?.getAttribute("data-sar-variant"))
      .toBe("ignored");
    const stored = (await store.get([ALLOW_KEY])).get(ALLOW_KEY);
    expect(Object.keys(typeof stored === "object" && stored !== null ? stored : {})).toEqual([
      "5072580",
    ]);

    await settings.write({ ...DEFAULT_SETTINGS, banner: false });
    expect(document.getElementById("sar-banner")).toBeNull();
  });
});
