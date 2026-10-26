import * as v from "valibot";
import { CREATOR_ROLES, type CreatorKey, type CreatorRole, toCreatorKey } from "../creator";
import type { BareMessageKey } from "../i18n/t";
import type { IgnoreLists } from "../ignored";
import { type HexColor, readTypedColor } from "../kinds/color";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { FacetDefinition, FacetId, TagKind } from "../kinds/kind";
import { type KindSettings, LIST_FILTERS, type ListFilter } from "../kinds/kind-settings";
import { KIND_BY_ID, KINDS } from "../kinds/registry";
import type { Clock, FileTransfer, MessageCatalog } from "../ports";
import { ALLOW_ALL, type AllowScope, parseGameKey } from "../settings/allow-data";
import {
  AUTO_LOCALE,
  DEFAULT_SETTINGS,
  LocaleSchema,
  parseSettings,
  type Settings,
  type SettingsPatch,
} from "../settings/settings";
import type { StoredSettings } from "../settings/settings-source";
import type { AppId } from "../types";
import {
  type AllowSource,
  type AllowSpec,
  createAllowSource,
  LIST_ATTRIBUTE,
  RESTORE_ATTRIBUTE,
  SCOPE_ATTRIBUTE,
} from "./allow-view";
import { announce, POLITE } from "./announce";
import { createBackupCard } from "./backup-card";
import { createElement } from "./element";
import { parseIcon } from "./icon";
import { KIND_ATTRIBUTE, setColorOnce } from "./kind-attributes";
import { chipName } from "./kind-details";
import { createOrderCard, type OrderCard } from "./order-card";
import { adoptStyles, SETTINGS_CSS, TOKENS_CSS } from "./styles";
import { GENERAL_TAB, sortTabs, tabHash, type TabId, toTabId } from "./tab-id";
import { createTabs, type Tabs } from "./tabs";
import type { UiState } from "./ui-state";

/** The full options page, or the compact toolbar popup and userscript dialog. */
export type SettingsContext = "page" | "popup";

/** Tabs with every setting, or a row per tag with its name, list filter and master switch. */
export type SettingsLayout = "tabs" | "list";

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
  /** The games, developers and publishers the user ignored. */
  readonly lists: IgnoreLists;
  /** The tab last shown, kept across visits. */
  readonly uiState: UiState;
  /** Density and the page-only pieces: the privacy card and the long footer. */
  readonly context: SettingsContext;
  /** Tabs on the page and in the dialog; one row per tag in the toolbar popup. */
  readonly layout: SettingsLayout;
  /**
   * Whether each tag gets a color field. The full page and the userscript dialog show it; the
   * toolbar popup does not. It is a capability, not a context, so the layout stays the same.
   */
  readonly colors: boolean;
  /** The catalog locales this build ships, for the language picker. */
  readonly locales: readonly string[];
  /** Renders the product heading; omitted where the host already titles the form. */
  readonly header?: SettingsHeader;
  /** The full options page, behind the popup's gear and its tag names. */
  readonly allSettingsUrl?: string;
  /** Opens a tag's tab on the options page from a popup row; the row's link does without it. */
  readonly openTab?: (id: TabId) => void;
  /** Gives the form its Backup card; the toolbar popup has none. */
  readonly backup?: BackupFormDeps;
  /** The tab to show first, from the page's location fragment; else the stored one. */
  readonly initialTab?: TabId;
  /** Hears each tab shown after the first, for the page to mirror in its fragment. */
  readonly onTabChange?: (id: TabId) => void;
}

/** The download and file chooser of the Backup card, and the clock that dates a backup. */
export interface BackupFormDeps {
  readonly files: FileTransfer;
  readonly clock: Clock;
}

export interface SettingsForm {
  /** Reads the ignore lists again, after another tab changed one. */
  refreshAllowList(): Promise<void>;
  /** Shows a tab asked for from outside: a new location fragment, or the popup's request. */
  selectTab(id: TabId): void;
  /** Stops listening and empties the root. */
  destroy(): void;
}

const STORE_APP_URL = "https://store.steampowered.com/app/";

