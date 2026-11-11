// @vitest-environment-options {"url":"https://store.steampowered.com/app/3751950/"}
import * as v from "valibot";
import { afterEach, describe, expect, it } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import textCases from "../../tests/fixtures/getitems/text-cases.json";
import { clearRoot } from "../../tests/helpers/dom";
import { make } from "../../tests/helpers/factory";
import { fake } from "../../tests/helpers/fakes";
import { getItemsRequest } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { writeSettings } from "../../tests/helpers/settings";
import { readKey } from "../../tests/helpers/store-read";
import { loadPage } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { dateFormat } from "./i18n/date-format";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import type { JsonValue } from "./json";
import type { KindSettings } from "./kinds/kind-settings";
import { DEFAULT_SETTINGS, encodeSettings, type Settings } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, SETTINGS_KEY } from "./storage-keys";
import { HOVER_CARD_ID } from "./ui/hover-card";
import { adoptPageStyles } from "./ui/styles";

// The game of the open page declares DRM, a third-party account and a EULA, and no AI. Its
// English page can answer none of them: they come from GetItems.
const GAME = make.fixture.app.drmAccountEula;

const i18n = englishI18n();
const AllowSchema = v.record(v.string(), v.record(v.string(), v.unknown()));

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
  clearRoot();
});

const banner = () => document.getElementById("tks-banner")?.shadowRoot ?? null;
const headings = () =>
  [...(banner()?.querySelectorAll("h2") ?? [])].map((heading) => heading.textContent);
const chipKinds = () =>
  [...document.querySelectorAll(".tks-tag-section .tks-badge")].map((chip) =>
    chip.getAttribute("data-tks-kind")
  );
const control = (selector: string) => banner()?.querySelector<HTMLElement>(selector);
const storing = (settings: Settings) =>
  new Map<string, JsonValue>([[SETTINGS_KEY, encodeSettings(settings)]]);

const DRM_PAGE = make.page.withSummaryBox(
  make.page.withDescriptionColumn(make.page.app("3751950-drm-account-eula.html")),
);

/** Starts on the page, which shows `entries` banner entries once GetItems has answered. */
async function startOnDrmPage(
  initial: ReadonlyMap<string, JsonValue> = new Map(),
  items: readonly unknown[] = make.fixture.items(kindItems),
  page: string = DRM_PAGE,
  entries = 3,
) {
  loadPage(page);
  document.documentElement.lang = "en";
  const store = fake.store(initial);
  const settings = createSettingsSource(store);
  const http = fake.http([make.item.route(items)]);
  app = await start({
    document,
    http,
    store,
    settings,
    clock: fake.clock(make.time()),
    console: fake.console(),
    catalogs: SHIPPED_CATALOGS,
    addPageStyles: adoptPageStyles,
  });
  await expect.poll(() => headings().length).toBeGreaterThanOrEqual(entries);
  const ignored = async (scope: string) =>
    Object.keys(v.parse(AllowSchema, await readKey(store, ALLOW_KEY))[scope] ?? {});
  return { http, settings, ignored };
}

