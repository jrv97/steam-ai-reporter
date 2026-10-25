import { KIND_BY_ID } from "../kinds/registry";
import { type AnyDisclosed, sameVerdicts } from "../kinds/verdicts";
import type { MessageCatalog } from "../ports";
import { createChip, createChipGroup } from "./badge";
import type { CardTriggers } from "./hover-card";

/**
 * Where the section goes, best first: right after the store's "Popular user-defined tags" block,
 * else after the last Developer or Publisher row of the summary box. The first selector that
 * matches wins, and the last match of it is the anchor.
 */
const ANCHORS = [".popular_tags_ctn", ".glance_ctn_responsive_left .dev_row"] as const;

/** The label's id, which the section's group points to for its name. */
const LABEL_ID = "sar-tag-section-label";

/** The tag section of the game's own page. */
export interface TagSection {
  /**
   * Shows one chip for each verdict, in the order given, or removes the section when there is
   * none. Idempotent: the same verdicts change nothing, and a section the store dropped returns.
   */
  render(verdicts: readonly AnyDisclosed[]): void;
}

interface Drawn {
  readonly element: HTMLElement;
  readonly verdicts: readonly AnyDisclosed[];
}

function anchorOf(doc: Document): Element | undefined {
  for (const selector of ANCHORS) {
    const found = doc.querySelectorAll(selector);
    if (found.length > 0) {
      return found.item(found.length - 1);
    }
  }
  return undefined;
}

/**
 * The Tag Kit section under the store's user-defined tags: a muted label and one chip for each
 * verdict, all of them, wrapping to more rows. Each chip opens the hover card for its own kind
 * and takes focus when a card is given. The chips carry no listener: the card's delegated ones
 * serve them. A page with neither anchor gets no section.
 */
export function createTagSection(
  doc: Document,
  i18n: MessageCatalog,
  card?: CardTriggers,
): TagSection {
  let drawn: Drawn | undefined;

  function build(verdicts: readonly AnyDisclosed[]): HTMLElement {
    const element = doc.createElement("div");
    element.className = "sar-tag-section";
    element.setAttribute("role", "group");
    element.setAttribute("aria-labelledby", LABEL_ID);
    const label = doc.createElement("div");
    label.className = "sar-tag-section-label";
    label.id = LABEL_ID;
    label.textContent = i18n.t("badge_tags_title");
    const group = createChipGroup(doc, "full");
    for (const verdict of verdicts) {
      const chip = createChip(doc, i18n, KIND_BY_ID[verdict.kind]);
      if (card !== undefined) {
        chip.tabIndex = 0;
        card.bind(chip, [verdict], true);
      }
      group.append(chip);
    }
    element.append(label, group);
    return element;
  }

  function remove(): void {
    drawn?.element.remove();
    drawn = undefined;
  }

  return {
    render(verdicts) {
      if (verdicts.length === 0) {
        remove();
        return;
      }
      if (
        drawn === undefined || !drawn.element.isConnected || !sameVerdicts(drawn.verdicts, verdicts)
      ) {
        remove();
        drawn = { element: build(verdicts), verdicts };
      }
      const anchor = anchorOf(doc);
      if (anchor === undefined) {
        remove();
      } else if (anchor.nextElementSibling !== drawn.element) {
        anchor.after(drawn.element);
      }
    },
  };
}