/** Link target and relation tokens, not copy. */
const NEW_TAB = "_blank";
const NO_OPENER = "noopener";
/** ARIA tokens, not copy. */
const TRUE = "true";
const TAB_ROLE = "tab";
/** Names the tab a popup row's link opens. */
const OPEN_TAB_ATTRIBUTE = "data-sar-open-tab";
/** An original gear, eight teeth around a hole on a 48 unit grid (`parseIcon`). */
const GEAR_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
  + '<path fill-rule="evenodd" d="M40 26 45 30 43 35 37 34 34 37 35 43 30 45 26 40 22 40 18 45 '
  + "13 43 14 37 11 34 5 35 3 30 8 26 8 22 3 18 5 13 11 14 14 11 13 5 18 3 22 8 26 8 30 3 35 5 34 "
  + '11 37 14 43 13 45 18 40 22ZM31 24a7 7 0 1 0-14 0 7 7 0 1 0 14 0Z"/></svg>';

/** The header icon's rendered size in CSS pixels (components.mdx section 6). */
const ICON_SIZE = 32;

/** What a control changes, named in its `data-sar-setting`. A kind's control names its kind. */
const FIELDS = ["enabled", "badge", "banner", "filter", "facets", "color", "locale"] as const;
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

/** What marks the Reset button of a color field, with the kind it resets. */
const COLOR_RESET_ATTRIBUTE = "data-sar-color-reset";
/** The quiet, link-like look of Reset, Stop ignoring and Show in General. */
const QUIET = "quiet";
const VARIANT_ATTRIBUTE = "data-sar-variant";

/** The controls of one kind's color field. */
interface ColorControls {
  readonly input: HTMLInputElement;
  /** Shown only while a color is set. */
  readonly reset: HTMLButtonElement;
  /** Names the text as no hex color; shown while the text is invalid. */
  readonly invalid: HTMLElement;
}

/** The controls of one kind, which `sync` sets from the stored settings. */
interface KindControls {
  /** What the master switch turns off: hidden on a tab, a disabled fieldset in a popup row. */
  readonly options: HTMLElement;
  /** The on or off cue on the kind's tab; a popup row has none. */
  readonly state: HTMLElement | undefined;
  readonly switches: ReadonlyMap<SwitchField, HTMLInputElement>;
  readonly radios: ReadonlyMap<ListFilter, HTMLInputElement>;
  readonly filterHelp: HTMLElement | undefined;
  /** One checkbox per value a kind with facets can tag; empty for the other kinds. */
  readonly facets: ReadonlyMap<FacetId, HTMLInputElement>;
  /** Absent where the form has no color fields. */
  readonly color: ColorControls | undefined;
}

/** The card of what is ignored in one scope: all tags in General, one tag in its own tab. */
interface ScopeCard {
  readonly of: AllowScope;
  readonly section: HTMLElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
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

/** The error key of the Tag order card, which holds no `data-sar-setting` control. */
const ORDER_ERROR = "order";

function errorKey(field: Field, kind?: KindId): string {
  return kind === undefined ? field : `${kind}:${field}`;
}

/**
 * Mounts the settings and the ignore lists into `root` as tabs: General, then one per tag. Each
 * change is a patch of the stored settings, applied at once. One delegated listener per event
 * type on the root serves every control (rule 13).
 */
export async function mountSettingsForm(
  root: HTMLElement,
  deps: SettingsFormDeps,
): Promise<SettingsForm> {
  const { i18n, settings, lists, context } = deps;
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

  /** A stored tab that cannot be read leaves General. */
  async function readTab(): Promise<TabId | undefined> {
    try {
      return await deps.uiState.read();
    } catch {
      return undefined;
    }
  }
  const firstTab = deps.initialTab !== undefined || deps.layout === "list"
    ? Promise.resolve(deps.initialTab)
    : readTab();

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    return createElement(doc, tag, className, text);
  }

  function quietButton(text: string): HTMLButtonElement {
    const button = element("button", "sar-button", text);
    button.type = "button";
    button.setAttribute(VARIANT_ATTRIBUTE, QUIET);
    return button;
  }

  function fieldError(): HTMLElement {
    const error = element("p", "sar-field-error", i18n.t("error_settings_save"));
    error.setAttribute("role", "alert");
    error.hidden = true;
    return error;
  }

  /** The title of a card; focus lands on it after a restore, so it takes focus but is no stop. */
  function cardTitle(title: string, id: string, level: "h2" | "h3"): HTMLElement {
    const heading = element(level, "sar-card-title", title);
    heading.id = prefix + id;
    heading.tabIndex = -1;
    return heading;
  }

