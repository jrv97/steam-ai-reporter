import * as v from "valibot";
import type { BareMessageKey } from "../i18n/t";
import { type HexColor, readTypedColor } from "../kinds/color";
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
import { KIND_ATTRIBUTE, setColorOnce } from "./kind-attributes";
import {
  isSectionOpen,
  SECTION_DEFAULT_OPEN,
  SECTION_IDS,
  type SectionId,
  type SectionState,
  type SectionStates,
} from "./section-state";
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
  /** Which tag sections are open, kept across visits. */
  readonly sectionState: SectionState;
  readonly context: SettingsContext;
  /**
   * Whether each tag gets a color field. The full page and the userscript dialog show it; the
   * toolbar popup does not. It is a capability, not a context, so the layout stays the same.
   */
  readonly colors: boolean;
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
const FIELDS = ["enabled", "badge", "banner", "filter", "color", "locale"] as const;
type Field = (typeof FIELDS)[number];
const FieldSchema = v.picklist(FIELDS);
const KindIdSchema = v.picklist(KIND_IDS);
const SectionIdSchema = v.picklist(SECTION_IDS);

/** Names the collapsible section a `details` element holds. */
const SECTION_ATTRIBUTE = "data-sar-section";

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

/** The controls of one kind's color field. */
interface ColorControls {
  readonly input: HTMLInputElement;
  /** Shown only while a color is set. */
  readonly reset: HTMLButtonElement;
  /** Names the text as no hex color; shown while the text is invalid. */
  readonly invalid: HTMLElement;
}

/** The controls of one kind's section, which `sync` sets from the stored settings. */
interface KindControls {
  /** The switches below the master switch; hidden while the kind is off. */
  readonly options: HTMLElement;
  /** The on or off cue in the section's summary, which stays in view while it is closed. */
  readonly state: HTMLElement;
  readonly switches: Readonly<Record<SwitchField, HTMLInputElement>>;
  readonly radios: ReadonlyMap<ListFilter, HTMLInputElement>;
  readonly filterHelp: HTMLElement;
  /** Absent where the form has no color fields. */
  readonly color: ColorControls | undefined;
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

  /** The title of a card; focus lands on it after a restore, so it takes focus but is no stop. */
  function cardTitle(title: string, id: string): HTMLElement {
    const heading = element("h2", "sar-card-title", title);
    heading.id = prefix + id;
    heading.tabIndex = -1;
    return heading;
  }

  function card(title: string, id: string): HTMLElement {
    const section = element("section", "sar-card");
    const heading = cardTitle(title, id);
    section.setAttribute("aria-labelledby", heading.id);
    section.append(heading);
    return section;
  }

  const sections = new Map<SectionId, HTMLDetailsElement>();
  /** The state each section is known to be in, so a toggle that changes nothing writes nothing. */
  const shown = new Map<SectionId, boolean>();

  /**
   * A card the user can close: a native `details` whose `summary` holds the title and the cue.
   * The browser gives it the disclosure role, the keyboard and the expanded state. The body goes
   * into the returned `details`; it starts open until the stored state says otherwise.
   */
  function collapsibleCard(
    title: string,
    id: SectionId,
    cue: HTMLElement,
  ): { readonly section: HTMLElement; readonly body: HTMLDetailsElement; } {
    const section = element("section", "sar-card");
    const heading = cardTitle(title, id);
    section.setAttribute("aria-labelledby", heading.id);
    const body = element("details", "sar-card-details");
    body.open = SECTION_DEFAULT_OPEN;
    body.setAttribute(SECTION_ATTRIBUTE, id);
    const summary = element("summary", "sar-card-summary");
    summary.append(heading, cue);
    body.append(summary);
    section.append(body);
    sections.set(id, body);
    shown.set(id, SECTION_DEFAULT_OPEN);
    return { section, body };
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
    swatch.setAttribute("aria-hidden", String(true));
    const reset = element("button", "sar-button", i18n.t("options_color_reset"));
    reset.type = "button";
    reset.setAttribute(COLOR_RESET_ATTRIBUTE, kind.id);
    reset.setAttribute(
      "aria-label",
      i18n.t("options_color_reset_label", { heading: i18n.t(kind.messages.heading) }),
    );
    const entry = element("div", "sar-color-entry");
    entry.append(swatch, input, reset);
    const help = element("span", "sar-field-help", i18n.t("options_color_help"));
    help.id = `${input.id}-help`;
    const invalid = element("p", "sar-field-error", i18n.t("options_color_invalid"));
    invalid.id = `${input.id}-invalid`;
    invalid.setAttribute("role", "alert");
    invalid.hidden = true;
    input.setAttribute("aria-describedby", [help.id, invalid.id].join(" "));
    const error = fieldError();
    errors.set(errorKey("color", kind.id), error);
    row.append(label, entry, help, invalid, error);
    return { row, controls: { input, reset, invalid } };
  }

