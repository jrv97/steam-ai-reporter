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
import puppeteer, {
  type Browser,
  type JSHandle,
  type Page,
  type Target,
  TargetType,
} from "puppeteer-core";
import { BidiBrowser } from "puppeteer-core/internal/bidi/Browser.js";
import geckoManifest from "../../src/platform/extension/manifest.gecko.json";

export type Engine = "chromium" | "gecko";

export const ENGINES: readonly Engine[] = ["chromium", "gecko"];

/** A running browser with the extension installed. */
export interface ExtensionBrowser {
  /** Opens an extension page, such as `options.html`, in a new tab once it has loaded. */
  open(path: string): Promise<Page>;
  /**
   * Opens an extension page in a new tab with `preload` run before the page's own scripts, and
   * resolves once the page has loaded or closed itself. Chromium only.
   */
  visit(path: string, preload: () => void): Promise<void>;
  /**
   * Runs `action` and resolves with the tab the extension opens at exactly `path`. On Gecko it
   * reconnects after the action settles, and pages returned earlier stop working.
   */
  openedBy(path: string, action: () => Promise<void>): Promise<Page>;
  /** An extension page of its own in a background tab, opened on first use, to drive the API. */
  control(): Promise<Control>;
  /** The address tab `tab` shows, as the driver sees it, or "" when the driver cannot tell. */
  urlOf(tab: number): Promise<string>;
  close(): Promise<void>;
}

/** Firefox Nightly, which can also open container tabs. */
export interface GeckoExtensionBrowser extends ExtensionBrowser {
  /** Opens `url` in a new tab of a new container, without waiting for it to load. */
  containerTab(url: string): Promise<void>;
}

/**
 * An extension page and its WebExtension namespace: `browser` on Firefox, else `chrome`, as the
 * extension's own code picks. Pass `api` to `page.evaluate` to call the API in the page.
 */
export interface Control {
  readonly page: Page;
  readonly api: JSHandle<typeof chrome>;
}

const TIMEOUT_MS = 10_000;
const POLL_MS = 100;
const EXIT_MS = 5_000;
const LOCALE = "en-US";
/** The extension page behind `control`. */
const CONTROL_PATH = "options.html?context=popup";

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

export function launch(engine: "gecko", headed?: boolean): Promise<GeckoExtensionBrowser>;
export function launch(engine: Engine, headed?: boolean): Promise<ExtensionBrowser>;
/** Launches `engine` with the extension, headed when `headed` is true. */
export async function launch(engine: Engine, headed = false): Promise<ExtensionBrowser> {
  // Headless, so a run takes no focus from the desktop. SAR_E2E_HEADED=1 shows the windows.
  const hidden = !headed && process.env["SAR_E2E_HEADED"] !== "1";
  return engine === "chromium" ? launchChromium(hidden) : launchGecko(hidden);
}

async function controlOf(page: Page): Promise<Control> {
  const api = await page.evaluateHandle(() =>
    "browser" in globalThis ? globalThis.browser : globalThis.chrome
  );
  return { page, api };
}

/** The tab an extension page runs in, or undefined for a page outside a tab. */
async function tabIdOf(target: Target): Promise<number | undefined> {
  const page = await target.page();
  return page?.evaluate(async () => (await chrome.tabs.getCurrent())?.id);
}

