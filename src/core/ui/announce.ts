/** An `aria-live` token, not copy. */
export const POLITE = "polite";

/**
 * Says `text` through a live region. The region empties first and fills on the next frame, so a
 * message that repeats, such as a second "Saved.", is announced again.
 */
export function announce(doc: Document, live: Element, text: string): void {
  live.textContent = "";
  const view = doc.defaultView;
  if (view === null) {
    live.textContent = text;
    return;
  }
  view.requestAnimationFrame(() => {
    live.textContent = text;
  });
}
