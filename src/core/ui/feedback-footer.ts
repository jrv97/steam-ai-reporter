import { FEEDBACK_LINKS } from "../feedback-links";
import type { MessageCatalog } from "../ports";
import { createElement } from "./element";
import { withIcon } from "./icon";

/** Link target and relation tokens, not copy. */
const NEW_TAB = "_blank";
const NO_OPENER = "noopener noreferrer";

/**
 * The feedback links at the bottom of the settings: a bar that stays in view while the tabs
 * scroll (`.tks-feedback` is sticky), in the options page and the userscript dialog. Each link
 * is its Lucide icon, hidden from assistive technology, then its label, so the accessible name
 * is the visible text. They open in a new tab and send nothing.
 */
export function createFeedbackFooter(doc: Document, i18n: MessageCatalog): HTMLElement {
  const footer = createElement(doc, "nav", "tks-feedback");
  footer.setAttribute("aria-label", i18n.t("options_feedback_label"));
  for (const { url, icon, label } of FEEDBACK_LINKS) {
    const link = createElement(doc, "a", "tks-feedback-link");
    link.href = url;
    link.target = NEW_TAB;
    link.rel = NO_OPENER;
    footer.append(withIcon(link, icon, i18n.t(label)));
  }
  return footer;
}
