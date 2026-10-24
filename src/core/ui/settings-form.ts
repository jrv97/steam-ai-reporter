import * as v from "valibot";
import type { BareMessageKey } from "../i18n/t";
import type { TagKind } from "../kinds/kind";
import { LIST_FILTERS, type ListFilter } from "../kinds/kind-settings";
import type { MessageCatalog } from "../ports";
import type { AllowEntry } from "../settings/allow-data";
import type { AllowList } from "../settings/allow-list";
import {
  AUTO_LOCALE,
  DEFAULT_SETTINGS,
  LocaleSchema,
  parseSettings,
  type Settings,
  withKind,
} from "../settings/settings";
import type { StoredSettings } from "../settings/settings-source";
import { type AppId, toAppId } from "../types";
import { adoptStyles, SETTINGS_CSS, TOKENS_CSS } from "./styles";

/** The full options page, or the short toolbar popup (no language picker, no privacy card). */
export type SettingsContext = "page" | "popup";

/** The product heading above the cards: name, version and, where an icon file ships, the icon. */
export interface SettingsHeader {
  /** The release version, from `package.json` through the manifest or the userscript header. */
  readonly version: string;
  /** The icon shown at 32px: `icon-48.png` on the page, `icon-32.png` in the popup. */
  readonly iconUrl?: string;
}

export interface SettingsFormDeps {
  /** The tag kind whose settings and ignored games the form shows. */
  readonly kind: TagKind;
  readonly i18n: MessageCatalog;
  readonly settings: StoredSettings;
  readonly allowList: AllowList;
  readonly context: SettingsContext;
  /** The catalog locales this build ships, for the language picker. */
  readonly locales: readonly string[];
  /** Renders the product heading; omitted where the host already titles the form. */
  readonly header?: SettingsHeader;
  /** The full options page, linked from the popup footer as "All settings". */
  readonly allSettingsUrl?: string;
}

export interface SettingsForm {
  /** Reads the allow-list again, after another tab changed it. */
  refreshAllowList(): Promise<void>;
  /** Stops listening and empties the root. */
  destroy(): void;
}

/** An `aria-live` token, not copy. */
const POLITE = "polite";

const STORE_APP_URL = "https://store.steampowered.com/app/";

/** Link target and relation tokens, not copy. */
const NEW_TAB = "_blank";
const NO_OPENER = "noopener";

/** The header icon's rendered size in CSS pixels (components.mdx section 6). */
const ICON_SIZE = 32;

const FIELDS = ["badges", "banner", "listFilter", "locale"] as const;
type Field = (typeof FIELDS)[number];
const FieldSchema = v.picklist(FIELDS);

const FILTER_LABELS: Readonly<Record<ListFilter, BareMessageKey>> = {
  off: "options_filter_off",
  dim: "options_filter_dim",
  hide: "options_filter_hide",
};
const FILTER_HELP: Readonly<Record<ListFilter, BareMessageKey>> = {
  off: "options_filter_off_help",
  dim: "options_filter_dim_help",
  hide: "options_filter_hide_help",
};

let mounts = 0;

/** A BCP 47 tag for a catalog locale code (`pt_BR` to `pt-BR`). */
function languageTag(locale: string): string {
  return locale.replaceAll("_", "-");
}

/** The locale's name in its own language, or the code when `Intl` does not know it. */
function autonym(locale: string): string {
  const tag = languageTag(locale);
  try {
    return new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? locale;
  } catch {
    return locale;
  }
}

function dateFormat(locale: string): Intl.DateTimeFormat {
  const tag = languageTag(locale);
  const supported = Intl.DateTimeFormat.supportedLocalesOf(tag).length > 0 ? tag : undefined;
  return new Intl.DateTimeFormat(supported, { dateStyle: "medium" });
}

/**
 * Mounts the settings and the allow-list into `root`: the options page, the toolbar popup or the
 * userscript dialog. Every change applies at once through the settings port; there is no save
 * button. One delegated listener on the root serves every control (rule 13).
 */
