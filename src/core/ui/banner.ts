import {
  type Creator,
  CREATOR_ROLES,
  type CreatorKey,
  type CreatorRole,
  toCreatorKey,
} from "../creator";
import type { BareMessageKey } from "../i18n/t";
import type { KindId } from "../kinds/id";
import type { ChipWords } from "../kinds/kind-settings";
import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL, type AllowScope, toAllowScope } from "../settings/allow-data";
import { announce, POLITE } from "./announce";
import { ROLE_LABELS } from "./creator-roles";
import {
  buildIgnoreMenu,
  CREATOR_ATTRIBUTE,
  GROUP_ATTRIBUTE,
  MENU_ACTIONS,
  MENU_BUTTON_ID,
  MENU_GROUPS,
  MENU_ID,
  type MenuCreator,
  type MenuGroup,
  nextItem,
  OPEN_GROUPS,
  ROLE_ATTRIBUTE,
  visibleItems,
} from "./ignore-menu";
import { KIND_ATTRIBUTE } from "./kind-attributes";
import { entryName, fromValve, fullGameLine, type KindDetail, kindDetails } from "./kind-details";
import { normalizeBreaks } from "./notes";
import { adoptStyles, BANNER_CSS } from "./styles";

/** The banner host's id. */
export const BANNER_ID = "tks-banner";

/** The store's left description column; the banner goes first in it, above the purchase box. */
const COLUMN_SELECTOR = ".game_description_column";

/** What the banner's ignore menu does outside the banner. Each rejects when storage fails. */
export interface BannerActions {
  /** Ignores the game in the scope: for one kind, or for all kinds. */
  ignore(scope: AllowScope): Promise<void>;
  /** Stops ignoring the game in the scope. */
  restore(scope: AllowScope): Promise<void>;
  /** Ignores the game's developer or publisher in the scope. */
  ignoreCreator(role: CreatorRole, creator: Creator, scope: AllowScope): Promise<void>;
  /** Stops ignoring the developer or publisher whose key is on the list of the scope. */
  restoreCreator(role: CreatorRole, key: CreatorKey, scope: AllowScope): Promise<void>;
}

export interface BannerOptions {
  /** Schedules the collapse measurement after layout; `requestAnimationFrame` by default. */
  readonly frame?: (callback: () => void) => void;
  /** Whether the collapsed notes hide text; compares scroll and client height by default. */
  readonly overflows?: (quote: HTMLElement) => boolean;
}

/** One developer or publisher of the game, with the scopes it is ignored in for its role. */
export type BannerCreator = MenuCreator;

/** A developer or publisher ignored in a scope this page would otherwise show. */
export interface CreatorNote {
  readonly role: CreatorRole;
  readonly creator: Creator;
  readonly key: CreatorKey;
  readonly scope: AllowScope;
}

/** What the banner shows for the game. */
export interface BannerView {
  /** The disclosed kinds listed in full, in the tag order. */
  readonly shown: readonly AnyDisclosed[];
  /** Every kind the banner lists for the game, ignored or not, in the tag order. */
  readonly listed: readonly KindId[];
  /**
   * The scopes the game is ignored in, among all tags and the listed kinds. The banner notes all
   * tags alone when it is there, else each kind.
   */
  readonly ignored: readonly AllowScope[];
  /** The game's developers and publishers, one row per name and role. */
  readonly creators: readonly BannerCreator[];
  /** The notes for the creators ignored in a scope the page would show. */
  readonly creatorNotes: readonly CreatorNote[];
  /** The person's chip text, which names a tag's options in the menu. */
  readonly words?: ChipWords;
}

export interface Banner {
  /** `div.tks-banner-host`, the light-DOM element that holds the shadow root. */
  readonly host: HTMLElement;
  /** Shows the entries, the notes and the menu. Same view: no change. */
  show(view: BannerView): void;
  /** Closes the menu and takes the banner off the page; `show` and `placeBanner` bring it back. */
  remove(): void;
}

const ACTIONS = ["toggle", ...MENU_ACTIONS] as const;
/** How long a menu opened by hover stays open after the pointer leaves the button and menu. */
export const HOVER_CLOSE_MS = 300;
const SPLIT_SELECTOR = ".tks-ignore";

type Action = (typeof ACTIONS)[number];

