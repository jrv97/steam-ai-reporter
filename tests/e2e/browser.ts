/**
 * Launches Chromium or Firefox Nightly with the built extension installed, on a throwaway profile,
 * through puppeteer-core (ADR 0020). The binaries come from SAR_CHROMIUM_BIN and SAR_GECKO_BIN,
 * which `mise run e2e` checks before the tests start.
 */
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { BidiBrowser } from "puppeteer-core/internal/bidi/Browser.js";
import geckoManifest from "../../src/platform/extension/manifest.gecko.json";

export type Engine = "chromium" | "gecko";

export const ENGINES: readonly Engine[] = ["chromium", "gecko"];

/** A running browser with the extension installed. */
export interface ExtensionBrowser {
  /** Opens an extension page, such as `options.html`, in a new tab once it has loaded. */
  open(path: string): Promise<Page>;
  /**
   * Resolves with the tab the extension opens at exactly `path`. Call it before the action that
   * opens the tab. On Gecko it reconnects, and pages returned earlier stop working.
   */
  waitForPage(path: string): Promise<Page>;
  close(): Promise<void>;
}

const TIMEOUT_MS = 10_000;
const POLL_MS = 100;
const EXIT_MS = 5_000;
const LOCALE = "en-US";

function envPath(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(name);
  }
  return value;
}

function distDir(engine: Engine): string {
  return fileURLToPath(new URL(`../../dist/${engine}`, import.meta.url));
}

export async function launch(engine: Engine): Promise<ExtensionBrowser> {
  return engine === "chromium" ? launchChromium() : launchGecko();
}

async function installed(browser: Browser, engine: Engine): Promise<string> {
  try {
    return await browser.installExtension(distDir(engine));
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function launchChromium(): Promise<ExtensionBrowser> {
  // Pipe mode plus extension debugging lets the driver install the unpacked build.
  const browser = await puppeteer.launch({
    executablePath: envPath("SAR_CHROMIUM_BIN"),
    headless: false,
    pipe: true,
    enableExtensions: true,
    args: [`--lang=${LOCALE}`],
  });
  const id = await installed(browser, "chromium");
  const url = (path: string): string => `chrome-extension://${id}/${path}`;
  return {
    async open(path) {
      const page = await browser.newPage();
      await page.goto(url(path));
      return page;
    },
    async waitForPage(path) {
      const target = await browser.waitForTarget((t) => t.url() === url(path), {
        timeout: TIMEOUT_MS,
      });
      return target.asPage();
    },
    close: () => browser.close(),
  };
}

/** Resolves once the browser process has exited, so its profile files are unlocked. */
function exited(child: ChildProcess | null | undefined): Promise<void> {
  // A process killed by a signal has no exit code, only a signal code.
  if (child?.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once("exit", () => {
      resolve();
    });
  });
}

/** Waits for the browser process to exit, kills it when it lingers, then deletes its profile. */
async function removeProfile(profile: string, child: ChildProcess | null | undefined) {
  // A failed reconnect leaves no session to close the browser with.
  const done = exited(child);
  const late = new Promise<"late">((resolve) => {
    AbortSignal.timeout(EXIT_MS).addEventListener("abort", () => {
      resolve("late");
    });
  });
  if ((await Promise.race([done, late])) === "late") {
    // SIGKILL cannot be caught or ignored, so the exit follows.
    child?.kill("SIGKILL");
    await done;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}

async function launchGecko(): Promise<ExtensionBrowser> {
  // A random UUID per launch, preset through a pref, gives a known moz-extension:// origin.
  const uuid = crypto.randomUUID();
  // After a reconnect puppeteer skips its own profile cleanup, so this module owns the profile.
  const profile = await mkdtemp(join(tmpdir(), "sar-e2e-gecko-"));
  let launched: Browser | undefined;
  try {
    launched = await puppeteer.launch({
      browser: "firefox",
      executablePath: envPath("SAR_GECKO_BIN"),
      userDataDir: profile,
      headless: false,
      // Firefox treats extension pages as privileged and refuses to drive them without this.
      env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
      extraPrefsFirefox: {
        "extensions.webextensions.uuids": JSON.stringify({
          [geckoManifest.browser_specific_settings.gecko.id]: uuid,
        }),
        "extensions.openPopupWithoutUserGesture.enabled": true,
        "intl.accept_languages": LOCALE,
        "intl.locale.requested": LOCALE,
      },
    });
    await installed(launched, "gecko");
  } catch (error) {
    // `installed` has closed a browser that started; a failed launch left none.
    await removeProfile(profile, launched?.process());
    throw error;
  }
  const child = launched.process();
  let browser: Browser = launched;
  const url = (path: string): string => `moz-extension://${uuid}/${path}`;

  function bidi(): BidiBrowser {
    if (!(browser instanceof BidiBrowser)) {
      throw new TypeError();
    }
    return browser;
  }

  async function contextUrls(): Promise<string[]> {
    const tree = await bidi().connection.send("browsingContext.getTree", { maxDepth: 0 });
    return tree.result.contexts.map((context) => context.url);
  }

  // Firefox sends no BiDi events for extension tabs (bug 1755014), and puppeteer never learns of
  // them. A new session reads the whole tree and adopts every open tab.
  async function adopt(href: string): Promise<Page> {
    const endpoint = browser.wsEndpoint();
    await browser.disconnect();
    browser = await puppeteer.connect({ browserWSEndpoint: endpoint, protocol: "webDriverBiDi" });
    for (const page of await browser.pages()) {
      if ((await page.evaluate(() => location.href)) === href) {
        return page;
      }
    }
    throw new Error(href);
  }

  return {
    async open(path) {
      const { result } = await bidi().connection.send("browsingContext.create", { type: "tab" });
      await bidi().connection.send("browsingContext.navigate", {
        context: result.context,
        url: url(path),
        wait: "complete",
      });
      return adopt(url(path));
    },
    async waitForPage(path) {
      const href = url(path);
      const deadline = Date.now() + TIMEOUT_MS;
      while (!(await contextUrls()).includes(href)) {
        if (Date.now() > deadline) {
          throw new Error(href);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      return adopt(href);
    },
    async close() {
      await browser.close();
      await removeProfile(profile, child);
    },
  };
}
