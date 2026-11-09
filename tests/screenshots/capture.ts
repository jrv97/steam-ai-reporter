/**
 * Helpers for the store screenshots (ADR 0022): the sample config restored through the settings
 * page, settings changes per shot, Steam pages in the capture locale, and PNG files at the size
 * both stores take.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "puppeteer-core";
import * as v from "valibot";
import { readBackup } from "../../src/core/backup/format";
import {
  applyPatch,
  encodeSettings,
  type Settings,
  type SettingsPatch,
} from "../../src/core/settings/settings";
import { SETTINGS_KEY } from "../../src/core/storage-keys";
import { GENERAL_TAB, tabHash } from "../../src/core/ui/tab-id";
import type { ExtensionBrowser } from "../e2e/browser";

/** The Chrome Web Store screenshot size, which AMO also recommends, at one device pixel per px. */
const STORE_VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 } as const;

/** The settings the screenshots start from, made with the settings page's Download backup. */
const SAMPLE_CONFIG = fileURLToPath(
  new URL("../../docs/store/sample-config.json", import.meta.url),
);

const SCREENSHOTS = fileURLToPath(new URL("../../docs/store/screenshots/", import.meta.url));

/** Live Steam pages take their time; a selector that never shows fails the shot. */
export const WAIT = { timeout: 30_000 } as const;

const IDLE = { idleTime: 1_500, timeout: 30_000 } as const;
/** The quiet wait after one wheel step, while the extension tags what Steam loaded. */
const STEP_IDLE = { idleTime: 600, timeout: 30_000 } as const;
/** One wheel step, a little less than a frame so no row is skipped. */
const WHEEL = 700;
/** Steam's sticky store bar, which covers the top of a scrolled page when signed in. */
const NAV_HEIGHT = 64;

/**
 * A capture language: the browser's, Steam's `l` parameter, the setting, the output folder, and
 * Steam's own words for the home widgets that only text finds.
 */
export interface CaptureLocale {
  readonly browser: string;
  readonly steam: string;
  readonly setting: string;
  readonly folder: string;
  readonly queueWidget: string;
  readonly calendarWidget: string;
}

const LOCALES = {
  en: {
    browser: "en-US",
    steam: "english",
    setting: "en",
    folder: "",
    queueWidget: "Explore Your Discovery Queue",
    calendarWidget: "Your Personal Calendar",
  },
  es: {
    browser: "es-ES",
    steam: "spanish",
    setting: "es",
    folder: "es/",
    queueWidget: "Explora tu lista de descubrimientos",
    calendarWidget: "Tu calendario personal",
  },
} as const satisfies Record<string, CaptureLocale>;

/** An environment variable's value, or undefined when it is unset or empty. */
function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

/** The locale TKS_SCREENSHOT_LOCALE names, English by default. */
export function captureLocale(): CaptureLocale {
  const name = v.parse(
    v.optional(v.picklist(["en", "es"]), "en"),
    envValue("TKS_SCREENSHOT_LOCALE"),
  );
  return LOCALES[name];
}

/** The copied Chromium profile the capture runs on, or undefined for a fresh one. */
export function captureProfile(): string | undefined {
  return envValue("TKS_SCREENSHOT_PROFILE");
}

/** The path of screenshot `name` (without extension) for `locale`. */
function screenshotPath(locale: CaptureLocale, name: string): string {
  return `${SCREENSHOTS}${locale.folder}${name}.png`;
}

/** The sample config's settings. Fails unless the whole file reads as a backup of this build. */
export async function sampleSettings(): Promise<Settings> {
  const reading = readBackup(await readFile(SAMPLE_CONFIG, "utf8"));
  if (reading.kind !== "backup" || reading.skipped > 0) {
    throw new Error(SAMPLE_CONFIG);
  }
  return reading.contents.settings;
}

