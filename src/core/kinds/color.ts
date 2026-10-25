import * as v from "valibot";

/** What a person may type: three or six hex digits, with or without the leading `#`. */
const TYPED_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The one form that ever reaches a style value: `#` and six lowercase hex digits. */
const NORMAL_COLOR = /^#[0-9a-f]{6}$/;

/** The typed text in its normal form; text that is no color stays as it is, for the check. */
function normalize(text: string): string {
  const digits = TYPED_COLOR.exec(text.trim())?.[1]?.toLowerCase();
  if (digits === undefined) {
    return text;
  }
  const full = digits.length === 3 ? digits.replace(/./g, "$&$&") : digits;
  return `#${full}`;
}

/**
 * A tag's custom color. The brand is applied only by this schema, so every `HexColor` in core is
 * `#rrggbb` in lowercase and is safe to write into a CSS custom property. It accepts `#rgb` and
 * `#rrggbb`, with or without the `#`, in any case, and gives the normal form.
 */
export const HexColorSchema = v.pipe(
  v.string(),
  v.transform(normalize),
  v.regex(NORMAL_COLOR),
  v.brand("HexColor"),
);

export type HexColor = v.InferOutput<typeof HexColorSchema>;

/** The color in normal form, or undefined when the text is not a hex color. */
export function toHexColor(text: unknown): HexColor | undefined {
  const result = v.safeParse(HexColorSchema, text);
  return result.success ? result.output : undefined;
}

/** What a color field holds: no color (the default), a color, or text that is neither. */
export type TypedColor =
  | { readonly valid: true; readonly color: HexColor | undefined; }
  | { readonly valid: false; };

/** Reads the text of a color field. Empty text, or only spaces, is the default color. */
export function readTypedColor(text: string): TypedColor {
  if (text.trim() === "") {
    return { valid: true, color: undefined };
  }
  const color = toHexColor(text);
  return color === undefined ? { valid: false } : { valid: true, color };
}
