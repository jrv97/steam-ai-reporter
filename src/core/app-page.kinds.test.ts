// @vitest-environment-options {"url":"https://store.steampowered.com/app/3751950/"}
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import { APP_PAGES, withDescriptionColumn, withSummaryBox } from "../../tests/helpers/app-page";
import { clearRoot } from "../../tests/helpers/dom";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRequest, getItemsRoute, itemAs } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { withKind, writeSettings } from "../../tests/helpers/settings";
import { loadPage } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import type { JsonValue } from "./json";
import { COMPAT_FACETS } from "./kinds/compat";
import type { KindSettings } from "./kinds/kind-settings";
import { DEFAULT_SETTINGS, encodeSettings } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, SETTINGS_KEY } from "./storage-keys";
import { adoptPageStyles } from "./ui/styles";

// Game 3751950 declares DRM, a third-party
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
const chipKinds = () =>
  [...document.querySelectorAll(".sar-tag-section .sar-badge")].map((chip) =>
    chip.getAttribute("data-sar-kind")
  );
const control = (selector: string) => banner()?.querySelector<HTMLElement>(selector);

async function startOnDrmPage(
  initial: ReadonlyMap<string, JsonValue> = new Map(),
  items: readonly unknown[] = fixtureItems(kindItems),
) {
  loadPage(withSummaryBox(withDescriptionColumn(APP_PAGES["3751950-drm-account-eula.html"])));
  document.documentElement.lang = "en";
  const store = memoryStore(initial);
  const settings = createSettingsSource(store);
  const http = fakeHttp([getItemsRoute(items)]);
  app = await start({
    document,
    http,
    store,
    settings,
    clock: fixedClock(0),
    console: quiet,
    catalogs: SHIPPED_CATALOGS,
    addPageStyles: adoptPageStyles,
  });
  await expect.poll(() => headings().length).toBeGreaterThanOrEqual(3);
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
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
  });

  it("ignores one kind from its entry and leaves the others", async () => {
    const { ignored } = await startOnDrmPage();

    control('.sar-banner-action[data-sar-scope="drm"]')?.click();
    await expect.poll(() => control('[data-sar-action="undo"]') !== undefined).toBe(true);
    expect(await ignored("drm")).toEqual(["3751950"]);
    expect(await ignored("all")).toEqual([]);
    expect(headings()).toEqual([i18n.t("kind_account_heading"), i18n.t("kind_eula_heading")]);
    expect(chipKinds()).toEqual(["account", "eula"]);

    control('[data-sar-action="undo"]')?.click();
    await expect.poll(() => headings().length).toBe(3);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
    expect(await ignored("drm")).toEqual([]);
  });

  it("leaves out a kind whose banner entry is switched off", async () => {
    const { settings } = await startOnDrmPage();

    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "eula", { banner: false }));
    expect(headings()).toEqual([i18n.t("kind_drm_heading"), i18n.t("kind_account_heading")]);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "drm", { enabled: false }));
    expect(headings()).toEqual([i18n.t("kind_account_heading"), i18n.t("kind_eula_heading")]);
    expect(chipKinds()).toEqual(["account", "eula"]);
  });

  describe("with Valve's device ratings on", () => {
    // Valve rates the game Unsupported on Steam Deck and has not rated it for Steam Machine.
    const rated = [
      {
        ...itemAs(kindItems, 3751950, 3751950),
        platforms: { steam_deck_compat_category: 1, steam_machine_compat_category: 0 },
      },
    ];
    const devices = (patch: Partial<KindSettings>) =>
      withKind(withKind(DEFAULT_SETTINGS, "deck", patch), "machine", patch);
    const start = (patch: Partial<KindSettings>) =>
      startOnDrmPage(new Map([[SETTINGS_KEY, encodeSettings(devices(patch))]]), rated);
    const deckEntry = i18n.t("kind_facet_name", {
      heading: i18n.t("kind_deck_heading"),
      value: i18n.t("kind_compat_unsupported"),
    });

    it("puts a rating in the tag section and, by default, not in the banner", async () => {
      await start({ enabled: true });
      expect(chipKinds()).toEqual(["drm", "account", "eula", "deck"]);
      expect(headings()).toHaveLength(3);
    });

    it("heads a rating's entry with Steam's heading and word, and ignores that tag", async () => {
      const { ignored } = await start({ enabled: true, banner: true, facets: [...COMPAT_FACETS] });
      await expect.poll(() => headings().length).toBe(4);
      expect(headings()[3]).toBe(deckEntry);
      control('.sar-banner-action[data-sar-scope="deck"]')?.click();
      await expect.poll(() => control('[data-sar-action="undo"]') !== undefined).toBe(true);
      expect(await ignored("deck")).toEqual(["3751950"]);
      expect(control(".sar-banner-ignored-text")?.textContent).toBe(
        i18n.t("banner_ignored_kind", { heading: i18n.t("kind_deck_heading") }),
      );
      expect(chipKinds()).toEqual(["drm", "account", "eula"]);
    });
  });

  it("draws only the chips whose badge switch is on", async () => {
    const { settings } = await startOnDrmPage();

    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "account", { badge: false }));
    expect(chipKinds()).toEqual(["drm", "eula"]);
    expect(headings()).toHaveLength(3);
    await writeSettings(settings, DEFAULT_SETTINGS);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
  });
});