async function installed(browser: Browser, engine: Engine): Promise<string> {
  try {
    return await browser.installExtension(distDir(engine));
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function launchChromium(hidden: boolean): Promise<ExtensionBrowser> {
  // Pipe mode plus extension debugging lets the driver install the unpacked build.
  const browser = await puppeteer.launch({
    executablePath: envPath("SAR_CHROMIUM_BIN"),
    headless: hidden,
    pipe: true,
    enableExtensions: true,
    args: [`--lang=${LOCALE}`],
  });
  const id = await installed(browser, "chromium");
  const url = (path: string): string => `chrome-extension://${id}/${path}`;

  // Chromium hides a web page's address from an extension without the tabs permission. The driver
  // ties each extension page's target to its tab ID while the page runs. The target stays the same
  // when the tab moves on to another address.
  const targets = new Map<number, Target>();
  const pending = new Set<Promise<void>>();
  function track(target: Target): void {
    if (target.type() !== TargetType.PAGE || !target.url().startsWith(url(""))) {
      return;
    }
    const done = tabIdOf(target)
      .then((tab) => {
        if (tab !== undefined) {
          targets.set(tab, target);
        }
      })
      // A page that moves on before it answers is tracked again at its next extension address.
      .catch(() => undefined)
      .finally(() => pending.delete(done));
    pending.add(done);
  }
  browser.on("targetcreated", track);
  browser.on("targetchanged", track);

  async function open(path: string): Promise<Page> {
    const page = await browser.newPage();
    await page.goto(url(path));
    return page;
  }
  let control: Promise<Control> | undefined;

  return {
    open,
    async visit(path, preload) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(preload);
      try {
        await page.goto(url(path));
      } catch (error) {
        if (!page.isClosed()) {
          throw error;
        }
      }
    },
    async openedBy(path, action) {
      // Listen first: the target can appear before the action resolves.
      const [target] = await Promise.all([
        browser.waitForTarget((t) => t.url() === url(path), { timeout: TIMEOUT_MS }),
        action(),
      ]);
      return target.asPage();
    },
    control() {
      control ??= open(CONTROL_PATH).then(controlOf);
      return control;
    },
    async urlOf(tab) {
      await Promise.all(pending);
      return targets.get(tab)?.url() ?? "";
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

/** Resolves with whether `done` settled within `ms`. */
function settlesWithin(done: Promise<void>, ms: number): Promise<boolean> {
  const late = new Promise<false>((resolve) => {
    AbortSignal.timeout(ms).addEventListener("abort", () => {
      resolve(false);
    });
  });
  return Promise.race([done.then(() => true), late]);
}

/** Waits for the browser process to exit, kills it when it lingers, then deletes its profile. */
async function removeProfile(profile: string, child: ChildProcess | null | undefined) {
  // A failed reconnect leaves no session to close the browser with.
  const done = exited(child);
  if (!(await settlesWithin(done, EXIT_MS))) {
    child?.kill("SIGKILL");
    // The second bound keeps a kill the OS never carries out from stalling the run.
    await settlesWithin(done, EXIT_MS);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}

async function launchGecko(hidden: boolean): Promise<GeckoExtensionBrowser> {
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
      headless: hidden,
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

  async function open(path: string): Promise<Page> {
    const { result } = await bidi().connection.send("browsingContext.create", { type: "tab" });
    await bidi().connection.send("browsingContext.navigate", {
      context: result.context,
      url: url(path),
      wait: "complete",
    });
    return adopt(url(path));
  }

  // A reconnect retires the pages of the session before it, so the control page is found again.
  let held: { readonly session: Browser; readonly page: Page; } | undefined;
  async function controlPage(): Promise<Page> {
    if (held?.session !== browser) {
      const page = held === undefined ? await open(CONTROL_PATH) : await adopt(url(CONTROL_PATH));
      held = { session: browser, page };
    }
    return held.page;
  }

  // The namespace handle belongs to one session too, so it is fetched on each call.
  const control = async (): Promise<Control> => controlOf(await controlPage());

  return {
    open,
    // Firefox runs no BiDi preload script in an extension page, so a test that needs one is
    // Chromium only.
    visit(path) {
      return Promise.reject(new TypeError(path));
    },
    async openedBy(path, action) {
      // A reconnect would cut off a command of the action that is still in flight.
      await action();
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
    control,
    // Firefox shows the extension the address of a store page, which its content script matches.
    async urlOf(tab) {
      const { page, api } = await control();
      return page.evaluate(async (ext, id) => (await ext.tabs.get(id)).url ?? "", api, tab);
    },
    async containerTab(address) {
      const { result: user } = await bidi().connection.send("browser.createUserContext", {});
      const { result } = await bidi().connection.send("browsingContext.create", {
        type: "tab",
        userContext: user.userContext,
      });
      await bidi().connection.send("browsingContext.navigate", {
        context: result.context,
        url: address,
        wait: "none",
      });
    },
    async close() {
      await browser.close();
      await removeProfile(profile, child);
    },
  };
}
