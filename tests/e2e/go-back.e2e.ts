import { expect, it, vi } from "vitest";
import { APP_PAGE_ORIGIN } from "../../src/core/detect/app-page";
import type { KindId } from "../../src/core/kinds/id";
import { ORIGIN_KEY } from "../../src/core/storage-keys";
import { TAB_ATTRIBUTE } from "../../src/core/ui/tabs";
import { englishI18n } from "../helpers/i18n";
import { type Engine, ENGINES, type ExtensionBrowser, launch } from "./browser";

// The settings page's Go back to Steam button, the automated cases of ADR 0019's spike part 2. No
// driver presses the toolbar button: `action.openPopup()` opens the popup, and the control page
// clicks in it and in the settings page through `extension.getViews()`.

const i18n = englishI18n();
const STORE_HOME = `${APP_PAGE_ORIGIN}/`;
const BLANK = "about:blank";
const SETTINGS_PATH = "options.html";
const TAG: KindId = "drm";
const GEAR = `a[aria-label="${i18n.t("options_all_settings")}"]`;
const TAG_LINK = `a[data-sar-open-tab="${TAG}"]`;
const SELECTED_TAB = `[role=tab][aria-selected=true]`;
const BACK = i18n.t("options_back_to_steam");
/** The control page's session storage key that collects the settings page's errors. */
const ERRORS_KEY = "sar-e2e-errors";
const WAIT = { timeout: 10_000, interval: 100 };
/** How Firefox names the cookie store of a container tab. */
const CONTAINER_PREFIX = "firefox-container-";

/** Launches `engine`, headed if asked, runs `body` and closes the browser whatever happens. */
async function withBrowser(
  engine: Engine,
  body: (browser: ExtensionBrowser) => Promise<void>,
  headed = false,
): Promise<void> {
  const browser = await launch(engine, { headed });
  try {
    await body(browser);
  } finally {
    await browser.close();
  }
}

/** The control page, its API namespace, and a function there that finds a tab's page. */
async function control(browser: ExtensionBrowser) {
  const { page, api } = await browser.control();
  const pageIn = await page.evaluateHandle(
    (ext) => (tabId: number) => ext.extension.getViews({ type: "tab", tabId })[0],
    api,
  );
  return { page, api, pageIn };
}

/** Opens `url` in a new tab in front of the control page's window. Resolves with its ID. */
async function newTab(browser: ExtensionBrowser, url: string): Promise<number> {
  const { page, api } = await control(browser);
  return page.evaluate(
    async (ext, address) =>
      (await ext.tabs.create({ url: address, active: true })).id ?? ext.tabs.TAB_ID_NONE,
    api,
    url,
  );
}

/** Opens `url` in a new focused window. Resolves with the ID of its one tab. */
async function newWindow(browser: ExtensionBrowser, url: string): Promise<number> {
  const { page, api } = await control(browser);
  return page.evaluate(
    async (ext, address) =>
      (await ext.windows.create({ url: address, focused: true }))?.tabs?.[0]?.id
        ?? ext.tabs.TAB_ID_NONE,
    api,
    url,
  );
}

/** Resolves with the window that holds `tab`. */
async function windowOf(browser: ExtensionBrowser, tab: number): Promise<number> {
  const { page, api } = await control(browser);
  return page.evaluate(async (ext, id) => (await ext.tabs.get(id)).windowId, api, tab);
}

/**
 * Focuses `tab`'s window, as pressing its toolbar button does, opens the popup over its active tab
 * and clicks `selector` once the popup draws it.
 */
async function pressInPopup(browser: ExtensionBrowser, tab: number, selector: string) {
  const windowId = await windowOf(browser, tab);
  const { page, api } = await control(browser);
  await page.evaluate(
    async (ext, id) => {
      await ext.windows.update(id, { focused: true });
      await ext.action.openPopup({ windowId: id });
    },
    api,
    windowId,
  );
  await vi.waitFor(
    () =>
      page.evaluate(
        (ext, wanted) => {
          const [popup] = ext.extension.getViews({ type: "popup" });
          const link = popup?.document.querySelector<HTMLElement>(wanted);
          if (link === null || link === undefined) {
            throw new Error(wanted);
          }
          link.click();
        },
        api,
        selector,
      ),
    WAIT,
  );
}

