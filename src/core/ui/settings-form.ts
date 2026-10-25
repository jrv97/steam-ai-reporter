import * as v from "valibot";
import type { BareMessageKey } from "../i18n/t";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import { type KindSettings, LIST_FILTERS, type ListFilter } from "../kinds/kind-settings";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import type { MessageCatalog } from "../ports";
import {
  ALLOW_ALL,
  ALLOW_SCOPES,
  type AllowEntries,
  type AllowEntry,
  type AllowScope,
  toAllowScope,
} from "../settings/allow-data";
import type { AllowList } from "../settings/allow-list";
import {
  AUTO_LOCALE,
  DEFAULT_SETTINGS,
  LocaleSchema,
  parseSettings,
  type Settings,
  type SettingsPatch,
} from "../settings/settings";
import type { StoredSettings } from "../settings/settings-source";
import { type AppId, toAppId } from "../types";
import { announce, POLITE } from "./announce";
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

const STORE_APP_URL = "https://store.steampowered.com/app/";

/** Link target and relation tokens, not copy. */
const NEW_TAB = "_blank";
const NO_OPENER = "noopener";

/** The header icon's rendered size in CSS pixels (components.mdx section 6). */
const ICON_SIZE = 32;

/** What a control changes, named in its `data-sar-setting`. A kind's control names its kind. */
const FIELDS = ["enabled", "badge", "banner", "filter", "locale"] as const;
type Field = (typeof FIELDS)[number];
const FieldSchema = v.picklist(FIELDS);
const KindIdSchema = v.picklist(KIND_IDS);

/** The switches of a kind, which `data-sar-setting` names as the kind setting they flip. */
type SwitchField = "enabled" | "badge" | "banner";

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

/** The controls of one kind's section, which `sync` sets from the stored settings. */
interface KindControls {
  /** The switches below the master switch; hidden while the kind is off. */
  readonly options: HTMLElement;
  readonly switches: Readonly<Record<SwitchField, HTMLInputElement>>;
  readonly radios: ReadonlyMap<ListFilter, HTMLInputElement>;
  readonly filterHelp: HTMLElement;
}

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

/** The patch that sets some fields of one kind. */
function forKind(id: KindId, settings: Partial<KindSettings>): SettingsPatch {
  return { kinds: { [id]: settings } };
}

function errorKey(field: Field, kind?: KindId): string {
  return kind === undefined ? field : `${kind}:${field}`;
}

/**
 * Mounts the settings and the ignored games into `root`: the options page, the popup or the
 * userscript dialog. Each change is a patch of the stored settings, applied at once. One
 * delegated listener per event type on the root serves every control (rule 13).
 */
