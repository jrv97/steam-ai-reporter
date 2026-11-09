import type { Page } from "puppeteer-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { KindId } from "../../src/core/kinds/id";
import type { Settings, SettingsPatch } from "../../src/core/settings/settings";
import { GENERAL_TAB, tabHash } from "../../src/core/ui/tab-id";
import { type ExtensionBrowser, launch } from "../e2e/browser";
import {
  alignBottom,
  captureLocale,
  captureProfile,
  countOf,
  densestFrame,
  overlayPopup,
  rejectCookies,
  restoreSampleConfig,
  reveal,
  revealBelowNav,
  sampleSettings,
  save,
  scrollPast,
  settingsPage,
  settle,
  STEAM_HEADER,
  storePage,
  WAIT,
  wheelUntil,
  writeSettings,
} from "./capture";

// The store screenshots in upload order: the Chrome Web Store takes the first five, AMO and the
// README take them all. Each shot checks that what it shows is on the page before it saves, so
// drifted Steam data fails the run instead of saving a thin image. Shots 06 to 08 need the
// signed-in profile copy. The runbook is docs/store/screenshots.mdx.

const STORE = "https://store.steampowered.com";
const SEARCH = `${STORE}/search/?term=Electronic+Arts`;
/** THE FINALS: an AI disclosure with a developer note, plus several other tags. */
const APP = `${STORE}/app/2073850/`;
const HOME = `${STORE}/`;
const WISHLIST = `${STORE}/wishlist/`;

/** The kind whose tab the last settings shot opens: it has values to tag and chip text. */
const KIND_TAB: KindId = "deck";

const BADGE = ".sar-badge";
const COMPACT = ".sar-compact";
const CHIPS = ".sar-chips";
const HOVER_CARD = ">>> .sar-hovercard";
const HIDDEN_NOTICE = ">>> .sar-list-notice-text";
const BANNER = ">>> .sar-banner-host";
const TAG_SECTION = ".sar-tag-section-label";
const ORDER_HANDLE = ".sar-order-handle";
const ORDER_CARD = ".sar-card:has(.sar-order-handle)";
/** The open tab's preview: every tag's panel is in the page, and only one is shown. */
const CHIP_PREVIEW = "[role=tabpanel]:not([hidden]) .sar-chip-preview";
const POPUP = ".sar-options";
const DECK_ROW = "#home_deck_content";
const QUEUE_CHIPS = "[role=dialog] .sar-chips";

/** How far the densest-frame search wheels through a page, and the chips it must find. */
const SEARCH_STEPS = 12;
const WISHLIST_STEPS = 40;
const LAZY_STEPS = 20;
const SEARCH_CHIPS = 4;
const WISHLIST_CHIPS = 3;

const locale = captureLocale();
const signedOut = captureProfile() === undefined;
const { queueWidget, calendarWidget } = locale;
let browser: ExtensionBrowser;
let base: Settings;

/** Stores the sample settings in the capture locale with `patch` on top. */
function use(patch: SettingsPatch = {}): Promise<void> {
  return writeSettings(browser, base, { ...patch, locale: locale.setting });
}

/** Waits until at least `least` elements match `selector`. */
async function atLeast(page: Page, selector: string, least: number): Promise<void> {
  await page.waitForFunction(
    (css, min) => document.querySelectorAll(css).length >= min,
    WAIT,
    selector,
    least,
  );
}

/** Hovers the row with the most chips in the upper part of the frame, so its card fits below. */
async function hoverFullestRow(page: Page): Promise<void> {
  const rows = await page.$$(CHIPS);
  const sizes = await Promise.all(
    rows.map((row) =>
      row.evaluate((node) => {
        const box = node.getBoundingClientRect();
        const fits = box.height > 0 && box.top > 0 && box.top < window.innerHeight * 0.6;
        return fits ? node.children.length : 0;
      })
    ),
  );
  const most = Math.max(0, ...sizes);
  const chip = await rows[sizes.indexOf(most)]?.$(":scope > *");
  if (most === 0 || chip === undefined || chip === null) {
    throw new Error(CHIPS);
  }
  // The pointer leaves the page first, so the hover is a fresh mouseover on the chip itself.
  await page.mouse.move(0, 0);
  await chip.hover();
  await page.waitForSelector(HOVER_CARD, { ...WAIT, visible: true });
  await settle(page);
}

