// @vitest-environment-options {"url":"https://store.steampowered.com/app/5072580/"}
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import mixedStates from "../../tests/fixtures/getitems/mixed-states.json";
import { APP_PAGES } from "../../tests/helpers/app-page";
import { basicInfo } from "../../tests/helpers/creators";
import { clearRoot } from "../../tests/helpers/dom";
import { fakeHttp, type Route } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRequest, getItemsRoute, itemAs } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { withKind, writeSettings } from "../../tests/helpers/settings";
import { loadPage } from "../../tests/helpers/surfaces";
import { T0, useTimerClock } from "../../tests/helpers/timer-clock";
import { type App, start } from "./app";
import type { CreatorRole } from "./creator";
import { API_BREAKER_KEY } from "./detect/breaker";
import { GETITEMS_URL } from "./detect/getitems";
import { RETRY_DELAY_MS } from "./detect/retry";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import type { JsonValue } from "./json";
import type { Clock, Http } from "./ports";
import { DEFAULT_SETTINGS, encodeSettings } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, CREATOR_ALLOW_KEYS, SETTINGS_KEY } from "./storage-keys";
import { adoptPageStyles } from "./ui/styles";

const i18n = englishI18n();
const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
  clearRoot();
  vi.useRealTimers();
});

const AllowSchema = v.object({
  all: v.record(v.string(), v.unknown()),
  ai: v.record(v.string(), v.unknown()),
});

const CreatorAllowSchema = v.optional(v.record(v.string(), v.record(v.string(), v.unknown())), {});

const banner = () => document.getElementById("sar-banner")?.shadowRoot ?? null;
const control = (selector: string) => banner()?.querySelector<HTMLElement>(selector);
const headings = () =>
  [...(banner()?.querySelectorAll("h2") ?? [])].map((heading) => heading.textContent);

interface StartOptions {
  readonly route?: Route;
  readonly initial?: ReadonlyMap<string, JsonValue>;
  /** Holds every request until `release` is called. */
  readonly held?: boolean;
  readonly clock?: Clock;
}

async function startOnAiPage(options: StartOptions = {}) {
  const { route = getItemsRoute(fixtureItems(mixedStates)), initial = new Map() } = options;
  loadPage(APP_PAGES["5072580-ai-first.html"]);
  document.documentElement.lang = "en";
  const store = memoryStore(initial);
  const settings = createSettingsSource(store);
  const inner = fakeHttp([route]);
  const requested: string[] = [];
  let release = (): void => undefined;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  const http: Http = {
    async get(url) {
      requested.push(url);
      if (options.held === true) {
        await open;
      }
      return inner.get(url);
    },
  };
  app = await start({
    document,
    http,
    store,
    settings,
    clock: options.clock ?? fixedClock(0),
    console: quiet,
    catalogs: SHIPPED_CATALOGS,
    addPageStyles: adoptPageStyles,
  });
  const stored = async () => v.parse(AllowSchema, (await store.get([ALLOW_KEY])).get(ALLOW_KEY));
  /** The keys of a role's ignore list in a scope; none while the list was never written. */
  const storedCreators = async (role: CreatorRole, scope: string) => {
    const key = CREATOR_ALLOW_KEYS[role];
    const lists = v.parse(CreatorAllowSchema, (await store.get([key])).get(key));
    return Object.keys(lists[scope] ?? {});
  };
  return { http: { calls: requested }, settings, stored, storedCreators, release };
}

