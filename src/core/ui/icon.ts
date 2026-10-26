/**
 * An inline SVG icon of our own markup, for `doc`. HTML parsing puts it in the SVG namespace, so
 * no namespace URL enters the bundle. Undefined when the markup holds no element.
 */
export function parseIcon(doc: Document, markup: string): Element | undefined {
  const icon = new DOMParser().parseFromString(markup, "text/html").body.firstElementChild;
  return icon === null ? undefined : doc.importNode(icon, true);
}
