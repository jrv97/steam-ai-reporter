import { createElement } from "./element";
import { lucideMarkup, type LucideName } from "./lucide";

/**
 * An inline SVG icon of our own markup, for `doc`. HTML parsing puts it in the SVG namespace, so
 * no namespace URL enters the bundle. Undefined when the markup holds no element.
 */
export function parseIcon(doc: Document, markup: string): Element | undefined {
  const icon = new DOMParser().parseFromString(markup, "text/html").body.firstElementChild;
  return icon === null ? undefined : doc.importNode(icon, true);
}

/**
 * Fills `node` with a Lucide icon, hidden from assistive technology, then `text` in a span. The
 * visible text stays the accessible name of a link or button. Returns `node`.
 */
export function withIcon<T extends HTMLElement>(node: T, name: LucideName, text: string): T {
  const doc = node.ownerDocument;
  const icon = parseIcon(doc, lucideMarkup(name));
  node.replaceChildren(...(icon === undefined ? [] : [icon]), createElement(doc, "span", "", text));
  return node;
}
