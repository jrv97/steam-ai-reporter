/** Names the tab a tab button, or a button that switches to a tab, belongs to. */
export const TAB_ATTRIBUTE = "data-sar-tab";

const TAB_ROLE = "tab";
const NEXT_KEYS: ReadonlySet<string> = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowUp"]);

export interface TabsOptions<Id extends string> {
  readonly doc: Document;
  /** The tabs in the order they show; the first is selected until `select` says otherwise. */
  readonly ids: readonly Id[];
  /** Makes the tab and panel ids unique on the page. */
  readonly idPrefix: string;
  /** The accessible name of the tab list. */
  readonly label: string;
}

/**
 * Tabs in the standard pattern: `role="tab"` buttons with `aria-selected` and `aria-controls`, one
 * tab stop, and only the selected panel shown. The caller fills them and routes its delegated keys.
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
  /**
   * The tab a key on a focused tab moves to: the next or previous one with the arrows of either
   * axis, wrapping at the ends, the first with Home and the last with End.
   */
  target(event: KeyboardEvent): Id | undefined;
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

  function lookup<T>(map: ReadonlyMap<Id, T>, id: Id): T {
    const found = map.get(id);
    if (found === undefined) {
      throw new RangeError(id);
    }
    return found;
  }

  let current: Id | undefined;

  function select(id: Id): boolean {
    if (id === current || !tabs.has(id)) {
      return false;
    }
    current = id;
    for (const [each, tab] of tabs) {
      const on = each === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      lookup(panels, each).hidden = !on;
    }
    return true;
  }

  const first = ids[0];
  if (first === undefined) {
    throw new RangeError();
  }
  select(first);

  function order(next: readonly Id[]): void {
    ids = next.filter((id) => tabs.has(id));
    list.append(...ids.map((id) => lookup(tabs, id)));
  }

  function idOf(node: Element): Id | undefined {
    const value = node.closest(`[${TAB_ATTRIBUTE}]`)?.getAttribute(TAB_ATTRIBUTE);
    return ids.find((id) => id === value);
  }

  return {
    list,
    tab: (id) => lookup(tabs, id),
    panel: (id) => lookup(panels, id),
    selected: () => current ?? first,
    select,
    order,
    idOf,

    target(event) {
      const node = event.target;
      if (
        !(node instanceof Element) || node.getAttribute("role") !== TAB_ROLE
        || !list.contains(node) || event.altKey || event.ctrlKey || event.metaKey
      ) {
        return undefined;
      }
      const from = idOf(node);
      const at = from === undefined ? -1 : ids.indexOf(from);
      const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
      if (step !== 0 && at !== -1) {
        return ids[(at + step + ids.length) % ids.length];
      }
      return event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : undefined;
    },
  };
}
