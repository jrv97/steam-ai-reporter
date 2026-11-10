import { type Creator, CREATOR_ROLES, type CreatorKey, type CreatorRole } from "../creator";
import type { BareMessageKey } from "../i18n/t";
import type { KindId } from "../kinds/id";
import type { ChipWords } from "../kinds/kind-settings";
import { KIND_BY_ID } from "../kinds/registry";
import type { MessageCatalog } from "../ports";
import { ALLOW_ALL, type AllowScope } from "../settings/allow-data";

/** The menu's groups, in the order they show after the game's own row. A creator group is named
 * by its role. */
export const MENU_GROUPS = ["tags", ...CREATOR_ROLES] as const;

export type MenuGroup = (typeof MENU_GROUPS)[number];

/** The groups open on a fresh page; a creator lists one option per tag, so those start closed. */
export const OPEN_GROUPS: readonly MenuGroup[] = ["tags"];

/** Marks the main half once the game is ignored for all tags; its label says so too. */
export const IGNORED_ATTRIBUTE = "data-tks-ignored";

/** Name the role and the key of the creator an option acts on, and the group a head opens. */
export const ROLE_ATTRIBUTE = "data-tks-role";
export const CREATOR_ATTRIBUTE = "data-tks-creator";
export const GROUP_ATTRIBUTE = "data-tks-group";

/** The ids of the caret and the menu, unique in the banner. */
export const MENU_BUTTON_ID = "tks-banner-menu-button";
export const MENU_ID = "tks-banner-menu";

/** What a control of the menu does: open it, open a group, or toggle a game or creator scope. */
export const MENU_ACTIONS = ["menu", "group", "game", "creator"] as const;
const TRUE = "true";
const POPUP = "menu";

export type MenuAction = (typeof MENU_ACTIONS)[number];

/** One developer or publisher of the game, with the scopes it is ignored in for its role. */
export interface MenuCreator {
  readonly role: CreatorRole;
  readonly creator: Creator;
  /** Each scope with the key that is on the list, which unchecking removes. */
  readonly ignored: readonly { readonly scope: AllowScope; readonly key: CreatorKey; }[];
}

/** What the menu lists and what is checked. */
export interface MenuView {
  /** The tags the banner lists for the game, ignored or not, in the tag order. */
  readonly listed: readonly KindId[];
  /** The scopes the game itself is on the list for. */
  readonly ignored: readonly AllowScope[];
  readonly creators: readonly MenuCreator[];
  /** The person's chip text, which names a tag's options. */
  readonly words?: ChipWords;
}

/** The menu's state that a redraw keeps. */
export interface MenuState {
  readonly open: boolean;
  readonly groups: ReadonlySet<MenuGroup>;
}

const GROUP_LABELS: Readonly<Record<MenuGroup, BareMessageKey>> = {
  developer: "banner_menu_group_developers",
  publisher: "banner_menu_group_publishers",
  tags: "banner_menu_group_tags",
};

const CREATOR_ALL_NOTES: Readonly<Record<CreatorRole, BareMessageKey>> = {
  developer: "banner_menu_developer_all_note",
  publisher: "banner_menu_publisher_all_note",
};

/** A control's id: one name per control, stable across a redraw, so the focus can follow it. */
function itemId(...parts: readonly string[]): string {
  return ["tks-banner", ...parts].join("-");
}

/**
 * Builds the split button and its menu after Steam's Ignore dropdown: the main half ignores the
 * game for all tags, the caret opens a menu of groups, and each option is a checkbox with a title
 * and a muted line under it. No listener is attached; the banner's delegated ones serve it.
 */
