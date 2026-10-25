// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import searchItems from "../../tests/fixtures/getitems/search-roguelike-50.json";
import { clearRoot } from "../../tests/helpers/dom";
import { fakeHttp } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRequest, getItemsRoute, itemAs } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { withKind, writeSettings } from "../../tests/helpers/settings";
import { loadPage, SURFACES } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import type { JsonValue } from "./json";
import { toHexColor } from "./kinds/color";
import type { KindId } from "./kinds/id";
import { KIND_BY_ID } from "./kinds/registry";
import { DEFAULT_SETTINGS, encodeSettings } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, SETTINGS_KEY } from "./storage-keys";
import { KIND_ATTRIBUTE } from "./ui/kind-attributes";
import { adoptPageStyles } from "./ui/styles";

const i18n = englishI18n();
const DISCLOSED = "4461450";
const SEARCH_IDS = [4075620, 3934270, 3784030, 1045010, 3432110, 3664320, 4461450, 2624160];
const NOW = Date.UTC(2026, 9, 20);

const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

async function startOnSearch(
  initial: ReadonlyMap<string, JsonValue> = new Map(),
  items: readonly unknown[] = fixtureItems(searchItems),
) {
  loadPage(SURFACES.search);
  document.documentElement.lang = "en";
  const store = memoryStore(initial);
  const settings = createSettingsSource(store);
  const http = fakeHttp([getItemsRoute(items)]);
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
    const badge = row(DISCLOSED)?.querySelector(".search_name > .title + .sar-chips > .sar-badge");
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

    await writeSettings(
      settings,
      withKind(DEFAULT_SETTINGS, "ai", { filter: "hide", badge: false }),
    );
    expect(rootMark("data-sar-filter-ai")).toBe("hide");
    expect(rootMark("data-sar-filter-kernel")).toBe("off");
    const disclosed = row(DISCLOSED);
    const other = row(String(SEARCH_IDS[0]));
    expect(disclosed === null ? "" : getComputedStyle(disclosed).display).toBe("none");
    expect(other === null ? "" : getComputedStyle(other).display).not.toBe("none");
  });

  it("counts the hidden row and shows it again without touching the settings", async () => {
    const { settings, store } = await startOnSearch();
    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "ai", { filter: "hide" }));
    const stored = await store.get([SETTINGS_KEY]);
    const line = () => document.querySelector(".sar-list-notice-text")?.textContent;
    await expect.poll(line).toBe(i18n.plural("notice_list_hidden", 1));

    document.querySelector<HTMLButtonElement>(".sar-list-notice-button")?.click();
    const disclosed = row(DISCLOSED);
    expect(disclosed === null ? "" : getComputedStyle(disclosed).display).not.toBe("none");
    expect(line()).toBe(i18n.plural("notice_list_revealed", 1));
    expect(await store.get([SETTINGS_KEY])).toStrictEqual(stored);
  });

  describe("with a game that discloses several kinds", () => {
    // ARC Raiders' item (AI notes, a kernel anti-cheat, a EULA and PvP) replaces the disclosed
    // row's item: the route keeps the last item of an ID.
    const several = [
      ...fixtureItems(searchItems),
      itemAs(kindItems, 1808500, Number(DISCLOSED)),
    ];
    const chips = () =>
      Array.from(
        row(DISCLOSED)?.querySelectorAll(".sar-chips > .sar-badge") ?? [],
        (element) => element.querySelector(".sar-badge-label")?.textContent,
      );
    const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);
    // PvP starts off, so these tests turn it on in the stored settings.
    const withPvp = withKind(DEFAULT_SETTINGS, "pvp", { enabled: true });
    const pvpOn = (): Map<string, JsonValue> => new Map([[SETTINGS_KEY, encodeSettings(withPvp)]]);

    it("draws the placement's allowance of chips and a +N chip for the rest", async () => {
      const { http } = await startOnSearch(pvpOn(), several);
      await drawn(http);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai kernel eula pvp");
      expect(chips()).toEqual([
        chip("ai"),
        chip("kernel"),
        chip("eula"),
        i18n.t("kind_chip_more", { count: "1" }),
      ]);
    });

    it("draws the chips again when a kind's badges are switched off", async () => {
      const { http, settings } = await startOnSearch(pvpOn(), several);
      await drawn(http);
      await writeSettings(settings, withKind(withPvp, "kernel", { badge: false }));
      await expect.poll(() => chips()).toEqual([
        chip("ai"),
        chip("eula"),
        chip("pvp"),
      ]);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai kernel eula pvp");
    });

    it("draws no chip for an ignored kind, and keeps the others", async () => {
      const ignored = pvpOn().set(ALLOW_KEY, {
        all: {},
        kernel: { [DISCLOSED]: { name: "Ignored", added: NOW } },
      });
      const { http } = await startOnSearch(ignored, several);
      await drawn(http);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai eula pvp");
      expect(chips()).toEqual([
        chip("ai"),
        chip("eula"),
        chip("pvp"),
      ]);
    });

    it("leaves the row alone when the kind that would hide it is ignored", async () => {
      const filters = withKind(withKind(DEFAULT_SETTINGS, "kernel", { filter: "hide" }), "ai", {
        filter: "dim",
      });
      const ignored = new Map<string, JsonValue>([
        [SETTINGS_KEY, encodeSettings(filters)],
        [ALLOW_KEY, { all: {}, kernel: { [DISCLOSED]: { name: "Ignored", added: NOW } } }],
      ]);
      const { http } = await startOnSearch(ignored, several);
      await drawn(http);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai eula pvp");
      expect(getComputedStyle(row(DISCLOSED) ?? document.body).display).not.toBe("none");
    });

    it("hides the row when any of its kinds hides, whatever the others do", async () => {
      const { http, settings } = await startOnSearch(pvpOn(), several);
      await drawn(http);
      const dimAi = withKind(withPvp, "ai", { filter: "dim" });
      await writeSettings(settings, withKind(dimAi, "pvp", { filter: "hide" }));
      const style = getComputedStyle(row(DISCLOSED) ?? document.body);
      expect(style.display).toBe("none");
    });
  });

  describe("with a DLC row of a game the user ignored", () => {
    const BASE = "1808500";
    // The disclosed row is a DLC of ARC Raiders: Steam's item names the base game, as the
    // captured DLC does (dlc-parent.json). Nothing lists the DLC.
    const dlc = [
      ...fixtureItems(searchItems),
      {
        ...itemAs(kindItems, 1808500, Number(DISCLOSED)),
        related_items: { parent_appid: 1808500 },
      },
    ];
    const chips = () =>
      Array.from(
        row(DISCLOSED)?.querySelectorAll(".sar-chips > .sar-badge") ?? [],
        (element) => element.querySelector(".sar-badge-label")?.textContent,
      );
    const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);
    const ignoring = (scope: string): Map<string, JsonValue> =>
      new Map<string, JsonValue>([
        [ALLOW_KEY, { all: {}, [scope]: { [BASE]: { name: "Base game", added: NOW } } }],
      ]);

    it("draws every chip while the base game is not ignored", async () => {
      const { http } = await startOnSearch(new Map(), dlc);
      await drawn(http);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai kernel eula pvp");
      expect(chips()).toEqual([chip("ai"), chip("kernel"), chip("eula")]);
    });

    it("drops the chip and the list mark of the kind the base game is ignored for", async () => {
      const { http } = await startOnSearch(ignoring("ai"), dlc);
      await drawn(http);
      expect(http.calls).toHaveLength(1);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("kernel eula pvp");
      expect(chips()).toEqual([chip("kernel"), chip("eula")]);
    });

    it("marks nothing for a base game ignored for all kinds", async () => {
      const { http } = await startOnSearch(ignoring("all"), dlc);
      await drawn(http);
      expect(row(DISCLOSED)?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(document.querySelector(".sar-badge")).toBeNull();
    });

    it("leaves the row when the kind that would hide it is ignored for its base game", async () => {
      const hide = withKind(DEFAULT_SETTINGS, "ai", { filter: "hide" });
      const initial = ignoring("ai").set(SETTINGS_KEY, encodeSettings(hide));
      const { http } = await startOnSearch(initial, dlc);
      await drawn(http);
      expect(rootMark("data-sar-filter-ai")).toBe("hide");
      expect(getComputedStyle(row(DISCLOSED) ?? document.body).display).not.toBe("none");
    });

    it("hides the row when the kind is not ignored, so the mark is what decides", async () => {
      const hide = withKind(DEFAULT_SETTINGS, "ai", { filter: "hide" });
      const initial = new Map<string, JsonValue>([[SETTINGS_KEY, encodeSettings(hide)]]);
      const { http } = await startOnSearch(initial, dlc);
      await drawn(http);
      expect(getComputedStyle(row(DISCLOSED) ?? document.body).display).toBe("none");
    });

    it("draws a DLC whose own entry is ignored without touching its base game", async () => {
      const own = new Map<string, JsonValue>([
        [ALLOW_KEY, { all: {}, ai: { [DISCLOSED]: { name: "Ignored", added: NOW } } }],
      ]);
      const { http } = await startOnSearch(own, dlc);
      await drawn(http);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("kernel eula pvp");
    });
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
    await writeSettings(
      settings,
      withKind(DEFAULT_SETTINGS, "ai", { enabled: false, filter: "hide" }),
    );
    expect(rootMark("data-sar-filter-ai")).toBe("off");
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(0);
    await writeSettings(settings, DEFAULT_SETTINGS);
    expect(rootMark("data-sar-filter-ai")).toBe("off");
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
  });

  describe("with a custom tag color", () => {
    const property = "--sar-kind-color-ai";
    const colorOnRoot = () => document.documentElement.style.getPropertyValue(property);
    const red = toHexColor("#ff0000");

    it("sets nothing by default, so the badges keep the violet", async () => {
      await startOnSearch();
      await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
      expect(colorOnRoot()).toBe("");
      expect(document.documentElement.hasAttribute("style")).toBe(false);
    });

    it("applies a stored color at start as one root property", async () => {
      const stored = encodeSettings(withKind(DEFAULT_SETTINGS, "ai", { color: red }));
      await startOnSearch(new Map([[SETTINGS_KEY, stored]]));
      await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
      expect(colorOnRoot()).toBe("#ff0000");
      expect(document.querySelector(".sar-badge")?.getAttribute(KIND_ATTRIBUTE)).toBe("ai");
      expect(document.querySelector(".sar-badge")?.hasAttribute("style")).toBe(false);
      expect(document.querySelector(".sar-chips")?.hasAttribute("style")).toBe(false);
    });

    it("follows a change and its removal without drawing a badge again", async () => {
      const { settings } = await startOnSearch();
      await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
      const badge = document.querySelector(".sar-badge");
      await writeSettings(settings, withKind(DEFAULT_SETTINGS, "ai", { color: red }));
      expect(colorOnRoot()).toBe("#ff0000");
      await writeSettings(
        settings,
        withKind(DEFAULT_SETTINGS, "ai", { color: toHexColor("#00ff00") }),
      );
      expect(colorOnRoot()).toBe("#00ff00");
      await writeSettings(settings, DEFAULT_SETTINGS);
      expect(colorOnRoot()).toBe("");
      expect(document.querySelector(".sar-badge")).toBe(badge);
    });

    it("keeps the other kinds on the default", async () => {
      const { settings } = await startOnSearch();
      await writeSettings(settings, withKind(DEFAULT_SETTINGS, "drm", { color: red }));
      expect(document.documentElement.style.getPropertyValue("--sar-kind-color-drm")).toBe(
        "#ff0000",
      );
      expect(colorOnRoot()).toBe("");
    });
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
    expect(rootMark("data-sar-filter-kernel")).toBe("off");
    const keys = await store.keys();
    expect(keys).toContain("v2:settings");
    expect(keys).toContain("v2:allow");
    expect(keys).toContain("v1:settings");
    expect(keys).toContain("v1:allow");
  });
});
