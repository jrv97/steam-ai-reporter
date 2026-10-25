/** Replaces the test document's body with the given markup (test fixtures, not UI copy). */
export function setBody(markup: string): void {
  document.body.innerHTML = markup;
}

/** Removes every attribute of the root element, such as the marks the app wrote there. */
export function clearRoot(): void {
  const root = document.documentElement;
  for (const name of root.getAttributeNames()) {
    root.removeAttribute(name);
  }
}
