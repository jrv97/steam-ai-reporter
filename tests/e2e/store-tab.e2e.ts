import { expect, it } from "vitest";
import { APP_PAGE_ORIGIN } from "../../src/core/detect/app-page";
import { STORE_TAB_MESSAGE } from "../../src/platform/extension/store-tab";
import { STORE_TAB_ICON } from "../../src/platform/extension/store-tab-icon";
import { ENGINES, WAIT, withBrowser } from "./browser";

// The store page's announcement that turns the toolbar icon normal (ADR 0027). No driver reads the
// toolbar icon, so the control page listens beside the background script, records each message,
// then sets the same icon on the tab it heard to prove the paths load.

const STORE_HOME = `${APP_PAGE_ORIGIN}/`;
const BLANK = "about:blank";
const HEARD_KEY = "tks-e2e-heard";

it.each(ENGINES)(
  "%s: a store tab names itself on load and again after Back",
  (engine) =>
    withBrowser(engine, async (browser) => {
      const { page, api } = await browser.control();
      await page.evaluate(
        (ext, key) => {
          ext.runtime.onMessage.addListener((message: unknown, sender) => {
            const line = JSON.stringify({ message, tab: sender.tab?.id });
            sessionStorage.setItem(key, `${sessionStorage.getItem(key) ?? ""}${line}\n`);
          });
        },
        api,
        HEARD_KEY,
      );
      /** One JSON line per message the control page heard, in order. */
      const heard = async (): Promise<readonly string[]> =>
        (await page.evaluate((key) => sessionStorage.getItem(key) ?? "", HEARD_KEY))
          .split("\n")
          .filter((line) => line !== "");

      const store = await browser.web(STORE_HOME);
      await expect.poll(heard, WAIT).toHaveLength(1);
      await store.goto(BLANK);
      await store.goBack();
      await expect.poll(heard, WAIT).toHaveLength(2);

      const lines = await heard();
      expect(new Set(lines).size).toBe(1);
      expect(lines[0]).toContain(JSON.stringify(STORE_TAB_MESSAGE));
      const tab = Number(/"tab":(\d+)/.exec(lines[0] ?? "")?.[1]);
      await expect(
        page.evaluate(
          async (ext, tabId, path) => {
            await ext.action.setIcon({ tabId, path });
          },
          api,
          tab,
          STORE_TAB_ICON,
        ),
      ).resolves.toBeUndefined();
    }),
);