  /** One tag's section, titled with Steam's line for it: the master switch, then the rest. */
  function kindCard(kind: TagKind): HTMLElement {
    const state = element("span", "sar-card-state");
    const { section, body } = collapsibleCard(i18n.t(kind.messages.heading), kind.id, state);
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
    const options = element("div", "sar-kind-options");
    options.append(badge.row, banner.row);
    if (color !== undefined) {
      options.append(color.row);
    }
    options.append(filter.row);
    body.append(enabled.row, options);
    controls.set(kind.id, {
      options,
      state,
      switches: { enabled: enabled.input, badge: badge.input, banner: banner.input },
      radios: filter.radios,
      filterHelp: filter.help,
      color: color?.controls,
    });
    return section;
  }

  const loadError = element("p", "sar-field-error", i18n.t("error_settings_load"));
  loadError.setAttribute("role", "alert");
  loadError.hidden = true;
  const kindCards = KINDS.map(kindCard);

  // Above the cards, so a closed section cannot hide it
  const cards: HTMLElement[] = deps.header === undefined
    ? [loadError, ...kindCards]
    : [header(deps.header), loadError, ...kindCards];

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

  /** The stored section states; a store that cannot be read leaves every section open. */
  async function readSections(): Promise<SectionStates> {
    try {
      return await deps.sectionState.read();
    } catch {
      return new Map();
    }
  }
  const storedSections = readSections();

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
    if (own.input.getAttribute("aria-invalid") !== "true") {
      own.input.value = color ?? "";
    }
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
      if (own.color !== undefined) {
        syncColor(id, own.color, kind.color);
      }
      own.options.hidden = !kind.enabled;
      own.state.textContent = i18n.t(kind.enabled ? "options_state_on" : "options_state_off");
      own.state.toggleAttribute("data-sar-on", kind.enabled);
    }
    if (picker !== undefined) {
      picker.value = current.locale;
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

  function onClick(target: EventTarget | null): void {
    const reset = target instanceof Element
      ? target.closest<HTMLElement>(`[${COLOR_RESET_ATTRIBUTE}]`)
      : null;
    if (reset !== null) {
      resetColor(reset);
      return;
    }
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

  /** Opens or closes the sections as stored. `shown` moves first, so the toggles it fires pass. */
  function applySections(states: SectionStates): void {
    for (const [id, details] of sections) {
      const open = isSectionOpen(states, id);
      shown.set(id, open);
      details.open = open;
    }
  }

  async function remember(id: SectionId, open: boolean): Promise<void> {
    try {
      await deps.sectionState.setOpen(id, open);
    } catch {
      // The section keeps the state on screen; only the memory of it is lost.
    }
  }

  function onToggle(target: EventTarget | null): void {
    if (!(target instanceof HTMLDetailsElement)) {
      return;
    }
    const id = v.safeParse(SectionIdSchema, target.getAttribute(SECTION_ATTRIBUTE));
    if (id.success && shown.get(id.output) !== target.open) {
      shown.set(id.output, target.open);
      void remember(id.output, target.open);
    }
  }

  function onEvent(event: Event): void {
    switch (event.type) {
      case "change":
        onChange(event.target);
        break;
      case "input":
        onInput(event.target);
        break;
      case "toggle":
        onToggle(event.target);
        break;
      default:
        onClick(event.target);
    }
  }

  sync();
  await refreshAllowList();
  applySections(await storedSections);
  root.addEventListener("change", onEvent);
  root.addEventListener("input", onEvent);
  root.addEventListener("click", onEvent);
  // A toggle does not bubble, so the one listener for it takes the capture phase
  root.addEventListener("toggle", onEvent, true);
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
      root.removeEventListener("input", onEvent);
      root.removeEventListener("click", onEvent);
      root.removeEventListener("toggle", onEvent, true);
      root.replaceChildren();
    },
  };
}
