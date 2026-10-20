/**
 * Parses JSON text without trusting it: the result stays `unknown` until a validation schema turns
 * it into a typed value. The only place allowed to call `JSON.parse` (see lint/restricted-syntax).
 * Throws `SyntaxError` on malformed text, like `JSON.parse`.
 */
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
