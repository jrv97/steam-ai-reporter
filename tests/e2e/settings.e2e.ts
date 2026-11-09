import { expect, it } from "vitest";
import { englishI18n } from "../helpers/i18n";
import { ENGINES, launch } from "./browser";

const i18n = englishI18n();

it.each(ENGINES)("%s: the popup's gear opens the settings page", async (engine) => {
  const browser = await launch(engine);
  try {
    const popup = await browser.open("options.html?context=popup");
    const settings = await browser.openedBy(
      "options.html",
      () => popup.locator(`a[aria-label="${i18n.t("options_all_settings")}"]`).click(),
    );
    await settings.waitForSelector("[role=tablist]");
    expect(await settings.title()).toBe(i18n.t("ext_name"));
  } finally {
    await browser.close();
  }
});

/** Clicks the popup's DRM row in the frame that draws it, before the form has read storage. */
function clickDrmRowAtOnce(): void {
  new MutationObserver((_records, observer) => {
    const link = document.querySelector('a[data-sar-open-tab="drm"]');
    if (link instanceof HTMLElement) {
      observer.disconnect();
      link.click();
    }
  }).observe(document, { childList: true, subtree: true });
}

it("chromium: a popup row clicked at once opens the settings at its tab", async () => {
  const browser = await launch("chromium");
  try {
    const settings = await browser.openedBy(
      "options.html",
      () => browser.visit("options.html?context=popup", clickDrmRowAtOnce),
    );
    await settings.waitForSelector('[role=tab][data-sar-tab="drm"][aria-selected="true"]');
  } finally {
    await browser.close();
  }
});
