import * as v from "valibot";

/** A value that survives a JSON round trip, as storage ports accept it. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue; };

/**
 * Parses JSON text without trusting it: the result stays `unknown` until a validation schema turns
 * it into a typed value. The only place allowed to call `JSON.parse` (see lint/restricted-syntax).
 * Throws `SyntaxError` on malformed text, like `JSON.parse`.
 */
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}

/**
 * The parsed value, or what an empty object parses to when the input does not parse. The schema
 * gives every field a fallback, so it holds the defaults once.
 */
export function parseWithDefaults<TSchema extends v.GenericSchema>(
  schema: TSchema,
  input: unknown,
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  return result.success ? result.output : v.parse(schema, {});
}