  function card(title: string, id: string, level: "h2" | "h3" = "h3"): HTMLElement {
    const section = element("section", "sar-card");
    const heading = cardTitle(title, id, level);
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
    if (deps.allSettingsUrl !== undefined) {
      node.append(gear(deps.allSettingsUrl));
    }
    return node;
  }

  /** The popup's way to every setting: a gear link, the one icon in the settings chrome. */
  function gear(url: string): HTMLElement {
    const link = element("a", "sar-gear");
    link.href = url;
    link.target = NEW_TAB;
    link.rel = NO_OPENER;
    link.title = i18n.t("options_all_settings");
    link.setAttribute("aria-label", link.title);
    const icon = parseIcon(doc, GEAR_SVG);
    if (icon !== undefined) {
      link.append(icon);
    }
    return link;
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

  /** Show, Dim and Hide: a fieldset of radios, labelled by the elements `labelledBy` names. */
  function filterSegment(kind: TagKind, labelledBy: string): {
    readonly segment: HTMLFieldSetElement;
    readonly radios: ReadonlyMap<ListFilter, HTMLInputElement>;
  } {
    const segment = element("fieldset", "sar-segment");
    segment.setAttribute("aria-labelledby", labelledBy);
    const name = `${prefix}${kind.id}-filter-value`;
    const radios = new Map<ListFilter, HTMLInputElement>();
    for (const value of LIST_FILTERS) {
      const input = element("input", "");
      input.type = "radio";
      input.name = name;
      input.id = `${name}-${value}`;
      input.value = value;
      input.setAttribute("data-sar-setting", "filter");
      input.setAttribute("data-sar-for", kind.id);
      radios.set(value, input);
      const text = element("label", "", i18n.t(FILTER_LABELS[value]));
      text.htmlFor = input.id;
      segment.append(input, text);
    }
    return { segment, radios };
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
    const { segment, radios } = filterSegment(kind, label.id);
    const help = element("span", "sar-field-help");
    const error = fieldError();
    errors.set(errorKey("filter", kind.id), error);
    row.append(label, segment, help, error);
    return { row, radios, help };
  }

  /** The values a kind tags: a labelled fieldset with a checkbox per value, in Steam's words. */
  function facetsField(kind: TagKind, facets: readonly FacetDefinition<FacetId>[]): {
    readonly row: HTMLElement;
    readonly boxes: ReadonlyMap<FacetId, HTMLInputElement>;
  } {
    const row = element("div", "sar-field");
    row.setAttribute("data-sar-layout", "stacked");
    const label = element("span", "sar-field-label", i18n.t("options_facets_label"));
    label.id = `${prefix}${kind.id}-facets`;
    const group = element("fieldset", "sar-checks");
    group.setAttribute("aria-labelledby", label.id);
    const boxes = new Map<FacetId, HTMLInputElement>();
    for (const facet of facets) {
      const input = element("input", "");
      input.type = "checkbox";
      input.value = facet.id;
      input.setAttribute("data-sar-setting", "facets");
      input.setAttribute("data-sar-for", kind.id);
      boxes.set(facet.id, input);
      const text = element("label", "");
      text.append(input, i18n.t(facet.word));
      group.append(text);
    }
    const error = fieldError();
    errors.set(errorKey("facets", kind.id), error);
    row.append(
      label,
      group,
      element("span", "sar-field-help", i18n.t("options_facets_help")),
      error,
    );
    return { row, boxes };
  }

  /** The full color help, once in General; every color field points at it. */
  const colorHelp = element("p", "sar-field-help", i18n.t("options_color_help"));
  colorHelp.id = `${prefix}color-help`;

  /**
   * A tag's color field: a swatch, a text box for the hex code, and Reset. The swatch and the
   * words are redundant on purpose, so the color is never the only cue. The row carries the kind,
   * so the swatch reads the kind's color through the same style rules as the badges.
   */
  function colorField(kind: TagKind): {
    readonly row: HTMLElement;
    readonly controls: ColorControls;
  } {
    const row = element("div", "sar-field sar-color");
    row.setAttribute("data-sar-layout", "stacked");
    row.setAttribute(KIND_ATTRIBUTE, kind.id);
    const label = element("label", "sar-field-label", i18n.t("options_color_label"));
    const input = element("input", "sar-input");
    input.type = "text";
    input.id = `${prefix}${kind.id}-color`;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = i18n.t("options_color_placeholder");
    input.setAttribute("data-sar-setting", "color");
    input.setAttribute("data-sar-for", kind.id);
    label.htmlFor = input.id;
    const swatch = element("span", "sar-color-swatch");
    swatch.setAttribute("aria-hidden", TRUE);
    const reset = quietButton(i18n.t("options_color_reset"));
    reset.setAttribute(COLOR_RESET_ATTRIBUTE, kind.id);
    reset.setAttribute(
      "aria-label",
      i18n.t("options_color_reset_label", { heading: i18n.t(kind.messages.heading) }),
    );
    const entry = element("div", "sar-color-entry");
    entry.append(swatch, input, reset);
    const help = element("span", "sar-field-help", i18n.t("options_color_help_short"));
    const invalid = element("p", "sar-field-error", i18n.t("options_color_invalid"));
    invalid.id = `${input.id}-invalid`;
    invalid.setAttribute("role", "alert");
    invalid.hidden = true;
    input.setAttribute("aria-describedby", [colorHelp.id, invalid.id].join(" "));
    const error = fieldError();
    errors.set(errorKey("color", kind.id), error);
    row.append(label, entry, help, invalid, error);
    return { row, controls: { input, reset, invalid } };
  }

  /** One tag's settings, titled with Steam's line for it: the master switch, then the rest. */
  function kindCard(kind: TagKind, state: HTMLElement): HTMLElement {
    const section = card(i18n.t(kind.messages.heading), kind.id, "h2");
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
    const color = deps.colors ? colorField(kind) : undefined;
    const facetList: readonly FacetDefinition<FacetId>[] = kind.facets ?? [];
    const facets = facetList.length === 0 ? undefined : facetsField(kind, facetList);
    const options = element("div", "sar-kind-options");
    if (facets !== undefined) {
      options.append(facets.row);
    }
    options.append(badge.row, banner.row);
    if (color !== undefined) {
      options.append(color.row);
    }
    options.append(filter.row);
    section.append(enabled.row, options);
    controls.set(kind.id, {
      options,
      state,
      switches: new Map([
        ["enabled", enabled.input],
        ["badge", badge.input],
        ["banner", banner.input],
      ]),
      radios: filter.radios,
      filterHelp: filter.help,
      facets: facets?.boxes ?? new Map(),
      color: color?.controls,
    });
    return section;
  }

  /** A tag's chip word, shown, and its full name for screen readers, which starts with it. */
  function kindName(kind: TagKind): readonly HTMLElement[] {
    const chip = i18n.t(kind.messages.chip);
    const label = element("span", "sar-tab-label", chip);
    label.setAttribute("aria-hidden", TRUE);
    return [label, element("span", "sar-vh", chipName(i18n, chip, i18n.t(kind.messages.heading)))];
  }

  /** A popup row: the tag's name, a link to its tab, then its list filter and master switch. */
  function kindRow(kind: TagKind): HTMLElement {
    const row = element("div", "sar-kind-row");
    const link = element("a", "sar-kind-link");
    link.id = `${prefix}${kind.id}-name`;
    link.href = `${deps.allSettingsUrl ?? ""}${tabHash(kind.id)}`;
    link.target = NEW_TAB;
    link.rel = NO_OPENER;
    link.setAttribute(OPEN_TAB_ATTRIBUTE, kind.id);
    link.append(...kindName(kind));
    const filterName = element("span", "sar-vh", i18n.t("options_filter_label"));
    filterName.id = `${prefix}${kind.id}-filter`;
    const { segment, radios } = filterSegment(kind, `${link.id} ${filterName.id}`);
    const enabled = element("input", "sar-toggle");
    enabled.type = "checkbox";
    enabled.setAttribute("role", "switch");
    enabled.setAttribute("aria-labelledby", link.id);
    enabled.setAttribute("data-sar-setting", "enabled");
    enabled.setAttribute("data-sar-for", kind.id);
    const error = fieldError();
    errors.set(errorKey("enabled", kind.id), error);
    errors.set(errorKey("filter", kind.id), error);
    row.append(link, filterName, segment, enabled, error);
    controls.set(kind.id, {
      options: segment,
      state: undefined,
      switches: new Map([["enabled", enabled]]),
      radios,
      filterHelp: undefined,
      facets: new Map(),
      color: undefined,
    });
    return row;
  }

  /** The card of what is ignored in a scope, drawn by `renderScope` from the lists. */
  function scopeCard(of: AllowScope, title: BareMessageKey): ScopeCard {
    const section = element("section", "sar-card");
    const heading = cardTitle(i18n.t(title), `allow-${of}`, "h3");
    const body = element("div", "");
    section.setAttribute("aria-labelledby", heading.id);
    section.append(heading, body);
    return { of, section, title: heading, body };
  }

  const loadError = element("p", "sar-field-error", i18n.t("error_settings_load"));
  loadError.setAttribute("role", "alert");
  loadError.hidden = true;

  // One tab per kind, labelled with its chip word and sorted by it; General first
  const tabIds = sortTabs(
    KINDS.map((kind) => ({ id: kind.id, label: i18n.t(kind.messages.chip) })),
    i18n.locale,
  );
  const tabs = deps.layout === "list"
    ? undefined
    : createTabs({ doc, ids: tabIds, idPrefix: prefix, label: i18n.t("options_tabs_label") });
  const scopes = new Map<AllowScope, ScopeCard>();
  const live = element("div", "sar-vh");
  live.setAttribute("aria-live", POLITE);
  // The popup's rows follow the tabs' order
  const rows = element("div", "sar-kind-rows");
  for (const id of tabs === undefined ? tabIds : []) {
    if (id !== GENERAL_TAB) {
      rows.append(kindRow(KIND_BY_ID[id]));
    }
  }
  const built = tabs === undefined ? undefined : tabbedBody(tabs);

  /** General, then a tab per kind with its settings and what is ignored for it. */
  function tabbedBody(tabs: Tabs<TabId>): {
    readonly frame: HTMLElement;
    readonly picker: HTMLSelectElement;
    readonly allIgnored: ScopeCard;
    readonly order: OrderCard;
  } {
    const general = tabs.panel(GENERAL_TAB);
    tabs.tab(GENERAL_TAB).textContent = i18n.t("options_tab_general");
    general.append(element("h2", "sar-panel-title", i18n.t("options_tab_general")));

    for (const kind of KINDS) {
      const state = element("span", "sar-tab-state");
      tabs.tab(kind.id).append(...kindName(kind), " ", state);
      const ignored = scopeCard(kind.id, "options_allow_kind_title");
      scopes.set(kind.id, ignored);
      tabs.panel(kind.id).append(kindCard(kind, state), ignored.section);
    }

    // General: language, color help, what is ignored for all tags, backup and privacy
    const languageCard = card(i18n.t("options_section_language"), "language");
    const languageField = element("div", "sar-field");
    languageField.setAttribute("data-sar-layout", "stacked");
    const languageLabel = element("label", "sar-field-label", i18n.t("options_language_label"));
    const picker = element("select", "sar-select");
    picker.id = `${prefix}locale`;
    picker.setAttribute("data-sar-setting", "locale");
    languageLabel.htmlFor = picker.id;
    const auto = element("option", "", i18n.t("options_language_auto"));
    auto.value = AUTO_LOCALE;
    picker.append(auto);
    for (const locale of deps.locales) {
      const option = element("option", "", autonym(locale));
      option.value = locale;
      option.lang = languageTag(locale);
      picker.append(option);
    }
    const languageError = fieldError();
    errors.set(errorKey("locale"), languageError);
    languageField.append(
      languageLabel,
      picker,
      element("span", "sar-field-help", i18n.t("options_language_help")),
      languageError,
    );
    languageCard.append(languageField);
    general.append(languageCard);

    if (deps.colors) {
      const colors = card(i18n.t("options_color_label"), "colors");
      colors.append(colorHelp);
      general.append(colors);
    }

    const allIgnored = scopeCard(ALLOW_ALL, "options_allow_all_title");
    scopes.set(ALLOW_ALL, allIgnored);
    general.append(allIgnored.section);

    const orderError = fieldError();
    errors.set(ORDER_ERROR, orderError);
    const order = createOrderCard(doc, {
      i18n,
      idPrefix: prefix,
      announce: (text) => {
        announce(doc, live, text);
      },
      save: (value, spoken) => {
        if (loadFailed) {
          sync();
        } else {
          void save({ order: value }, ORDER_ERROR, spoken);
        }
      },
      error: orderError,
    });
    general.append(order.section);

    if (deps.backup !== undefined) {
      general.append(
        createBackupCard(doc, {
          ...deps.backup,
          settings,
          lists,
          i18n,
          dates,
          idPrefix: prefix,
          announce: (text) => {
            announce(doc, live, text);
          },
          onRestored: refreshAllowList,
        }),
      );
    }

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
      general.append(privacy);
    }

    const frame = element("div", "sar-tabs");
    frame.append(tabs.list, ...tabIds.map((id) => tabs.panel(id)));
    return { frame, picker, allIgnored, order };
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

  const top: HTMLElement[] = deps.header === undefined ? [] : [header(deps.header)];
  tabs?.select((await firstTab) ?? GENERAL_TAB);
  root.classList.add("sar-options");
  root.setAttribute("data-sar-context", context);
  root.setAttribute("data-sar-view", deps.layout);
  // Above the tabs, where no tab can hide it
  root.replaceChildren(...top, loadError, built?.frame ?? rows, footer, live);

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

  /** Text the person is still fixing stays as typed; everything else shows what is stored. */
  function syncColor(id: KindId, own: ColorControls, color: HexColor | undefined): void {
    setColorOnce(root, id, color);
    own.reset.hidden = color === undefined;
    if (own.input.getAttribute("aria-invalid") !== TRUE) {
      own.input.value = color ?? "";
    }
  }

  function sync(): void {
    for (const [id, own] of controls) {
      const kind = current.kinds[id];
      for (const [field, input] of own.switches) {
        input.checked = kind[field];
      }
      for (const [value, input] of own.radios) {
        input.checked = value === kind.filter;
      }
      if (own.filterHelp !== undefined) {
        own.filterHelp.textContent = i18n.t(FILTER_HELP[kind.filter]);
      }
      for (const [facet, box] of own.facets) {
        box.checked = kind.facets?.includes(facet) ?? false;
      }
      if (own.color !== undefined) {
        syncColor(id, own.color, kind.color);
      }
      if (own.options instanceof HTMLFieldSetElement) {
        own.options.disabled = !kind.enabled;
      } else {
        own.options.hidden = !kind.enabled;
      }
      if (own.state !== undefined) {
        own.state.textContent = i18n.t(kind.enabled ? "options_state_on" : "options_state_off");
        own.state.toggleAttribute("data-sar-on", kind.enabled);
      }
    }
    if (built !== undefined) {
      built.picker.value = current.locale;
      built.order.sync(current.order);
    }
  }

  /** The patch for a control's value; an invalid value becomes the default. */
  function patchFor(
    field: Exclude<Field, "color">,
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
      case "facets": {
        const boxes = controls.get(kind.id)?.facets ?? new Map<FacetId, HTMLInputElement>();
        return forKind(kind.id, {
          facets: [...boxes].filter(([, box]) => box.checked).map(([facet]) => facet),
        });
      }
    }
  }