export function buildIgnoreMenu(
  doc: Document,
  i18n: MessageCatalog,
  view: MenuView,
  state: MenuState,
): HTMLElement {
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

  function control(className: string, action: MenuAction, text?: string): HTMLButtonElement {
    const node = element("button", className, text);
    node.type = "button";
    node.setAttribute("data-tks-action", action);
    return node;
  }

  /** A checkbox option: a box, the title and the muted line under it. */
  function option(
    id: string,
    action: MenuAction,
    scope: AllowScope,
    checked: boolean,
    title: string,
    note: string,
  ): HTMLButtonElement {
    const node = control("tks-ignore-option", action);
    node.id = id;
    node.tabIndex = -1;
    node.setAttribute("role", "menuitemcheckbox");
    node.setAttribute("aria-checked", String(checked));
    node.setAttribute("data-tks-scope", scope);
    const box = element("span", "tks-ignore-box");
    box.setAttribute("aria-hidden", TRUE);
    const label = element("span", "tks-ignore-label");
    label.append(
      element("span", "tks-ignore-title", title),
      element("span", "tks-ignore-subtitle", note),
    );
    node.append(box, label);
    return node;
  }

  function chip(kind: KindId): string {
    return view.words?.[kind]?.chip ?? i18n.t(KIND_BY_ID[kind].messages.chip);
  }

  function heading(kind: KindId): string {
    return i18n.t(KIND_BY_ID[kind].messages.heading);
  }

  /** The game's own row, first in the menu and under no heading. */
  function gameRow(): HTMLElement {
    const row = element("div", "tks-ignore-section");
    row.setAttribute("role", "none");
    row.append(option(
      itemId("option", "game", ALLOW_ALL),
      "game",
      ALLOW_ALL,
      view.ignored.includes(ALLOW_ALL),
      i18n.t("banner_ignore"),
      i18n.t("banner_menu_game_note"),
    ));
    return row;
  }

  function tagOptions(): readonly HTMLElement[] {
    return view.listed.map((kind) =>
      option(
        itemId("option", "tag", kind),
        "game",
        kind,
        view.ignored.includes(kind),
        chip(kind),
        heading(kind),
      )
    );
  }

  /** One name: a group of its own with all tags first, then one option per listed tag. */
  function creatorBlock(row: MenuCreator, index: number): HTMLElement {
    const block = element("div", "tks-ignore-creator");
    block.setAttribute("role", "group");
    const name = element("span", "tks-ignore-creator-name", row.creator.name);
    name.id = itemId(row.role, String(index), "name");
    name.setAttribute("role", "presentation");
    block.setAttribute("aria-labelledby", name.id);
    const ignoredIn = new Set(row.ignored.map((each) => each.scope));
    const scopes: readonly AllowScope[] = [ALLOW_ALL, ...view.listed];
    const options = scopes.map((scope) => {
      const node = option(
        itemId("option", row.role, String(index), scope),
        "creator",
        scope,
        ignoredIn.has(scope),
        scope === ALLOW_ALL ? i18n.t("banner_menu_all_tags") : chip(scope),
        scope === ALLOW_ALL ? i18n.t(CREATOR_ALL_NOTES[row.role]) : heading(scope),
      );
      node.setAttribute(ROLE_ATTRIBUTE, row.role);
      node.setAttribute(CREATOR_ATTRIBUTE, row.creator.key);
      return node;
    });
    block.append(name, ...options);
    return block;
  }

  function groupItems(group: MenuGroup): readonly HTMLElement[] {
    switch (group) {
      case "tags":
        return tagOptions();
      case "developer":
      case "publisher":
        return view.creators.filter((row) => row.role === group).map(creatorBlock);
    }
  }

  /** A group: a head that opens and closes it, then its items. An empty group is left out. */
  function section(group: MenuGroup): HTMLElement | undefined {
    const items = groupItems(group);
    if (items.length === 0) {
      return undefined;
    }
    const open = state.groups.has(group);
    const head = control("tks-ignore-group-head", "group", i18n.t(GROUP_LABELS[group]));
    head.id = itemId("group", group);
    head.tabIndex = -1;
    head.setAttribute("role", "menuitem");
    head.setAttribute(GROUP_ATTRIBUTE, group);
    head.setAttribute("aria-expanded", String(open));
    const body = element("div", "tks-ignore-group");
    body.id = itemId("group", group, "items");
    body.setAttribute("role", "group");
    body.setAttribute("aria-labelledby", head.id);
    body.hidden = !open;
    head.setAttribute("aria-controls", body.id);
    body.append(...items);
    const wrap = element("div", "tks-ignore-section");
    wrap.setAttribute("role", "none");
    wrap.append(head, body);
    return wrap;
  }

  const ignored = view.ignored.includes(ALLOW_ALL);
  const main = control(
    "tks-ignore-main",
    "game",
    i18n.t(ignored ? "banner_menu_ignored" : "banner_menu_ignore"),
  );
  main.id = itemId("ignore", "main");
  main.setAttribute("data-tks-scope", ALLOW_ALL);
  main.toggleAttribute(IGNORED_ATTRIBUTE, ignored);

  const caret = control("tks-ignore-caret", "menu");
  caret.id = MENU_BUTTON_ID;
  caret.setAttribute("aria-label", i18n.t("banner_menu_label"));
  caret.setAttribute("aria-haspopup", POPUP);
  caret.setAttribute("aria-controls", MENU_ID);
  caret.setAttribute("aria-expanded", String(state.open));
  const arrow = element("span", "tks-ignore-arrow");
  arrow.setAttribute("aria-hidden", TRUE);
  caret.append(arrow);

  const menu = element("div", "tks-ignore-flyout");
  menu.id = MENU_ID;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-labelledby", MENU_BUTTON_ID);
  menu.hidden = !state.open;
  menu.append(gameRow(), ...MENU_GROUPS.flatMap((group) => section(group) ?? []));

  const split = element("div", "tks-ignore-split");
  split.append(main, caret);
  const wrap = element("div", "tks-ignore");
  wrap.append(split, menu);
  return wrap;
}

/** The items a person can reach now: the group heads and the options of open groups. */
export function visibleItems(menu: Element): readonly HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>("[role^='menuitem']")].filter((item) =>
    item.parentElement?.closest("[hidden]") === null
  );
}

/** The item a key moves to from `from`, or undefined for a key that does not move. */
export function nextItem(
  items: readonly HTMLElement[],
  from: HTMLElement | undefined,
  key: string,
): HTMLElement | undefined {
  const at = from === undefined ? -1 : items.indexOf(from);
  const last = items.length - 1;
  switch (key) {
    case "ArrowDown":
      return items[at >= last ? 0 : at + 1];
    case "ArrowUp":
      return items[at <= 0 ? last : at - 1];
    case "Home":
      return items[0];
    case "End":
      return items[last];
    default:
      return undefined;
  }
}
