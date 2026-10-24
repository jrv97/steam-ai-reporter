import type { AiDisclosed } from "../kinds/ai";
import type { TagKind } from "../kinds/kind";
import type { MessageCatalog } from "../ports";
import { normalizeBreaks } from "./notes";
import { adoptStyles, BANNER_CSS } from "./styles";

/** The banner host's id, the target of the summary row's link. */
export const BANNER_ID = "sar-banner";

/** The store's left description column; the banner goes first in it, above the purchase box. */
const COLUMN_SELECTOR = ".game_description_column";

/** An `aria-live` token, not copy. */
const POLITE = "polite";

const TITLE_ID = "sar-banner-title";
const NOTES_ID = "sar-banner-notes";

/** What the banner's buttons do outside the banner. Each rejects when storage fails. */
export interface BannerActions {
  /** Adds the game to the allow-list. */
  stopMarking(): Promise<void>;
  /** Takes it off the allow-list again. */
  markAgain(): Promise<void>;
}

export interface BannerOptions {
  /** Schedules the collapse measurement after layout; `requestAnimationFrame` by default. */
  readonly frame?: (callback: () => void) => void;
  /** Whether the collapsed notes hide text; compares scroll and client height by default. */
  readonly overflows?: (quote: HTMLElement) => boolean;
}

export interface Banner {
  /** `div.sar-banner-host`, the light-DOM element that holds the shadow root. */
  readonly host: HTMLElement;
  /** Shows the full notice, or the one-line note for an allow-listed game. Same view: no change. */
  show(verdict: AiDisclosed, allowed: boolean): void;
  /** Scrolls the banner into view and moves focus to it, for the summary row's jump. */
  reveal(): void;
}

type Variant = "full" | "ignored";

const ACTIONS = ["stop", "undo", "toggle"] as const;

type Action = (typeof ACTIONS)[number];

function parseAction(value: string | null): Action | undefined {
  return ACTIONS.find((action) => action === value);
}

interface Shown {
  readonly variant: Variant;
  readonly verdict: AiDisclosed;
}

function defaultFrame(doc: Document): (callback: () => void) => void {
  return (callback) => {
    const view = doc.defaultView;
    if (view === null) {
      callback();
    } else {
      view.requestAnimationFrame(callback);
    }
  };
}

function defaultOverflows(quote: HTMLElement): boolean {
  return quote.scrollHeight > quote.clientHeight;
}

/**
 * The app page banner: a store notice bubble in our hue, in a shadow root so store CSS cannot
 * reach it. It quotes the developer's notes verbatim through `textContent`, names the AI service
 * as plain text, and offers "Ignore this game"; an allow-listed game gets only a one-line
 * note with Undo. One delegated click listener on the shadow root serves every button.
 */