describe("start on an English app page", () => {
  it("shows the AI banner from the page at once and does not wait for GetItems", async () => {
    const { http, release } = await startOnAiPage({ held: true });

    await expect.poll(() => http.calls.length).toBe(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual([5072580]);
    const column = document.querySelector(".game_description_column");
    expect(column?.firstElementChild?.id).toBe("sar-banner");
    expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
    expect(banner()?.querySelector("blockquote")?.textContent).not.toBe("");
    expect(banner()?.querySelector(".sar-banner-service")).toBeNull();
    release();
    await expect.poll(() => banner()?.querySelector(".sar-banner-service")?.textContent).toContain(
      i18n.t("badge_card_service_label"),
    );
  });

  it("asks GetItems once for the game and never fetches the page that is open", async () => {
    const { http } = await startOnAiPage({ route: getItemsRoute([]) });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toContain("GetItems");
    expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
  });

  it("keeps the AI banner from the page when GetItems cannot answer", async () => {
    await startOnAiPage({ route: [GETITEMS_URL, "network-error"] });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
  });

  it("asks GetItems again once a breaker left open by a past page closes", async () => {
    const { http } = await startOnAiPage({
      initial: new Map([[API_BREAKER_KEY, { until: T0 + 65_000 }]]),
      clock: useTimerClock(),
    });
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1000);
    expect(http.calls).toHaveLength(0);
    expect(banner()?.querySelector(".sar-banner-service")).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(http.calls).toHaveLength(1);
    await expect.poll(() => banner()?.querySelector(".sar-banner-service")?.textContent).toContain(
      i18n.t("badge_card_service_label"),
    );
  });

  it("logs a disagreement in debug mode and keeps the disclosure of the page", async () => {
    quiet.debug.mockClear();
    const none = itemAs(mixedStates, 413150, 5072580);
    const initial = new Map<string, JsonValue>([
      [SETTINGS_KEY, encodeSettings({ ...DEFAULT_SETTINGS, debug: true })],
    ]);
    await startOnAiPage({ route: getItemsRoute([none]), initial });

    await expect.poll(() => quiet.debug.mock.calls.length).toBeGreaterThan(0);
    expect(quiet.debug).toHaveBeenCalledWith(
      expect.any(String),
      i18n.t("notice_page_disagrees", {
        kind: "ai",
        app: "5072580",
        page: "disclosed",
        data: "not-disclosed",
      }),
    );
    expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
  });

  it("ignores the AI kind from its entry and brings it back with Undo", async () => {
    const { stored } = await startOnAiPage();

    control('.sar-banner-action[data-sar-scope="ai"]')?.click();
    await expect.poll(() => control('[data-sar-action="undo"]')?.getAttribute("data-sar-scope"))
      .toBe("ai");
    expect(Object.keys((await stored()).ai)).toEqual(["5072580"]);
    expect(Object.keys((await stored()).all)).toEqual([]);
    expect(banner()?.querySelector("aside")?.getAttribute("data-sar-variant")).toBe("ignored");

    control('[data-sar-action="undo"]')?.click();
    await expect.poll(() => banner()?.querySelector("blockquote") !== null).toBe(true);
    expect(Object.keys((await stored()).ai)).toEqual([]);
  });

  it("ignores the game for all tags from the link below the entries", async () => {
    const { stored } = await startOnAiPage();

    control('.sar-banner-foot [data-sar-action="ignore"]')?.click();
    await expect.poll(() => control(".sar-banner-ignored-text")?.textContent).toBe(
      i18n.t("banner_ignored"),
    );
    expect(Object.keys((await stored()).all)).toEqual(["5072580"]);
    expect(Object.keys((await stored()).ai)).toEqual([]);
  });

  describe("with a developer and a publisher", () => {
    // The open page's item names Dev Studio (clan 7) and Big Publisher (no clan ID).
    const studio = {
      ...itemAs(mixedStates, 5072580, 5072580),
      ...basicInfo({ developers: [["Dev Studio", 7]], publishers: ["Big Publisher"] }),
    };
    const rows = () => [...(banner()?.querySelectorAll(".sar-banner-creator") ?? [])];
    const ignoreButton = (row: number, scope: string) =>
      rows()[row]?.querySelector<HTMLElement>(`button[data-sar-scope="${scope}"]`);

    it("lists them once Steam's data arrives, and not before", async () => {
      const { release } = await startOnAiPage({ route: getItemsRoute([studio]), held: true });
      expect(banner()?.querySelector("details")).toBeNull();
      release();
      await expect.poll(() => rows().length).toBe(2);
      expect(rows().map((row) => row.querySelector(".sar-banner-creator-name")?.textContent))
        .toEqual(["Dev Studio", "Big Publisher"]);
    });

    it("ignores the developer for AI by clan ID and brings it back with Undo", async () => {
      const { storedCreators } = await startOnAiPage({ route: getItemsRoute([studio]) });
      await expect.poll(() => rows().length).toBe(2);

      ignoreButton(0, "ai")?.click();
      await expect.poll(() => control('[data-sar-action="undo-creator"]')).not.toBeNull();
      expect(await storedCreators("developer", "ai")).toEqual(["c:7"]);
      expect(await storedCreators("publisher", "ai")).toEqual([]);
      expect(headings()).toEqual([]);
      expect(control(".sar-banner-ignored-text")?.textContent).toBe(
        i18n.t("banner_ignored_creator_kind", {
          name: "Dev Studio",
          role: i18n.t("banner_role_developer"),
          heading: i18n.t("kind_ai_heading"),
        }),
      );

      control('[data-sar-action="undo-creator"]')?.click();
      await expect.poll(() => headings()).toEqual([i18n.t("kind_ai_heading")]);
      expect(await storedCreators("developer", "ai")).toEqual([]);
    });

    it("ignores the publisher for all tags by name when Steam sends no clan ID", async () => {
      const { storedCreators } = await startOnAiPage({ route: getItemsRoute([studio]) });
      await expect.poll(() => rows().length).toBe(2);

      ignoreButton(1, "all")?.click();
      await expect.poll(() => control('[data-sar-action="undo-creator"]')).not.toBeNull();
      expect(await storedCreators("publisher", "all")).toEqual(["n:Big Publisher"]);
      expect(await storedCreators("developer", "all")).toEqual([]);
    });

    it("applies a stored developer ignore at once, with its note and Undo", async () => {
      const initial = new Map<string, JsonValue>([
        [CREATOR_ALLOW_KEYS.developer, {
          all: {},
          ai: { "c:7": { name: "Dev Studio", added: 0 } },
        }],
      ]);
      await startOnAiPage({ route: getItemsRoute([studio]), initial });
      await expect.poll(() => control('[data-sar-action="undo-creator"]')).not.toBeNull();
      expect(headings()).toEqual([]);
      expect(document.querySelector(".sar-tag-section")).toBeNull();
    });
  });

  describe("on the page of a DLC", () => {
    const BASE = "1938090";
    // The open page (5072580) is a DLC of 1938090: Steam's data names its base game.
    const dlc = {
      ...itemAs(mixedStates, 5072580, 5072580),
      type: 4,
      related_items: { parent_appid: Number(BASE) },
    };
    const ignoredFor = (kind: string): ReadonlyMap<string, JsonValue> =>
      new Map<string, JsonValue>([
        [ALLOW_KEY, { all: {}, [kind]: { [BASE]: { name: "Base game", added: 0 } } }],
      ]);

    it("shows the banner of a kind when its base game is not ignored for it", async () => {
      await startOnAiPage({ route: getItemsRoute([dlc]), initial: ignoredFor("kernel") });
      await expect.poll(() => banner()?.querySelector(".sar-banner-service")).not.toBeNull();
      expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
    });

    it("takes the banner entry and its note away once Steam names the base game", async () => {
      const { release } = await startOnAiPage({
        route: getItemsRoute([dlc]),
        initial: ignoredFor("ai"),
        held: true,
      });
      // The page's own disclosure draws first; the base game is not known until the answer.
      expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
      release();
      await expect.poll(() => document.getElementById("sar-banner")).toBeNull();
    });

    it("takes the banner away for a base game ignored for all tags", async () => {
      const { release } = await startOnAiPage({
        route: getItemsRoute([dlc]),
        initial: ignoredFor("all"),
        held: true,
      });
      release();
      await expect.poll(() => document.getElementById("sar-banner")).toBeNull();
    });

    it("still ignores the DLC itself, never the base game, from its own page", async () => {
      const { stored } = await startOnAiPage({
        route: getItemsRoute([dlc]),
        initial: ignoredFor("kernel"),
      });
      await expect.poll(() => banner()?.querySelector(".sar-banner-service")).not.toBeNull();
      control('.sar-banner-foot [data-sar-action="ignore"]')?.click();
      await expect.poll(() => control(".sar-banner-ignored-text")?.textContent).toBe(
        i18n.t("banner_ignored"),
      );
      expect(Object.keys((await stored()).all)).toEqual(["5072580"]);
    });
  });

  it("follows the banner setting of the kind", async () => {
    const { settings } = await startOnAiPage();

    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
    expect(document.getElementById("sar-banner")).toBeNull();
    await writeSettings(settings, DEFAULT_SETTINGS);
    expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
  });

  it("follows the switch of the kind", async () => {
    const { settings } = await startOnAiPage();

    await writeSettings(settings, withKind(DEFAULT_SETTINGS, "ai", { enabled: false }));
    expect(document.getElementById("sar-banner")).toBeNull();
  });
});
