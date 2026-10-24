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

/**
 * The JSON form of a plain data value, or undefined when it holds something JSON cannot carry (a
 * function, a symbol, NaN). Object keys whose value is undefined are left out, like
 * `JSON.stringify` does, so an optional field that is not set costs no storage. A `__proto__` key
 * stays an own key.
 */
export function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const item of value) {
      const json = toJsonValue(item);
      if (json === undefined) {
        return undefined;
      }
      items.push(json);
    }
    return items;
  }
  if (typeof value === "object") {
    const fields: [string, JsonValue][] = [];
    for (const [key, field] of Object.entries(value)) {
      const json = toJsonValue(field);
      if (json !== undefined) {
        fields.push([key, json]);
      } else if (field !== undefined) {
        return undefined;
      }
    }
    return Object.fromEntries(fields);
  }
  return undefined;
}
