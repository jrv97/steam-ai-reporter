// @vitest-environment-options {"url":"https://store.steampowered.com/search/?term=roguelike"}
import { afterEach, describe, expect, it, vi } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import searchItems from "../../tests/fixtures/getitems/search-roguelike-50.json";
import { clearRoot, setBody } from "../../tests/helpers/dom";
import { make } from "../../tests/helpers/factory";
import type { Route } from "../../tests/helpers/fake-http";
import { fake } from "../../tests/helpers/fakes";
import { getItemsRequest, itemIds, requestFlags } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { writeSettings } from "../../tests/helpers/settings";
import { loadPage } from "../../tests/helpers/surfaces";
import { T0 } from "../../tests/helpers/timer-clock";
import { type App, start } from "./app";
import type { CreatorRole } from "./creator";
import { API_BREAKER_KEY, DEFAULT_BACKOFF } from "./detect/breaker";
import { RETRY_DELAY_MS } from "./detect/retry";
import { DEFAULT_SPACING_MS } from "./detect/throttle";
import { dateFormat } from "./i18n/date-format";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import type { JsonValue } from "./json";
import { COMPAT_FACETS, type CompatFacet } from "./kinds/compat";
import { FAMILY_CATEGORY_ID } from "./kinds/family";
import type { KindId } from "./kinds/id";
import { parseOrder } from "./kinds/order";
import { KIND_BY_ID } from "./kinds/registry";
import type { Clock, SettingsSource } from "./ports";
import type { AllowScope } from "./settings/allow-data";
import { DEFAULT_SETTINGS, encodeSettings, type Settings } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, CREATOR_ALLOW_KEYS, SETTINGS_KEY } from "./storage-keys";
import { HOVER_CARD_ID } from "./ui/hover-card";
import { KIND_ATTRIBUTE } from "./ui/kind-attributes";
import { adoptPageStyles } from "./ui/styles";

const i18n = englishI18n();
const DISCLOSED = make.fixture.app.searchDisclosed;
// The captured row is in Early Access too, so it carries both tags on the default settings.
const DISCLOSED_KINDS = "ai earlyaccess";
const DISCLOSED_BADGES = DISCLOSED_KINDS.split(" ").length;
const SEARCH_IDS = make.fixture.searchRows;
const SEARCH_ITEMS = make.fixture.items(searchItems);
/** ARC Raiders declares AI notes, a kernel anti-cheat, a EULA, PvP and In-App Purchases. */
const ARC_RAIDERS = make.fixture.app.arcRaiders;
/** The marks of a row that carries ARC Raiders' item. */
const ARC_KINDS = "ai iap pvp eula kernel";

const quiet = fake.console();

let app: App | undefined;

interface StartOptions {
  readonly initial?: ReadonlyMap<string, JsonValue>;
  readonly items?: readonly unknown[];
  readonly clock?: Clock;
  readonly route?: Route;
  /** Replaces the settings source over the store. */
  readonly source?: SettingsSource;
}

async function startOnSearch(options: StartOptions = {}) {
  loadPage(make.page.surface("search"));
  return startOnLoaded(options);
}

/** Starts the app on the page the test document holds. */
async function startOnLoaded(options: StartOptions = {}) {
  const {
    initial = new Map(),
    items = SEARCH_ITEMS,
    clock = fake.clock(make.time()),
    route = make.item.route(items),
  } = options;
  document.documentElement.lang = "en";
  const store = fake.store(initial);
  const settings = createSettingsSource(store);
  const http = fake.http([route]);
  app = await start({
    document,
    http,
    store,
    settings: options.source ?? settings,
    clock,
    console: quiet,
    catalogs: SHIPPED_CATALOGS,
    addPageStyles: adoptPageStyles,
  });
  return { http, settings, store };
}

const row = (id: number | undefined) =>
  document.querySelector(`a.search_result_row[data-ds-appid="${String(id)}"]`);
const rootMark = (name: string) => document.documentElement.getAttribute(name);
/** The row's marks, empty when it has none. */
const marks = (id: number | undefined) => row(id)?.getAttribute("data-sar-kinds") ?? "";
const labels = (id: number | undefined) =>
  Array.from(
    row(id)?.querySelectorAll(".sar-chips > .sar-badge > .sar-badge-label") ?? [],
    (label) => label.textContent,
  );
