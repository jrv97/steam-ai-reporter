// @vitest-environment-options {"url":"https://store.steampowered.com/app/5072580/"}
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import kindItems from "../../tests/fixtures/getitems/kinds.json";
import mixedStates from "../../tests/fixtures/getitems/mixed-states.json";
import type { AppPageName } from "../../tests/helpers/app-page";
import { clearRoot } from "../../tests/helpers/dom";
import { make } from "../../tests/helpers/factory";
import type { Route } from "../../tests/helpers/fake-http";
import { fake } from "../../tests/helpers/fakes";
import { getItemsRequest } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { writeSettings } from "../../tests/helpers/settings";
import { readKey } from "../../tests/helpers/store-read";
import { loadPage } from "../../tests/helpers/surfaces";
import { T0 } from "../../tests/helpers/timer-clock";
import { type App, start } from "./app";
import type { CreatorRole } from "./creator";
import { API_BREAKER_KEY, DEFAULT_BACKOFF } from "./detect/breaker";
import { GETITEMS_URL } from "./detect/getitems";
import { RETRY_DELAY_MS } from "./detect/retry";
import { DEFAULT_SPACING_MS } from "./detect/throttle";
import { SHIPPED_CATALOGS } from "./i18n/shipped";
import type { JsonValue } from "./json";
import type { KindSettings } from "./kinds/kind-settings";
import type { KindVerdicts } from "./kinds/verdicts";
import type { Clock, Http } from "./ports";
import type { AllowScope } from "./settings/allow-data";
import { DEFAULT_SETTINGS, encodeSettings } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, CREATOR_ALLOW_KEYS, SETTINGS_KEY } from "./storage-keys";
import { normalizeBreaks } from "./ui/notes";
import { adoptPageStyles } from "./ui/styles";

/** The app of the open page, which discloses AI on the page and in Steam's data. */
const OPEN = make.fixture.app.aiWithService;

const i18n = englishI18n();
const quiet = fake.console();

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

const banner = () => document.getElementById("tks-banner")?.shadowRoot ?? null;
const control = (selector: string) => banner()?.querySelector<HTMLElement>(selector);
const headings = () =>
  [...(banner()?.querySelectorAll("h2") ?? [])].map((heading) => heading.textContent);
const aiHeading = i18n.t("kind_ai_heading");
/** The AI notes a banner quotes for `verdicts`; throws when AI is not disclosed. */
function quotedNotes(verdicts: KindVerdicts): string {
  const { ai } = verdicts;
  if (ai.state !== "disclosed") {
    throw new TypeError(ai.state);
  }
  return normalizeBreaks(ai.notes);
}
/** A store whose ignore list under `key` holds `keys` in `scope`. */
const ignoring = (scope: AllowScope, keys: readonly (number | string)[], key = ALLOW_KEY) =>
  new Map<string, JsonValue>([[key, make.raw.v2Allow(scope, ...keys)]]);

interface StartOptions {
  readonly route?: Route;
  readonly initial?: ReadonlyMap<string, JsonValue>;
  /** Holds every request until `release` is called. */
  readonly held?: boolean;
  readonly clock?: Clock;
  /** The open page's document; the AI page by default. */
  readonly page?: AppPageName;
}

async function startOnAiPage(options: StartOptions = {}) {
  const {
    route = make.item.route(make.fixture.items(mixedStates)),
    initial = new Map(),
    page = "5072580-ai-first.html",
    clock = fake.clock(make.time()),
  } = options;
  loadPage(make.page.app(page));
  document.documentElement.lang = "en";
  const store = fake.store(initial);
  const settings = createSettingsSource(store);
  const inner = fake.http([route]);
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
    clock,
    console: quiet,
    catalogs: SHIPPED_CATALOGS,
    addPageStyles: adoptPageStyles,
  });
  const stored = async () => v.parse(AllowSchema, await readKey(store, ALLOW_KEY));
  /** The keys of a role's ignore list in a scope; none while the list was never written. */
  const storedCreators = async (role: CreatorRole, scope: string) => {
    const lists = v.parse(CreatorAllowSchema, await readKey(store, CREATOR_ALLOW_KEYS[role]));
    return Object.keys(lists[scope] ?? {});
  };
  return { http: { calls: requested }, settings, stored, storedCreators, release };
}