/** Restores the sample config through General's Restore from a backup, as a person would. */
export async function restoreSampleConfig(browser: ExtensionBrowser): Promise<void> {
  const page = await browser.open(`options.html${tabHash(GENERAL_TAB)}`);
  const [chooser] = await Promise.all([
    page.waitForFileChooser(WAIT),
    page.locator('[data-tks-backup="pick"]').click(),
  ]);
  await chooser.accept([SAMPLE_CONFIG]);
  await page.locator('[data-tks-backup="confirm"]').setTimeout(WAIT.timeout).click();
  await page.waitForSelector('[data-tks-backup="confirm"]', { ...WAIT, hidden: true });
  await page.close();
}

/**
 * Stores `base` with `patch` applied, as the settings page would. Open pages pick it up. A locale
 * change reloads extension pages, so the call reaches the API through the page each time.
 */
export async function writeSettings(
  browser: ExtensionBrowser,
  base: Settings,
  patch: SettingsPatch,
): Promise<void> {
  const { page } = await browser.control();
  await page.evaluate(
    async (key, value) => {
      await chrome.storage.local.set({ [key]: value });
    },
    SETTINGS_KEY,
    encodeSettings(applyPatch(base, patch)),
  );
}

/** Clicks Reject All on Steam's cookie banner when it shows; a signed-in profile has answered. */
export async function rejectCookies(page: Page): Promise<void> {
  const shown = await page.evaluate(() => {
    const popup = document.querySelector("#cookiePrefPopup");
    return popup !== null && getComputedStyle(popup).display !== "none";
  });
  if (shown) {
    await page.locator("#rejectAllButton").click();
    await page.waitForSelector("#cookiePrefPopup", { ...WAIT, hidden: true });
  }
}

/**
 * Opens a store page in the capture locale at the store size, answers the cookie banner, and
 * resolves once the page and the extension's requests have gone quiet.
 */
export async function storePage(
  browser: ExtensionBrowser,
  locale: CaptureLocale,
  address: string,
): Promise<Page> {
  const url = new URL(address);
  url.searchParams.set("l", locale.steam);
  const page = await browser.web(url.href);
  await page.setViewport(STORE_VIEWPORT);
  // The banner shows a moment after load, so the answer waits for the page to go quiet.
  await page.waitForNetworkIdle(IDLE);
  await rejectCookies(page);
  await page.waitForNetworkIdle(IDLE);
  return page;
}

/** Opens an extension page at the store size and waits for the settings form. */
export async function settingsPage(browser: ExtensionBrowser, path: string): Promise<Page> {
  const page = await browser.open(path);
  await page.setViewport(STORE_VIEWPORT);
  await page.waitForSelector("[role=tablist]", WAIT);
  return page;
}

/** Scrolls so the bottom of `selector` sits `margin` px above the bottom of the viewport. */
export async function alignBottom(page: Page, selector: string, margin = 24): Promise<void> {
  const target = await page.waitForSelector(selector, WAIT);
  if (target === null) {
    throw new Error(selector);
  }
  await target.evaluate((node, gap) => {
    window.scrollBy(0, node.getBoundingClientRect().bottom + gap - window.innerHeight);
  }, margin);
}

/** Scrolls the nearest scroll container so `selector` shows at `block` of it. */
export async function reveal(
  page: Page,
  selector: string,
  block: ScrollLogicalPosition,
): Promise<void> {
  const target = await page.waitForSelector(selector, WAIT);
  if (target === null) {
    throw new Error(selector);
  }
  await target.evaluate((node, where) => {
    node.scrollIntoView({ block: where });
  }, block);
}

/** Waits for every finite animation and transition on the page, shadow roots included. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) =>
      animation.effect?.getComputedTiming().endTime !== Infinity
    );
    await Promise.all(finite.map((animation) => animation.finished));
  });
}

/** Steam's global header, which carries the account name, avatar and wallet when signed in. */
export const STEAM_HEADER = "#global_header";

/** Scrolls so the bottom of `selector` sits at the top of the viewport. */
export async function scrollPast(page: Page, selector: string): Promise<void> {
  const target = await page.waitForSelector(selector, WAIT);
  if (target === null) {
    throw new Error(selector);
  }
  await target.evaluate((node) => {
    window.scrollBy(0, node.getBoundingClientRect().bottom);
  });
}