export function createBanner(
  doc: Document,
  i18n: MessageCatalog,
  kind: TagKind,
  actions: BannerActions,
  options: BannerOptions = {},
): Banner {
  const frame = options.frame ?? defaultFrame(doc);
  const overflows = options.overflows ?? defaultOverflows;

  const host = doc.createElement("div");
  host.className = "sar-banner-host";
  host.id = BANNER_ID;
  const shadow = host.attachShadow({ mode: "open" });
  adoptStyles(shadow, BANNER_CSS);

  let box = doc.createElement("aside");
  const live = element("div", "sar-vh");
  live.setAttribute("aria-live", POLITE);
  shadow.append(box, live);

  let shown: Shown | undefined;
  let pending = false;

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function button(className: string, action: Action, label: string): HTMLButtonElement {
    const node = element("button", className, label);
    node.type = "button";
    node.setAttribute("data-sar-action", action);
    return node;
  }

  function errorLine(): HTMLElement {
    const line = element("p", "sar-banner-error");
    line.setAttribute("role", "alert");
    line.hidden = true;
    return line;
  }

  /** Long notes start clamped; short ones lose the clamp and the toggle before first paint. */
  function measure(quote: HTMLElement, toggle: HTMLElement): void {
    if (!quote.isConnected) {
      return;
    }
    if (overflows(quote)) {
      toggle.hidden = false;
    } else {
      quote.removeAttribute("data-sar-collapsed");
      toggle.remove();
    }
  }

  function buildFull(verdict: AiDisclosed): HTMLElement {
    const aside = element("aside", "sar-banner");
    aside.setAttribute("aria-labelledby", TITLE_ID);
    aside.tabIndex = -1;

    const head = element("div", "sar-banner-head");
    const title = element("h2", "sar-banner-title", i18n.t(kind.messages.label));
    title.id = TITLE_ID;
    head.append(title, button("sar-banner-action", "stop", i18n.t("banner_ignore")));

    const quote = element("blockquote", "sar-banner-quote", normalizeBreaks(verdict.notes));
    quote.id = NOTES_ID;
    quote.setAttribute("data-sar-collapsed", "true");
    const toggle = button("sar-banner-link", "toggle", i18n.t("banner_expand"));
    toggle.setAttribute("aria-expanded", String(false));
    toggle.setAttribute("aria-controls", NOTES_ID);
    toggle.hidden = true;

    aside.append(head, element("p", "sar-banner-source", i18n.t("banner_source")), quote, toggle);
    if (verdict.service !== undefined && verdict.service !== "") {
      const service = element("p", "sar-banner-service", i18n.t(kind.messages.bannerService));
      service.append(" ", element("span", "sar-banner-service-name", verdict.service));
      aside.append(service);
    }
    aside.append(errorLine());
    frame(() => {
      measure(quote, toggle);
    });
    return aside;
  }

  function buildIgnored(): HTMLElement {
    const aside = element("aside", "sar-banner");
    aside.setAttribute("data-sar-variant", "ignored");
    aside.setAttribute("aria-label", i18n.t(kind.messages.bannerRegion));
    aside.tabIndex = -1;
    aside.append(
      element("span", "sar-banner-ignored-text", i18n.t("banner_ignored")),
      button("sar-banner-link", "undo", i18n.t("banner_undo")),
      errorLine(),
    );
    return aside;
  }

  function render(variant: Variant, verdict: AiDisclosed): void {
    const next = variant === "full" ? buildFull(verdict) : buildIgnored();
    box.replaceWith(next);
    box = next;
    shown = { variant, verdict };
  }

  function toggleNotes(toggle: Element): void {
    const quote = box.querySelector(".sar-banner-quote");
    if (quote === null) {
      return;
    }
    const expand = quote.getAttribute("data-sar-collapsed") === "true";
    quote.setAttribute("data-sar-collapsed", expand ? "false" : "true");
    toggle.setAttribute("aria-expanded", expand ? "true" : "false");
    toggle.textContent = i18n.t(expand ? "banner_collapse" : "banner_expand");
  }

  async function run(action: () => Promise<void>, next: Variant): Promise<void> {
    if (pending || shown === undefined) {
      return;
    }
    const { verdict } = shown;
    pending = true;
    try {
      await action();
    } catch {
      const error = box.querySelector<HTMLElement>(".sar-banner-error");
      if (error !== null) {
        error.textContent = i18n.t("error_allow_list_save");
        error.hidden = false;
      }
      return;
    } finally {
      pending = false;
    }
    if (shown.variant !== next) {
      render(next, verdict);
    }
    const focus = box.querySelector<HTMLElement>(
      `[data-sar-action="${next === "ignored" ? "undo" : "stop"}"]`,
    );
    focus?.focus();
    live.textContent = i18n.t(
      next === "ignored" ? "notice_marking_stopped" : "notice_marking_restored",
    );
  }

  shadow.addEventListener("click", (event) => {
    const target = event.target;
    const control = target instanceof Element ? target.closest("[data-sar-action]") : null;
    if (control === null) {
      return;
    }
    const action = parseAction(control.getAttribute("data-sar-action"));
    switch (action) {
      case "toggle":
        toggleNotes(control);
        break;
      case "stop":
        void run(() => actions.stopMarking(), "ignored");
        break;
      case "undo":
        void run(() => actions.markAgain(), "full");
        break;
      case undefined:
        break;
    }
  });

  return {
    host,

    show(verdict, allowed) {
      const variant: Variant = allowed ? "ignored" : "full";
      const same = shown?.variant === variant
        && (variant === "ignored"
          || (shown.verdict.notes === verdict.notes && shown.verdict.service === verdict.service));
      if (same) {
        shown = { variant, verdict };
        return;
      }
      render(variant, verdict);
    },

    reveal() {
      host.scrollIntoView({ block: "start" });
      box.focus({ preventScroll: true });
    },
  };
}

/**
 * Puts the banner first in the description column, directly above the purchase box. Returns
 * false when the page has no such column (a gate, a redirect, a layout we do not know).
 */
export function placeBanner(doc: Document, host: HTMLElement): boolean {
  const column = doc.querySelector(COLUMN_SELECTOR);
  if (column === null) {
    return false;
  }
  if (column.firstElementChild !== host) {
    column.prepend(host);
  }
  return true;
}