describe("start on an English app page of a game with no AI", () => {
  it("shows its DRM, account and EULA entries, read from GetItems", async () => {
    const { http } = await startOnDrmPage();

    expect(http.calls).toHaveLength(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual([GAME]);
    expect(headings()).toEqual([
      i18n.t("kind_drm_heading"),
      i18n.t("kind_account_heading"),
      i18n.t("kind_eula_heading"),
    ]);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
  });

  it("ignores one kind from the menu and leaves the others", async () => {
    const { ignored } = await startOnDrmPage();
    const option = () => control("#tks-banner-option-tag-drm");

    option()?.click();
    await expect.poll(() => option()?.getAttribute("aria-checked")).toBe("true");
    expect(await ignored("drm")).toEqual([String(GAME)]);
    expect(await ignored("all")).toEqual([]);
    expect(headings()).toEqual([i18n.t("kind_account_heading"), i18n.t("kind_eula_heading")]);
    expect(chipKinds()).toEqual(["account", "eula"]);

    option()?.click();
    await expect.poll(() => headings().length).toBe(3);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
    expect(await ignored("drm")).toEqual([]);
  });

  it("leaves out a kind whose banner entry is switched off", async () => {
    const { settings } = await startOnDrmPage();

    await writeSettings(settings, make.settings.kind("eula", { banner: false }));
    expect(headings()).toEqual([i18n.t("kind_drm_heading"), i18n.t("kind_account_heading")]);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
    await writeSettings(settings, make.settings.kind("drm", { enabled: false }));
    expect(headings()).toEqual([i18n.t("kind_account_heading"), i18n.t("kind_eula_heading")]);
    expect(chipKinds()).toEqual(["account", "eula"]);
  });

  describe("with Valve's device ratings on", () => {
    // Valve rates the game Unsupported on Steam Deck and has not rated it for Steam Machine.
    const rated = [
      {
        ...make.fixture.itemAs(kindItems, GAME, GAME),
        platforms: { steam_deck_compat_category: 1, steam_machine_compat_category: 0 },
      },
    ];
    const devices = (patch: Partial<KindSettings>) =>
      make.settings.kind("machine", patch, make.settings.kind("deck", patch));
    const startRated = (patch: Partial<KindSettings>) =>
      startOnDrmPage(storing(devices(patch)), rated);
    const deckEntry = i18n.t("kind_facet_name", {
      heading: i18n.t("kind_deck_heading"),
      value: i18n.t("kind_compat_unsupported"),
    });

    it("puts a rating in the tag section and, by default, not in the banner", async () => {
      await startRated({ enabled: true });
      expect(chipKinds()).toEqual(["drm", "account", "eula", "deck"]);
      expect(headings()).toHaveLength(3);
    });

    it("heads a rating's entry with Steam's heading and word, and ignores that tag", async () => {
      const { ignored } = await startRated({
        enabled: true,
        banner: true,
      });
      await expect.poll(() => headings().length).toBe(4);
      expect(headings()[3]).toBe(deckEntry);
      control("#tks-banner-option-tag-deck")?.click();
      await expect.poll(() => control("#tks-banner-option-tag-deck")?.getAttribute("aria-checked"))
        .toBe("true");
      expect(await ignored("deck")).toEqual([String(GAME)]);
      expect(control(".tks-banner-ignored-text")?.textContent).toBe(
        i18n.t("banner_ignored_kind", { heading: i18n.t("kind_deck_heading") }),
      );
      expect(chipKinds()).toEqual(["drm", "account", "eula"]);
    });
  });

  it("tags a paid game whose features lack category 62, in Steam's words", async () => {
    // The game's feature list in the capture leaves out category 62.
    const on = make.settings.kind("family", { enabled: true });
    const { settings } = await startOnDrmPage(storing(on));
    expect(chipKinds()).toEqual(["family", "drm", "account", "eula"]);
    expect(headings()).toHaveLength(3);
    await writeSettings(settings, make.settings.kind("family", { banner: true }, on));
    await expect.poll(() => headings().length).toBe(4);
    expect(headings()[0]).toBe(i18n.t("kind_family_unsupported"));
  });

  it("draws only the chips whose badge switch is on", async () => {
    const { settings } = await startOnDrmPage();

    await writeSettings(settings, make.settings.kind("account", { badge: false }));
    expect(chipKinds()).toEqual(["drm", "eula"]);
    expect(headings()).toHaveLength(3);
    await writeSettings(settings, DEFAULT_SETTINGS);
    expect(chipKinds()).toEqual(["drm", "account", "eula"]);
  });
});

describe("start on the app page of a game whose legal notice names an EA account", () => {
  // The captured item of 2448570, served as the page's game, with its features list, which shows
  // the EULA notice and no DRM or account notice.
  const items = [make.fixture.itemAs(textCases, make.fixture.app.legalNotice, GAME)];
  const page = make.page.withSummaryBox(
    make.page.withDescriptionColumn(make.page.app("2448570-eula-legal-notice.html")),
  );

  it("tags the EULA and no DRM or account, as the store page lists them", async () => {
    await startOnDrmPage(new Map(), items, page, 2);
    expect(headings()).toEqual([i18n.t("kind_ai_heading"), i18n.t("kind_eula_heading")]);
    expect(chipKinds()).toEqual(["ai", "eula"]);
  });
});

describe("start on the app page of a game in early access", () => {
  // The captured Early Access item with its note and release date, served as the page's game.
  const flagged = [make.fixture.itemAs(kindItems, make.fixture.app.earlyAccess, GAME)];
  const day = (seconds: number) => dateFormat(i18n.locale).format(seconds * 1000);
  const released = i18n.t("kind_earlyaccess_released", { date: day(make.fixture.released) });
  const updated = i18n.t("kind_earlyaccess_updated", { date: day(make.fixture.updated) });

  /** Opens the hover card of the page's Early Access chip and returns the entry's lines. */
  async function cardLines(): Promise<readonly (string | null)[]> {
    const chip = '.tks-tag-section .tks-badge[data-tks-kind="earlyaccess"]';
    await expect.poll(() => document.querySelector(chip)).not.toBeNull();
    document.querySelector(chip)?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    const entry = document.querySelector(
      `#${HOVER_CARD_ID} .tks-hovercard-entry[data-tks-kind="earlyaccess"]`,
    );
    return Array.from(entry?.children ?? [], (line) => line.textContent);
  }

  it.each([
    ["then the latest update post the page holds", make.page.withLastUpdateScript(DRM_PAGE), [
      released,
      updated,
    ]],
    ["and nothing more when the page holds no update post", DRM_PAGE, [released]],
  ])("shows the note and the release date, %s", async (_name, page, dates) => {
    await startOnDrmPage(new Map(), flagged, page, 0);
    expect(await cardLines()).toEqual([
      i18n.t("kind_earlyaccess_heading"),
      expect.any(String),
      ...dates,
    ]);
  });

  it("leaves early access out of the banner, which Steam's own box already tops", async () => {
    await startOnDrmPage(new Map(), flagged, DRM_PAGE, 0);
    await expect.poll(() => chipKinds()).toEqual(["earlyaccess"]);
    expect(headings()).toEqual([]);
  });
});
