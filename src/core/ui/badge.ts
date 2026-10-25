import type { KindId } from "../kinds/id";
import type { TagKind } from "../kinds/kind";
import { KINDS, perKind } from "../kinds/registry";
import { type AnyDisclosed, sameVerdicts } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import type { BadgeSlot, CompactSize, HostRenderer } from "./host";
import type { CardTriggers } from "./hover-card";
import { KIND_ATTRIBUTE } from "./kind-attributes";

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

/** A chip's visible text, and the accessible name that starts with it. */
interface ChipText {
  readonly label: string;
  readonly name: string;
}

function chipText(i18n: MessageCatalog, kind: TagKind): ChipText {
  const label = i18n.t(kind.messages.chip);
  const heading = i18n.t(kind.messages.heading);
  // PvP reads the same as its heading, so its name is that word once, not "PvP: PvP".
  const name = label === heading ? label : i18n.t("kind_chip_name", { chip: label, heading });
  return { label, name };
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
function createChipElement(
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

/** The full badge's chip, the store's tag-chip shape in our hue. The summary row reuses it. */
export function createChip(doc: Document, i18n: MessageCatalog, kind: TagKind): HTMLElement {
  return createChipElement(doc, chipText(i18n, kind), "sar-badge", "sar-badge-label", kind.id);
}

interface Drawn {
  /** The `span.sar-chips` that holds this host's chips. */
  readonly group: HTMLElement;
  /** The disclosed verdicts the chips stand for, in chip order. */
  readonly present: readonly AnyDisclosed[];
  readonly slot: BadgeSlot;
  readonly maxChips: number;
}

function sameSlot(a: BadgeSlot, b: BadgeSlot): boolean {
  return a.anchor === b.anchor && a.position === b.position
    && (a.kind === "full" ? b.kind === "full" : b.kind === "compact" && a.size === b.size);
}

/** Whether the lists stand for the same kinds in the same order, whatever their verdicts. */
function sameKinds(a: readonly AnyDisclosed[], b: readonly AnyDisclosed[]): boolean {
  return a.length === b.length && a.every((verdict, index) => verdict.kind === b[index]?.kind);
}

/**
 * Draws a host's chips in the slot its placement chose: one text chip for each kind that is
 * disclosed, not ignored and shown by its settings, in registry order. A placement shows at most
 * `maxChips` of them; a "+N" chip stands for the rest. Every chip registers with the hover card,
 * which lists all the kinds. A host with no such kind loses its chips. The chips of a host sit in
 * one group, so a refresh removes and places them as one.
 */
export function createBadgeRenderer(
  doc: Document,
  i18n: MessageCatalog,
  card: CardTriggers,
  kinds: readonly TagKind[] = KINDS,
): HostRenderer {
  const drawn = new WeakMap<Element, Drawn>();
  const texts = perKind((kind) => chipText(i18n, kind));

  function chipFor(slot: BadgeSlot, text: ChipText, kind?: KindId): HTMLElement {
    if (slot.kind === "full") {
      return createChipElement(doc, text, "sar-badge", "sar-badge-label", kind);
    }
    const chip = createChipElement(doc, text, "sar-compact", "sar-compact-label", kind);
    chip.setAttribute("data-sar-size", slot.size);
    return chip;
  }

  function build(slot: BadgeSlot, present: readonly AnyDisclosed[], maxChips: number): HTMLElement {
    const group = doc.createElement("span");
    group.className = "sar-chips";
    group.setAttribute("data-sar-chips", slot.kind);
    for (const verdict of present.slice(0, maxChips)) {
      group.append(chipFor(slot, texts[verdict.kind], verdict.kind));
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
      for (const kind of kinds) {
        const verdict = verdicts[kind.id];
        if (verdict.state === "disclosed" && !allowed[kind.id] && badged[kind.id]) {
          (present ??= []).push(verdict);
        }
      }
      const current = drawn.get(host);
      if (present === undefined || slot === undefined) {
        current?.group.remove();
        drawn.delete(host);
        return;
      }
      if (
        current !== undefined && current.group.isConnected && sameSlot(current.slot, slot)
        && current.maxChips === maxChips && sameKinds(current.present, present)
      ) {
        if (!sameVerdicts(current.present, present)) {
          bind(current.group, present);
          drawn.set(host, { ...current, present });
        }
        return;
      }
      current?.group.remove();
      const group = build(slot, present, maxChips);
      slot.anchor.insertAdjacentElement(slot.position, group);
      if (slot.kind === "compact") {
        linkCompact(group, host);
      }
      bind(group, present);
      drawn.set(host, { group, present, slot, maxChips });
    },
  };
}