/**
 * The tagged hosts that Steam itself names another app: neither their store link nor Steam's own
 * `data-ds-appid` matches the app they were tagged for. A demo row links to its full game and
 * names the demo, so either match is enough. A shot with any puts one game's tags on another.
 */
async function strangers(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-tks-appid]")].flatMap((host) => {
      const link = host.closest("a[href]") ?? host.querySelector("a[href]");
      const linked = /\/app\/(\d+)/.exec(link?.getAttribute("href") ?? "")?.[1];
      const named = host.closest("[data-ds-appid]")?.getAttribute("data-ds-appid");
      const tagged = host.getAttribute("data-tks-appid") ?? "";
      const known = [linked, named].filter((id) => typeof id === "string");
      return known.length === 0 || known.includes(tagged)
        ? []
        : [`${tagged} on ${known.join("/")}`];
    })
  );
}

/** How many chips sit fully inside the frame, on shown rows. */
function chipsInView(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".tks-chips")]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.height > 0 && box.top >= 0 && box.bottom <= window.innerHeight;
      })
      .reduce((sum, node) => sum + node.children.length, 0)
  );
}

/** Scrolls one wheel step at the middle of the frame, so inner scroll lists move too. */
async function wheelStep(page: Page, delta: number): Promise<void> {
  await page.mouse.move(STORE_VIEWPORT.width / 2, STORE_VIEWPORT.height / 2);
  await page.mouse.wheel({ deltaY: delta });
  await page.waitForNetworkIdle(STEP_IDLE);
}

/**
 * Wheels down `steps` times, then back up to the frame that held the most chips. Returns that
 * count. It works on window scrolling and on Steam's virtual lists alike.
 */
export async function densestFrame(page: Page, steps: number): Promise<number> {
  const counts = [await chipsInView(page)];
  for (let step = 0; step < steps; step += 1) {
    await wheelStep(page, WHEEL);
    counts.push(await chipsInView(page));
  }
  const most = Math.max(...counts);
  for (let step = counts.length - 1; step > counts.indexOf(most); step -= 1) {
    await wheelStep(page, -WHEEL);
  }
  return most;
}

/**
 * Wheels down until `selector` exists, for sections Steam renders on scroll. Fails after `steps`.
 */
export async function wheelUntil(page: Page, selector: string, steps: number): Promise<void> {
  for (let step = 0; (await page.$(selector)) === null; step += 1) {
    if (step === steps) {
      throw new Error(selector);
    }
    await wheelStep(page, WHEEL);
  }
}

/** Scrolls `selector` to the top of the frame, just below Steam's sticky store bar. */
export async function revealBelowNav(page: Page, selector: string): Promise<void> {
  await reveal(page, selector, "start");
  await page.evaluate((offset) => {
    window.scrollBy(0, -offset);
  }, NAV_HEIGHT);
  await page.waitForNetworkIdle(STEP_IDLE);
}

/** How many elements match `selector`, shadow roots included through `>>>`. */
export async function countOf(page: Page, selector: string): Promise<number> {
  return (await page.$$(selector)).length;
}

/**
 * Draws the image `png` (base64) over the top right of the viewport, as the toolbar popup sits
 * under its button. It only exists in the capture tab.
 */
export async function overlayPopup(page: Page, png: string): Promise<void> {
  await page.evaluate(async (data) => {
    const image = document.createElement("img");
    image.src = `data:image/png;base64,${data}`;
    Object.assign(image.style, {
      position: "fixed",
      top: "0",
      right: "24px",
      zIndex: "2147483647",
      border: "1px solid #3d4450",
      boxShadow: "0 12px 32px rgb(0 0 0 / 60%)",
    });
    document.body.append(image);
    await image.decode();
  }, png);
}

/** Saves the viewport as screenshot `name` for `locale`, with no cookie banner over it. */
export async function save(page: Page, locale: CaptureLocale, name: string): Promise<void> {
  // Steam can show its cookie banner late, after the page went quiet.
  await rejectCookies(page);
  const wrong = await strangers(page);
  if (wrong.length > 0) {
    throw new Error(wrong.join(", "));
  }
  const path = screenshotPath(locale, name);
  // A locale folder such as es/ does not exist until its first capture.
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, type: "png" });
}
