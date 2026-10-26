import {
  type Creator,
  CREATOR_ROLES,
  type CreatorKey,
  type CreatorRole,
  toCreatorKey,
} from "../creator";
import type { BareMessageKey } from "../i18n/t";
import type { ChipWords } from "../kinds/kind-settings";
import { KIND_BY_ID } from "../kinds/registry";
import type { AnyDisclosed } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL, type AllowScope, toAllowScope } from "../settings/allow-data";
import { announce, POLITE } from "./announce";
import { ROLE_LABELS } from "./creator-roles";
import { KIND_ATTRIBUTE } from "./kind-attributes";
import { entryName, fromValve, fullGameLine, type KindDetail, kindDetails } from "./kind-details";
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
export interface BannerCreator {
  readonly role: CreatorRole;
  readonly creator: Creator;
  /** Each scope with the key that is on the list, which Undo removes. */
  readonly ignored: readonly { readonly scope: AllowScope; readonly key: CreatorKey; }[];
}

/** A developer or publisher ignored in a scope this page would otherwise show. */
export interface CreatorNote {
  readonly role: CreatorRole;
  readonly creator: Creator;
  readonly key: CreatorKey;
  readonly scope: AllowScope;
}

/** What the banner shows for the game. */
export interface BannerView {
  /** The disclosed kinds listed in full, in registry order. */
  readonly shown: readonly AnyDisclosed[];
  /** The scopes the game is ignored in that the banner notes with an Undo. */
  readonly ignored: readonly AllowScope[];
  /** The game's developers and publishers, one row per name and role. */
  readonly creators: readonly BannerCreator[];
  /** The notes, with an Undo, for the creators ignored in a scope the page would show. */
  readonly creatorNotes: readonly CreatorNote[];
  /** The person's chip text, which names a tag on its Ignore button in a creator's row. */
  readonly words?: ChipWords;
}

export interface Banner {
  /** `div.sar-banner-host`, the light-DOM element that holds the shadow root. */
  readonly host: HTMLElement;
  /** Shows the entries and the notes. Same view: no change. */
  show(view: BannerView): void;
}

/** Name the role and the key of the creator a button acts on. */
const ROLE_ATTRIBUTE = "data-sar-role";
const CREATOR_ATTRIBUTE = "data-sar-creator";

/** What a row and a note of a creator share. */
type BannerCreatorRef = Pick<BannerCreator, "role" | "creator">;

const ACTIONS = ["ignore", "undo", "toggle", "ignore-creator", "undo-creator"] as const;

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

/** A row as text: its role, its key and the scopes with the keys it is ignored under. */
function rowSignature(row: BannerCreator): string {
  const ignored = row.ignored.map((each) => `${each.scope}=${each.key}`);
  return [row.role, row.creator.key, ...ignored].join("|");
}

/** Whether two lists hold the same creators in the same order, with the same ignored scopes. */
function sameCreators(a: readonly BannerCreator[], b: readonly BannerCreator[]): boolean {
  const other = b.map(rowSignature);
  return a.length === b.length && a.every((row, index) => rowSignature(row) === other[index]);
}

function sameNotes(a: readonly CreatorNote[], b: readonly CreatorNote[]): boolean {
  return a.length === b.length && a.every((note, index) => {
    const other = b[index];
    return other !== undefined && note.role === other.role && note.key === other.key
      && note.scope === other.scope;
  });
}

function sameView(a: BannerView, b: BannerView): boolean {
  return a.shown.length === b.shown.length
    && a.shown.every((verdict, index) => verdict === b.shown[index])
    && a.ignored.length === b.ignored.length
    && a.ignored.every((scope, index) => scope === b.ignored[index])
    && a.words === b.words && sameCreators(a.creators, b.creators)
    && sameNotes(a.creatorNotes, b.creatorNotes);
}

