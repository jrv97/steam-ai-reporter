import * as v from "valibot";
import type { BareMessageKey } from "../i18n/t";
import {
  CHIP_TEXT_FIELDS,
  CHIP_TEXT_LIMITS,
  type ChipText,
  type ChipTextField,
  toChipText,
} from "../kinds/chip-text";
import { KIND_IDS, type KindId } from "../kinds/id";
import type { FacetDefinition, FacetId, TagKind } from "../kinds/kind";
import type { KindSettings } from "../kinds/kind-settings";
import type { MessageCatalog } from "../ports";
import type { SettingsPatch } from "../settings/settings";
import { createChipElement } from "./badge";
import { createElement } from "./element";
import { chipText } from "./kind-details";

/** What the chip text fields need from the form around them. */
export interface ChipFieldsDeps {
  readonly doc: Document;
  readonly i18n: MessageCatalog;
  /** Starts every id, so two forms on one page never share one. */
  readonly idPrefix: string;
  /** The error line of a field, which the form shows when a save of it fails. */
  readonly error: (field: ChipTextField, id: KindId) => HTMLElement;
  /** Stores a patch; the form syncs the fields once it is stored or has failed. */
  readonly save: (patch: SettingsPatch, field: ChipTextField, id: KindId) => Promise<void>;
  /** Quiet buttons, in the form's own look. */
  readonly quietButton: (text: string) => HTMLButtonElement;
}

export interface ChipFields {
  /** A tag's two fields and the live preview of its chips, for its card. */
  rows(kind: TagKind): readonly HTMLElement[];
  /** Shows the stored texts, where the person is not still typing, and draws the previews. */
  sync(kinds: Readonly<Record<KindId, KindSettings>>): void;
  /** Serves an `input`, `change` or `click` the form's root heard; true when it was one of ours. */
  handle(event: Event): boolean;
}

/** The setting a text box changes and the kind it is for, as the form's controls name them. */
const SETTING_ATTRIBUTE = "data-sar-setting";
const FOR_ATTRIBUTE = "data-sar-for";
/** What marks the Reset button of a chip text field, with the field it clears. */
const RESET_ATTRIBUTE = "data-sar-chip-reset";
/** The compact tier the short text names (`compactSize` in badge.ts). */
const TEXT_TIER = "text";

const FieldSchema = v.picklist(CHIP_TEXT_FIELDS);
const KindIdSchema = v.picklist(KIND_IDS);

/** Each field's label and help. */
const KEYS: Readonly<Record<ChipTextField, { label: BareMessageKey; help: BareMessageKey; }>> = {
  chip: { label: "options_chip_label", help: "options_chip_help" },
  chipCompact: { label: "options_chip_compact_label", help: "options_chip_compact_help" },
};

interface Field {
  readonly input: HTMLInputElement;
  readonly count: HTMLElement;
  /** Shown only while the field holds stored text. */
  readonly reset: HTMLButtonElement;
}

interface KindFields {
  readonly kind: TagKind;
  readonly fields: Readonly<Record<ChipTextField, Field>>;
  readonly preview: HTMLElement;
}

/** The patch that sets, or clears with `undefined`, one chip text of one kind. */
function chipPatch(id: KindId, field: ChipTextField, text: ChipText | undefined): SettingsPatch {
  return { kinds: { [id]: field === "chip" ? { chip: text } : { chipCompact: text } } };
}

/**
 * The chip text fields of each tag's card: a text box per field with a counter and Reset, and a
 * preview that draws the tag's badge and its small image chip with the store page's own chip
 * renderer, in the tag's color, as the person types. Text is saved on `change`, cleaned by the
 * same schema that reads it back; an empty field clears it. The form's one listener per event
 * type hands the events over (`handle`).
 */