function parseAction(value: string | null): Action | undefined {
  return ACTIONS.find((action) => action === value);
}

function parseGroup(value: string | null): MenuGroup | undefined {
  return MENU_GROUPS.find((group) => group === value);
}

function parseRole(value: string | null): CreatorRole | undefined {
  return CREATOR_ROLES.find((role) => role === value);
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
  return `tks-banner-${scope}-${part}`;
}

/**
 * The developer's own long text and what labels it. Steam's short lines for a kind stay in
 * Steam's own boxes on the page and in the hover card.
 */
type DeveloperText = Extract<KindDetail, { readonly kind: "quote" | "labeled"; }>;

function isDeveloperText(detail: KindDetail): detail is DeveloperText {
  return detail.kind === "quote" || detail.kind === "labeled";
}

/** A row as text: its role, its key and the scopes with the keys it is ignored under. */
function rowSignature(row: BannerCreator): string {
  const ignored = row.ignored.map((each) => `${each.scope}=${each.key}`);
  return [row.role, row.creator.key, ...ignored].join("|");
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((each, index) => each === b[index]);
}

/** Whether two lists hold the same creators in the same order, with the same ignored scopes. */
function sameCreators(a: readonly BannerCreator[], b: readonly BannerCreator[]): boolean {
  return sameList(a.map(rowSignature), b.map(rowSignature));
}

function sameNotes(a: readonly CreatorNote[], b: readonly CreatorNote[]): boolean {
  return a.length === b.length && a.every((note, index) => {
    const other = b[index];
    return other !== undefined && note.role === other.role && note.key === other.key
      && note.scope === other.scope;
  });
}

function sameView(a: BannerView, b: BannerView): boolean {
  return sameList(a.shown, b.shown) && sameList(a.listed, b.listed)
    && sameList(a.ignored, b.ignored) && a.words === b.words
    && sameCreators(a.creators, b.creators) && sameNotes(a.creatorNotes, b.creatorNotes);
}

/** The scopes the banner notes: all tags alone when the game is ignored for them. */
function notedScopes(ignored: readonly AllowScope[]): readonly AllowScope[] {
  return ignored.includes(ALLOW_ALL) ? [ALLOW_ALL] : ignored;
}

