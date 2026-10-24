import type { AiDisclosed, AiKind } from "../kinds/ai";
import type { TagKind } from "../kinds/kind";
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

/** An `aria-hidden` token, not copy. */
const TRUE = "true";

/** A kind's chip text, and the accessible name that starts with it. */
interface ChipText {
  readonly label: string;
  readonly name: string;
}

function chipText(i18n: MessageCatalog, kind: TagKind): ChipText {
  const label = i18n.t(kind.messages.chip);
  const name = i18n.t("kind_chip_name", { chip: label, heading: i18n.t(kind.messages.heading) });
  return { label, name };
}

/**
 * A chip: the short text, which screen readers skip, and the accessible name read instead. The
 * name starts with the visible text and goes on with Steam's full line.
 */
function createChipElement(
  doc: Document,
  kind: TagKind,
  text: ChipText,
  className: string,
  labelClass: string,
): HTMLElement {
  const chip = doc.createElement("span");
  chip.className = className;
  chip.setAttribute(KIND_ATTRIBUTE, kind.id);
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
  return createChipElement(doc, kind, chipText(i18n, kind), "sar-badge", "sar-badge-label");
}

interface Drawn {
  readonly badge: HTMLElement;
  readonly verdict: AiDisclosed;
  readonly slot: BadgeSlot;
}

function sameSlot(a: BadgeSlot, b: BadgeSlot): boolean {
  return a.anchor === b.anchor && a.position === b.position
    && (a.kind === "full" ? b.kind === "full" : b.kind === "compact" && a.size === b.size);
}

/**
 * Draws the full or compact badge of a host disclosed for `kind` in the slot its placement chose,
 * and removes it for every other state. Each badge registers with the hover card, which shows the
 * notes.
 */
export function createBadgeRenderer(
  doc: Document,
  i18n: MessageCatalog,
  card: CardTriggers,
  kind: AiKind,
): HostRenderer {
  const drawn = new WeakMap<Element, Drawn>();
  const text = chipText(i18n, kind);

  function build(slot: BadgeSlot): HTMLElement {
    if (slot.kind === "full") {
      return createChipElement(doc, kind, text, "sar-badge", "sar-badge-label");
    }
    const badge = createChipElement(doc, kind, text, "sar-compact", "sar-compact-label");
    badge.setAttribute("data-sar-size", slot.size);
    return badge;
  }

  /** A compact badge inside the capsule's own link takes the pointer and opens the card. */
  function linkCompact(badge: HTMLElement, host: Element): void {
    const link = badge.parentElement?.closest("a");
    if (link !== null && link !== undefined && (host.contains(link) || link.contains(host))) {
      badge.setAttribute("data-sar-in-link", "true");
    }
  }

  return {
    render({ host, verdicts, allowed, slot }) {
      const current = drawn.get(host);
      const verdict = verdicts[kind.id];
      if (verdict.state !== "disclosed" || allowed[kind.id] || slot === undefined) {
        current?.badge.remove();
        drawn.delete(host);
        return;
      }
      if (
        current !== undefined && current.badge.isConnected && sameSlot(current.slot, slot)
      ) {
        if (current.verdict !== verdict) {
          card.bind(current.badge, [verdict]);
          drawn.set(host, { ...current, verdict });
        }
        return;
      }
      current?.badge.remove();
      const badge = build(slot);
      slot.anchor.insertAdjacentElement(slot.position, badge);
      if (slot.kind === "compact") {
        linkCompact(badge, host);
      }
      card.bind(badge, [verdict]);
      drawn.set(host, { badge, verdict, slot });
    },
  };
}