export function createChipFields(deps: ChipFieldsDeps): ChipFields {
  const { doc, i18n, idPrefix } = deps;
  const byKind = new Map<KindId, KindFields>();
  /** The stored text each box last showed, so a sync leaves text still being typed alone. */
  const shown = new WeakMap<HTMLInputElement, string>();
  let kinds: Readonly<Record<KindId, KindSettings>> | undefined;

  function field(kind: TagKind, name: ChipTextField): { row: HTMLElement; field: Field; } {
    const keys = KEYS[name];
    const row = createElement(doc, "div", "sar-field");
    row.setAttribute("data-sar-layout", "stacked");
    const input = createElement(doc, "input", "sar-input");
    input.type = "text";
    input.id = `${idPrefix}${kind.id}-${name}`;
    input.maxLength = CHIP_TEXT_LIMITS[name];
    input.autocomplete = "off";
    input.setAttribute(SETTING_ATTRIBUTE, name);
    input.setAttribute(FOR_ATTRIBUTE, kind.id);
    const label = createElement(doc, "label", "sar-field-label", i18n.t(keys.label));
    label.htmlFor = input.id;
    const reset = deps.quietButton(i18n.t("options_color_reset"));
    reset.setAttribute(RESET_ATTRIBUTE, name);
    reset.setAttribute(FOR_ATTRIBUTE, kind.id);
    const heading = i18n.t(kind.messages.heading);
    reset.setAttribute(
      "aria-label",
      name === "chip"
        ? i18n.t("options_chip_reset_label", { heading })
        : i18n.t("options_chip_compact_reset_label", { heading }),
    );
    const entry = createElement(doc, "div", "sar-text-entry");
    entry.append(input, reset);
    const count = createElement(doc, "span", "sar-field-count");
    count.id = `${input.id}-count`;
    const help = createElement(doc, "span", "sar-field-help", i18n.t(keys.help));
    help.id = `${input.id}-help`;
    input.setAttribute("aria-describedby", [help.id, count.id].join(" "));
    row.append(label, entry, count, help, deps.error(name, kind.id));
    return { row, field: { input, count, reset } };
  }

  function preview(kind: TagKind): { row: HTMLElement; box: HTMLElement; } {
    const row = createElement(doc, "div", "sar-field");
    row.setAttribute("data-sar-layout", "stacked");
    const label = createElement(doc, "span", "sar-field-label", i18n.t("options_chip_preview"));
    label.id = `${idPrefix}${kind.id}-preview`;
    const box = createElement(doc, "div", "sar-chip-preview");
    box.setAttribute("role", "group");
    box.setAttribute("aria-labelledby", label.id);
    row.append(label, box);
    return { row, box };
  }

  /** The value whose chip the preview shows: the first one picked, else the kind's first. */
  function previewFacet(kind: TagKind): FacetDefinition<FacetId> | undefined {
    const facets: readonly FacetDefinition<FacetId>[] = kind.facets ?? [];
    const picked = kinds?.[kind.id].facets ?? [];
    return facets.find((facet) => picked.includes(facet.id)) ?? facets[0];
  }

  /** Counters, placeholders and the preview, from the text as typed. */
  function draw({ kind, fields, preview: box }: KindFields): void {
    const facet = previewFacet(kind);
    const chip = toChipText("chip", fields.chip.input.value);
    const compact = toChipText("chipCompact", fields.chipCompact.input.value) ?? chip;
    const word = i18n.t(facet?.chip ?? kind.messages.chip);
    fields.chip.input.placeholder = word;
    fields.chipCompact.input.placeholder = chip ?? word;
    for (const name of CHIP_TEXT_FIELDS) {
      const { input, count } = fields[name];
      // The count of what the box holds, in the units its maxlength counts
      count.textContent = i18n.t("options_chip_count", {
        count: String(input.value.length),
        max: String(input.maxLength),
      });
    }
    const full = createChipElement(
      doc,
      chipText(i18n, kind, facet, chip),
      "sar-badge",
      "sar-badge-label",
      kind.id,
    );
    const small = createChipElement(
      doc,
      chipText(i18n, kind, facet, compact),
      "sar-compact",
      "sar-compact-label",
      kind.id,
    );
    small.setAttribute("data-sar-size", TEXT_TIER);
    box.replaceChildren(full, small);
  }

  function save(own: KindFields, name: ChipTextField, text: ChipText | undefined): Promise<void> {
    return deps.save(chipPatch(own.kind.id, name, text), name, own.kind.id);
  }

  /** The text is committed (Enter or leaving the box): saved cleaned, or cleared when empty. */
  function commit(own: KindFields, name: ChipTextField): void {
    const { input } = own.fields[name];
    const text = toChipText(name, input.value);
    input.value = text ?? "";
    draw(own);
    void save(own, name, text);
  }

  function reset(own: KindFields, name: ChipTextField): void {
    const { input } = own.fields[name];
    input.value = "";
    draw(own);
    void save(own, name, undefined).then(() => {
      input.focus();
    });
  }

  /** The field and the kind's fields a control names, or undefined for any other control. */
  function owner(node: Element, attribute: string) {
    const name = v.safeParse(FieldSchema, node.getAttribute(attribute));
    const id = v.safeParse(KindIdSchema, node.getAttribute(FOR_ATTRIBUTE));
    const own = id.success ? byKind.get(id.output) : undefined;
    return name.success && own !== undefined ? { own, name: name.output } : undefined;
  }

  return {
    rows(kind) {
      const chip = field(kind, "chip");
      const compact = field(kind, "chipCompact");
      const shownPreview = preview(kind);
      const own: KindFields = {
        kind,
        fields: { chip: chip.field, chipCompact: compact.field },
        preview: shownPreview.box,
      };
      byKind.set(kind.id, own);
      draw(own);
      return [chip.row, compact.row, shownPreview.row];
    },

    sync(next) {
      kinds = next;
      for (const own of byKind.values()) {
        for (const name of CHIP_TEXT_FIELDS) {
          const { input, reset: button } = own.fields[name];
          const stored = next[own.kind.id][name] ?? "";
          if (shown.get(input) !== stored) {
            input.value = stored;
            shown.set(input, stored);
          }
          button.hidden = stored === "";
        }
        draw(own);
      }
    },

    handle(event) {
      const node = event.target;
      if (!(node instanceof Element)) {
        return false;
      }
      if (event.type === "click") {
        const button = node.closest(`[${RESET_ATTRIBUTE}]`);
        const found = button === null ? undefined : owner(button, RESET_ATTRIBUTE);
        if (found !== undefined) {
          reset(found.own, found.name);
        }
        return found !== undefined;
      }
      const found = node instanceof HTMLInputElement ? owner(node, SETTING_ATTRIBUTE) : undefined;
      if (found === undefined || (event.type !== "input" && event.type !== "change")) {
        return false;
      }
      if (event.type === "input") {
        draw(found.own);
      } else {
        commit(found.own, found.name);
      }
      return true;
    },
  };
}
