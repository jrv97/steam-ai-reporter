// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import searchItems from "../../tests/fixtures/getitems/search-roguelike-50.json";
import { basicInfo } from "../../tests/helpers/creators";
import { clearRoot, setBody } from "../../tests/helpers/dom";
import { fakeHttp, type Route } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import {
  demoItem,
  disclosedItem,
  fixtureItems,
  getItemsRequest,
  getItemsRoute,
  itemAs,
  ratedItem,
  requestFlags,
  storeItem,
} from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { packagePage } from "../../tests/helpers/package-page";
import { withKind, writeSettings } from "../../tests/helpers/settings";
import { loadPage, SURFACES } from "../../tests/helpers/surfaces";
import { T0, useTimerClock } from "../../tests/helpers/timer-clock";
import { type App, start } from "./app";
import type { CreatorRole } from "./creator";
import { API_BREAKER_KEY } from "./detect/breaker";
import { RETRY_DELAY_MS } from "./detect/retry";
import { DEFAULT_SPACING_MS } from "./detect/throttle";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import type { JsonValue } from "./json";
import { toHexColor } from "./kinds/color";
import { COMPAT_FACETS, type CompatFacet } from "./kinds/compat";
import type { KindId } from "./kinds/id";
import { KIND_BY_ID } from "./kinds/registry";
import type { Clock } from "./ports";
import { DEFAULT_SETTINGS, encodeSettings, type Settings } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, CREATOR_ALLOW_KEYS, SETTINGS_KEY } from "./storage-keys";
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
  clock: Clock = fixedClock(NOW),
  route: Route = getItemsRoute(items),
) {
  loadPage(SURFACES.search);
  return startOnLoaded(initial, items, clock, route);
}

