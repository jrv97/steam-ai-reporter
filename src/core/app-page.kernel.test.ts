// @vitest-environment-options {"url":"https://store.steampowered.com/app/2807960/"}
import { afterEach, describe, expect, it, vi } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import { APP_PAGES, withDescriptionColumn } from "../../tests/helpers/app-page";
import { clearRoot } from "../../tests/helpers/dom";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRoute } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { loadPage } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { createSettingsSource } from "./settings/settings-source";
import { adoptPageStyles } from "./ui/styles";

// Game 2807960 declares a kernel anti-cheat with boot protection and no vendor name: GetItems has
// the flags, and only the page has the anti-cheat's name and the boot protection line.

const i18n = englishI18n();
const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
  clearRoot();
});

describe("start on the app page of a kernel anti-cheat", () => {
  it("names the anti-cheat and gives the boot protection line the page shows", async () => {
    loadPage(withDescriptionColumn(APP_PAGES["2807960-kernel-boot-protection.html"]));
    document.documentElement.lang = "en";
    const store = memoryStore();
    app = await start({
      document,
      http: fakeHttp([getItemsRoute(fixtureItems(kindItems))]),
      store,
      settings: createSettingsSource(store),
      clock: fixedClock(0),
      console: quiet,
      addPageStyles: adoptPageStyles,
    });

    const banner = document.getElementById("sar-banner")?.shadowRoot;
    const headings = [...(banner?.querySelectorAll("h2") ?? [])].map((heading) =>
      heading.textContent
    );
    expect(headings).toEqual([
      i18n.t("kind_kernel_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
      i18n.t("kind_pvp_heading"),
    ]);
    const kernel = banner?.querySelector(".sar-banner-entry");
    const lines = [...(kernel?.querySelectorAll(".sar-banner-detail") ?? [])].map((line) =>
      line.textContent
    );
    expect(lines).toEqual(["EA Javelin Anticheat", i18n.t("kind_kernel_boot")]);
  });
});
