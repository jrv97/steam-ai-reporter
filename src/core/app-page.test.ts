// @vitest-environment-options {"url":"https://store.steampowered.com/app/5072580/"}
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import mixedStates from "../../tests/fixtures/getitems/mixed-states.json";
import { APP_PAGES } from "../../tests/helpers/app-page";
import { clearRoot } from "../../tests/helpers/dom";
import { fakeHttp, type Route } from "../../tests/helpers/fake-http";
import { fixedClock } from "../../tests/helpers/fixed-clock";
import { fixtureItems, getItemsRequest, getItemsRoute, itemAs } from "../../tests/helpers/getitems";
import { englishI18n } from "../../tests/helpers/i18n";
import { memoryStore } from "../../tests/helpers/memory-store";
import { loadPage } from "../../tests/helpers/surfaces";
import { type App, start } from "./app";
import { GETITEMS_URL } from "./detect/getitems";
import type { JsonValue } from "./json";
import type { Http } from "./ports";
import { DEFAULT_SETTINGS, encodeSettings, withKind } from "./settings/settings";
import { createSettingsSource } from "./settings/settings-source";
import { ALLOW_KEY, SETTINGS_KEY } from "./storage-keys";
import { adoptPageStyles } from "./ui/styles";

const i18n = englishI18n();
const quiet = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app: App | undefined;

afterEach(() => {
  app?.stop();
  app = undefined;
  clearRoot();
});

const AllowSchema = v.object({
  all: v.record(v.string(), v.unknown()),
  ai: v.record(v.string(), v.unknown()),
});

const banner = () => document.getElementById("sar-banner")?.shadowRoot ?? null;
const control = (selector: string) => banner()?.querySelector<HTMLElement>(selector);
const headings = () =>
  [...(banner()?.querySelectorAll("h2") ?? [])].map((heading) => heading.textContent);

interface StartOptions {
  readonly route?: Route;
  readonly initial?: ReadonlyMap<string, JsonValue>;
  /** Holds every request until `release` is called. */
  readonly held?: boolean;
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
    clock: fixedClock(0),
    console: quiet,
    addPageStyles: adoptPageStyles,
  });
  const stored = async () => v.parse(AllowSchema, (await store.get([ALLOW_KEY])).get(ALLOW_KEY));
  return { http: { calls: requested }, settings, stored, release };
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

  it("follows the banner setting of the kind", async () => {
    const { settings } = await startOnAiPage();

    await settings.write(withKind(DEFAULT_SETTINGS, "ai", { banner: false }));
    expect(document.getElementById("sar-banner")).toBeNull();
    await settings.write(DEFAULT_SETTINGS);
    expect(headings()).toEqual([i18n.t("kind_ai_heading")]);
  });

  it("follows the switch of the kind", async () => {
    const { settings } = await startOnAiPage();

    await settings.write(withKind(DEFAULT_SETTINGS, "ai", { enabled: false }));
    expect(document.getElementById("sar-banner")).toBeNull();
  });
});
