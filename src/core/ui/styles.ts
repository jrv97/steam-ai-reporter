import { PAGE_CSS, TOKENS_CSS } from "./styles.gen";

export { BANNER_CSS, DIALOG_CSS, PAGE_CSS, SETTINGS_CSS, TOKENS_CSS } from "./styles.gen";

/** The store page stylesheet for `AppDeps.addPageStyles`, where the platform does not load it. */
export function adoptPageStyles(doc: Document): void {
  adoptStyles(doc, TOKENS_CSS + PAGE_CSS);
}

/** One constructed sheet per document and CSS text, shared by every root that adopts it. */
const sheets = new WeakMap<Document, Map<string, CSSStyleSheet>>();
/** The CSS texts each root already carries. */
const adopted = new WeakMap<Document | ShadowRoot, Set<string>>();

function constructed(doc: Document, css: string): CSSStyleSheet | undefined {
  const view = doc.defaultView;
  if (view === null) {
    return undefined;
  }
  let byText = sheets.get(doc);
  if (byText === undefined) {
    byText = new Map();
    sheets.set(doc, byText);
  }
  let sheet = byText.get(css);
  if (sheet === undefined) {
    sheet = new view.CSSStyleSheet();
    sheet.replaceSync(css);
    byText.set(css, sheet);
  }
  return sheet;
}

/**
 * Adds the CSS to a document or a shadow root, once. A platform injector, when set, takes the
 * document's CSS first. Otherwise constructed sheets come first: one parsed sheet serves every
 * root of the document. Where they are unavailable or refused (an old engine, a sandboxed content
 * script), a `style` element carries the same text.
 */
export function adoptStyles(root: Document | ShadowRoot, css: string): void {
  const done = adopted.get(root) ?? new Set();
  if (done.has(css)) {
    return;
  }
  done.add(css);
  adopted.set(root, done);
  const doc = "host" in root ? root.ownerDocument : root;
  try {
    const sheet = constructed(doc, css);
    if (sheet !== undefined) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    }
  } catch {
    // Fall through to a style element.
  }
  const style = doc.createElement("style");
  style.className = "sar-styles";
  style.textContent = css;
  ("host" in root ? root : root.head).append(style);
}