beforeAll(async () => {
  base = await sampleSettings();
  browser = await launch("chromium", { locale: locale.browser, profile: captureProfile() });
  await restoreSampleConfig(browser);
}, 120_000);

afterAll(async () => {
  await browser.close();
});

// The sample config dims some tags and hides others, so the results show both with the notice.
it("01-search: chips, dimmed and hidden games, and a hover card", async () => {
  await use();
  const page = await storePage(browser, locale, SEARCH);
  await atLeast(page, BADGE, 6);
  await page.waitForSelector(HIDDEN_NOTICE, WAIT);
  expect(await densestFrame(page, SEARCH_STEPS)).toBeGreaterThanOrEqual(SEARCH_CHIPS);
  await rejectCookies(page);
  await hoverFullestRow(page);
  await save(page, locale, "01-search");
  await page.close();
});

it("02-app: the banner and the tag row on a game page", async () => {
  await use();
  const page = await storePage(browser, locale, APP);
  await page.waitForSelector(BANNER, WAIT);
  await page.waitForSelector(TAG_SECTION, WAIT);
  // The banner ends the frame; the tag row and the game's details sit above it.
  await alignBottom(page, BANNER);
  await save(page, locale, "02-app");
  await page.close();
});

it("03-home: badges on capsules and the toolbar popup", async () => {
  await use();
  const popup = await browser.open("options.html?context=popup");
  const panel = await popup.waitForSelector(POPUP, WAIT);
  const png = await panel?.screenshot({ type: "png", encoding: "base64" });
  await popup.close();
  expect(png).toBeDefined();
  const page = await storePage(browser, locale, HOME);
  await atLeast(page, COMPACT, 6);
  await scrollPast(page, STEAM_HEADER);
  await overlayPopup(page, png ?? "");
  await save(page, locale, "03-home");
  await page.close();
});

it("04-settings: General with the tag order", async () => {
  await use();
  const page = await settingsPage(browser, `options.html${tabHash(GENERAL_TAB)}`);
  expect(await countOf(page, ORDER_HANDLE)).toBe(base.order.length);
  await reveal(page, ORDER_CARD, "start");
  await save(page, locale, "04-settings");
  await page.close();
});

it("05-tag: a tag's own tab with its values and chip text", async () => {
  await use();
  const page = await settingsPage(browser, `options.html${tabHash(KIND_TAB)}`);
  await reveal(page, CHIP_PREVIEW, "end");
  await save(page, locale, "05-tag");
  await page.close();
});

it.skipIf(signedOut)(
  "06-queue: chips in the discovery queue opened from the store home",
  async () => {
    await use();
    const page = await storePage(browser, locale, HOME);
    const widget = `::-p-text(${queueWidget})`;
    await wheelUntil(page, widget, LAZY_STEPS);
    await page.locator(widget).setTimeout(WAIT.timeout).click();
    await page.waitForSelector(QUEUE_CHIPS, { ...WAIT, visible: true });
    await page.waitForNetworkIdle({ idleTime: 1_500, timeout: WAIT.timeout });
    await settle(page);
    await save(page, locale, "06-queue");
    await page.close();
  },
);

it.skipIf(signedOut)("07-wishlist: the wishlist frame with the most chips", async () => {
  await use();
  const page = await storePage(browser, locale, WISHLIST);
  await atLeast(page, BADGE, 1);
  expect(await densestFrame(page, WISHLIST_STEPS)).toBeGreaterThanOrEqual(WISHLIST_CHIPS);
  await settle(page);
  await save(page, locale, "07-wishlist");
  await page.close();
});

it.skipIf(signedOut)(
  "08-calendar: badges on the home page's personal calendar",
  async () => {
    await use();
    const page = await storePage(browser, locale, HOME);
    const widget = `::-p-text(${calendarWidget})`;
    await wheelUntil(page, widget, LAZY_STEPS);
    await revealBelowNav(page, widget);
    await save(page, locale, "08-calendar");
    await page.close();
  },
);

it("09-deck: badges on the home page's Steam Deck row", async () => {
  await use();
  const page = await storePage(browser, locale, HOME);
  await wheelUntil(page, DECK_ROW, LAZY_STEPS);
  await revealBelowNav(page, DECK_ROW);
  await save(page, locale, "09-deck");
  await page.close();
});