/**
 * Waits until the popup has closed, no origin is left in the session area (each settings page
 * removes it once read) and every settings tab is ready. The form draws the empty ignore lists
 * once its reads are done, right before it handles events. Resolves with the newest settings
 * tab's ID.
 */
async function settingsTab(browser: ExtensionBrowser): Promise<number> {
  const { page, api, pageIn } = await control(browser);
  return vi.waitFor(
    () =>
      page.evaluate(
        async (ext, find, key, path, back) => {
          const address = ext.runtime.getURL(path);
          const tabs = (await ext.tabs.query({})).filter((t) => t.url?.split("#")[0] === address);
          const ready = tabs.every((t) => {
            const doc = t.id === undefined ? undefined : find(t.id)?.document;
            const button = [...(doc?.querySelectorAll("button") ?? [])].some(
              (node) => node.textContent === back,
            );
            return button && (doc?.querySelector(".sar-empty") ?? null) !== null;
          });
          const popups = ext.extension.getViews({ type: "popup" });
          const stored = await ext.storage.session.get(key);
          const newest = Math.max(...tabs.map((t) => t.id ?? ext.tabs.TAB_ID_NONE));
          if (tabs.length === 0 || !ready || popups.length > 0 || key in stored) {
            throw new Error(key);
          }
          return newest;
        },
        api,
        pageIn,
        ORIGIN_KEY,
        SETTINGS_PATH,
        BACK,
      ),
    WAIT,
  );
}

/** Opens the settings page in a new tab from its address, as the extensions menu does. */
async function settingsWithoutPopup(browser: ExtensionBrowser): Promise<number> {
  const { page, api } = await control(browser);
  await page.evaluate(
    (ext, path) => ext.tabs.create({ url: ext.runtime.getURL(path), active: true }),
    api,
    SETTINGS_PATH,
  );
  return settingsTab(browser);
}

/** Has the control page note the errors of the page in tab `settings`, then clicks its button. */
async function pressBack(browser: ExtensionBrowser, settings: number): Promise<void> {
  const { page, pageIn } = await control(browser);
  await page.evaluate(
    (find, id, back, errorsKey) => {
      const view = find(id);
      const button = [...(view?.document.querySelectorAll("button") ?? [])].find(
        (node) => node.textContent === back,
      );
      if (view === undefined || button === undefined) {
        throw new Error(back);
      }
      const note = (message: string): void => {
        sessionStorage.setItem(errorsKey, `${sessionStorage.getItem(errorsKey) ?? ""}${message}\n`);
      };
      view.addEventListener("error", (event) => {
        note(event.message);
      });
      view.addEventListener("unhandledrejection", (event) => {
        note(String(event.reason));
      });
      button.click();
    },
    pageIn,
    settings,
    BACK,
    ERRORS_KEY,
  );
}

/** The errors the settings page raised after `pressBack`, one per line. */
async function pageErrors(browser: ExtensionBrowser): Promise<string> {
  const { page } = await control(browser);
  return page.evaluate((key) => sessionStorage.getItem(key) ?? "", ERRORS_KEY);
}

/** The tab in front of `tab`'s window, and whether tab `settings` is still open. */
async function landing(browser: ExtensionBrowser, tab: number, settings: number) {
  const { page, api } = await control(browser);
  return page.evaluate(
    async (ext, id, own) => {
      const { windowId } = await ext.tabs.get(id);
      const [active] = await ext.tabs.query({ active: true, windowId });
      const open = (await ext.tabs.query({})).some((t) => t.id === own);
      return { active: active?.id, settingsOpen: open };
    },
    api,
    tab,
    settings,
  );
}

