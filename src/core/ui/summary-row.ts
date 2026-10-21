import type { MessageCatalog } from "../ports";
import type { DisclosedVerdict } from "../types";
import { createChip } from "./badge";
import { BANNER_ID } from "./banner";
import type { CardTriggers } from "./hover-card";

/** The store's own label and value rows in the summary box (Developer, Publisher). */
const DEV_ROW_SELECTOR = ".glance_ctn_responsive_left .dev_row";

/**
 * The summary box row "AI use: Disclosed by the developer", in the store's own row shape. With the
 * banner on it is a link to the banner, and `jump` handles the click (scroll and focus, no history
 * entry); without the banner it is a focusable row that opens the hover card, when one is given.
 * The row is its own root, with one listener.
 */
export function createSummaryRow(
  doc: Document,
  i18n: MessageCatalog,
  verdict: DisclosedVerdict,
  jump: (() => void) | undefined,
  card?: CardTriggers,
): HTMLElement {
  const row = doc.createElement(jump === undefined ? "div" : "a");
  row.className = "sar-summary-row";
  const label = doc.createElement("span");
  label.className = "sar-summary-label";
  label.textContent = i18n.t("summary_label");
  row.append(label, createChip(doc, i18n.t("summary_value")));
  if (jump !== undefined) {
    row.setAttribute("href", `#${BANNER_ID}`);
    row.addEventListener("click", (event) => {
      event.preventDefault();
      jump();
    });
  } else {
    row.tabIndex = 0;
    card?.bind(row, verdict, true);
  }
  return row;
}

/**
 * Puts the row right after the last row of the summary box, under Publisher. Returns false when
 * the page has no summary box rows.
 */
export function placeSummaryRow(doc: Document, row: HTMLElement): boolean {
  const rows = doc.querySelectorAll(DEV_ROW_SELECTOR);
  if (rows.length === 0) {
    return false;
  }
  const last = rows.item(rows.length - 1);
  if (last.nextElementSibling !== row) {
    last.after(row);
  }
  return true;
}