/**
 * The app page banner, in a shadow root so store CSS cannot reach it. It lists each disclosed kind
 * by Steam's line; the AI kind adds the developer's text, set through `textContent`. An ignored
 * scope becomes a note, and one menu holds every ignore (ADR 0026). Delegated listeners on the
 * shadow root serve every control.
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
  host.className = "tks-banner-host";
  host.id = BANNER_ID;
  const shadow = host.attachShadow({ mode: "open" });
  adoptStyles(shadow, BANNER_CSS);

  let box = doc.createElement("aside");
  const live = element("div", "tks-vh");
  live.setAttribute("aria-live", POLITE);
  shadow.append(box, live);

  let shown: BannerView | undefined;
  let pending = false;
  /** Whether the menu is open and which groups are; both survive a redraw but not a reload. */
  let menuOpen = false;
  const groupsOpen = new Set<MenuGroup>(OPEN_GROUPS);
  /** Whether hover opened the menu, which then closes when the pointer leaves it. */
  let hovered = false;
  let leaving: ReturnType<typeof setTimeout> | undefined;

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
    node.setAttribute("data-tks-action", action);
    return node;
  }

  function errorLine(): HTMLElement {
    const line = element("p", "tks-banner-error");
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
      quote.removeAttribute("data-tks-collapsed");
      toggle.remove();
    }
  }

  /** The developer's long text behind its source line, with a toggle once it overflows. */
  function appendQuote(entry: HTMLElement, id: string, text: string): void {
    const quote = element("blockquote", "tks-banner-quote", normalizeBreaks(text));
    quote.id = id;
    quote.setAttribute("data-tks-collapsed", "true");
    const toggle = button("tks-banner-link", "toggle", i18n.t("banner_expand"));
    toggle.setAttribute("aria-expanded", String(false));
    toggle.setAttribute("aria-controls", id);
    toggle.hidden = true;
    entry.append(element("p", "tks-banner-source", i18n.t("banner_source")), quote, toggle);
    frame(() => {
      measure(quote, toggle);
    });
  }

  function appendDetail(entry: HTMLElement, detail: DeveloperText, quoteId: string): void {
    if (detail.kind === "quote") {
      appendQuote(entry, quoteId, detail.text);
      return;
    }
    const line = element("p", "tks-banner-service", i18n.t(detail.key));
    line.append(" ", element("span", "tks-banner-service-name", detail.text));
    entry.append(line);
  }

  /**
   * One kind: Steam's line as the heading, a line on a demo's page when the full game declared
   * it, then the developer's text.
   */
  function buildEntry(verdict: AnyDisclosed): HTMLElement {
    const entry = element("div", "tks-banner-entry");
    const title = element("h2", "tks-banner-title", entryName(i18n, verdict));
    title.id = partId(verdict.kind, "title");
    entry.append(title);
    if (verdict.fullGame === true) {
      entry.append(element("p", "tks-banner-full-game", i18n.t(fullGameLine(verdict))));
    }
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

  /** The creator's name and role, for a note or an announcement. */
  function nameAndRole(role: CreatorRole, creator: Creator): { name: string; role: string; } {
    return { name: creator.name, role: i18n.t(ROLE_LABELS[role]) };
  }

  /** What a creator note says: every game by the creator, or one tag by Steam's line. */
  function creatorNoteText(note: CreatorNote): string {
    const who = nameAndRole(note.role, note.creator);
    return note.scope === ALLOW_ALL
      ? i18n.t("banner_ignored_creator", who)
      : i18n.t("banner_ignored_creator_kind", {
        ...who,
        heading: i18n.t(KIND_BY_ID[note.scope].messages.heading),
      });
  }

  function note(text: string): HTMLElement {
    const line = element("p", "tks-banner-note");
    line.append(element("span", "tks-banner-ignored-text", text));
    return line;
  }

  function build(view: BannerView): HTMLElement {
    const aside = element("aside", "tks-banner");
    aside.tabIndex = -1;
    const [only] = view.shown;
    const notes = [
      ...notedScopes(view.ignored).map(noteText),
      ...view.creatorNotes.map(creatorNoteText),
    ];
    if (only !== undefined && view.shown.length === 1 && notes.length === 0) {
      aside.setAttribute("aria-labelledby", partId(only.kind, "title"));
    } else {
      // "Declared by the developer" would be false for an entry Valve states.
      const label = view.shown.some(fromValve) ? "badge_tags_title" : "banner_region_label";
      aside.setAttribute("aria-label", i18n.t(label));
    }
    if (only === undefined) {
      aside.setAttribute("data-tks-variant", "ignored");
    } else if (view.shown.length > 1) {
      // A banner with one tag takes its color; several tags keep the default violet.
      aside.setAttribute("data-tks-entries", "many");
    } else {
      aside.setAttribute(KIND_ATTRIBUTE, only.kind);
    }
    aside.append(...view.shown.map(buildEntry), ...notes.map(note));
    const foot = element("div", "tks-banner-foot");
    foot.append(buildIgnoreMenu(doc, i18n, view, { open: menuOpen, groups: groupsOpen }));
    aside.append(foot, errorLine());
    return aside;
  }

  /** Draws the view and keeps the focus on the control of the same id, if it had it. */
  function render(view: BannerView): void {
    const focused = shadow.activeElement;
    const next = build(view);
    box.replaceWith(next);
    box = next;
    shown = view;
    if (focused !== null && focused.id !== "") {
      shadow.getElementById(focused.id)?.focus();
    }
  }

  function toggleNotes(toggle: Element): void {
    const quote = shadow.getElementById(toggle.getAttribute("aria-controls") ?? "");
    if (quote === null) {
      return;
    }
    const expand = quote.getAttribute("data-tks-collapsed") === "true";
    quote.setAttribute("data-tks-collapsed", expand ? "false" : "true");
    toggle.setAttribute("aria-expanded", expand ? "true" : "false");
    toggle.textContent = i18n.t(expand ? "banner_collapse" : "banner_expand");
  }

  function menu(): HTMLElement | null {
    return shadow.getElementById(MENU_ID);
  }

  /** Closes the menu when a press lands outside the banner; listening only while it is open. */
  function onOutside(event: Event): void {
    if (!event.composedPath().includes(host)) {
      setMenu(false);
    }
  }

  function stayOpen(): void {
    clearTimeout(leaving);
    leaving = undefined;
  }

  /** Opens or closes the menu in place; opening by click or key focuses its first or last item. */
  function setMenu(open: boolean, focus?: "first" | "last"): void {
    menuOpen = open;
    hovered = false;
    stayOpen();
    const flyout = menu();
    shadow.getElementById(MENU_BUTTON_ID)?.setAttribute("aria-expanded", String(open));
    if (flyout !== null) {
      flyout.hidden = !open;
    }
    if (open) {
      doc.addEventListener("pointerdown", onOutside, true);
      const items = flyout === null || focus === undefined ? [] : visibleItems(flyout);
      (focus === "last" ? items[items.length - 1] : items[0])?.focus();
    } else {
      doc.removeEventListener("pointerdown", onOutside, true);
    }
  }

  /** Opens or closes a group in place. */
  function setGroup(head: Element, group: MenuGroup, open: boolean): void {
    if (open) {
      groupsOpen.add(group);
    } else {
      groupsOpen.delete(group);
    }
    head.setAttribute("aria-expanded", String(open));
    const body = shadow.getElementById(head.getAttribute("aria-controls") ?? "");
    if (body !== null) {
      body.hidden = !open;
    }
  }

  /** What a screen reader hears after an ignore or a restore: for all tags, or for one tag. */
  function announcement(restoring: boolean, scope: AllowScope): string {
    if (scope === ALLOW_ALL) {
      return i18n.t(restoring ? "notice_marking_restored" : "notice_marking_stopped");
    }
    const heading = i18n.t(KIND_BY_ID[scope].messages.heading);
    return restoring
      ? i18n.t("notice_marking_restored_kind", { heading })
      : i18n.t("notice_marking_stopped_kind", { heading });
  }

  /** The same, after a developer or publisher was ignored or restored. */
  function creatorAnnouncement(restoring: boolean, row: BannerCreator, scope: AllowScope): string {
    const who = nameAndRole(row.role, row.creator);
    if (scope === ALLOW_ALL) {
      return i18n.t(restoring ? "notice_creator_restored" : "notice_creator_stopped", who);
    }
    const heading = i18n.t(KIND_BY_ID[scope].messages.heading);
    return i18n.t(
      restoring ? "notice_creator_restored_kind" : "notice_creator_stopped_kind",
      { ...who, heading },
    );
  }

  /**
   * Runs one change, one at a time. A failed save shows the error line; a saved one announces
   * the change and puts the focus back on the control when the redraw dropped it to the page's
   * body. Focus the person moved anywhere else stays there.
   */
  async function perform(
    clicked: Element,
    change: () => Promise<void>,
    failure: BareMessageKey,
    message: string,
  ): Promise<void> {
    if (pending) {
      return;
    }
    pending = true;
    try {
      await change();
    } catch {
      const error = box.querySelector<HTMLElement>(".tks-banner-error");
      if (error !== null) {
        error.textContent = i18n.t(failure);
        error.hidden = false;
      }
      return;
    } finally {
      pending = false;
    }
    const active = doc.activeElement;
    if (!box.contains(shadow.activeElement) && (active === null || active === doc.body)) {
      (shadow.getElementById(clicked.id) ?? shadow.getElementById(MENU_BUTTON_ID) ?? box).focus();
    }
    announce(doc, live, message);
  }

  /** Checks or unchecks a scope of the game: what is checked is what the view has ignored. */
  function toggleGame(clicked: Element, scope: AllowScope, view: BannerView): Promise<void> {
    const restoring = view.ignored.includes(scope);
    return perform(
      clicked,
      () => restoring ? actions.restore(scope) : actions.ignore(scope),
      "error_allow_list_save",
      announcement(restoring, scope),
    );
  }

  /** The same for a creator of the view, named by its role and one of its keys. */
  function toggleCreator(clicked: Element, scope: AllowScope, view: BannerView): Promise<void> {
    const role = parseRole(clicked.getAttribute(ROLE_ATTRIBUTE));
    const key = toCreatorKey(clicked.getAttribute(CREATOR_ATTRIBUTE));
    const row = view.creators.find((each) =>
      each.role === role && key !== undefined && each.creator.keys.includes(key)
    );
    if (row === undefined) {
      return Promise.resolve();
    }
    const listed = row.ignored.find((each) => each.scope === scope);
    return perform(
      clicked,
      () =>
        listed === undefined
          ? actions.ignoreCreator(row.role, row.creator, scope)
          : actions.restoreCreator(row.role, listed.key, scope),
      "error_creator_list_save",
      creatorAnnouncement(listed !== undefined, row, scope),
    );
  }

  function onClick(clicked: Element): void {
    const action = parseAction(clicked.getAttribute("data-tks-action"));
    const scope = toAllowScope(clicked.getAttribute("data-tks-scope"));
    switch (action) {
      case "toggle":
        toggleNotes(clicked);
        return;
      case "menu":
        // A click on a menu that hover opened keeps it open and takes it over.
        setMenu(!menuOpen || hovered, "first");
        return;
      case "group": {
        const group = parseGroup(clicked.getAttribute(GROUP_ATTRIBUTE));
        if (group !== undefined) {
          setGroup(clicked, group, !groupsOpen.has(group));
        }
        return;
      }
      case "game":
      case "creator":
        if (scope !== undefined && shown !== undefined) {
          void (action === "game" ? toggleGame : toggleCreator)(clicked, scope, shown);
        }
        return;
      case undefined:
        return;
    }
  }

  /** The menu's keys: arrows, Home and End move; Right and Left open and close a group. */
  function onMenuKey(event: KeyboardEvent, target: HTMLElement, flyout: HTMLElement): void {
    const group = parseGroup(target.getAttribute(GROUP_ATTRIBUTE));
    if (event.key === "Escape") {
      setMenu(false);
      shadow.getElementById(MENU_BUTTON_ID)?.focus();
    } else if (event.key === "Tab") {
      setMenu(false);
      return;
    } else if (group !== undefined && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      setGroup(target, group, event.key === "ArrowRight");
    } else if (event.key === "ArrowLeft") {
      const head = target.closest(".tks-ignore-section")?.querySelector<HTMLElement>(
        "[role='menuitem']",
      );
      head?.focus();
    } else {
      const next = nextItem(visibleItems(flyout), target, event.key);
      if (next === undefined) {
        return;
      }
      next.focus();
    }
    event.preventDefault();
  }

  shadow.addEventListener("click", (event) => {
    const target = event.target;
    const clicked = target instanceof Element ? target.closest("[data-tks-action]") : null;
    if (clicked !== null) {
      onClick(clicked);
    }
  });

  shadow.addEventListener("pointerover", (event) => {
    const target = event.target;
    if (
      !(event instanceof PointerEvent) || event.pointerType === "touch"
      || !(target instanceof Element) || target.closest(SPLIT_SELECTOR) === null
    ) {
      return;
    }
    stayOpen();
    // Only a pointer that enters the caret from outside opens it; moves inside it do not.
    const caret = target.closest(`#${MENU_BUTTON_ID}`);
    const from = event.relatedTarget;
    if (!menuOpen && caret !== null && !(from instanceof Node && caret.contains(from))) {
      setMenu(true);
      hovered = true;
    }
  });

  shadow.addEventListener("pointerout", (event) => {
    const next = event instanceof PointerEvent ? event.relatedTarget : null;
    const within = next instanceof Node
      && box.querySelector(SPLIT_SELECTOR)?.contains(next) === true;
    if (!hovered || within) {
      return;
    }
    stayOpen();
    leaving = setTimeout(() => {
      if (hovered) {
        setMenu(false);
      }
    }, HOVER_CLOSE_MS);
  });

  shadow.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(event instanceof KeyboardEvent) || !(target instanceof HTMLElement)) {
      return;
    }
    const flyout = menu();
    if (flyout !== null && menuOpen && flyout.contains(target)) {
      onMenuKey(event, target, flyout);
    } else if (
      target.id === MENU_BUTTON_ID && (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      setMenu(true, event.key === "ArrowUp" ? "last" : "first");
      event.preventDefault();
    } else if ((event.key === "Escape" || event.key === "Tab") && menuOpen) {
      setMenu(false);
    }
  });

  return {
    host,

    show(view) {
      if (shown === undefined || !sameView(shown, view)) {
        render(view);
      }
    },

    remove() {
      setMenu(false);
      host.remove();
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