/** The focused windows, the tab in front of the first, and whether tab `settings` is open. */
async function front(browser: ExtensionBrowser, settings: number) {
  const { page, api } = await control(browser);
  return page.evaluate(
    async (ext, own) => {
      const focused = (await ext.windows.getAll()).filter((window) => window.focused);
      const [active] = await ext.tabs.query({ active: true, windowId: focused[0]?.id });
      const open = (await ext.tabs.query({})).some((t) => t.id === own);
      return {
        focused: focused.map((window) => window.id),
        active: active?.id,
        settingsOpen: open,
      };
    },
    api,
    settings,
  );
}

/** The origin of the address tab `tab` shows, or undefined before it has one. */
async function originOf(browser: ExtensionBrowser, tab: number): Promise<string | undefined> {
  return URL.parse(await browser.urlOf(tab))?.origin;
}

/** Opens the settings from `selector` in the popup over a new tab at `url`. */
async function settingsFrom(browser: ExtensionBrowser, url: string, selector: string) {
  const origin = await newTab(browser, url);
  await pressInPopup(browser, origin, selector);
  return { origin, settings: await settingsTab(browser) };
}

/** Loads `url` in tab `tab`, or reloads it without one, and resolves once the load completes. */
async function load(browser: ExtensionBrowser, tab: number, url?: string): Promise<void> {
  const { page, api } = await control(browser);
  await page.evaluate(
    (ext, id, address) =>
      new Promise<void>((resolve) => {
        let started = false;
        ext.tabs.onUpdated.addListener((updated, change) => {
          started ||= updated === id && change.status === "loading";
          if (started && updated === id && change.status === "complete") {
            resolve();
          }
        });
        void (address === null ? ext.tabs.reload(id) : ext.tabs.update(id, { url: address }));
      }),
    api,
    tab,
    url ?? null,
  );
}

interface Opened {
  /** The tab the button should return to. */
  readonly origin: number;
  readonly settings: number;
}

const RETURNS: readonly {
  readonly name: string;
  readonly arrange: (browser: ExtensionBrowser) => Promise<Opened>;
}[] = [
  {
    name: "1, basic path",
    arrange: (browser) => settingsFrom(browser, STORE_HOME, GEAR),
  },
  {
    name: "2, tag path",
    arrange: (browser) => settingsFrom(browser, STORE_HOME, TAG_LINK),
  },
  {
    name: "3, focus path, to the second store tab",
    arrange: async (browser) => {
      const { settings } = await settingsFrom(browser, STORE_HOME, GEAR);
      const second = await settingsFrom(browser, STORE_HOME, GEAR);
      return { origin: second.origin, settings };
    },
  },
  {
    name: "5, origin navigated away",
    arrange: async (browser) => {
      const opened = await settingsFrom(browser, STORE_HOME, GEAR);
      await load(browser, opened.origin, BLANK);
      return opened;
    },
  },
  {
    name: "9, popup opened on the settings tab",
    arrange: async (browser) => {
      const opened = await settingsFrom(browser, STORE_HOME, GEAR);
      await pressInPopup(browser, opened.settings, GEAR);
      await settingsTab(browser);
      return opened;
    },
  },
];

it.each(ENGINES.flatMap((engine) => RETURNS.map((row) => ({ ...row, engine }))))(
  "$engine: case $name: the back button returns to the origin tab",
  ({ engine, arrange }) =>
    withBrowser(engine, async (browser) => {
      const { origin, settings } = await arrange(browser);
      await pressBack(browser, settings);
      await expect
        .poll(() => landing(browser, origin, settings), WAIT)
        .toEqual({ active: origin, settingsOpen: false });
    }),
);

const FALLBACKS: readonly {
  readonly name: string;
  readonly arrange: (browser: ExtensionBrowser) => Promise<number>;
}[] = [
  {
    name: "4, origin tab closed",
    arrange: async (browser) => {
      const { origin, settings } = await settingsFrom(browser, STORE_HOME, GEAR);
      const { page, api } = await control(browser);
      await page.evaluate((ext, id) => ext.tabs.remove(id), api, origin);
      return settings;
    },
  },
  { name: "6, no origin", arrange: settingsWithoutPopup },
  {
    name: "7, settings tab reloaded",
    arrange: async (browser) => {
      const { settings } = await settingsFrom(browser, STORE_HOME, GEAR);
      await load(browser, settings);
      return settingsTab(browser);
    },
  },
];