/** Starts the app on the page the test document holds. */
async function startOnLoaded(
  initial: ReadonlyMap<string, JsonValue>,
  items: readonly unknown[],
  clock: Clock = fixedClock(NOW),
  route: Route = getItemsRoute(items),
) {
  document.documentElement.lang = "en";
  const store = memoryStore(initial);
  const settings = createSettingsSource(store);
  const http = fakeHttp([route]);
  app = await start({
    document,
    http,
    store,
    settings,
    clock,
    console: quiet,
    catalogs: SHIPPED_CATALOGS,
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
  vi.useRealTimers();
});

describe("start on a package page", () => {
  it("counts a Deck rating Valve gave, never Valve's Unknown or a missing section", async () => {
    setBody(packagePage([10, 20, 30]));
    const items = [ratedItem(10, { deck: 0 }), storeItem(20), ratedItem(30, { deck: 1 })];
    const deckOn = withKind(DEFAULT_SETTINGS, "deck", { enabled: true });
    await startOnLoaded(new Map([[SETTINGS_KEY, encodeSettings(deckOn)]]), items);
    const heading = i18n.t("kind_deck_heading");
    const value = i18n.t("kind_compat_unsupported");
    await expect.poll(() => document.querySelector(".sar-summary-line")?.textContent).toBe(
      i18n.plural("badge_summary_games", 2, {
        kind: i18n.t("kind_facet_name", { heading, value }),
        tagged: "1",
      }),
    );
    expect(document.querySelectorAll(".sar-summary-line")).toHaveLength(1);
  });

  it("sums up the included games' tags above them from the one request", async () => {
    setBody(packagePage([10, 20, 30]));
    const items = [disclosedItem(10, "Concept art."), storeItem(20), storeItem(30)];
    const { http } = await startOnLoaded(new Map(), items);
    const line = () => document.querySelector(".sar-summary .sar-summary-line")?.textContent;
    await expect.poll(line).toBe(
      i18n.plural("badge_summary_games", 3, { kind: i18n.t("kind_ai_heading"), tagged: "1" }),
    );
    expect(http.calls).toHaveLength(1);
  });
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

  it("asks again once a breaker left open by a past page closes, and tags every row", async () => {
    const { http } = await startOnSearch(
      new Map([[API_BREAKER_KEY, { until: T0 + 65_000 }]]),
      SEARCH_IDS.map((id) => disclosedItem(id, "notes")),
      useTimerClock(),
    );
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1000);
    expect(http.calls).toHaveLength(0);
    expect(document.querySelectorAll("[data-sar-kinds]")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(http.calls).toHaveLength(1);
    await expect.poll(() => SEARCH_IDS.map((id) => row(String(id))?.getAttribute("data-sar-kinds")))
      .toEqual(SEARCH_IDS.map(() => "ai"));
  });

  describe("with a game that discloses several kinds", () => {
    // ARC Raiders' item (AI notes, a kernel anti-cheat, a EULA, PvP and In-App Purchases) replaces
    // the disclosed row's item: the route keeps the last item of an ID.
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
    // PvP starts off, so these tests turn it on in the stored settings. In-App Purchases stays off:
    // its mark is on the row, which no filter of a kind that is off matches, and it draws no chip.
    const withPvp = withKind(DEFAULT_SETTINGS, "pvp", { enabled: true });
    const pvpOn = (): Map<string, JsonValue> => new Map([[SETTINGS_KEY, encodeSettings(withPvp)]]);

    it("draws the placement's allowance of chips and a +N chip for the rest", async () => {
      const { http } = await startOnSearch(pvpOn(), several);
      await drawn(http);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai kernel eula pvp iap");
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
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai kernel eula pvp iap");
    });

    it("draws no chip for an ignored kind, and keeps the others", async () => {
      const ignored = pvpOn().set(ALLOW_KEY, {
        all: {},
        kernel: { [DISCLOSED]: { name: "Ignored", added: NOW } },
      });
      const { http } = await startOnSearch(ignored, several);
      await drawn(http);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai eula pvp iap");
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
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai eula pvp iap");
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
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("ai kernel eula pvp iap");
      expect(chips()).toEqual([chip("ai"), chip("kernel"), chip("eula")]);
    });

    it("drops the chip and the list mark of the kind the base game is ignored for", async () => {
      const { http } = await startOnSearch(ignoring("ai"), dlc);
      await drawn(http);
      expect(http.calls).toHaveLength(1);
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("kernel eula pvp iap");
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
      expect(row(DISCLOSED)?.getAttribute("data-sar-kinds")).toBe("kernel eula pvp iap");
    });
  });

  describe("with demo rows of a full game that declares several kinds", () => {
    // Two rows become demos of ARC Raiders, which is not on the page and declares AI notes, a
    // kernel anti-cheat, a EULA, PvP and In-App Purchases; a third is a demo of another row's game.
    const GAME = 1808500;
    const SIBLING = String(SEARCH_IDS[0]);
    const ROW_DEMO = String(SEARCH_IDS[1]);
    const demos = [
      ...fixtureItems(searchItems),
      demoItem(Number(DISCLOSED), GAME),
      demoItem(Number(SIBLING), GAME),
      demoItem(Number(ROW_DEMO), SEARCH_IDS[4] ?? 0),
      itemAs(kindItems, GAME, GAME),
    ];
    const marks = (id: string) => row(id)?.getAttribute("data-sar-kinds");
    const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);
    const chips = () =>
      Array.from(
        row(DISCLOSED)?.querySelectorAll(".sar-chips > .sar-badge") ?? [],
        (element) => element.querySelector(".sar-badge-label")?.textContent,
      );
    const asked = (http: { readonly calls: readonly string[]; }) =>
      http.calls.map((url) => getItemsRequest(url).ids);
    const listing = (id: number | string): Map<string, JsonValue> =>
      new Map<string, JsonValue>([
        [ALLOW_KEY, { all: {}, ai: { [String(id)]: { name: "Ignored", added: NOW } } }],
      ]);

    /** Starts on the page and lets the throttle send the second request. */
    async function startDemos(initial = new Map<string, JsonValue>(), route?: Route) {
      const started = await startOnSearch(initial, demos, useTimerClock(), route);
      await vi.advanceTimersByTimeAsync(DEFAULT_SPACING_MS);
      return started;
    }

    it("lends the game's tags to its demo rows after one more request, for it alone", async () => {
      const { http } = await startDemos();
      await expect.poll(() => marks(DISCLOSED)).toBe("ai kernel eula pvp iap");
      expect(marks(SIBLING)).toBe("ai kernel eula pvp iap");
      expect(row(ROW_DEMO)?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(asked(http)).toStrictEqual([SEARCH_IDS, [GAME]]);
      expect(chips()).toStrictEqual([chip("ai"), chip("kernel"), chip("eula")]);
      row(DISCLOSED)?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const lines = [...document.querySelectorAll(".sar-hovercard-full-game")];
      expect(lines.map((line) => line.textContent)).toStrictEqual(
        chips().map(() => i18n.t("kind_full_game")),
      );
    });

    it.each([
      ["the game it is a demo of", GAME],
      ["the demo", DISCLOSED],
    ])("drops the lent AI chip and mark when %s is ignored for AI", async (_name, id) => {
      await startDemos(listing(id));
      await expect.poll(() => marks(DISCLOSED)).toBe("kernel eula pvp iap");
      expect(chips()).toStrictEqual([chip("kernel"), chip("eula")]);
    });

    it("follows the lent kind's switch and list filter", async () => {
      const settings = withKind(withKind(DEFAULT_SETTINGS, "ai", { filter: "hide" }), "kernel", {
        enabled: false,
      });
      await startDemos(new Map([[SETTINGS_KEY, encodeSettings(settings)]]));
      await expect.poll(() => marks(DISCLOSED)).toBe("ai kernel eula pvp iap");
      expect(chips()).toStrictEqual([chip("ai"), chip("eula")]);
      expect(getComputedStyle(row(DISCLOSED) ?? document.body).display).toBe("none");
    });

    it("asks again for a full game whose lookup failed, and lends its tags then", async () => {
      const [match, reply] = getItemsRoute(demos);
      let failed = false;
      const failingOnce: Route = [match, (url) => {
        if (!failed && getItemsRequest(url).ids.includes(GAME)) {
          failed = true;
          return "network-error";
        }
        return typeof reply === "function" ? reply(url) : reply;
      }];
      const { http } = await startDemos(new Map(), failingOnce);
      await expect.poll(() => http.calls.length).toBe(2);
      expect(row(DISCLOSED)?.hasAttribute("data-sar-kinds")).toBe(false);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
      await expect.poll(() => marks(DISCLOSED)).toBe("ai kernel eula pvp iap");
      expect(asked(http)).toStrictEqual([SEARCH_IDS, [GAME], [GAME]]);
    });
  });

  describe("with a row by a developer and a publisher the user ignored", () => {
    // The disclosed row carries ARC Raiders' kinds and the developer and publisher below; the
    // ignore lists name creators, never this game.
    const studio = [
      ...fixtureItems(searchItems),
      {
        ...itemAs(kindItems, 1808500, Number(DISCLOSED)),
        ...basicInfo({ developers: [["Dev Studio", 7]], publishers: ["Big Publisher"] }),
      },
    ];
    const ALL = "ai kernel eula pvp iap";
    const marks = () => row(DISCLOSED)?.getAttribute("data-sar-kinds") ?? "";
    const listing = (key: string, creator: string, scope: string): Map<string, JsonValue> =>
      new Map<string, JsonValue>([
        [key, { all: {}, [scope]: { [creator]: { name: "Ignored", added: NOW } } }],
      ]);

    it.each<[string, CreatorRole, string, string, string]>([
      ["a developer by clan ID, for one kind", "developer", "c:7", "ai", "kernel eula pvp iap"],
      [
        "a developer by name, for one kind",
        "developer",
        "n:Dev Studio",
        "ai",
        "kernel eula pvp iap",
      ],
      [
        "a publisher by name, for one kind",
        "publisher",
        "n:Big Publisher",
        "kernel",
        "ai eula pvp iap",
      ],
      ["a developer for all kinds", "developer", "c:7", "all", ""],
      ["the publisher's name on the developer list", "developer", "n:Big Publisher", "ai", ALL],
      ["another developer", "developer", "c:8", "ai", ALL],
    ])("draws no chip for %s", async (_name, role, creator, scope, expected) => {
      const { http } = await startOnSearch(
        listing(CREATOR_ALLOW_KEYS[role], creator, scope),
        studio,
      );
      await drawn(http);
      expect(marks()).toBe(expected);
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

  describe("with Valve's device ratings", () => {
    const [UNSUPPORTED = 0, VERIFIED = 0, UNRATED = 0, UNASKED = 0] = SEARCH_IDS;
    // The route keeps the last item of an ID, so these replace the captured rows' items.
    const rated = [
      ...fixtureItems(searchItems),
      ratedItem(UNSUPPORTED, { deck: 1, machine: 3 }),
      ratedItem(VERIFIED, { deck: 3, machine: 3 }),
      ratedItem(UNRATED, { deck: 0, machine: 0 }),
    ];
    const deckOn = withKind(DEFAULT_SETTINGS, "deck", { enabled: true });
    const stored = (value: Settings) => new Map([[SETTINGS_KEY, encodeSettings(value)]]);
    const labels = (id: number) =>
      Array.from(
        row(String(id))?.querySelectorAll(".sar-chips > .sar-badge > .sar-badge-label") ?? [],
        (label) => label.textContent,
      );
    const deckChip = (facet: CompatFacet) =>
      i18n.t("kind_facet_chip", {
        chip: i18n.t("kind_deck_chip"),
        value: i18n.t(`kind_compat_${facet}`),
      });

    it("asks for platforms once Deck turns on, for the rows on screen, and only once", async () => {
      const { http, settings } = await startOnSearch(new Map(), rated);
      await drawn(http);
      expect(requestFlags(http.calls[0] ?? "")).not.toContain("include_platforms");
      expect(labels(UNSUPPORTED)).toEqual([]);
      await writeSettings(settings, deckOn);
      // The throttle spaces requests a second apart: until the answer, the kind draws nothing.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(http.calls).toHaveLength(1);
      expect(labels(UNSUPPORTED)).toEqual([]);
      expect(row(String(UNSUPPORTED))?.hasAttribute("data-sar-kinds")).toBe(false);
      await expect.poll(() => labels(UNSUPPORTED), { timeout: 5000 }).toEqual([
        deckChip("unsupported"),
      ]);
      expect(http.calls).toHaveLength(2);
      expect(requestFlags(http.calls[1] ?? "")).toContain("include_platforms");
      expect(getItemsRequest(http.calls[1] ?? "").ids).toEqual(SEARCH_IDS);
      await writeSettings(settings, DEFAULT_SETTINGS);
      await writeSettings(settings, deckOn);
      await expect.poll(() => labels(UNSUPPORTED)).toEqual([deckChip("unsupported")]);
      expect(http.calls).toHaveLength(2);
    });

    it("draws and marks a value once it is ticked, and drops it once unticked", async () => {
      const { http, settings } = await startOnSearch(stored(deckOn), rated);
      await drawn(http);
      expect(labels(VERIFIED)).toEqual([]);
      expect(row(String(VERIFIED))?.hasAttribute("data-sar-kinds")).toBe(false);
      await writeSettings(settings, withKind(deckOn, "deck", { facets: ["verified"] }));
      await expect.poll(() => labels(VERIFIED)).toEqual([deckChip("verified")]);
      expect(row(String(VERIFIED))?.getAttribute("data-sar-kinds")).toBe("deck");
      expect(labels(UNSUPPORTED)).toEqual([]);
      await writeSettings(settings, withKind(deckOn, "deck", { facets: [] }));
      await expect.poll(() => labels(VERIFIED)).toEqual([]);
      expect(row(String(VERIFIED))?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(http.calls).toHaveLength(1);
    });

    it.each([
      ["Valve's Unknown (0)", UNRATED],
      ["an item without a platforms section", UNASKED],
    ])("never marks %s, with every value ticked and Hide on", async (_name, id) => {
      const every = withKind(deckOn, "deck", { facets: [...COMPAT_FACETS], filter: "hide" });
      const { http } = await startOnSearch(stored(every), rated);
      await drawn(http);
      expect(labels(UNSUPPORTED)).toEqual([deckChip("unsupported")]);
      expect(row(String(UNSUPPORTED))?.getAttribute("data-sar-kinds")).toBe("deck");
      expect(labels(id)).toEqual([]);
      expect(row(String(id))?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(getComputedStyle(row(String(id)) ?? document.body).display).not.toBe("none");
    });
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
      catalogs: SHIPPED_CATALOGS,
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
