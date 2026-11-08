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