describe("start on an English app page", () => {
  it("shows the AI banner from the page at once and does not wait for GetItems", async () => {
    const { http, release } = await startOnAiPage({ held: true });

    await expect.poll(() => http.calls.length).toBe(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual([OPEN]);
    const column = document.querySelector(".game_description_column");
    expect(column?.firstElementChild?.id).toBe("tks-banner");
    expect(headings()).toEqual([aiHeading]);
    expect(banner()?.querySelector("blockquote")?.textContent).toBe(
      quotedNotes(make.fixture.pageVerdicts("5072580-ai-first.html", OPEN)),
    );
    expect(banner()?.querySelector(".tks-banner-service")).toBeNull();
    release();
    await expect.poll(() => banner()?.querySelector(".tks-banner-service")?.textContent).toContain(
      i18n.t("badge_card_service_label"),
    );
  });

  it.each<[string, Route]>([
    ["has no item for it", make.item.route([])],
    ["cannot answer", [GETITEMS_URL, "network-error"]],
  ])("keeps the page's AI banner and asks GetItems once when it %s", async (_name, route) => {
    const { http } = await startOnAiPage({ route });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(http.calls).toHaveLength(1);
    expect(getItemsRequest(http.calls[0] ?? "").ids).toEqual([OPEN]);
    expect(headings()).toEqual([aiHeading]);
  });

  it("asks GetItems again once a breaker left open by a past page closes", async () => {
    const until = T0 + DEFAULT_BACKOFF.baseMs + DEFAULT_BACKOFF.jitterMs;
    const { http } = await startOnAiPage({
      initial: new Map([[API_BREAKER_KEY, { until }]]),
      clock: fake.timerClock(),
    });
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1000);
    expect(http.calls).toHaveLength(0);
    expect(banner()?.querySelector(".tks-banner-service")).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(http.calls).toHaveLength(1);
    await expect.poll(() => banner()?.querySelector(".tks-banner-service")?.textContent).toContain(
      i18n.t("badge_card_service_label"),
    );
  });

  it("logs a disagreement in debug mode and keeps the disclosure of the page", async () => {
    quiet.debug.mockClear();
    const none = make.fixture.itemAs(mixedStates, make.fixture.app.noBlock, OPEN);
    const initial = new Map<string, JsonValue>([
      [SETTINGS_KEY, encodeSettings(make.settings({ debug: true }))],
    ]);
    await startOnAiPage({ route: make.item.route([none]), initial });

    await expect.poll(() => quiet.debug.mock.calls.length).toBeGreaterThan(0);
    expect(quiet.debug).toHaveBeenCalledWith(
      expect.any(String),
      i18n.t("notice_page_disagrees", {
        kind: "ai",
        app: String(OPEN),
        page: "disclosed",
        data: "not-disclosed",
      }),
    );
    expect(headings()).toEqual([aiHeading]);
  });

  it("ignores the AI kind from its entry and brings it back with Undo", async () => {
    const { stored } = await startOnAiPage();

    control('.tks-banner-action[data-tks-scope="ai"]')?.click();
    await expect.poll(() => control('[data-tks-action="undo"]')?.getAttribute("data-tks-scope"))
      .toBe("ai");
    expect(Object.keys((await stored()).ai)).toEqual([String(OPEN)]);
    expect(Object.keys((await stored()).all)).toEqual([]);
    expect(banner()?.querySelector("aside")?.getAttribute("data-tks-variant")).toBe("ignored");

    control('[data-tks-action="undo"]')?.click();
    await expect.poll(() => banner()?.querySelector("blockquote")).toBeInstanceOf(HTMLElement);
    expect(Object.keys((await stored()).ai)).toEqual([]);
  });

  it("ignores the game for all tags from the link below the entries", async () => {
    const { stored } = await startOnAiPage();

    control('.tks-banner-foot [data-tks-action="ignore"]')?.click();
    await expect.poll(() => control(".tks-banner-ignored-text")?.textContent).toBe(
      i18n.t("banner_ignored"),
    );
    expect(Object.keys((await stored()).all)).toEqual([String(OPEN)]);
    expect(Object.keys((await stored()).ai)).toEqual([]);
  });

  describe("with a developer and a publisher", () => {
    // The open page's item names a developer with a clan ID and a publisher without one.
    const developer = make.text.creator();
    const clan = make.creator.clan();
    const publisher = make.text.creator();
    const studio = {
      ...make.fixture.itemAs(mixedStates, OPEN, OPEN),
      ...make.item.creators({ developers: [[developer, clan]], publishers: [publisher] }),
    };
    const rows = () => [...(banner()?.querySelectorAll(".tks-banner-creator") ?? [])];
    const ignoreButton = (row: number, scope: string) =>
      rows()[row]?.querySelector<HTMLElement>(`button[data-tks-scope="${scope}"]`);

    it("lists them once Steam's data arrives, and not before", async () => {
      const { release } = await startOnAiPage({ route: make.item.route([studio]), held: true });
      expect(banner()?.querySelector("details")).toBeNull();
      release();
      await expect.poll(() => rows().length).toBe(2);
      expect(rows().map((row) => row.querySelector(".tks-banner-creator-name")?.textContent))
        .toEqual([developer, publisher]);
    });

    it("ignores the developer for AI by clan ID and brings it back with Undo", async () => {
      const { storedCreators } = await startOnAiPage({ route: make.item.route([studio]) });
      await expect.poll(() => rows().length).toBe(2);

      ignoreButton(0, "ai")?.click();
      await expect.poll(() => control('[data-tks-action="undo-creator"]')).not.toBeNull();
      expect(await storedCreators("developer", "ai")).toEqual([`c:${String(clan)}`]);
      expect(await storedCreators("publisher", "ai")).toEqual([]);
      expect(headings()).toEqual([]);
      expect(control(".tks-banner-ignored-text")?.textContent).toBe(
        i18n.t("banner_ignored_creator_kind", {
          name: developer,
          role: i18n.t("banner_role_developer"),
          heading: aiHeading,
        }),
      );

      control('[data-tks-action="undo-creator"]')?.click();
      await expect.poll(() => headings()).toEqual([aiHeading]);
      expect(await storedCreators("developer", "ai")).toEqual([]);
    });

    it("ignores the publisher for all tags by name when Steam sends no clan ID", async () => {
      const { storedCreators } = await startOnAiPage({ route: make.item.route([studio]) });
      await expect.poll(() => rows().length).toBe(2);

      ignoreButton(1, "all")?.click();
      await expect.poll(() => control('[data-tks-action="undo-creator"]')).not.toBeNull();
      expect(await storedCreators("publisher", "all")).toEqual([`n:${publisher}`]);
      expect(await storedCreators("developer", "all")).toEqual([]);
    });

    it("applies a stored developer ignore at once, with its note and Undo", async () => {
      const initial = ignoring("ai", [`c:${String(clan)}`], CREATOR_ALLOW_KEYS.developer);
      await startOnAiPage({ route: make.item.route([studio]), initial });
      await expect.poll(() => control('[data-tks-action="undo-creator"]')).not.toBeNull();
      expect(headings()).toEqual([]);
      expect(document.querySelector(".tks-tag-section")).toBeNull();
    });
  });

  describe("on the page of a DLC", () => {
    // The open page is a DLC: Steam's data names its base game.
    const base = make.appId();
    const route = make.item.route([{
      ...make.fixture.itemAs(mixedStates, OPEN, OPEN),
      type: 4,
      related_items: { parent_appid: base },
    }]);

    it("shows the banner of a kind when its base game is not ignored for it", async () => {
      await startOnAiPage({ route, initial: ignoring("kernel", [base]) });
      await expect.poll(() => banner()?.querySelector(".tks-banner-service")).not.toBeNull();
      expect(headings()).toEqual([aiHeading]);
    });

    it.each<AllowScope>(["ai", "all"])(
      "takes the banner away once Steam names a base game ignored for %s",
      async (scope) => {
        const { release } = await startOnAiPage({
          route,
          initial: ignoring(scope, [base]),
          held: true,
        });
        // The page's own disclosure draws first; the base game is not known until the answer.
        expect(headings()).toEqual([aiHeading]);
        release();
        await expect.poll(() => document.getElementById("tks-banner")).toBeNull();
      },
    );

    it("still ignores the DLC itself, never the base game, from its own page", async () => {
      const { stored } = await startOnAiPage({ route, initial: ignoring("kernel", [base]) });
      await expect.poll(() => banner()?.querySelector(".tks-banner-service")).not.toBeNull();
      control('.tks-banner-foot [data-tks-action="ignore"]')?.click();
      await expect.poll(() => control(".tks-banner-ignored-text")?.textContent).toBe(
        i18n.t("banner_ignored"),
      );
      expect(Object.keys((await stored()).all)).toEqual([String(OPEN)]);
    });
  });

  describe("on the page of a demo", () => {
    // The open page shows no declaration and is a demo of ARC Raiders, whose item declares AI
    // notes, a kernel anti-cheat, a EULA and PvP (off by default).
    const GAME = make.fixture.app.arcRaiders;
    const route = make.item.route([
      make.item.demo(OPEN, GAME),
      make.fixture.itemAs(kindItems, GAME, GAME),
    ]);
    const kinds = ["kind_ai_heading", "kind_eula_heading", "kind_kernel_heading"] as const;
    const lines = () =>
      [...(banner()?.querySelectorAll(".tks-banner-full-game") ?? [])].map((line) =>
        line.textContent
      );

    async function startOnDemo(initial: ReadonlyMap<string, JsonValue> = new Map()) {
      await startOnAiPage({
        route,
        initial,
        page: "413150-no-block.html",
        clock: fake.timerClock(),
      });
      await vi.advanceTimersByTimeAsync(DEFAULT_SPACING_MS);
    }

    it("lists the full game's tags, each said to be the full game's, and quotes it", async () => {
      await startOnDemo();
      await expect.poll(headings).toEqual(kinds.map((key) => i18n.t(key)));
      expect(lines()).toEqual(kinds.map(() => i18n.t("kind_full_game")));
      expect(banner()?.querySelector("blockquote")?.textContent).toBe(
        quotedNotes(make.fixture.verdicts(GAME)),
      );
      expect(banner()?.querySelector(".tks-banner-source")?.textContent).toBe(
        i18n.t("banner_source"),
      );
    });

    it("leaves out a tag the full game is ignored for, with no note", async () => {
      await startOnDemo(ignoring("ai", [GAME]));
      await expect.poll(headings).toEqual(kinds.slice(1).map((key) => i18n.t(key)));
      expect(banner()?.querySelector(".tks-banner-note")).toBeNull();
    });
  });

  it.each<[string, Partial<KindSettings>]>([
    ["banner setting", { banner: false }],
    ["switch", { enabled: false }],
  ])("follows the %s of the kind", async (_name, patch) => {
    const { settings } = await startOnAiPage();

    await writeSettings(settings, make.settings.kind("ai", patch));
    expect(document.getElementById("tks-banner")).toBeNull();
    await writeSettings(settings, DEFAULT_SETTINGS);
    expect(headings()).toEqual([aiHeading]);
  });
});
