import { facetOf } from "../kinds/facets";
import type { KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import type { ChipWords } from "../kinds/kind-settings";
import { registryOrder } from "../kinds/order";
import { KIND_BY_ID } from "../kinds/registry";
import { type AnyDisclosed, sameVerdicts } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import type { BadgeSlot, CompactSize, HostRenderer } from "./host";
import type { CardTriggers } from "./hover-card";
import { KIND_ATTRIBUTE } from "./kind-attributes";
import { type ChipText, chipText } from "./kind-details";

/** Compact badge tiers by image box (components.mdx, section 2). Smaller images get none. */
const TEXT_MIN_WIDTH = 180;
const TEXT_MIN_HEIGHT = 32;
const LARGE_MIN_WIDTH = 400;
const LARGE_MIN_HEIGHT = 150;

/** The compact badge tier for an image box, or undefined when the image is too small for one. */
export function compactSize(width: number, height: number): CompactSize | undefined {
  if (width < TEXT_MIN_WIDTH || height < TEXT_MIN_HEIGHT) {
    return undefined;
  }
  return width >= LARGE_MIN_WIDTH && height >= LARGE_MIN_HEIGHT ? "large" : "text";
}

/** An ARIA or data token, not copy. */
const TRUE = "true";

/** The person's text for a kind's chips; small images (`compact`) take the short one first. */
export function ownText(
  words: ChipWords | undefined,
  id: KindId,
  compact?: boolean,
): string | undefined {
  const own = words?.[id];
  return compact === true ? own?.chipCompact ?? own?.chip : own?.chip;
}

/** A verdict's chip, in the person's words for the kind when there are some. */
function verdictText(
  i18n: MessageCatalog,
  verdict: AnyDisclosed,
  words: ChipWords | undefined,
  compact?: boolean,
): ChipText {
  const own = ownText(words, verdict.kind, compact);
  return chipText(i18n, KIND_BY_ID[verdict.kind], facetOf(verdict), own);
}

/** The "+N" chip's text, for the N kinds that did not fit. */
function moreText(i18n: MessageCatalog, count: number): ChipText {
  const label = i18n.t("kind_chip_more", { count: String(count) });
  const name = i18n.t("kind_chip_name", { chip: label, heading: i18n.t("kind_chip_more_name") });
  return { label, name };
}

/**
 * A chip: the short text, which screen readers skip, and the accessible name read instead. The
 * name starts with the visible text and goes on with Steam's full line. A kind's chip carries the
 * kind, so the style rules can switch its badges off.
 */
export function createChipElement(
  doc: Document,
  text: ChipText,
  className: string,
  labelClass: string,
  kind?: KindId,
): HTMLElement {
  const chip = doc.createElement("span");
  chip.className = className;
  if (kind !== undefined) {
    chip.setAttribute(KIND_ATTRIBUTE, kind);
  }
  const label = doc.createElement("span");
  label.className = labelClass;
  label.setAttribute("aria-hidden", TRUE);
  label.textContent = text.label;
  const name = doc.createElement("span");
  name.className = "sar-vh";
  name.textContent = text.name;
  chip.append(label, name);
  return chip;
}

/** The full badge's chip, the store's tag-chip shape in our hue. The tag section reuses it. */
export function createChip(
  doc: Document,
  i18n: MessageCatalog,
  verdict: AnyDisclosed,
  words?: ChipWords,
): HTMLElement {
  return createChipElement(
    doc,
    verdictText(i18n, verdict, words),
    "sar-badge",
    "sar-badge-label",
    verdict.kind,
  );
}

/** The `span.sar-chips` that holds chips of one size, so a row or a section places them as one. */
export function createChipGroup(doc: Document, size: BadgeSlot["kind"]): HTMLElement {
  const group = doc.createElement("span");
  group.className = "sar-chips";
  group.setAttribute("data-sar-chips", size);
  return group;
}

interface Drawn {
  /** The `span.sar-chips` that holds this host's chips. */
  readonly group: HTMLElement;
  /** The disclosed verdicts the chips stand for, in chip order. */
  readonly present: readonly AnyDisclosed[];
  readonly slot: BadgeSlot;
  readonly maxChips: number;
  /** The person's chip text the chips were drawn with. */
  readonly words: ChipWords | undefined;
}

function sameSlot(a: BadgeSlot, b: BadgeSlot): boolean {
  return a.anchor === b.anchor && a.position === b.position
    && (a.kind === "full" ? b.kind === "full" : b.kind === "compact" && a.size === b.size);
}

/**
 * Whether the lists draw the same chips: the same kinds and values in the same order, which makes
 * a new tag order a change.
 */
function sameChips(a: readonly AnyDisclosed[], b: readonly AnyDisclosed[]): boolean {
  return a.length === b.length && a.every((verdict, index) => {
    const other = b[index];
    return other?.kind === verdict.kind && facetOf(other) === facetOf(verdict);
  });
}

/**
 * Draws a host's chips in the slot its placement chose: one text chip for each kind that is
 * disclosed, not ignored and shown by its settings, in the person's tag order (`order`). A
 * placement shows the first `maxChips` of them; a "+N" chip stands for the rest. Each chip shows
 * the person's text when there is one (`words`, a new object only when a text changed). Every chip
 * registers with the hover card, which lists all the kinds. A host with no such kind loses its
 * chips. The chips of a host sit in one group, so a refresh removes and places them as one.
 */
export function createBadgeRenderer(
  doc: Document,
  i18n: MessageCatalog,
  card: CardTriggers,
  order: () => readonly TagKind[] = registryOrder,
  words?: () => ChipWords,
): HostRenderer {
  const drawn = new WeakMap<Element, Drawn>();

  function chipFor(slot: BadgeSlot, text: ChipText, kind?: KindId): HTMLElement {
    if (slot.kind === "full") {
      return createChipElement(doc, text, "sar-badge", "sar-badge-label", kind);
    }
    const chip = createChipElement(doc, text, "sar-compact", "sar-compact-label", kind);
    chip.setAttribute("data-sar-size", slot.size);
    return chip;
  }

  function build(
    slot: BadgeSlot,
    present: readonly AnyDisclosed[],
    maxChips: number,
    texts: ChipWords | undefined,
  ): HTMLElement {
    const group = createChipGroup(doc, slot.kind);
    const compact = slot.kind === "compact" && slot.size === "text";
    for (const verdict of present.slice(0, maxChips)) {
      group.append(chipFor(slot, verdictText(i18n, verdict, texts, compact), verdict.kind));
    }
    if (present.length > maxChips) {
      group.append(chipFor(slot, moreText(i18n, present.length - maxChips)));
    }
    return group;
  }

  /** Compact chips inside the capsule's own link take the pointer and open the card. */
  function linkCompact(group: HTMLElement, host: Element): void {
    const link = group.parentElement?.closest("a");
    if (link !== null && link !== undefined && (host.contains(link) || link.contains(host))) {
      for (const chip of group.children) {
        chip.setAttribute("data-sar-in-link", TRUE);
      }
    }
  }

  function bind(group: HTMLElement, present: readonly AnyDisclosed[]): void {
    for (const chip of group.children) {
      card.bind(chip, present);
    }
  }

  return {
    render({ host, verdicts, allowed, badged, slot, maxChips }) {
      let present: AnyDisclosed[] | undefined;
      for (const kind of order()) {
        const verdict = verdicts[kind.id];
        if (verdict.state === "disclosed" && !allowed[kind.id] && badged[kind.id]) {
          (present ??= []).push(verdict);
        }
      }
      const current = drawn.get(host);
      const texts = words?.();
      if (present === undefined || slot === undefined) {
        current?.group.remove();
        drawn.delete(host);
        return;
      }
      if (
        current !== undefined && current.group.isConnected && sameSlot(current.slot, slot)
        && current.maxChips === maxChips && current.words === texts
        && sameChips(current.present, present)
      ) {
        if (!sameVerdicts(current.present, present)) {
          bind(current.group, present);
          drawn.set(host, { ...current, present });
        }
        return;
      }
      current?.group.remove();
      const group = build(slot, present, maxChips, texts);
      slot.anchor.insertAdjacentElement(slot.position, group);
      if (slot.kind === "compact") {
        linkCompact(group, host);
      }
      bind(group, present);
      drawn.set(host, { group, present, slot, maxChips, words: texts });
    },
  };
}