const chip = (id: KindId) => i18n.t(KIND_BY_ID[id].messages.chip);
const more = (count: number) => i18n.t("kind_chip_more", { count: String(count) });
const display = (id: number | undefined) => getComputedStyle(row(id) ?? document.body).display;
const storing = (settings: Settings) =>
  new Map<string, JsonValue>([[SETTINGS_KEY, encodeSettings(settings)]]);
/** A store whose ignore list under `key` holds `keys` in `scope`. */
const ignoring = (scope: AllowScope, keys: readonly (number | string)[], key = ALLOW_KEY) =>
  new Map<string, JsonValue>([[key, make.raw.v2Allow(scope, ...keys)]]);
/** The search items with the disclosed row's item replaced: the route keeps an ID's last item. */
const withDisclosed = (item: Readonly<Record<string, unknown>>) => [...SEARCH_ITEMS, item];

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
  it.each<[string, Settings, readonly unknown[], string, number]>([
    [
      "a Deck rating Valve gave, never Valve's Unknown or a missing section",
      make.settings.kind("deck", { enabled: true }),
      [
        make.item.rated(make.appId(), { deck: 0 }),
        make.item.store(),
        make.item.rated(make.appId(), { deck: 1 }),
      ],
      i18n.t("kind_facet_name", {
        heading: i18n.t("kind_deck_heading"),
        value: i18n.t("kind_compat_unsupported"),
      }),
      2,
    ],
    [
      "a paid game Steam's features leave out, never a free game or a DLC",
      make.settings.kind("family", { enabled: true }),
      [
        make.item.featured(make.appId(), [22, 29]),
        make.item.featured(make.appId(), [22, 29], { is_free: true }),
        make.item.featured(make.appId(), [22, 29], { type: 4 }),
        make.item.store(),
      ],
      i18n.t("kind_family_unsupported"),
      3,
    ],
    [
      "a game's AI disclosure",
      DEFAULT_SETTINGS,
      [make.item.disclosed(), make.item.store(), make.item.store()],
      i18n.t("kind_ai_heading"),
      3,
    ],
  ])("sums up %s above the included games, from one request", async (
    _name,
    settings,
    items,
    kind,
    games,
  ) => {
    setBody(make.page.package(itemIds(items)));
    const { http } = await startOnLoaded({ initial: storing(settings), items });
    const lines = () => document.querySelectorAll(".sar-summary .sar-summary-line");
    await expect.poll(() => lines()[0]?.textContent).toBe(
      i18n.plural("badge_summary_games", games, { kind, tagged: "1" }),
    );
    expect(lines()).toHaveLength(1);
    expect(http.calls).toHaveLength(1);
  });
});