  /** Marks the color text as a color or not, with the words that say so. */
  function showColorValidity(own: ColorControls, valid: boolean): void {
    own.invalid.hidden = valid;
    own.input.setAttribute("aria-invalid", String(!valid));
  }

  /**
   * Live while typing: the error shows at once, and a color that reads shows on the swatch and
   * the badge at once (the root's custom property), unsaved. Saving waits for `change`.
   */
  function onColorInput(kind: TagKind, own: ColorControls): void {
    const typed = readTypedColor(own.input.value);
    showColorValidity(own, typed.valid);
    if (typed.valid) {
      setColorOnce(root, kind.id, typed.color);
    }
  }

  /** The text is committed (Enter or leaving the field): a valid color is saved, normalized. */
  function onColorChange(kind: TagKind, own: ColorControls): void {
    const typed = readTypedColor(own.input.value);
    showColorValidity(own, typed.valid);
    if (typed.valid) {
      void save(forKind(kind.id, { color: typed.color }), errorKey("color", kind.id));
    }
  }

  async function save(
    patch: SettingsPatch,
    key: string,
    spoken = i18n.t("notice_settings_saved"),
  ): Promise<void> {
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
    announce(doc, live, spoken);
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
    if (field.output === "color") {
      const own = kind === undefined ? undefined : controls.get(kind.id)?.color;
      if (kind !== undefined && own !== undefined) {
        onColorChange(kind, own);
      }
      return;
    }
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

  /** The spec of the developers or the publishers list. */
  function creatorSpec(role: CreatorRole): AllowSpec<CreatorKey> {
    const developer = role === "developer";
    const roleName = i18n.t(developer ? "banner_role_developer" : "banner_role_publisher");
    return {
      id: `allow-${role}s`,
      list: lists.creators[role],
      parseKey: toCreatorKey,
      title: developer ? "options_section_allow_developers" : "options_section_allow_publishers",
      saveError: "error_creator_list_save",
      loadError: "error_creator_list_load",
      nameOf: (_key, entry) => element("span", "sar-allow-name", entry.name),
      restored: (name, of) =>
        of === ALLOW_ALL
          ? i18n.t("notice_creator_restored", { name, role: roleName })
          : i18n.t("notice_creator_restored_kind", {
            name,
            role: roleName,
            heading: scopeName(of),
          }),
    };
  }

  // Games, developers and publishers you ignored: each list read once, drawn in every scope
  const allowContext = { doc, i18n, dates, prefix, scopeName };
  const gameSpec: AllowSpec<AppId> = {
    id: "allow",
    list: lists.games,
    parseKey: parseGameKey,
    title: "options_section_allow",
    saveError: "error_allow_list_save",
    loadError: "error_allow_list_load",
    nameOf: (key, entry) => {
      const name = element("a", "sar-allow-name", entry.name);
      name.href = `${STORE_APP_URL}${String(key)}/`;
      return name;
    },
    restored: (_name, of) =>
      of === ALLOW_ALL
        ? i18n.t("notice_marking_restored")
        : i18n.t("notice_marking_restored_kind", { heading: scopeName(of) }),
  };
  const sources: readonly AllowSource[] = [
    createAllowSource(gameSpec, allowContext),
    ...CREATOR_ROLES.map((role) => createAllowSource(creatorSpec(role), allowContext)),
  ];

  /** One list in a scope: its items, or that it could not be read; nothing when it is empty. */
  function listBlock(source: AllowSource, of: AllowScope): HTMLElement | undefined {
    const caption = i18n.t(source.title);
    if (!source.failed()) {
      return source.group(of, caption, "h4");
    }
    const block = element("div", "sar-allow-group");
    block.append(element("h4", "sar-allow-scope", caption), source.loadError());
    return block;
  }

  /** The note in a tag's card on what all tags ignore, with the way to it in General. */
  function allNote(): HTMLElement | undefined {
    const count = sources.reduce((sum, source) => sum + source.count(ALLOW_ALL), 0);
    if (count === 0) {
      return undefined;
    }
    const note = element("p", "sar-allow-note", i18n.plural("options_allow_all_note", count));
    // A button, not a hash link: in the userscript dialog a hash would change the store's URL
    const show = quietButton(i18n.t("options_allow_all_show"));
    show.setAttribute("data-sar-tab", GENERAL_TAB);
    note.append(" ", show);
    return note;
  }

  /** Draws a scope's card from the last reads: each list that holds items, or the empty state. */
  function renderScope({ of, body }: ScopeCard): void {
    const blocks = sources.flatMap((source) => listBlock(source, of) ?? []);
    const action = of === ALLOW_ALL ? "banner_ignore" : "banner_ignore_kind";
    const shown: HTMLElement[] = blocks.length === 0
      ? [element("p", "sar-empty", i18n.t("options_allow_empty", { action: i18n.t(action) }))]
      : blocks;
    const note = of === ALLOW_ALL ? undefined : allNote();
    body.replaceChildren(...shown, ...(note === undefined ? [] : [note]));
  }

  function renderScopes(): void {
    scopes.forEach(renderScope);
  }

  /** Reads each list once, then draws every scope from what was read. */
  async function refreshAllowList(): Promise<void> {
    if (scopes.size === 0) {
      return;
    }
    await Promise.all(sources.map((source) => source.refresh()));
    renderScopes();
  }

  /** The button that stops ignoring an item, once the card is drawn again. */
  function stopButton(body: HTMLElement, list: string | null, key: string | null) {
    return [...body.querySelectorAll<HTMLElement>(`[${RESTORE_ATTRIBUTE}]`)].find((button) =>
      button.getAttribute(LIST_ATTRIBUTE) === list && button.getAttribute(RESTORE_ATTRIBUTE) === key
    );
  }

  /** Stops ignoring an item; focus moves to the next item in the card, else to its title. */
  async function restore(button: HTMLElement): Promise<void> {
    const source = sources.find((each) => each.id === button.getAttribute(LIST_ATTRIBUTE));
    const of = button.getAttribute(SCOPE_ATTRIBUTE);
    const owner = [...scopes.values()].find((each) => each.of === of);
    if (source === undefined || owner === undefined) {
      return;
    }
    const buttons = [...owner.body.querySelectorAll<HTMLElement>(`[${RESTORE_ATTRIBUTE}]`)];
    const at = buttons.indexOf(button);
    const neighbor = buttons[at + 1] ?? buttons[at - 1];
    const spoken = await source.restore(button);
    if (spoken === undefined) {
      return;
    }
    await source.refresh();
    renderScopes();
    const next = neighbor === undefined ? undefined : stopButton(
      owner.body,
      neighbor.getAttribute(LIST_ATTRIBUTE),
      neighbor.getAttribute(RESTORE_ATTRIBUTE),
    );
    (next ?? owner.title).focus();
    announce(doc, live, spoken);
  }

  function onInput(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement) || loadFailed) {
      return;
    }
    const id = v.safeParse(KindIdSchema, target.getAttribute("data-sar-for"));
    const field = v.safeParse(FieldSchema, target.getAttribute("data-sar-setting"));
    const own = id.success ? controls.get(id.output)?.color : undefined;
    if (id.success && field.success && field.output === "color" && own !== undefined) {
      onColorInput(KIND_BY_ID[id.output], own);
    }
  }

  /** The Reset button of a color field: clears the color, whatever the text says. */
  function resetColor(button: HTMLElement): void {
    const id = v.safeParse(KindIdSchema, button.getAttribute(COLOR_RESET_ATTRIBUTE));
    const own = id.success ? controls.get(id.output)?.color : undefined;
    if (!id.success || own === undefined || loadFailed) {
      return;
    }
    showColorValidity(own, true);
    void save(forKind(id.output, { color: undefined }), errorKey("color", id.output)).then(() => {
      own.input.focus();
    });
  }

  async function remember(id: TabId): Promise<void> {
    try {
      await deps.uiState.setTab(id);
    } catch {
      // The tab stays on screen; only the memory of it is lost.
    }
  }

  /** Shows a tab after the first: remembered, and told to the page. */
  function show(id: TabId): void {
    if (tabs?.select(id) === true) {
      void remember(id);
      deps.onTabChange?.(id);
    }
  }

  function onClick(event: Event | undefined, target: EventTarget | null): void {
    if (!(target instanceof Element)) {
      return;
    }
    const tab = tabs?.idOf(target);
    if (tab !== undefined) {
      show(tab);
      // Show in General leads to the list it counts
      if (target.closest(`[role=${TAB_ROLE}]`) === null) {
        built?.allIgnored.title.focus();
      }
      return;
    }
    const open = toTabId(
      target.closest(`[${OPEN_TAB_ATTRIBUTE}]`)?.getAttribute(OPEN_TAB_ATTRIBUTE),
    );
    if (open !== undefined && event !== undefined && deps.openTab !== undefined) {
      event.preventDefault();
      deps.openTab(open);
      return;
    }
    const reset = target.closest<HTMLElement>(`[${COLOR_RESET_ATTRIBUTE}]`);
    if (reset !== null) {
      resetColor(reset);
      return;
    }
    const button = target.closest<HTMLElement>(`[${RESTORE_ATTRIBUTE}]`);
    if (button !== null) {
      void restore(button);
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    const next = tabs?.target(event);
    if (next !== undefined) {
      event.preventDefault();
      show(next);
      tabs?.tab(next).focus();
    }
  }

  function onEvent(event: Event): void {
    built?.order.handle(event);
    switch (event.type) {
      case "change":
        onChange(event.target);
        break;
      case "input":
        onInput(event.target);
        break;
      case "keydown":
        if (event instanceof KeyboardEvent) {
          onKeydown(event);
        }
        break;
      case "pointerdown":
        break;
      default:
        onClick(event, event.target);
    }
  }

  const events = ["change", "input", "click", "keydown", "pointerdown"] as const;
  sync();
  await refreshAllowList();
  for (const type of events) {
    root.addEventListener(type, onEvent);
  }
  const unsubscribe = settings.subscribe((value) => {
    current = parseSettings(value);
    loadFailed = false;
    loadError.hidden = true;
    allowChanges(true);
    sync();
  });

  return {
    refreshAllowList,
    selectTab: show,
    destroy() {
      built?.order.stop();
      unsubscribe();
      for (const type of events) {
        root.removeEventListener(type, onEvent);
      }
      root.replaceChildren();
    },
  };
}
