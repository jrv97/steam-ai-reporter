import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { englishI18n } from "../helpers/i18n";
import { ENGINES, type ExtensionBrowser, launch } from "./browser";

const i18n = englishI18n();
const POPUP = "options.html?context=popup";
const SETTINGS = "options.html";

describe.each(ENGINES)("%s", (engine) => {
  let browser: ExtensionBrowser | undefined;

  beforeAll(async () => {
    browser = await launch(engine);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("opens the settings page from the popup's gear", async () => {
    if (browser === undefined) {
      throw new Error(engine);
    }
    const popup = await browser.open(POPUP);
    const opened = browser.waitForPage(SETTINGS);
    await popup.locator(`a[aria-label="${i18n.t("options_all_settings")}"]`).click();
    const settings = await opened;
    await settings.waitForSelector("[role=tablist]");
    expect(await settings.title()).toBe(i18n.t("ext_name"));
  });
});
