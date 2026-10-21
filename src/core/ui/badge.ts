import type { MessageCatalog } from "../ports";
import type { DisclosedVerdict } from "../types";
import type { BadgeSlot, CompactSize, HostRenderer } from "./host";
import type { CardTriggers } from "./hover-card";

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

/** The full badge's chip, the store's tag-chip shape in our hue. The summary row reuses it. */
export function createChip(doc: Document, label: string): HTMLElement {
  const chip = doc.createElement("span");
  chip.className = "sar-badge";
  const text = doc.createElement("span");
  text.className = "sar-badge-label";
  text.textContent = label;
  chip.append(text);
  return chip;
}

/** Turns badges on or off on the whole page: one root attribute, and CSS does the rest. */
export function applyBadgeSetting(root: Element, on: boolean): void {
  const value = on ? "on" : "off";
  if (root.getAttribute("data-sar-badges") !== value) {
    root.setAttribute("data-sar-badges", value);
  }
}

interface Drawn {
  readonly badge: HTMLElement;
  readonly verdict: DisclosedVerdict;
  readonly slot: BadgeSlot;
}

function sameSlot(a: BadgeSlot, b: BadgeSlot): boolean {
  return a.anchor === b.anchor && a.position === b.position
    && (a.kind === "full" ? b.kind === "full" : b.kind === "compact" && a.size === b.size);
}

/**
 * Draws the full or compact badge of a disclosed host in the slot its placement chose, and removes
 * it for every other state. Each badge registers with the hover card, which shows the notes.
 */
export function createBadgeRenderer(
  doc: Document,
  i18n: MessageCatalog,
  card: CardTriggers,
): HostRenderer {
  const drawn = new WeakMap<Element, Drawn>();
  const labels = { full: i18n.t("badge_full"), compact: i18n.t("badge_compact") } as const;

  function build(slot: BadgeSlot): HTMLElement {
    if (slot.kind === "full") {
      return createChip(doc, labels.full);
    }
    const badge = doc.createElement("span");
    badge.className = "sar-compact";
    badge.setAttribute("data-sar-size", slot.size);
    const text = doc.createElement("span");
    text.className = "sar-compact-label";
    text.textContent = labels.compact;
    badge.append(text);
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
    render({ host, verdict, allowed, slot }) {
      const current = drawn.get(host);
      if (verdict.state !== "disclosed" || allowed || slot === undefined) {
        current?.badge.remove();
        drawn.delete(host);
        return;
      }
      if (
        current !== undefined && current.badge.isConnected && sameSlot(current.slot, slot)
      ) {
        if (current.verdict !== verdict) {
          card.bind(current.badge, verdict);
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
      card.bind(badge, verdict);
      drawn.set(host, { badge, verdict, slot });
    },
  };
}