export async function mountSettingsForm(
  root: HTMLElement,
  deps: SettingsFormDeps,
): Promise<SettingsForm> {
  const { i18n, settings, allowList, context, kind } = deps;
  const doc = root.ownerDocument;
  mounts += 1;
  const prefix = `sar-${String(mounts)}-`;
  const dates = dateFormat(i18n.locale);

  const scope = root.getRootNode();
  if (scope === doc) {
    adoptStyles(doc, TOKENS_CSS);
    adoptStyles(doc, SETTINGS_CSS);
  } else if (scope instanceof ShadowRoot) {
    adoptStyles(scope, SETTINGS_CSS);
  }

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    if (className !== "") {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function fieldError(): HTMLElement {
    const error = element("p", "sar-field-error", i18n.t("error_settings_save"));
    error.setAttribute("role", "alert");
    error.hidden = true;
    return error;
  }

  function card(key: BareMessageKey, name: string): HTMLElement {
    const section = element("section", "sar-card");
    const title = element("h2", "sar-card-title", i18n.t(key));
    title.id = prefix + name;
    title.tabIndex = -1;
    section.setAttribute("aria-labelledby", title.id);
    section.append(title);
    return section;
  }

  function heading(info: SettingsHeader): HTMLElement {
    const node = element("header", "sar-options-header");
    if (info.iconUrl !== undefined) {
      const icon = element("img", "");
      icon.src = info.iconUrl;
      icon.alt = "";
      icon.width = ICON_SIZE;
      icon.height = ICON_SIZE;
      node.append(icon);
    }
    const text = element("div", "");
    text.append(
      element("h1", "sar-options-title", i18n.t("ext_name")),
      element("div", "sar-options-version", i18n.t("options_version", { version: info.version })),
    );
    node.append(text);
    return node;
  }

  const errors = new Map<Field, HTMLElement>();
  const switches = new Map<Field, HTMLInputElement>();
  const radios = new Map<ListFilter, HTMLInputElement>();

  function switchField(
    field: "badges" | "banner",
    label: BareMessageKey,
    help: string,
  ): HTMLElement {
    const row = element("label", "sar-field");
    const input = element("input", "sar-toggle");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.setAttribute("data-sar-setting", field);
    switches.set(field, input);
    const error = fieldError();
    errors.set(field, error);
    row.append(
      element("span", "sar-field-label", i18n.t(label)),
      input,
      element("span", "sar-field-help", help),
      error,
    );
    return row;
  }

  // On store pages
  const loadError = element("p", "sar-field-error", i18n.t("error_settings_load"));
  loadError.setAttribute("role", "alert");
  loadError.hidden = true;
  const store = card("options_section_store", "store");
  store.append(
    loadError,
    switchField(
      "badges",
      context === "popup" ? kind.messages.badgesSwitchShort : kind.messages.badgesSwitch,
      i18n.t("options_badges_help", { label: i18n.t(kind.messages.label) }),
    ),
    switchField("banner", "options_banner", i18n.t("options_banner_help")),
  );

  // In lists
  const lists = card("options_section_lists", "lists");
  const filter = element("div", "sar-field");
  filter.setAttribute("data-sar-layout", "stacked");
  const filterLabel = element("span", "sar-field-label", i18n.t(kind.messages.filterLabel));
  filterLabel.id = `${prefix}filter`;
  const segment = element("fieldset", "sar-segment");
  segment.setAttribute("aria-labelledby", filterLabel.id);
  for (const value of LIST_FILTERS) {
    const input = element("input", "");
    input.type = "radio";
    input.name = `${prefix}filter`;
    input.id = `${prefix}filter-${value}`;
    input.value = value;
    input.setAttribute("data-sar-setting", "listFilter");
    radios.set(value, input);
    const label = element("label", "", i18n.t(FILTER_LABELS[value]));
    label.htmlFor = input.id;
    segment.append(input, label);
  }
  const filterHelp = element("span", "sar-field-help");
  const filterError = fieldError();
  errors.set("listFilter", filterError);
  filter.append(filterLabel, segment, filterHelp, filterError);
  lists.append(filter);

  const cards: HTMLElement[] = deps.header === undefined
    ? [store, lists]
    : [heading(deps.header), store, lists];

  // Language (page only)
  let picker: HTMLSelectElement | undefined;
  if (context === "page") {
    const language = card("options_section_language", "language");
    const field = element("div", "sar-field");
    field.setAttribute("data-sar-layout", "stacked");
    const label = element("label", "sar-field-label", i18n.t("options_language_label"));
    picker = element("select", "sar-select");
    picker.id = `${prefix}locale`;
    picker.setAttribute("data-sar-setting", "locale");
    label.htmlFor = picker.id;
    const auto = element("option", "", i18n.t("options_language_auto"));
    auto.value = AUTO_LOCALE;
    picker.append(auto);
    for (const locale of deps.locales) {
      const option = element("option", "", autonym(locale));
      option.value = locale;
      option.lang = languageTag(locale);
      picker.append(option);
    }
    const error = fieldError();
    errors.set("locale", error);
    field.append(
      label,
      picker,
      element("span", "sar-field-help", i18n.t("options_language_help")),
      error,
    );
    language.append(field);
    cards.push(language);
  }

  // Games you ignored
  const allow = card("options_section_allow", "allow");
  const allowBody = element("div", "");
  allow.append(allowBody);
  cards.push(allow);

  // Privacy (page only) and footer
  if (context === "page") {
    const privacy = card("options_section_privacy", "privacy");
    const bullets = element("ul", "sar-privacy");
    const keys: readonly BareMessageKey[] = [
      "options_privacy_no_reports",
      "options_privacy_storage",
      "options_privacy_lookup",
      "options_privacy_nothing_sent",
    ];
    bullets.append(...keys.map((key) => element("li", "", i18n.t(key))));
    privacy.append(bullets);
    cards.push(privacy);
  }
  const footer = element("div", "sar-options-footer");
  if (context === "popup") {
    footer.append(element("p", "", i18n.t("options_privacy_no_reports")));
  }
  footer.append(
    element(
      "p",
      "",
      i18n.t(context === "popup" ? "options_unaffiliated_short" : "options_unaffiliated"),
    ),
  );
  if (deps.allSettingsUrl !== undefined) {
    const link = element("a", "", i18n.t("options_all_settings"));
    link.href = deps.allSettingsUrl;
    link.target = NEW_TAB;
    link.rel = NO_OPENER;
    const line = element("p", "");
    line.append(link);
    footer.append(line);
  }

  const live = element("div", "sar-vh");
  live.setAttribute("aria-live", POLITE);

  root.classList.add("sar-options");
  root.setAttribute("data-sar-context", context);
  root.replaceChildren(...cards, footer, live);

  let current: Settings = DEFAULT_SETTINGS;
  try {
    current = parseSettings(await settings.read());
  } catch {
    loadError.hidden = false;
  }

  function sync(): void {
    const own = current.kinds[kind.id];
    for (const [field, input] of switches) {
      input.checked = field === "badges" ? own.badge : own.banner;
    }
    for (const [value, input] of radios) {
      input.checked = value === own.filter;
    }
    filterHelp.textContent = i18n.t(FILTER_HELP[own.filter]);
    if (picker !== undefined) {
      picker.value = current.locale;
    }
  }

  /** The settings with the control's value applied; an invalid value becomes the default. */
  function changed(field: Field, control: HTMLInputElement | HTMLSelectElement): Settings {
    const defaults = kind.defaults;
    switch (field) {
      case "badges":
        return withKind(current, kind.id, {
          badge: control instanceof HTMLInputElement ? control.checked : defaults.badge,
        });
      case "banner":
        return withKind(current, kind.id, {
          banner: control instanceof HTMLInputElement ? control.checked : defaults.banner,
        });
      case "listFilter":
        return withKind(current, kind.id, {
          filter: v.parse(v.fallback(v.picklist(LIST_FILTERS), defaults.filter), control.value),
        });
      case "locale":
        return {
          ...current,
          locale: v.parse(v.fallback(LocaleSchema, DEFAULT_SETTINGS.locale), control.value),
        };
    }
  }

  async function save(field: Field, next: Settings): Promise<void> {
    const error = errors.get(field);
    try {
      await settings.write(next);
    } catch {
      sync();
      if (error !== undefined) {
        error.hidden = false;
      }
      return;
    }
    current = next;
    sync();
    if (error !== undefined) {
      error.hidden = true;
    }
    live.textContent = i18n.t("notice_settings_saved");
  }

  function onChange(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    const field = v.safeParse(FieldSchema, target.getAttribute("data-sar-setting"));
    if (!field.success) {
      return;
    }
    void save(field.output, changed(field.output, target));
  }

  function renderAllowList(entries: ReadonlyMap<AppId, AllowEntry>): void {
    // The popup has no room for an empty section; the full page keeps its empty state.
    allow.hidden = context === "popup" && entries.size === 0;
    if (entries.size === 0) {
      allowBody.replaceChildren(
        element(
          "p",
          "sar-empty",
          i18n.t("options_allow_empty", { action: i18n.t("banner_ignore") }),
        ),
      );
      return;
    }
    const list = element("ul", "sar-allow-list");
    const newestFirst = [...entries].sort(([, a], [, b]) => b.added - a.added);
    for (const [id, entry] of newestFirst) {
      const item = element("li", "sar-allow-item");
      const text = element("div", "");
      const name = element("a", "sar-allow-name", entry.name);
      name.href = `${STORE_APP_URL}${String(id)}/`;
      const since = dates.format(new Date(entry.added));
      text.append(
        name,
        element("span", "sar-allow-meta", i18n.t("options_allow_since", { date: since })),
      );
      const restore = element("button", "sar-button", i18n.t("options_allow_restore"));
      restore.type = "button";
      restore.setAttribute("data-sar-restore", String(id));
      restore.setAttribute(
        "aria-label",
        i18n.t("options_allow_restore_label", { name: entry.name }),
      );
      const error = element("p", "sar-field-error", i18n.t("error_allow_list_save"));
      error.setAttribute("role", "alert");
      error.hidden = true;
      item.append(text, restore, error);
      list.append(item);
    }
    allowBody.replaceChildren(list);
  }

  async function refreshAllowList(): Promise<void> {
    let entries: ReadonlyMap<AppId, AllowEntry> = new Map();
    try {
      entries = (await allowList.list())[kind.id];
    } catch {
      // Shown as empty; the next refresh tries again.
    }
    renderAllowList(entries);
  }

  async function restore(button: HTMLElement, id: AppId): Promise<void> {
    const item = button.closest(".sar-allow-item");
    const next = item?.nextElementSibling?.querySelector<HTMLElement>("[data-sar-restore]")
      ?? item?.previousElementSibling?.querySelector<HTMLElement>("[data-sar-restore]");
    const nextId = next?.getAttribute("data-sar-restore");
    try {
      await allowList.remove(kind.id, id);
    } catch {
      const error = item?.querySelector<HTMLElement>(".sar-field-error");
      if (error !== null && error !== undefined) {
        error.hidden = false;
      }
      return;
    }
    await refreshAllowList();
    // With the last game gone, the popup hides the section, so focus lands on the one above it
    const section = allow.hidden === true ? lists : allow;
    const focus = nextId === null || nextId === undefined
      ? section.querySelector<HTMLElement>(".sar-card-title")
      : allowBody.querySelector<HTMLElement>(`[data-sar-restore="${nextId}"]`);
    focus?.focus();
    live.textContent = i18n.t("notice_marking_restored");
  }

  function onClick(target: EventTarget | null): void {
    const button = target instanceof Element
      ? target.closest<HTMLElement>("[data-sar-restore]")
      : null;
    const id = button === null
      ? undefined
      : toAppId(Number(button.getAttribute("data-sar-restore")));
    if (button !== null && id !== undefined) {
      void restore(button, id);
    }
  }

  function onEvent(event: Event): void {
    if (event.type === "change") {
      onChange(event.target);
    } else {
      onClick(event.target);
    }
  }

  sync();
  await refreshAllowList();
  root.addEventListener("change", onEvent);
  root.addEventListener("click", onEvent);
  const unsubscribe = settings.subscribe((value) => {
    current = parseSettings(value);
    sync();
  });

  return {
    refreshAllowList,
    destroy() {
      unsubscribe();
      root.removeEventListener("change", onEvent);
      root.removeEventListener("click", onEvent);
      root.replaceChildren();
    },
  };
}