it.each(ENGINES.flatMap((engine) => FALLBACKS.map((row) => ({ ...row, engine }))))(
  "$engine: case $name: the back button loads the store home in the settings tab",
  ({ engine, arrange }) =>
    withBrowser(engine, async (browser) => {
      const settings = await arrange(browser);
      await pressBack(browser, settings);
      await expect.poll(() => originOf(browser, settings), WAIT).toBe(APP_PAGE_ORIGIN);
      expect(await pageErrors(browser)).toBe("");
    }),
);

it.each(ENGINES)(
  "%s: case 2, a tag row opens the settings on that tag's tab",
  (engine) =>
    withBrowser(engine, async (browser) => {
      const { settings } = await settingsFrom(browser, STORE_HOME, TAG_LINK);
      const { page, pageIn } = await control(browser);
      const selected = () =>
        page.evaluate(
          (find, id, selector, attribute) =>
            find(id)?.document.querySelector(selector)?.getAttribute(attribute),
          pageIn,
          settings,
          SELECTED_TAB,
          TAB_ATTRIBUTE,
        );
      await expect.poll(selected, WAIT).toBe(TAG);
    }),
);

// Firefox brings the settings tab in the first window forward. Chromium opens a second settings
// tab in the second window, and only that tab, in front, takes the origin. Headless Chromium
// reports every window as focused, so its run is headed.
it.each<{ engine: Engine; headed: boolean; }>([
  { engine: "chromium", headed: true },
  { engine: "gecko", headed: false },
])("$engine: case 8, two windows: the settings in front return to the second window", ({
  engine,
  headed,
}) =>
  withBrowser(engine, async (browser) => {
    await settingsFrom(browser, STORE_HOME, GEAR);
    const second = await newWindow(browser, STORE_HOME);
    await pressInPopup(browser, second, GEAR);
    const settings = await settingsTab(browser);
    await pressBack(browser, settings);
    await expect
      .poll(() => front(browser, settings), WAIT)
      .toEqual({ focused: [await windowOf(browser, second)], active: second, settingsOpen: false });
  }, headed));

it("gecko: case 11, the back button returns to a container tab", async () => {
  const browser = await launch("gecko");
  try {
    await browser.containerTab(STORE_HOME);
    const { page, api } = await control(browser);
    // Waits for the container tab to reach the store, then brings it to the front.
    const origin = await vi.waitFor(
      () =>
        page.evaluate(
          async (ext, store, container) => {
            const tab = (await ext.tabs.query({})).find(
              // Firefox's own Tab field, which @types/chrome does not declare
              (t) => "cookieStoreId" in t && String(t.cookieStoreId).startsWith(container),
            );
            if (tab?.id === undefined || tab.url?.startsWith(store) !== true) {
              throw new Error(container);
            }
            await ext.tabs.update(tab.id, { active: true });
            return tab.id;
          },
          api,
          STORE_HOME,
          CONTAINER_PREFIX,
        ),
      WAIT,
    );
    await pressInPopup(browser, origin, GEAR);
    const settings = await settingsTab(browser);
    await pressBack(browser, settings);
    await expect
      .poll(() => landing(browser, origin, settings), WAIT)
      .toEqual({ active: origin, settingsOpen: false });
  } finally {
    await browser.close();
  }
});

// Both engines load the settings into a blank active tab instead of opening a new one.
it.each(ENGINES)(
  "%s: case 13, the settings load in the blank tab, and the button opens the store home there",
  (engine) =>
    withBrowser(engine, async (browser) => {
      const { origin, settings } = await settingsFrom(browser, BLANK, GEAR);
      expect(settings).toBe(origin);
      await pressBack(browser, settings);
      await expect.poll(() => originOf(browser, settings), WAIT).toBe(APP_PAGE_ORIGIN);
    }),
);
