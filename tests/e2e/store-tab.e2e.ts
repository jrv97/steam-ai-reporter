import { expect, it, vi } from "vitest";
import { APP_PAGE_ORIGIN } from "../../src/core/detect/app-page";
import { STORE_TAB_MESSAGE } from "../../src/platform/extension/store-tab";
import { ENGINES, launch } from "./browser";

// The store page's announcement that turns the toolbar icon normal (ADR 0027). No driver reads the
// toolbar icon, so the control page listens beside the background script and records each message.

const STORE_HOME = `${APP_PAGE_ORIGIN}/`;
const BLANK = "about:blank";
const HEARD = "tksHeard";
const WAIT = { timeout: 10_000, interval: 100 };

it.each(ENGINES)("%s: a store tab names itself on load and after Back", async (engine) => {
  const browser = await launch(engine, { headed: false });
  try {
    const { page, api } = await browser.control();
    await page.evaluate(
      (ext, key) => {
        const root = document.documentElement;
        root.dataset[key] = "";
        ext.runtime.onMessage.addListener((message: unknown, sender) => {
          const line = JSON.stringify({ message, tab: sender.tab?.id });
          root.dataset[key] = `${root.dataset[key] ?? ""}${line}\n`;
        });
      },
      api,
      HEARD,
    );
    /** One JSON line per message the control page heard, in order. */
    const heard = async (): Promise<readonly string[]> =>
      (await page.evaluate((key) => document.documentElement.dataset[key] ?? "", HEARD))
        .split("\n")
        .filter((line) => line !== "");
    const count = (expected: number) => async () => {
      expect(await heard()).toHaveLength(expected);
    };

    const store = await browser.web(STORE_HOME);
    await vi.waitFor(count(1), WAIT);
    await store.goto(BLANK);
    await store.goBack();
    await vi.waitFor(count(2), WAIT);

    const lines = await heard();
    expect(new Set(lines).size).toBe(1);
    expect(lines[0]).toMatch(/"tab":\d+/);
    expect(lines[0]).toContain(JSON.stringify(STORE_TAB_MESSAGE));
  } finally {
    await browser.close();
  }
});
