// @vitest-environment-options {"url":"https://store.steampowered.com/app/3751950/"}
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import { APP_PAGES, withDescriptionColumn } from "../../tests/helpers/app-page";
import { clearRoot } from "../../tests/helpers/dom";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRequest, getItemsRoute } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { loadPage } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { DEFAULT_SETTINGS, withKind } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY } from "./storage-keys";
import { adoptPageStyles } from "./ui/styles";

// Game 3751950 declares DRM (with an activation limit only its page shows), a third-party
// account and a EULA, and no AI. Its English page can answer none of them: they come from GetItems.

const i18n = englishI18n();
const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const AllowSchema = v.record(v.string(), v.record(v.string(), v.unknown()));

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
  clearRoot();
});

const banner = () => document.getElementById("sar-banner")?.shadowRoot ?? null;
const headings = () =>
  [...(banner()?.querySelectorAll("h2") ?? [])].map((heading) => heading.textContent);
const control = (selector: string) => banner()?.querySelector<HTMLElement>(selector);

async function startOnDrmPage() {
  loadPage(withDescriptionColumn(APP_PAGES["3751950-drm-account-eula.html"]));
  document.documentElement.lang = "en";
  const store = memoryStore();
  const settings = createSettingsSource(store);
  const http = fakeHttp([getItemsRoute(fixtureItems(kindItems))]);
  app = await start({
    document,
    http,
    store,
    settings,
    clock: fixedClock(0),
    console: quiet,
    addPageStyles: adoptPageStyles,
  });
  const ignored = async (scope: string) =>
    Object.keys(v.parse(AllowSchema, (await store.get([ALLOW_KEY])).get(ALLOW_KEY))[scope] ?? {});
  return { http, settings, ignored };
}

describe("start on an English app page of a game with no AI", () => {
  it("shows its DRM, account and EULA entries, read from GetItems", async () => {
    const { http } = await startOnDrmPage();

    expect(http.calls).toHaveLength(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual([3751950]);
    expect(headings()).toEqual([
      i18n.t("kind_drm_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
    ]);
    expect(document.querySelector(".sar-summary-row")).toBeNull();
  });

  it("adds what only the page shows: the DRM activation limit", async () => {
    await startOnDrmPage();

    const lines = [...(banner()?.querySelectorAll(".sar-banner-detail") ?? [])].map((line) =>
      line.textContent
    );
    expect(lines).toContain("Denuvo Anti-tamper");
    expect(lines).toContain("5 a day machine activation limit");
  });

  it("links the EULA to the store page", async () => {
    await startOnDrmPage();

    const anchor = banner()?.querySelector("a");
    expect(anchor?.textContent).toBe("Assassin's Creed Black Flag Resynced EULA");
    expect(anchor?.getAttribute("href")).toBe(
      "https://store.steampowered.com/eula/3751950_eula_0",
    );
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("ignores one kind from its entry and leaves the others", async () => {
    const { ignored } = await startOnDrmPage();

    control('.sar-banner-action[data-sar-scope="drm"]')?.click();
    await expect.poll(() => control('[data-sar-action="undo"]') !== undefined).toBe(true);
    expect(await ignored("drm")).toEqual(["3751950"]);
    expect(await ignored("all")).toEqual([]);
    expect(headings()).toEqual([i18n.t("kind_account_heading"), i18n.t("kind_eula_heading")]);

    control('[data-sar-action="undo"]')?.click();
    await expect.poll(() => headings().length).toBe(3);
    expect(await ignored("drm")).toEqual([]);
  });

  it("leaves out a kind whose banner entry is switched off", async () => {
    const { settings } = await startOnDrmPage();

    await settings.write(withKind(DEFAULT_SETTINGS, "eula", { banner: false }));
    expect(headings()).toEqual([i18n.t("kind_drm_heading"), i18n.t("kind_account_heading")]);
    await settings.write(withKind(DEFAULT_SETTINGS, "drm", { enabled: false }));
    expect(headings()).toEqual([i18n.t("kind_account_heading"), i18n.t("kind_eula_heading")]);
  });
});
