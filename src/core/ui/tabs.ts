/** Names the tab a tab button, or a button that switches to a tab, belongs to. */
export const TAB_ATTRIBUTE = "data-sar-tab";

const TAB_ROLE = "tab";
const HIDDEN = "true";
const NEXT_KEYS: ReadonlySet<string> = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowUp"]);
/** Enter and Space, the keys that activate the focused tab. */
const ACTIVATE_KEYS: ReadonlySet<string> = new Set(["Enter", " "]);

export interface TabsOptions<Id extends string> {
  readonly doc: Document;
  /** The tabs in the order they show; the first is selected until `select` says otherwise. */
  readonly ids: readonly Id[];
  /** Makes the tab and panel ids unique on the page. */
  readonly idPrefix: string;
  /** The accessible name of the tab list. */
  readonly label: string;
  /** Hears a tab the person activates with Enter or Space; shows that tab when omitted. */
  readonly onActivate?: (id: Id) => void;
  /**
   * A caption over the tabs after `after`, below a divider. It is decoration that assistive
   * technology skips, since each tab names itself; it stays after `after` when the tabs move.
   */
  readonly group?: { readonly after: Id; readonly caption: string; };
}

/**
 * Tabs in the standard pattern with manual activation: `role="tab"` buttons with `aria-selected`
 * and `aria-controls`, one tab stop, and only the selected panel shown. The arrows, Home and End
 * move focus; Enter or Space (one `keydown` listener on the tab list) activates the focused tab.
 * The caller fills the tabs and routes clicks.
 */
export interface Tabs<Id extends string> {
  readonly list: HTMLElement;
  tab(id: Id): HTMLButtonElement;
  panel(id: Id): HTMLElement;
  selected(): Id;
  /** Shows a tab and its panel; returns whether that changed anything. */
  select(id: Id): boolean;
  /** Puts the tabs in a new order, the same ids, keeping the one selected; arrows follow it. */
  order(ids: readonly Id[]): void;
  /** The tab a node switches to: a tab, or a button that names one; undefined for others. */
  idOf(node: Element): Id | undefined;
  /** Removes the tab list's key listener; the tabs hear no key after it. */
  stop(): void;
}

export function createTabs<Id extends string>(options: TabsOptions<Id>): Tabs<Id> {
  const { doc, idPrefix } = options;
  let { ids } = options;
  const list = doc.createElement("div");
  list.className = "sar-tablist";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", options.label);
  const tabs = new Map<Id, HTMLButtonElement>();
  const panels = new Map<Id, HTMLElement>();

  for (const id of ids) {
    const tab = doc.createElement("button");
    tab.type = "button";
    tab.className = "sar-tab";
    tab.id = `${idPrefix}tab-${id}`;
    tab.setAttribute("role", TAB_ROLE);
    tab.setAttribute(TAB_ATTRIBUTE, id);
    const panel = doc.createElement("div");
    panel.className = "sar-tabpanel";
    panel.id = `${idPrefix}panel-${id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    tabs.set(id, tab);
    panels.set(id, panel);
    list.append(tab);
  }
  const { group } = options;
  const caption = doc.createElement("div");
  caption.className = "sar-tab-group";
  caption.setAttribute("aria-hidden", HIDDEN);
  caption.textContent = group?.caption ?? "";

  function lookup<T>(map: ReadonlyMap<Id, T>, id: Id): T {
    const found = map.get(id);
    if (found === undefined) {
      throw new RangeError(id);
    }
    return found;
  }

  let current: Id | undefined;

  /** The one tab stop follows focus: the arrows move it, a selection returns it. */
  function rove(id: Id): void {
    for (const [each, tab] of tabs) {
      tab.tabIndex = each === id ? 0 : -1;
    }
  }

  function select(id: Id): boolean {
    if (!tabs.has(id)) {
      return false;
    }
    if (id === current) {
      // The arrows may have moved the tab stop away from the selected tab
      rove(id);
      return false;
    }
    current = id;
    for (const [each, tab] of tabs) {
      tab.setAttribute("aria-selected", String(each === id));
      lookup(panels, each).hidden = each !== id;
    }
    rove(id);
    return true;
  }

  const first = ids[0];
  if (first === undefined) {
    throw new RangeError();
  }
  select(first);

  /** Puts the group's caption right after its tab. */
  function placeCaption(): void {
    if (group !== undefined) {
      lookup(tabs, group.after).after(caption);
    }
  }
  placeCaption();

  function order(next: readonly Id[]): void {
    ids = next.filter((id) => tabs.has(id));
    list.append(...ids.map((id) => lookup(tabs, id)));
    placeCaption();
  }

  function idOf(node: Element): Id | undefined {
    const value = node.closest(`[${TAB_ATTRIBUTE}]`)?.getAttribute(TAB_ATTRIBUTE);
    return ids.find((id) => id === value);
  }

  /** The tab a navigation key moves focus to: the next or previous with either axis, or an end. */
  function moveTo(key: string, from: Id): Id | undefined {
    const at = ids.indexOf(from);
    if (key === "Home") {
      return ids[0];
    }
    if (key === "End") {
      return ids.at(-1);
    }
    const step = NEXT_KEYS.has(key) ? 1 : PREVIOUS_KEYS.has(key) ? -1 : 0;
    return step === 0 ? undefined : ids[(at + step + ids.length) % ids.length];
  }

  const activate = options.onActivate ?? select;
  function onKeydown(event: KeyboardEvent): void {
    const node = event.target;
    if (
      !(node instanceof Element) || node.getAttribute("role") !== TAB_ROLE
      || event.altKey || event.ctrlKey || event.metaKey
    ) {
      return;
    }
    const from = idOf(node);
    if (from === undefined) {
      return;
    }
    if (ACTIVATE_KEYS.has(event.key)) {
      event.preventDefault();
      activate(from);
      return;
    }
    const next = moveTo(event.key, from);
    if (next !== undefined) {
      event.preventDefault();
      rove(next);
      lookup(tabs, next).focus();
    }
  }
  list.addEventListener("keydown", onKeydown);

  return {
    list,
    tab: (id) => lookup(tabs, id),
    panel: (id) => lookup(panels, id),
    selected: () => current ?? first,
    select,
    order,
    idOf,
    stop: () => {
      list.removeEventListener("keydown", onKeydown);
    },
  };
}