describe("start on the search page", () => {
  it("badges the disclosed row after one GetItems request for the page", async () => {
    const { http } = await startOnSearch();
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(DISCLOSED_BADGES);

    expect(http.calls).toHaveLength(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual(SEARCH_IDS);
    const badge = row(DISCLOSED)?.querySelector(".search_name > .title + .sar-chips > .sar-badge");
    expect(badge?.querySelector(".sar-badge-label")?.textContent).toBe(chip("ai"));
    expect(marks(DISCLOSED)).toBe(DISCLOSED_KINDS);
    const others = SEARCH_IDS.filter((id) => id !== DISCLOSED);
    expect(others.map((id) => row(id)?.hasAttribute("data-sar-kinds"))).toEqual(
      others.map(() => false),
    );
    expect(document.adoptedStyleSheets.length).toBeGreaterThan(0);
  });

  it("switches one kind to hide mode with one root attribute per setting", async () => {
    const { settings } = await startOnSearch();
    await expect.poll(() => marks(DISCLOSED)).toBe(DISCLOSED_KINDS);
    expect(rootMark("data-sar-filter-ai")).toBe("off");

    await writeSettings(settings, make.settings.kind("ai", { filter: "hide", badge: false }));
    expect(rootMark("data-sar-filter-ai")).toBe("hide");
    expect(rootMark("data-sar-filter-kernel")).toBe("off");
    expect(display(DISCLOSED)).toBe("none");
    expect(display(SEARCH_IDS[0])).not.toBe("none");
  });

  it("counts the hidden row and shows it again without touching the settings", async () => {
    const { settings, store } = await startOnSearch();
    await writeSettings(settings, make.settings.kind("ai", { filter: "hide" }));
    const stored = await store.get([SETTINGS_KEY]);
    const line = () => document.querySelector(".sar-list-notice-text")?.textContent;
    await expect.poll(line).toBe(i18n.plural("notice_list_hidden", 1));

    document.querySelector<HTMLButtonElement>(".sar-list-notice-button")?.click();
    expect(display(DISCLOSED)).not.toBe("none");
    expect(line()).toBe(i18n.plural("notice_list_revealed", 1));
    expect(await store.get([SETTINGS_KEY])).toStrictEqual(stored);
  });

  it("asks again once a breaker left open by a past page closes, and tags every row", async () => {
    const until = T0 + DEFAULT_BACKOFF.baseMs + DEFAULT_BACKOFF.jitterMs;
    const { http } = await startOnSearch({
      initial: new Map([[API_BREAKER_KEY, { until }]]),
      items: SEARCH_IDS.map((id) => make.item.disclosed(id)),
      clock: fake.timerClock(),
    });
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1000);
    expect(http.calls).toHaveLength(0);
    expect(document.querySelectorAll("[data-sar-kinds]")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(http.calls).toHaveLength(1);
    await expect.poll(() => SEARCH_IDS.map(marks)).toEqual(SEARCH_IDS.map(() => "ai"));
  });

  describe("with a game that discloses several kinds", () => {
    // ARC Raiders' item replaces the disclosed row's item.
    const several = withDisclosed(make.fixture.itemAs(kindItems, ARC_RAIDERS, DISCLOSED));
    // PvP starts off, so these tests turn it on in the stored settings. In-App Purchases stays off:
    // its mark is on the row, which no filter of a kind that is off matches, and it draws no chip.
    const withPvp = make.settings.kind("pvp", { enabled: true });
    const ownText = make.chipText();

    it("draws the placement's allowance of chips and a +N chip for the rest", async () => {
      const { http } = await startOnSearch({ initial: storing(withPvp), items: several });
      await drawn(http);
      expect(marks(DISCLOSED)).toBe(ARC_KINDS);
      expect(labels(DISCLOSED)).toEqual([chip("ai"), chip("pvp"), chip("eula"), more(1)]);
    });

    it.each<[string, Settings, readonly string[]]>([
      [
        "when a kind's badges are switched off",
        make.settings.kind("kernel", { badge: false }, withPvp),
        [chip("ai"), chip("pvp"), chip("eula")],
      ],
      [
        "in a new tag order, the allowance from its start",
        { ...withPvp, order: parseOrder(["pvp", "eula"]) },
        [chip("pvp"), chip("eula"), chip("ai"), more(1)],
      ],
      [
        "with the person's chip text",
        make.settings.chipText({ pvp: { chip: ownText } }, withPvp),
        [chip("ai"), ownText, chip("eula"), more(1)],
      ],
    ])("draws the chips again %s, with the same marks", async (_name, changed, expected) => {
      const { http, settings } = await startOnSearch({ initial: storing(withPvp), items: several });
      await drawn(http);
      await writeSettings(settings, changed);
      await expect.poll(() => labels(DISCLOSED)).toEqual(expected);
      expect(marks(DISCLOSED)).toBe(ARC_KINDS);
    });

    it("draws no chip for an ignored kind, and keeps the others", async () => {
      const initial = storing(withPvp).set(ALLOW_KEY, make.raw.v2Allow("kernel", DISCLOSED));
      const { http } = await startOnSearch({ initial, items: several });
      await drawn(http);
      expect(marks(DISCLOSED)).toBe("ai iap pvp eula");
      expect(labels(DISCLOSED)).toEqual([chip("ai"), chip("pvp"), chip("eula")]);
    });

    it("leaves the row alone when the kind that would hide it is ignored", async () => {
      const filters = make.settings.kind(
        "ai",
        { filter: "dim" },
        make.settings.kind("kernel", { filter: "hide" }),
      );
      const initial = storing(filters).set(ALLOW_KEY, make.raw.v2Allow("kernel", DISCLOSED));
      const { http } = await startOnSearch({ initial, items: several });
      await drawn(http);
      expect(marks(DISCLOSED)).toBe("ai iap pvp eula");
      expect(display(DISCLOSED)).not.toBe("none");
    });

    it("hides the row when any of its kinds hides, whatever the others do", async () => {
      const { http, settings } = await startOnSearch({ initial: storing(withPvp), items: several });
      await drawn(http);
      const dimAi = make.settings.kind("ai", { filter: "dim" }, withPvp);
      await writeSettings(settings, make.settings.kind("pvp", { filter: "hide" }, dimAi));
      expect(display(DISCLOSED)).toBe("none");
    });
  });

  describe("with a DLC row of a game the user ignored", () => {
    // The disclosed row is a DLC of ARC Raiders: Steam's item names the base game, as the
    // captured DLC does (dlc-parent.json). Nothing lists the DLC.
    const dlc = withDisclosed({
      ...make.fixture.itemAs(kindItems, ARC_RAIDERS, DISCLOSED),
      related_items: { parent_appid: ARC_RAIDERS },
    });
    const fewer = "iap pvp eula kernel";

    it.each<[string, ReadonlyMap<string, JsonValue>, string, readonly string[]]>([
      [
        "draws every chip while the base game is not ignored",
        new Map(),
        ARC_KINDS,
        [chip("ai"), chip("eula"), chip("kernel")],
      ],
      [
        "drops the chip and the list mark of the kind the base game is ignored for",
        ignoring("ai", [ARC_RAIDERS]),
        fewer,
        [chip("eula"), chip("kernel")],
      ],
      [
        "marks nothing for a base game ignored for all kinds",
        ignoring("all", [ARC_RAIDERS]),
        "",
        [],
      ],
      [
        "draws a DLC whose own entry is ignored without touching its base game",
        ignoring("ai", [DISCLOSED]),
        fewer,
        [chip("eula"), chip("kernel")],
      ],
    ])("%s, from one request", async (_name, initial, expectedMarks, expectedChips) => {
      const { http } = await startOnSearch({ initial, items: dlc });
      await drawn(http);
      expect(http.calls).toHaveLength(1);
      expect(marks(DISCLOSED)).toBe(expectedMarks);
      expect(labels(DISCLOSED)).toEqual(expectedChips);
    });

    it("leaves the row when the kind that would hide it is ignored for its base game", async () => {
      const initial = ignoring("ai", [ARC_RAIDERS]).set(
        SETTINGS_KEY,
        encodeSettings(make.settings.kind("ai", { filter: "hide" })),
      );
      const { http } = await startOnSearch({ initial, items: dlc });
      await drawn(http);
      expect(rootMark("data-sar-filter-ai")).toBe("hide");
      expect(display(DISCLOSED)).not.toBe("none");
    });
  });

  describe("with demo rows of a full game that declares several kinds", () => {
    // Two rows become demos of ARC Raiders, which is not on the page; a third is a demo of
    // another row's game.
    const [SIBLING = make.appId(), ROW_DEMO = make.appId(), , , ROW_GAME = make.appId()] =
      SEARCH_IDS;
    const demos = [
      ...SEARCH_ITEMS,
      make.item.demo(DISCLOSED, ARC_RAIDERS),
      make.item.demo(SIBLING, ARC_RAIDERS),
      make.item.demo(ROW_DEMO, ROW_GAME),
      make.fixture.itemAs(kindItems, ARC_RAIDERS, ARC_RAIDERS),
    ];
    const asked = (http: { readonly calls: readonly string[]; }) =>
      http.calls.map((url) => getItemsRequest(url).ids);

    /** Starts on the page and lets the throttle send the second request. */
    async function startDemos(initial = new Map<string, JsonValue>(), route?: Route) {
      const started = await startOnSearch({
        initial,
        items: demos,
        clock: fake.timerClock(),
        ...(route === undefined ? {} : { route }),
      });
      await vi.advanceTimersByTimeAsync(DEFAULT_SPACING_MS);
      return started;
    }

    it("lends the game's tags to its demo rows after one more request, for it alone", async () => {
      const { http } = await startDemos();
      await expect.poll(() => marks(DISCLOSED)).toBe(ARC_KINDS);
      expect(marks(SIBLING)).toBe(ARC_KINDS);
      expect(row(ROW_DEMO)?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(asked(http)).toStrictEqual([SEARCH_IDS, [ARC_RAIDERS]]);
      expect(labels(DISCLOSED)).toStrictEqual([chip("ai"), chip("eula"), chip("kernel")]);
      row(DISCLOSED)?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const lines = [...document.querySelectorAll(".sar-hovercard-full-game")];
      expect(lines.map((line) => line.textContent)).toStrictEqual(
        labels(DISCLOSED).map(() => i18n.t("kind_full_game")),
      );
    });

    it.each([
      ["the game it is a demo of", ARC_RAIDERS],
      ["the demo", DISCLOSED],
    ])("drops the lent AI chip and mark when %s is ignored for AI", async (_name, id) => {
      await startDemos(ignoring("ai", [id]));
      await expect.poll(() => marks(DISCLOSED)).toBe("iap pvp eula kernel");
      expect(labels(DISCLOSED)).toStrictEqual([chip("eula"), chip("kernel")]);
    });

    it("follows the lent kind's switch and list filter", async () => {
      const settings = make.settings.kind(
        "kernel",
        { enabled: false },
        make.settings.kind("ai", { filter: "hide" }),
      );
      await startDemos(storing(settings));
      await expect.poll(() => marks(DISCLOSED)).toBe(ARC_KINDS);
      expect(labels(DISCLOSED)).toStrictEqual([chip("ai"), chip("eula")]);
      expect(display(DISCLOSED)).toBe("none");
    });

    it("asks again for a full game whose lookup failed, and lends its tags then", async () => {
      const [match, reply] = make.item.route(demos);
      let failed = false;
      const failingOnce: Route = [match, (url) => {
        if (!failed && getItemsRequest(url).ids.includes(ARC_RAIDERS)) {
          failed = true;
          return "network-error";
        }
        return typeof reply === "function" ? reply(url) : reply;
      }];
      const { http } = await startDemos(new Map(), failingOnce);
      await expect.poll(() => http.calls.length).toBe(2);
      expect(row(DISCLOSED)?.hasAttribute("data-sar-kinds")).toBe(false);
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
      await expect.poll(() => marks(DISCLOSED)).toBe(ARC_KINDS);
      expect(asked(http)).toStrictEqual([SEARCH_IDS, [ARC_RAIDERS], [ARC_RAIDERS]]);
    });
  });

  describe("with a row by a developer and a publisher the user ignored", () => {
    // The disclosed row carries ARC Raiders' kinds and the developer and publisher below; the
    // ignore lists name creators, never this game.
    const developer = make.text.creator();
    const clan = make.creator.clan();
    const publisher = make.text.creator();
    const studio = withDisclosed({
      ...make.fixture.itemAs(kindItems, ARC_RAIDERS, DISCLOSED),
      ...make.item.creators({ developers: [[developer, clan]], publishers: [publisher] }),
    });

    it.each<[string, CreatorRole, string, AllowScope, string]>([
      [
        "a developer by clan ID, for one kind",
        "developer",
        `c:${String(clan)}`,
        "ai",
        "iap pvp eula kernel",
      ],
      [
        "a developer by name, for one kind",
        "developer",
        `n:${developer}`,
        "ai",
        "iap pvp eula kernel",
      ],
      [
        "a publisher by name, for one kind",
        "publisher",
        `n:${publisher}`,
        "kernel",
        "ai iap pvp eula",
      ],
      ["a developer for all kinds", "developer", `c:${String(clan)}`, "all", ""],
      [
        "the publisher's name on the developer list",
        "developer",
        `n:${publisher}`,
        "ai",
        ARC_KINDS,
      ],
      ["another developer", "developer", `c:${String(make.creator.clan())}`, "ai", ARC_KINDS],
    ])("draws no chip for %s", async (_name, role, creator, scope, expected) => {
      const initial = ignoring(scope, [creator], CREATOR_ALLOW_KEYS[role]);
      const { http } = await startOnSearch({ initial, items: studio });
      await drawn(http);
      expect(marks(DISCLOSED)).toBe(expected);
    });
  });

  it.each<[string, AllowScope, string, readonly string[]]>([
    ["one kind", "ai", "earlyaccess", ["earlyaccess"]],
    ["all kinds", "all", "", []],
  ])("leaves out what a game is ignored for (%s), in lists and on badges", async (
    _name,
    scope,
    expectedMarks,
    badgeKinds,
  ) => {
    const { http } = await startOnSearch({ initial: ignoring(scope, [DISCLOSED]) });
    await drawn(http);
    expect(marks(DISCLOSED)).toBe(expectedMarks);
    const badges = [...document.querySelectorAll(".sar-badge")];
    expect(badges.map((badge) => badge.getAttribute(KIND_ATTRIBUTE))).toEqual(badgeKinds);
  });

  it("shows no badge and filters nothing while the kind is disabled", async () => {
    const { settings } = await startOnSearch();
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(DISCLOSED_BADGES);
    await writeSettings(settings, make.settings.kind("ai", { enabled: false, filter: "hide" }));
    expect(rootMark("data-sar-filter-ai")).toBe("off");
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(1);
    expect(document.querySelector(".sar-badge")?.getAttribute(KIND_ATTRIBUTE)).toBe("earlyaccess");
    await writeSettings(settings, DEFAULT_SETTINGS);
    expect(rootMark("data-sar-filter-ai")).toBe("off");
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(DISCLOSED_BADGES);
  });

  describe("with the early access kind", () => {
    const note = make.text.note();
    const released = make.fixture.released;
    const flagged = withDisclosed(make.item.earlyAccess(DISCLOSED, { note, released }));

    it.each([
      ["on", DEFAULT_SETTINGS, true],
      ["off", make.settings.kind("earlyaccess", { enabled: false }), false],
    ])("sends include_release only while the kind is %s", async (_state, value, sent) => {
      const { http } = await startOnSearch({ initial: storing(value), items: flagged });
      await drawn(http);
      expect(requestFlags(http.calls[0] ?? "").includes("include_release")).toBe(sent);
    });

    it("leaves the latest update post out of a list card, whatever the page holds", async () => {
      loadPage(make.page.surface("search"));
      const script = document.createElement("script");
      script.textContent = make.page.lastUpdateScript;
      document.body.append(script);
      const { http } = await startOnLoaded({ items: flagged });
      await drawn(http);
      await expect.poll(() => marks(DISCLOSED)).toBe("earlyaccess");
      row(DISCLOSED)?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const entry = document.querySelector(`#${HOVER_CARD_ID} .sar-hovercard-entry`);
      expect(Array.from(entry?.children ?? [], (line) => line.textContent)).toEqual([
        i18n.t("kind_earlyaccess_heading"),
        note,
        i18n.t("kind_earlyaccess_released", {
          date: dateFormat(i18n.locale).format(released * 1000),
        }),
      ]);
    });
  });

  describe("with Valve's device ratings", () => {
    const [
      UNSUPPORTED = make.appId(),
      VERIFIED = make.appId(),
      UNRATED = make.appId(),
      UNASKED = make.appId(),
    ] = SEARCH_IDS;
    // The route keeps the last item of an ID, so these replace the captured rows' items.
    const rated = [
      ...SEARCH_ITEMS,
      make.item.rated(UNSUPPORTED, { deck: 1, machine: 3 }),
      make.item.rated(VERIFIED, { deck: 3, machine: 3 }),
      make.item.rated(UNRATED, { deck: 0, machine: 0 }),
    ];
    const deckOn = make.settings.kind("deck", { enabled: true });
    const deckChip = (facet: CompatFacet) =>
      i18n.t("kind_facet_chip", {
        chip: i18n.t("kind_deck_chip"),
        value: i18n.t(`kind_compat_${facet}`),
      });

    it("asks for platforms once Deck turns on, for the rows on screen, and only once", async () => {
      const { http, settings } = await startOnSearch({ items: rated });
      await drawn(http);
      expect(requestFlags(http.calls[0] ?? "")).not.toContain("include_platforms");
      expect(labels(UNSUPPORTED)).toEqual([]);
      await writeSettings(settings, deckOn);
      // The throttle spaces requests a second apart: until the answer, the kind draws nothing.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(http.calls).toHaveLength(1);
      expect(labels(UNSUPPORTED)).toEqual([]);
      expect(row(UNSUPPORTED)?.hasAttribute("data-sar-kinds")).toBe(false);
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
      const { http, settings } = await startOnSearch({ initial: storing(deckOn), items: rated });
      await drawn(http);
      expect(labels(VERIFIED)).toEqual([]);
      expect(row(VERIFIED)?.hasAttribute("data-sar-kinds")).toBe(false);
      await writeSettings(settings, make.settings.kind("deck", { facets: ["verified"] }, deckOn));
      await expect.poll(() => labels(VERIFIED)).toEqual([deckChip("verified")]);
      expect(marks(VERIFIED)).toBe("deck");
      expect(labels(UNSUPPORTED)).toEqual([]);
      await writeSettings(settings, make.settings.kind("deck", { facets: [] }, deckOn));
      await expect.poll(() => labels(VERIFIED)).toEqual([]);
      expect(row(VERIFIED)?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(http.calls).toHaveLength(1);
    });

    it.each([
      ["Valve's Unknown (0)", UNRATED],
      ["an item without a platforms section", UNASKED],
    ])("never marks %s, with every value ticked and Hide on", async (_name, id) => {
      const every = make.settings.kind(
        "deck",
        { facets: [...COMPAT_FACETS], filter: "hide" },
        deckOn,
      );
      const { http } = await startOnSearch({ initial: storing(every), items: rated });
      await drawn(http);
      expect(labels(UNSUPPORTED)).toEqual([deckChip("unsupported")]);
      expect(marks(UNSUPPORTED)).toBe("deck");
      expect(labels(id)).toEqual([]);
      expect(row(id)?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(display(id)).not.toBe("none");
    });
  });

  describe("with the family kind", () => {
    const [
      UNLISTED = make.appId(),
      LISTED = make.appId(),
      FREE = make.appId(),
      DLC = make.appId(),
      NO_LIST = make.appId(),
    ] = SEARCH_IDS;
    // No In-App Purchases (35), which would add its own token to the host.
    const PAID_FEATURES = [22, 29, 41, 42];
    // The route keeps the last item of an ID, so these replace the captured rows' items.
    const featured = [
      ...SEARCH_ITEMS,
      make.item.featured(UNLISTED, PAID_FEATURES),
      make.item.featured(LISTED, [...PAID_FEATURES, FAMILY_CATEGORY_ID]),
      make.item.featured(FREE, PAID_FEATURES, { is_free: true }),
      make.item.featured(DLC, PAID_FEATURES, { type: 4 }),
      make.item.store(NO_LIST),
    ];
    const familyOn = make.settings.kind("family", { enabled: true });
    const chips = (id: number) =>
      Array.from(
        row(id)?.querySelectorAll(".sar-chips > .sar-badge") ?? [],
        (badge) => Array.from(badge.children, (part) => part.textContent),
      );
    const unlistedChip = i18n.t("kind_family_unsupported_chip");
    const unlisted = [
      unlistedChip,
      i18n.t("kind_chip_name", { chip: unlistedChip, heading: i18n.t("kind_family_unsupported") }),
    ];

    it("tags a paid game its features leave out, with no new flag", async () => {
      const { http } = await startOnSearch({ initial: storing(familyOn), items: featured });
      await drawn(http);
      expect(chips(UNLISTED)).toEqual([unlisted]);
      expect(marks(UNLISTED)).toBe("family");
      expect(requestFlags(http.calls[0] ?? "")).toEqual([
        "include_extra_details",
        "include_basic_info",
        "include_release",
      ]);
    });

    it("draws and marks the listed value once ticked, and drops it once unticked", async () => {
      const { http, settings } = await startOnSearch({
        initial: storing(familyOn),
        items: featured,
      });
      await drawn(http);
      expect(chips(LISTED)).toEqual([]);
      await writeSettings(
        settings,
        make.settings.kind("family", { facets: ["supported"] }, familyOn),
      );
      await expect.poll(() => chips(LISTED)).toEqual([
        [i18n.t("kind_family_heading"), i18n.t("kind_family_heading")],
      ]);
      expect(chips(UNLISTED)).toEqual([]);
      await writeSettings(settings, make.settings.kind("family", { facets: [] }, familyOn));
      await expect.poll(() => chips(LISTED)).toEqual([]);
      expect(row(LISTED)?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(http.calls).toHaveLength(1);
    });

    it.each([
      ["a free game", FREE],
      ["a DLC", DLC],
      ["an item without a feature list", NO_LIST],
    ])("never marks %s, with every value ticked and Hide on", async (_name, id) => {
      const every = make.settings.kind(
        "family",
        { facets: ["supported", "unsupported"], filter: "hide" },
        familyOn,
      );
      const { http } = await startOnSearch({ initial: storing(every), items: featured });
      await drawn(http);
      expect(chips(UNLISTED)).toEqual([unlisted]);
      expect(chips(id)).toEqual([]);
      expect(row(id)?.hasAttribute("data-sar-kinds")).toBe(false);
      expect(display(id)).not.toBe("none");
    });
  });

  describe("with a custom tag color", () => {
    const property = "--sar-kind-color-ai";
    const colorOnRoot = () => document.documentElement.style.getPropertyValue(property);
    const badges = () => document.querySelectorAll(".sar-badge").length;

    it("sets nothing by default, so the badges keep the violet", async () => {
      await startOnSearch();
      await expect.poll(badges).toBe(DISCLOSED_BADGES);
      expect(colorOnRoot()).toBe("");
      expect(document.documentElement.hasAttribute("style")).toBe(false);
    });

    it("applies a stored color at start as one root property", async () => {
      const color = make.color();
      await startOnSearch({ initial: storing(make.settings.kind("ai", { color })) });
      await expect.poll(badges).toBe(DISCLOSED_BADGES);
      expect(colorOnRoot()).toBe(color);
      expect(document.querySelector(".sar-badge")?.getAttribute(KIND_ATTRIBUTE)).toBe("ai");
      expect(document.querySelector(".sar-badge")?.hasAttribute("style")).toBe(false);
      expect(document.querySelector(".sar-chips")?.hasAttribute("style")).toBe(false);
    });

    it("follows a change and its removal without drawing a badge again", async () => {
      const [first, second] = [make.color(), make.color()];
      const { settings } = await startOnSearch();
      await expect.poll(badges).toBe(DISCLOSED_BADGES);
      const badge = document.querySelector(".sar-badge");
      await writeSettings(settings, make.settings.kind("ai", { color: first }));
      expect(colorOnRoot()).toBe(first);
      await writeSettings(settings, make.settings.kind("ai", { color: second }));
      expect(colorOnRoot()).toBe(second);
      await writeSettings(settings, DEFAULT_SETTINGS);
      expect(colorOnRoot()).toBe("");
      expect(document.querySelector(".sar-badge")).toBe(badge);
    });

    it("keeps the other kinds on the default", async () => {
      const color = make.color();
      const { settings } = await startOnSearch();
      await writeSettings(settings, make.settings.kind("drm", { color }));
      expect(document.documentElement.style.getPropertyValue("--sar-kind-color-drm")).toBe(color);
      expect(colorOnRoot()).toBe("");
    });
  });

  it("logs a settings read that fails and starts on the defaults", async () => {
    quiet.error.mockClear();
    const problem = new Error();
    await startOnSearch({
      source: { read: () => Promise.reject(problem), subscribe: () => () => undefined },
    });
    expect(quiet.error).toHaveBeenCalledWith(
      expect.any(String),
      i18n.t("error_unexpected"),
      problem,
    );
    expect(rootMark("data-sar-filter-ai")).toBe("off");
    await expect.poll(() => document.querySelectorAll(".sar-badge").length).toBe(DISCLOSED_BADGES);
  });

  it("starts on the settings and the ignored games a v1 install stored", async () => {
    const { http, store } = await startOnSearch({
      initial: new Map<string, JsonValue>([
        ["v1:settings", make.raw.v1Settings({ badges: false, listFilter: "dim" })],
        ["v1:allow", make.raw.v1Allow({ [String(DISCLOSED)]: make.raw.allowEntry() })],
      ]),
    });
    await drawn(http);
    // The v1 install knew the AI kind only, so the row keeps its Early Access tag.
    expect(marks(DISCLOSED)).toBe("earlyaccess");
    expect(rootMark("data-sar-filter-ai")).toBe("dim");
    expect(rootMark("data-sar-filter-kernel")).toBe("off");
    const keys = await store.keys();
    expect(keys).toContain("v2:settings");
    expect(keys).toContain("v2:allow");
    expect(keys).toContain("v1:settings");
    expect(keys).toContain("v1:allow");
  });
});
