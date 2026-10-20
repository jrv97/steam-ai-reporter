import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_PAGES } from "../../../tests/helpers/app-page";
import { setBody } from "../../../tests/helpers/dom";
import { englishI18n } from "../../../tests/helpers/i18n";
import { disclosedVerdict } from "../../../tests/helpers/verdicts";
import { type BannerActions, type BannerOptions, createBanner, placeBanner } from "./banner";

const XSS = '<img src=x onerror="alert(1)">Backgrounds\r\nwere generated.';

interface Pending {
  resolve(): void;
  reject(): void;
}

/** Actions whose promises the test settles by hand. */
function manualActions(): BannerActions & { readonly calls: Pending[]; } {
  const calls: Pending[] = [];
  const next = () =>
    new Promise<void>((resolve, reject) => {
      calls.push({
        resolve,
        reject: () => {
          reject(new Error());
        },
      });
    });
  return { calls, stopMarking: vi.fn(next), markAgain: vi.fn(next) };
}

function setup(options: BannerOptions = {}, actions: BannerActions = manualActions()) {
  setBody('<div class="game_description_column"><div id="game_area_purchase"></div></div>');
  const frames: (() => void)[] = [];
  const banner = createBanner(document, englishI18n(), actions, {
    frame: (callback) => frames.push(callback),
    ...options,
  });
  placeBanner(document, banner.host);
  const root = banner.host.shadowRoot;
  if (root === null) {
    throw new TypeError();
  }
  const runFrames = () => {
    for (const callback of frames.splice(0)) {
      callback();
    }
  };
  return { banner, root, runFrames };
}

function query(root: ShadowRoot, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new TypeError(selector);
  }
  return found;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createBanner", () => {
  it("renders the developer's notes verbatim, markup included, as plain text", () => {
    const { banner, root } = setup();
    banner.show(disclosedVerdict({ notes: XSS }), false);
    const quote = query(root, "blockquote.sar-banner-quote");
    expect(quote.textContent).toBe('<img src=x onerror="alert(1)">Backgrounds\nwere generated.');
    expect(quote.children).toHaveLength(0);
    expect(root.querySelector("img")).toBeNull();
  });

  it("uses catalog copy and the developer as the source", () => {
    const { banner, root } = setup();
    banner.show(disclosedVerdict(), false);
    expect(query(root, "h2").textContent).toBe("The developer discloses AI use");
    expect(query(root, ".sar-banner-source").textContent).toBe("In the developer's own words:");
    expect(query(root, ".sar-banner-action").textContent).toBe("Stop marking this game");
    expect(root.querySelector("svg")).toBeNull();
  });

  it("names the AI service as plain text, never a link", () => {
    const { banner, root } = setup();
    banner.show(disclosedVerdict({ service: "<b>Midjourney</b>" }), false);
    const service = query(root, ".sar-banner-service");
    expect(service.textContent).toBe("AI service named by the developer: <b>Midjourney</b>");
    expect(service.querySelector("a, b")).toBeNull();
  });

  it("omits the service line when the developer named none", () => {
    const { banner, root } = setup();
    banner.show(disclosedVerdict({ service: "" }), false);
    expect(root.querySelector(".sar-banner-service")).toBeNull();
  });

  it("keeps long notes collapsed behind a toggle", () => {
    const { banner, root, runFrames } = setup({ overflows: () => true });
    banner.show(disclosedVerdict(), false);
    const quote = query(root, ".sar-banner-quote");
    const toggle = query(root, '[data-sar-action="toggle"]');
    expect(toggle.hidden).toBe(true);
    runFrames();
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(quote.getAttribute("data-sar-collapsed")).toBe("false");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Show less");
    toggle.click();
    expect(quote.getAttribute("data-sar-collapsed")).toBe("true");
    expect(toggle.textContent).toBe("Show full disclosure");
  });

  it("drops the clamp and the toggle for short notes", () => {
    const { banner, root, runFrames } = setup({ overflows: () => false });
    banner.show(disclosedVerdict(), false);
    runFrames();
    expect(query(root, ".sar-banner-quote").hasAttribute("data-sar-collapsed")).toBe(false);
    expect(root.querySelector('[data-sar-action="toggle"]')).toBeNull();
  });

  it("shows an allow-listed game as one line with Undo and nothing else", () => {
    const { banner, root } = setup();
    banner.show(disclosedVerdict({ notes: XSS }), true);
    const aside = query(root, "aside");
    expect(aside.getAttribute("data-sar-variant")).toBe("ignored");
    expect(aside.getAttribute("aria-label")).toBe("AI use disclosure");
    expect(query(root, ".sar-banner-ignored-text").textContent).toBe(
      "You stopped marking this game.",
    );
    expect(query(root, ".sar-banner-link").textContent).toBe("Undo");
    expect(root.querySelector("blockquote, h2, .sar-banner-action")).toBeNull();
    expect(root.textContent).not.toContain("Backgrounds");
  });

  it("stops marking, moves focus to Undo and announces it", async () => {
    const actions = manualActions();
    const { banner, root } = setup({}, actions);
    banner.show(disclosedVerdict(), false);
    query(root, ".sar-banner-action").click();
    query(root, ".sar-banner-action").click();
    expect(actions.calls).toHaveLength(1);
    actions.calls[0]?.resolve();
    await vi.waitFor(() => {
      expect(query(root, "aside").getAttribute("data-sar-variant")).toBe("ignored");
    });
    expect(root.activeElement).toBe(query(root, '[data-sar-action="undo"]'));
    expect(query(root, "[aria-live]").textContent).toBe("Marking stopped for this game.");

    query(root, '[data-sar-action="undo"]').click();
    actions.calls[1]?.resolve();
    await vi.waitFor(() => {
      expect(root.querySelector("blockquote")).not.toBeNull();
    });
    expect(root.activeElement).toBe(query(root, ".sar-banner-action"));
    expect(query(root, "[aria-live]").textContent).toBe("Marking restored for this game.");
  });

  it("keeps the banner and shows an error when the allow-list cannot be saved", async () => {
    const actions = manualActions();
    const { banner, root } = setup({}, actions);
    banner.show(disclosedVerdict(), false);
    query(root, ".sar-banner-action").click();
    actions.calls[0]?.reject();
    await vi.waitFor(() => {
      expect(query(root, ".sar-banner-error").hidden).toBe(false);
    });
    expect(query(root, ".sar-banner-error").textContent).toBe(
      "Could not update this game. Try again.",
    );
    expect(query(root, ".sar-banner-error").getAttribute("role")).toBe("alert");
    expect(root.querySelector("blockquote")).not.toBeNull();
  });

  it("does not rebuild for the same view", () => {
    const { banner, root } = setup();
    const verdict = disclosedVerdict();
    banner.show(verdict, false);
    const aside = query(root, "aside");
    banner.show(disclosedVerdict(), false);
    expect(query(root, "aside")).toBe(aside);
  });
});

describe("placeBanner", () => {
  it("puts the banner first in the description column, above the purchase box", () => {
    setBody(APP_PAGES["5072580-ai-first.html"]);
    const banner = createBanner(document, englishI18n(), manualActions());
    expect(placeBanner(document, banner.host)).toBe(true);
    const column = document.querySelector(".game_description_column");
    expect(column?.firstElementChild).toBe(banner.host);
    expect(banner.host.nextElementSibling?.id).toBe("game_area_purchase");
  });

  it("reports a page without the column", () => {
    setBody("<div></div>");
    const banner = createBanner(document, englishI18n(), manualActions());
    expect(placeBanner(document, banner.host)).toBe(false);
    expect(banner.host.isConnected).toBe(false);
  });
});
