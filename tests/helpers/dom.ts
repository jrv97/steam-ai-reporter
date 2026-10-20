/** Replaces the test document's body with the given markup (test fixtures, not UI copy). */
export function setBody(markup: string): void {
  document.body.innerHTML = markup;
}
