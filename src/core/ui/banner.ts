import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL, type AllowScope, toAllowScope } from "../settings/allow-data";
import { announce, POLITE } from "./announce";
import { KIND_ATTRIBUTE } from "./kind-attributes";
import { type KindDetail, kindDetails } from "./kind-details";
import { normalizeBreaks } from "./notes";
import { adoptStyles, BANNER_CSS } from "./styles";

/** The banner host's id. */
export const BANNER_ID = "sar-banner";

/** The store's left description column; the banner goes first in it, above the purchase box. */
const COLUMN_SELECTOR = ".game_description_column";

/** What the banner's buttons do outside the banner. Each rejects when storage fails. */
export interface BannerActions {
  /** Ignores the game in the scope: for one kind, or for all kinds. */
  ignore(scope: AllowScope): Promise<void>;
  /** Stops ignoring the game in the scope. */
  restore(scope: AllowScope): Promise<void>;
}

export interface BannerOptions {
  /** Schedules the collapse measurement after layout; `requestAnimationFrame` by default. */
  readonly frame?: (callback: () => void) => void;
  /** Whether the collapsed notes hide text; compares scroll and client height by default. */
  readonly overflows?: (quote: HTMLElement) => boolean;
}

/** What the banner shows for the game. */
export interface BannerView {
  /** The disclosed kinds listed in full, in registry order. */
  readonly shown: readonly AnyDisclosed[];
  /** The scopes the game is ignored in that the banner notes with an Undo. */
  readonly ignored: readonly AllowScope[];
}

export interface Banner {
  /** `div.sar-banner-host`, the light-DOM element that holds the shadow root. */
  readonly host: HTMLElement;
  /** Shows the entries and the notes. Same view: no change. */
  show(view: BannerView): void;
}

const ACTIONS = ["ignore", "undo", "toggle"] as const;

type Action = (typeof ACTIONS)[number];