function parseRole(value: string | null): CreatorRole | undefined {
  return CREATOR_ROLES.find((role) => role === value);
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
  /** Whether the creators section is open; it survives a redraw but not a reload. */
  let creatorsOpen = false;

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

  /** A button that acts on one developer or publisher, named by its role and key. */
  function creatorButton(
    className: string,
    action: Action,
    label: string,
    role: CreatorRole,
    key: CreatorKey,
    scope: AllowScope,
  ): HTMLButtonElement {
    const node = button(className, action, label, scope);
    node.setAttribute(ROLE_ATTRIBUTE, role);
    node.setAttribute(CREATOR_ATTRIBUTE, key);
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

  /**
   * One kind: Steam's line as the heading and its own ignore button, a line on a demo's page when
   * the full game declared it, then the developer's text.
   */
  function buildEntry(verdict: AnyDisclosed): HTMLElement {
    const entry = element("div", "sar-banner-entry");
    const titleId = partId(verdict.kind, "title");
    const ignoreId = partId(verdict.kind, "ignore");
    const title = element("h2", "sar-banner-title", entryName(i18n, verdict));
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
    if (verdict.fullGame === true) {
      entry.append(element("p", "sar-banner-full-game", i18n.t(fullGameLine(verdict))));
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

  /** The creator's name and role, for a label or a note: "Valve (Developer)" is two arguments. */
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

  function buildCreatorNote(note: CreatorNote, index: number): HTMLElement {
    const node = element("p", "sar-banner-note");
    const id = partId(`creator${String(index)}`, "note");
    const text = element("span", "sar-banner-ignored-text", creatorNoteText(note));
    text.id = id;
    const undo = creatorButton(
      "sar-banner-link",
      "undo-creator",
      i18n.t("banner_undo"),
      note.role,
      note.key,
      note.scope,
    );
    undo.id = partId(`creator${String(index)}`, "undo");
    undo.setAttribute("aria-labelledby", [undo.id, id].join(" "));
    node.append(text, undo);
    return node;
  }

  /** One row per developer or publisher: a button for each shown tag it is not ignored for. */
  function buildCreatorRow(row: BannerCreator, index: number, view: BannerView): HTMLElement {
    const item = element("li", "sar-banner-creator");
    const who = nameAndRole(row.role, row.creator);
    const label = element("span", "sar-banner-creator-label");
    label.append(
      element("span", "sar-banner-creator-name", who.name),
      " ",
      element("span", "sar-banner-creator-role", who.role),
    );
    label.id = partId(`row${String(index)}`, "label");
    const actions = element("span", "sar-banner-creator-actions");
    const ignoredIn = new Set(row.ignored.map((each) => each.scope));
    const choices: AllowScope[] = view.shown.map((verdict) => verdict.kind).filter((kind) =>
      !ignoredIn.has(kind)
    );
    if (!ignoredIn.has(ALLOW_ALL)) {
      choices.push(ALLOW_ALL);
    }
    for (const scope of choices) {
      const text = scope === ALLOW_ALL
        ? i18n.t("banner_ignore_creator_all")
        : i18n.t("banner_ignore_creator_kind", {
          chip: view.words?.[scope]?.chip ?? i18n.t(KIND_BY_ID[scope].messages.chip),
        });
      const choice = creatorButton(
        "sar-banner-link",
        "ignore-creator",
        text,
        row.role,
        row.creator.key,
        scope,
      );
      choice.id = partId(`row${String(index)}`, `ignore-${scope}`);
      choice.setAttribute("aria-labelledby", [choice.id, label.id].join(" "));
      actions.append(choice);
    }
    item.append(label, actions);
    return item;
  }

  /** The closed section that lists the game's developers and publishers. */
  function buildCreators(view: BannerView): HTMLElement {
    const section = doc.createElement("details");
    section.className = "sar-banner-creators";
    section.open = creatorsOpen;
    const summary = element(
      "summary",
      "sar-banner-creators-toggle",
      i18n.t("banner_creators_toggle"),
    );
    const list = element("ul", "sar-banner-creator-list");
    list.append(...view.creators.map((row, index) => buildCreatorRow(row, index, view)));
    section.append(summary, list);
    return section;
  }

  function build(view: BannerView): HTMLElement {
    const aside = element("aside", "sar-banner");
    aside.tabIndex = -1;
    const [only] = view.shown;
    const single = view.ignored.length === 0 && view.creatorNotes.length === 0;
    if (only !== undefined && view.shown.length === 1 && single) {
      aside.setAttribute("aria-labelledby", partId(only.kind, "title"));
    } else {
      // "Declared by the developer" would be false for an entry Valve states.
      const label = view.shown.some(fromValve) ? "badge_tags_title" : "banner_region_label";
      aside.setAttribute("aria-label", i18n.t(label));
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
    for (const [index, note] of view.creatorNotes.entries()) {
      aside.append(buildCreatorNote(note, index));
    }
    if (view.shown.length > 0) {
      if (view.creators.length > 0) {
        aside.append(buildCreators(view));
      }
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

  /** The control with this action and scope; a creator's also names its role and key. */
  function control(
    action: Action,
    scope: AllowScope,
    creator?: { readonly role: CreatorRole; readonly key: CreatorKey; },
  ): HTMLElement | undefined {
    return [...box.querySelectorAll<HTMLElement>("[data-sar-action]")].find((candidate) =>
      candidate.getAttribute("data-sar-action") === action
      && candidate.getAttribute("data-sar-scope") === scope
      && (creator === undefined || (candidate.getAttribute(ROLE_ATTRIBUTE) === creator.role
        && candidate.getAttribute(CREATOR_ATTRIBUTE) === creator.key))
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

  /** The same, after a developer or publisher was ignored or restored. */
  function creatorAnnouncement(
    action: Action,
    role: CreatorRole,
    creator: Creator,
    scope: AllowScope,
  ): string {
    const restoring = action === "undo-creator";
    const who = nameAndRole(role, creator);
    if (scope === ALLOW_ALL) {
      return i18n.t(restoring ? "notice_creator_restored" : "notice_creator_stopped", who);
    }
    const heading = i18n.t(KIND_BY_ID[scope].messages.heading);
    return i18n.t(
      restoring ? "notice_creator_restored_kind" : "notice_creator_stopped_kind",
      { ...who, heading },
    );
  }

  /** Undo takes the focus after an ignore, and the ignore button after an undo. */
  function focusAfter(action: Action, scope: AllowScope): void {
    const next = action === "undo" ? "ignore" : "undo";
    (control(next, scope) ?? control("ignore", ALLOW_ALL) ?? box).focus();
  }

  /** The same for a creator: Undo after an ignore, the ignore button after an undo. */
  function focusAfterCreator(action: Action, creator: BannerCreatorRef, scope: AllowScope): void {
    const next = action === "undo-creator" ? "ignore-creator" : "undo-creator";
    const own = { role: creator.role, key: creator.creator.key };
    const summary = box.querySelector<HTMLElement>(".sar-banner-creators-toggle");
    (control(next, scope, own) ?? summary ?? box).focus();
  }

  /**
   * Runs one change, one at a time. A failed save shows the error line; a saved one calls `done`
   * for the focus and the announcement.
   */
  async function perform(
    change: () => Promise<void>,
    failure: BareMessageKey,
    done: () => void,
  ): Promise<void> {
    if (pending || shown === undefined) {
      return;
    }
    pending = true;
    try {
      await change();
    } catch {
      const error = box.querySelector<HTMLElement>(".sar-banner-error");
      if (error !== null) {
        error.textContent = i18n.t(failure);
        error.hidden = false;
      }
      return;
    } finally {
      pending = false;
    }
    done();
  }

  function run(action: Action, scope: AllowScope): Promise<void> {
    return perform(
      () => action === "undo" ? actions.restore(scope) : actions.ignore(scope),
      "error_allow_list_save",
      () => {
        focusAfter(action, scope);
        announce(doc, live, announcement(action, scope));
      },
    );
  }

  /** The row or note of the view that names this role and key. */
  function creatorOf(role: CreatorRole, key: CreatorKey): BannerCreatorRef | undefined {
    const known: readonly BannerCreatorRef[] = [
      ...(shown?.creators ?? []),
      ...(shown?.creatorNotes ?? []),
    ];
    return known.find((each) => each.role === role && each.creator.keys.includes(key));
  }

  function runCreator(
    action: Action,
    creator: BannerCreatorRef,
    key: CreatorKey,
    scope: AllowScope,
  ): Promise<void> {
    const { role } = creator;
    return perform(
      () =>
        action === "undo-creator"
          ? actions.restoreCreator(role, key, scope)
          : actions.ignoreCreator(role, creator.creator, scope),
      "error_creator_list_save",
      () => {
        focusAfterCreator(action, creator, scope);
        announce(doc, live, creatorAnnouncement(action, role, creator.creator, scope));
      },
    );
  }

  function onClick(clicked: Element): void {
    const action = parseAction(clicked.getAttribute("data-sar-action"));
    const scope = toAllowScope(clicked.getAttribute("data-sar-scope"));
    if (action === "toggle") {
      toggleNotes(clicked);
      return;
    }
    if (action === undefined || scope === undefined) {
      return;
    }
    if (action !== "ignore-creator" && action !== "undo-creator") {
      void run(action, scope);
      return;
    }
    const role = parseRole(clicked.getAttribute(ROLE_ATTRIBUTE));
    const key = toCreatorKey(clicked.getAttribute(CREATOR_ATTRIBUTE));
    const creator = role === undefined || key === undefined ? undefined : creatorOf(role, key);
    if (key !== undefined && creator !== undefined) {
      void runCreator(action, creator, key, scope);
    }
  }

  shadow.addEventListener("click", (event) => {
    const target = event.target;
    const clicked = target instanceof Element ? target.closest("[data-sar-action]") : null;
    if (clicked !== null) {
      onClick(clicked);
    }
  });

  // A toggle does not bubble, so the one listener for it takes the capture phase
  shadow.addEventListener("toggle", (event) => {
    if (event.target instanceof HTMLDetailsElement) {
      creatorsOpen = event.target.open;
    }
  }, true);

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