export async function mountSettingsForm(
  root: HTMLElement,
  deps: SettingsFormDeps,
): Promise<SettingsForm> {
  const { i18n, settings, allowList, context } = deps;
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

  function card(title: string, id: string): HTMLElement {
    const section = element("section", "sar-card");
    const heading = element("h2", "sar-card-title", title);
    heading.id = prefix + id;
    heading.tabIndex = -1;
    section.setAttribute("aria-labelledby", heading.id);
    section.append(heading);
    return section;
  }

  function header(info: SettingsHeader): HTMLElement {
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

  const errors = new Map<string, HTMLElement>();
  const controls = new Map<KindId, KindControls>();

  function switchField(
    kind: KindId,
    field: SwitchField,
    label: BareMessageKey,
    help: string,
  ): { readonly row: HTMLElement; readonly input: HTMLInputElement; } {
    const row = element("label", "sar-field");
    const input = element("input", "sar-toggle");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.setAttribute("data-sar-setting", field);
    input.setAttribute("data-sar-for", kind);
    const error = fieldError();
    errors.set(errorKey(field, kind), error);
    row.append(
      element("span", "sar-field-label", i18n.t(label)),
      input,
      element("span", "sar-field-help", help),
      error,
    );
    return { row, input };
  }

  /** The list filter: a labelled fieldset of radios, with help that follows the choice. */
  function filterField(kind: TagKind): {
    readonly row: HTMLElement;
    readonly radios: ReadonlyMap<ListFilter, HTMLInputElement>;
    readonly help: HTMLElement;
  } {
    const row = element("div", "sar-field");
    row.setAttribute("data-sar-layout", "stacked");
    const label = element("span", "sar-field-label", i18n.t("options_filter_label"));
    label.id = `${prefix}${kind.id}-filter`;
    const segment = element("fieldset", "sar-segment");
    segment.setAttribute("aria-labelledby", label.id);
    const radios = new Map<ListFilter, HTMLInputElement>();
    for (const value of LIST_FILTERS) {
      const input = element("input", "");
      input.type = "radio";
      input.name = label.id;
      input.id = `${label.id}-${value}`;
      input.value = value;
      input.setAttribute("data-sar-setting", "filter");
      input.setAttribute("data-sar-for", kind.id);
      radios.set(value, input);
      const text = element("label", "", i18n.t(FILTER_LABELS[value]));
      text.htmlFor = input.id;
      segment.append(input, text);
    }
    const help = element("span", "sar-field-help");
    const error = fieldError();
    errors.set(errorKey("filter", kind.id), error);
    row.append(label, segment, help, error);
    return { row, radios, help };
  }

  /** One tag's section, titled with Steam's line for it: the master switch, then the rest. */
  function kindCard(kind: TagKind): HTMLElement {
    const section = card(i18n.t(kind.messages.heading), kind.id);
    const enabled = switchField(
      kind.id,
      "enabled",
      "options_kind_enabled",
      i18n.t("options_kind_enabled_help"),
    );
    const badge = switchField(
      kind.id,
      "badge",
      context === "popup" ? "options_badges_short" : "options_badges",
      i18n.t("options_badges_help", { label: i18n.t(kind.messages.chip) }),
    );
    const banner = switchField(
      kind.id,
      "banner",
      "options_banner",
      i18n.t("options_banner_help"),
    );
    const filter = filterField(kind);
    const options = element("div", "sar-kind-options");
    options.append(badge.row, banner.row, filter.row);
    section.append(enabled.row, options);
    controls.set(kind.id, {
      options,
      switches: { enabled: enabled.input, badge: badge.input, banner: banner.input },
      radios: filter.radios,
      filterHelp: filter.help,
    });
    return section;
  }

  const loadError = element("p", "sar-field-error", i18n.t("error_settings_load"));
  loadError.setAttribute("role", "alert");
  loadError.hidden = true;
  const kindCards = KINDS.map(kindCard);
  kindCards[0]?.querySelector(".sar-card-title")?.after(loadError);

  const cards: HTMLElement[] = deps.header === undefined
    ? [...kindCards]
    : [header(deps.header), ...kindCards];

  // Language (page only)
  let picker: HTMLSelectElement | undefined;
  if (context === "page") {
    const language = card(i18n.t("options_section_language"), "language");
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
    errors.set(errorKey("locale"), error);
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
  const allow = card(i18n.t("options_section_allow"), "allow");
  const allowBody = element("div", "");
  allow.append(allowBody);
  cards.push(allow);

  // Privacy (page only) and footer
  if (context === "page") {
    const privacy = card(i18n.t("options_section_privacy"), "privacy");
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

  /** Controls stay off while the load error shows, so no save puts defaults over v1 data. */
  const settingControls = root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "[data-sar-setting]",
  );
  function allowChanges(allowed: boolean): void {
    for (const control of settingControls) {
      control.disabled = !allowed;
    }
  }

  let current: Settings = DEFAULT_SETTINGS;
  let loadFailed = false;
  try {
    current = parseSettings(await settings.read());
  } catch {
    loadFailed = true;
    loadError.hidden = false;
    allowChanges(false);
  }

  function sync(): void {
    for (const [id, own] of controls) {
      const kind = current.kinds[id];
      own.switches.enabled.checked = kind.enabled;
      own.switches.badge.checked = kind.badge;
      own.switches.banner.checked = kind.banner;
      for (const [value, input] of own.radios) {
        input.checked = value === kind.filter;
      }
      own.filterHelp.textContent = i18n.t(FILTER_HELP[kind.filter]);
      own.options.hidden = !kind.enabled;
    }
    if (picker !== undefined) {
      picker.value = current.locale;
    }
  }

  /** The patch for a control's value; an invalid value becomes the default. */
  function patchFor(
    field: Field,
    kind: TagKind | undefined,
    control: HTMLInputElement | HTMLSelectElement,
  ): SettingsPatch | undefined {
    const checked = control instanceof HTMLInputElement && control.checked;
    if (field === "locale") {
      return { locale: v.parse(v.fallback(LocaleSchema, DEFAULT_SETTINGS.locale), control.value) };
    }
    if (kind === undefined) {
      return undefined;
    }
    switch (field) {
      case "enabled":
        return forKind(kind.id, { enabled: checked });
      case "badge":
        return forKind(kind.id, { badge: checked });
      case "banner":
        return forKind(kind.id, { banner: checked });
      case "filter":
        return forKind(kind.id, {
          filter: v.parse(
            v.fallback(v.picklist(LIST_FILTERS), kind.defaults.filter),
            control.value,
          ),
        });
    }
  }

  async function save(patch: SettingsPatch, key: string): Promise<void> {
    const error = errors.get(key);
    try {
      current = await settings.patch(patch);
    } catch {
      sync();
      if (error !== undefined) {
        error.hidden = false;
      }
      return;
    }
    sync();
    if (error !== undefined) {
      error.hidden = true;
    }
    announce(doc, live, i18n.t("notice_settings_saved"));
  }

  function onChange(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    const field = v.safeParse(FieldSchema, target.getAttribute("data-sar-setting"));
    if (!field.success) {
      return;
    }
    if (loadFailed) {
      sync();
      return;
    }
    const id = v.safeParse(KindIdSchema, target.getAttribute("data-sar-for"));
    const kind = id.success ? KIND_BY_ID[id.output] : undefined;
    const patch = patchFor(field.output, kind, target);
    if (patch !== undefined) {
      void save(patch, errorKey(field.output, kind?.id));
    }
  }

  /** The name of a scope: Steam's line for a tag, or all tags. */
  function scopeName(of: AllowScope): string {
    return of === ALLOW_ALL
      ? i18n.t("options_allow_scope_all")
      : i18n.t(KIND_BY_ID[of].messages.heading);
  }

  function allowItem(of: AllowScope, id: AppId, entry: AllowEntry): HTMLElement {
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
    restore.setAttribute("data-sar-scope", of);
    restore.setAttribute(
      "aria-label",
      i18n.t("options_allow_restore_label", { name: entry.name, scope: scopeName(of) }),
    );
    const error = element("p", "sar-field-error", i18n.t("error_allow_list_save"));
    error.setAttribute("role", "alert");
    error.hidden = true;
    item.append(text, restore, error);
    return item;
  }

  /** One scope's games, newest first, under the scope's name. */
  function allowGroup(of: AllowScope, entries: ReadonlyMap<AppId, AllowEntry>): HTMLElement {
    const group = element("div", "sar-allow-group");
    const title = element("h3", "sar-allow-scope", scopeName(of));
    title.id = `${prefix}allow-${of}`;
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", title.id);
    const list = element("ul", "sar-allow-list");
    const newestFirst = [...entries].sort(([, a], [, b]) => b.added - a.added);
    list.append(...newestFirst.map(([id, entry]) => allowItem(of, id, entry)));
    group.append(title, list);
    return group;
  }

  function renderAllowList(entries: AllowEntries): void {
    const listed = ALLOW_SCOPES.filter((each) => entries[each].size > 0);
    // The popup has no room for an empty section; the full page keeps its empty state.
    allow.hidden = context === "popup" && listed.length === 0;
    if (listed.length === 0) {
      allowBody.replaceChildren(
        element(
          "p",
          "sar-empty",
          i18n.t("options_allow_empty", { action: i18n.t("banner_ignore") }),
        ),
      );
      return;
    }
    allowBody.replaceChildren(...listed.map((each) => allowGroup(each, entries[each])));
  }

  /** A list that cannot be read says so, in both contexts; the next refresh tries again. */
  function renderAllowError(): void {
    allow.hidden = false;
    const error = element("p", "sar-field-error", i18n.t("error_allow_list_load"));
    error.setAttribute("role", "alert");
    allowBody.replaceChildren(error);
  }

  async function refreshAllowList(): Promise<void> {
    let entries: AllowEntries;
    try {
      entries = await allowList.list();
    } catch {
      renderAllowError();
      return;
    }
    renderAllowList(entries);
  }

  /** The button that stops ignoring a game in a scope, once the list is drawn again. */
  function restoreButton(of: string | null, id: string | null): HTMLElement | undefined {
    return [...allowBody.querySelectorAll<HTMLElement>("[data-sar-restore]")].find((button) =>
      button.getAttribute("data-sar-scope") === of && button.getAttribute("data-sar-restore") === id
    );
  }

  async function restore(button: HTMLElement, of: AllowScope, id: AppId): Promise<void> {
    const buttons = [...allowBody.querySelectorAll<HTMLElement>("[data-sar-restore]")];
    const at = buttons.indexOf(button);
    const neighbor = buttons[at + 1] ?? buttons[at - 1];
    const nextScope = neighbor?.getAttribute("data-sar-scope") ?? null;
    const nextId = neighbor?.getAttribute("data-sar-restore") ?? null;
    try {
      await allowList.remove(of, id);
    } catch {
      const error = button.closest(".sar-allow-item")?.querySelector<HTMLElement>(
        ".sar-field-error",
      );
      if (error !== null && error !== undefined) {
        error.hidden = false;
      }
      return;
    }
    await refreshAllowList();
    // With the last game gone, the popup hides the section, so focus lands on the one above it
    const section = allow.hidden === true ? kindCards.at(-1) : allow;
    const focus = restoreButton(nextScope, nextId)
      ?? section?.querySelector<HTMLElement>(".sar-card-title");
    focus?.focus();
    announce(
      doc,
      live,
      of === ALLOW_ALL
        ? i18n.t("notice_marking_restored")
        : i18n.t("notice_marking_restored_kind", { heading: scopeName(of) }),
    );
  }

  function onClick(target: EventTarget | null): void {
    const button = target instanceof Element
      ? target.closest<HTMLElement>("[data-sar-restore]")
      : null;
    const id = button === null
      ? undefined
      : toAppId(Number(button.getAttribute("data-sar-restore")));
    const of = button === null ? undefined : toAllowScope(button.getAttribute("data-sar-scope"));
    if (button !== null && id !== undefined && of !== undefined) {
      void restore(button, of, id);
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
    loadFailed = false;
    loadError.hidden = true;
    allowChanges(true);
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