function parseAction(value: string | null): Action | undefined {
  return ACTIONS.find((action) => action === value);
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

/** The id of a part of an entry or note, unique in the banner. */
function partId(scope: string, part: string): string {
  return `sar-banner-${scope}-${part}`;
}

/**
 * The developer's own long text and what labels it. Steam's short lines for a kind stay in
 * Steam's own boxes on the page and in the hover card.
 */
type DeveloperText = Extract<KindDetail, { readonly kind: "quote" | "labeled"; }>;

function isDeveloperText(detail: KindDetail): detail is DeveloperText {
  return detail.kind === "quote" || detail.kind === "labeled";
}

function sameView(a: BannerView, b: BannerView): boolean {
  return a.shown.length === b.shown.length
    && a.shown.every((verdict, index) => verdict === b.shown[index])
    && a.ignored.length === b.ignored.length
    && a.ignored.every((scope, index) => scope === b.ignored[index]);
}

/**
 * The app page banner, in a shadow root so store CSS cannot reach it. It lists each disclosed kind
 * as Steam's line with an ignore button; the AI kind adds the developer's text, set through
 * `textContent`. An ignored scope becomes a note with Undo; one delegated listener serves clicks.
 */
export function createBanner(
  doc: Document,
  i18n: MessageCatalog,
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

  let shown: BannerView | undefined;
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

  function button(
    className: string,
    action: Action,
    label: string,
    scope?: AllowScope,
  ): HTMLButtonElement {
    const node = element("button", className, label);
    node.type = "button";
    node.setAttribute("data-sar-action", action);
    if (scope !== undefined) {
      node.setAttribute("data-sar-scope", scope);
    }
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

  /** The developer's long text behind its source line, with a toggle once it overflows. */
  function appendQuote(entry: HTMLElement, id: string, text: string): void {
    const quote = element("blockquote", "sar-banner-quote", normalizeBreaks(text));
    quote.id = id;
    quote.setAttribute("data-sar-collapsed", "true");
    const toggle = button("sar-banner-link", "toggle", i18n.t("banner_expand"));
    toggle.setAttribute("aria-expanded", String(false));
    toggle.setAttribute("aria-controls", id);
    toggle.hidden = true;
    entry.append(element("p", "sar-banner-source", i18n.t("banner_source")), quote, toggle);
    frame(() => {
      measure(quote, toggle);
    });
  }

  function appendDetail(entry: HTMLElement, detail: DeveloperText, quoteId: string): void {
    if (detail.kind === "quote") {
      appendQuote(entry, quoteId, detail.text);
      return;
    }
    const line = element("p", "sar-banner-service", i18n.t(detail.key));
    line.append(" ", element("span", "sar-banner-service-name", detail.text));
    entry.append(line);
  }

  /** One kind: Steam's line as the heading and its own ignore button, then the developer's text. */
  function buildEntry(verdict: AnyDisclosed): HTMLElement {
    const entry = element("div", "sar-banner-entry");
    const titleId = partId(verdict.kind, "title");
    const ignoreId = partId(verdict.kind, "ignore");
    const heading = i18n.t(KIND_BY_ID[verdict.kind].messages.heading);
    const title = element("h2", "sar-banner-title", heading);
    title.id = titleId;
    const ignore = button(
      "sar-banner-action",
      "ignore",
      i18n.t("banner_ignore_kind"),
      verdict.kind,
    );
    ignore.id = ignoreId;
    ignore.setAttribute("aria-labelledby", [ignoreId, titleId].join(" "));
    const head = element("div", "sar-banner-head");
    head.append(title, ignore);
    entry.append(head);
    for (const [index, detail] of kindDetails(verdict).filter(isDeveloperText).entries()) {
      appendDetail(entry, detail, `${partId(verdict.kind, "notes")}-${String(index)}`);
    }
    return entry;
  }

  /** What an ignored scope says: the whole game, or one kind by Steam's line. */
  function noteText(scope: AllowScope): string {
    return scope === ALLOW_ALL
      ? i18n.t("banner_ignored")
      : i18n.t("banner_ignored_kind", { heading: i18n.t(KIND_BY_ID[scope].messages.heading) });
  }

  function buildNote(scope: AllowScope): HTMLElement {
    const note = element("p", "sar-banner-note");
    const text = element("span", "sar-banner-ignored-text", noteText(scope));
    text.id = partId(scope, "note");
    const undo = button("sar-banner-link", "undo", i18n.t("banner_undo"), scope);
    undo.id = partId(scope, "undo");
    undo.setAttribute("aria-labelledby", [undo.id, text.id].join(" "));
    note.append(text, undo);
    return note;
  }

  function build(view: BannerView): HTMLElement {
    const aside = element("aside", "sar-banner");
    aside.tabIndex = -1;
    const [only] = view.shown;
    if (only !== undefined && view.shown.length === 1 && view.ignored.length === 0) {
      aside.setAttribute("aria-labelledby", partId(only.kind, "title"));
    } else {
      aside.setAttribute("aria-label", i18n.t("banner_region_label"));
    }
    if (only === undefined) {
      aside.setAttribute("data-sar-variant", "ignored");
    } else {
      // A banner with one tag takes its color; several tags keep the default violet.
      if (view.shown.length > 1) {
        aside.setAttribute("data-sar-entries", "many");
      } else {
        aside.setAttribute(KIND_ATTRIBUTE, only.kind);
      }
    }
    for (const verdict of view.shown) {
      aside.append(buildEntry(verdict));
    }
    for (const scope of view.ignored) {
      aside.append(buildNote(scope));
    }
    if (view.shown.length > 0) {
      const foot = element("div", "sar-banner-foot");
      foot.append(button("sar-banner-link", "ignore", i18n.t("banner_ignore"), ALLOW_ALL));
      aside.append(foot);
    }
    aside.append(errorLine());
    return aside;
  }

  function render(view: BannerView): void {
    const next = build(view);
    box.replaceWith(next);
    box = next;
    shown = view;
  }

  function toggleNotes(toggle: Element): void {
    const quote = shadow.getElementById(toggle.getAttribute("aria-controls") ?? "");
    if (quote === null) {
      return;
    }
    const expand = quote.getAttribute("data-sar-collapsed") === "true";
    quote.setAttribute("data-sar-collapsed", expand ? "false" : "true");
    toggle.setAttribute("aria-expanded", expand ? "true" : "false");
    toggle.textContent = i18n.t(expand ? "banner_collapse" : "banner_expand");
  }

  function control(action: Action, scope: AllowScope): HTMLElement | undefined {
    return [...box.querySelectorAll<HTMLElement>("[data-sar-action]")].find((candidate) =>
      candidate.getAttribute("data-sar-action") === action
      && candidate.getAttribute("data-sar-scope") === scope
    );
  }

  /** What a screen reader hears after an ignore or an undo: for all tags, or for one tag. */
  function announcement(action: Action, scope: AllowScope): string {
    const restoring = action === "undo";
    if (scope === ALLOW_ALL) {
      return i18n.t(restoring ? "notice_marking_restored" : "notice_marking_stopped");
    }
    const heading = i18n.t(KIND_BY_ID[scope].messages.heading);
    return restoring
      ? i18n.t("notice_marking_restored_kind", { heading })
      : i18n.t("notice_marking_stopped_kind", { heading });
  }

  /** Undo takes the focus after an ignore, and the ignore button after an undo. */
  function focusAfter(action: Action, scope: AllowScope): void {
    const next = action === "undo" ? "ignore" : "undo";
    (control(next, scope) ?? control("ignore", ALLOW_ALL) ?? box).focus();
  }

  async function run(action: Action, scope: AllowScope): Promise<void> {
    if (pending || shown === undefined) {
      return;
    }
    pending = true;
    try {
      await (action === "undo" ? actions.restore(scope) : actions.ignore(scope));
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
    focusAfter(action, scope);
    announce(doc, live, announcement(action, scope));
  }

  shadow.addEventListener("click", (event) => {
    const target = event.target;
    const clicked = target instanceof Element ? target.closest("[data-sar-action]") : null;
    if (clicked === null) {
      return;
    }
    const action = parseAction(clicked.getAttribute("data-sar-action"));
    const scope = toAllowScope(clicked.getAttribute("data-sar-scope"));
    if (action === "toggle") {
      toggleNotes(clicked);
    } else if (action !== undefined && scope !== undefined) {
      void run(action, scope);
    }
  });

  return {
    host,

    show(view) {
      if (shown === undefined || !sameView(shown, view)) {
        render(view);
      }
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
