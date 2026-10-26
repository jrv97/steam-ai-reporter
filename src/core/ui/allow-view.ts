import type { BareMessageKey } from "../i18n/t";
import type { MessageCatalog } from "../ports";
import {
  type AllowEntries,
  type AllowEntry,
  type AllowScope,
  type ParseKey,
  toAllowScope,
} from "../settings/allow-data";
import type { ScopedList } from "../settings/allow-list";

/** What marks a "Stop ignoring" button, with the key of the item it restores. */
export const RESTORE_ATTRIBUTE = "data-sar-restore";
/** Names the list a "Stop ignoring" button belongs to. */
export const LIST_ATTRIBUTE = "data-sar-list";
/** Names the scope a "Stop ignoring" button restores the item in. */
export const SCOPE_ATTRIBUTE = "data-sar-scope";

/** What differs between the lists of ignored items: games, developers and publishers. */
export interface AllowSpec<Key> {
  /** Names the list; the heading ids of its groups and its buttons' `data-sar-list` follow it. */
  readonly id: string;
  readonly list: ScopedList<Key>;
  readonly parseKey: ParseKey<Key>;
  readonly title: BareMessageKey;
  readonly saveError: BareMessageKey;
  readonly loadError: BareMessageKey;
  /** The name of an item: a link to the game, or the creator's plain name. */
  nameOf(key: Key, entry: AllowEntry): HTMLElement;
  /** What a screen reader hears after "Stop ignoring" on an item named `name` in the scope. */
  restored(name: string, of: AllowScope): string;
}

/** What every list draws with: the document, the copy, the date format and the id prefix. */
export interface AllowViewContext {
  readonly doc: Document;
  readonly i18n: MessageCatalog;
  readonly dates: Intl.DateTimeFormat;
  readonly prefix: string;
  /** The name of a scope: Steam's line for a tag, or all tags. */
  readonly scopeName: (of: AllowScope) => string;
}

/** The heading level of a group's caption, below the card that holds it. */
export type CaptionLevel = "h3" | "h4";

/** One list of ignored items, read once per refresh and drawn one scope at a time. */
export interface AllowSource {
  readonly id: string;
  readonly title: BareMessageKey;
  /** Reads the list once. A failed read is kept, and drawn, until the next refresh. */
  refresh(): Promise<void>;
  /** Whether the last read failed. */
  failed(): boolean;
  /** How many items the scope holds; none while the read failed. */
  count(of: AllowScope): number;
  /** The scope's items, newest first, under a caption; undefined when it has none. */
  group(of: AllowScope, caption: string, level: CaptionLevel): HTMLElement | undefined;
  /** Says that the list could not be read, never that nothing is ignored. */
  loadError(): HTMLElement;
  /**
   * Stops ignoring the item a button names and returns what a screen reader hears. A button that
   * names no item, or a failed write, returns undefined; the write error shows under the item.
   */
  restore(button: Element): Promise<string | undefined>;
}

function errorLine(doc: Document, text: string): HTMLElement {
  const error = doc.createElement("p");
  error.className = "sar-field-error";
  error.textContent = text;
  error.setAttribute("role", "alert");
  return error;
}

/** The source of one list, drawn from its spec. */
export function createAllowSource<Key extends string | number>(
  spec: AllowSpec<Key>,
  context: AllowViewContext,
): AllowSource {
  const { doc, i18n, dates, prefix, scopeName } = context;
  let entries: AllowEntries<Key> | undefined;

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

  function item(of: AllowScope, key: Key, entry: AllowEntry): HTMLElement {
    const node = element("li", "sar-allow-item");
    const text = doc.createElement("div");
    const since = dates.format(new Date(entry.added));
    text.append(
      spec.nameOf(key, entry),
      element("span", "sar-allow-meta", i18n.t("options_allow_since", { date: since })),
    );
    const stop = element("button", "sar-button", i18n.t("options_allow_restore"));
    stop.type = "button";
    stop.setAttribute("data-sar-variant", "quiet");
    stop.setAttribute(RESTORE_ATTRIBUTE, String(key));
    stop.setAttribute(LIST_ATTRIBUTE, spec.id);
    stop.setAttribute(SCOPE_ATTRIBUTE, of);
    stop.setAttribute(
      "aria-label",
      i18n.t("options_allow_restore_label", { name: entry.name, scope: scopeName(of) }),
    );
    const error = errorLine(doc, i18n.t(spec.saveError));
    error.hidden = true;
    node.append(text, stop, error);
    return node;
  }

  return {
    id: spec.id,
    title: spec.title,

    async refresh() {
      try {
        entries = await spec.list.list();
      } catch {
        entries = undefined;
      }
    },

    failed: () => entries === undefined,

    count: (of) => entries?.[of].size ?? 0,

    group(of, caption, level) {
      const listed = entries?.[of];
      if (listed === undefined || listed.size === 0) {
        return undefined;
      }
      const node = element("div", "sar-allow-group");
      const title = element(level, "sar-allow-scope", caption);
      title.id = `${prefix}${spec.id}-${of}`;
      node.setAttribute("role", "group");
      node.setAttribute("aria-labelledby", title.id);
      const list = element("ul", "sar-allow-list");
      const newestFirst = [...listed].sort(([, a], [, b]) => b.added - a.added);
      list.append(...newestFirst.map(([key, entry]) => item(of, key, entry)));
      node.append(title, list);
      return node;
    },

    loadError: () => errorLine(doc, i18n.t(spec.loadError)),

    async restore(button) {
      const key = spec.parseKey(button.getAttribute(RESTORE_ATTRIBUTE) ?? "");
      const of = toAllowScope(button.getAttribute(SCOPE_ATTRIBUTE));
      if (key === undefined || of === undefined) {
        return undefined;
      }
      const row = button.closest(".sar-allow-item");
      const name = row?.querySelector(".sar-allow-name")?.textContent ?? "";
      try {
        await spec.list.remove(of, key);
      } catch {
        const error = row?.querySelector<HTMLElement>(".sar-field-error");
        if (error !== null && error !== undefined) {
          error.hidden = false;
        }
        return undefined;
      }
      return spec.restored(name, of);
    },
  };
}
