import * as v from "valibot";

/** The longest text, in code points, each chip field keeps (ADR 0017). */
export const CHIP_TEXT_LIMITS = { chip: 32, chipCompact: 16 } as const;

/** A kind's chip text fields: every chip, and the chip of small game images. */
export type ChipTextField = keyof typeof CHIP_TEXT_LIMITS;

/** Every chip text field, in the order the settings show them. */
export const CHIP_TEXT_FIELDS: readonly ChipTextField[] = ["chip", "chipCompact"];

/**
 * Reads a person's chip text: whitespace runs become one space, control and format characters
 * (bidirectional marks and overrides, zero-width characters) go, and the trimmed rest is cut to
 * `limit` code points. Empty text fails, which reads as unset.
 */
function chipTextSchema(limit: number) {
  return v.pipe(
    v.string(),
    v.transform((text) =>
      Array.from(text.replace(/(?!\s)[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/gu, " ").trim())
        .slice(0, limit).join("").trim()
    ),
    v.minLength(1),
    v.brand("ChipText"),
  );
}

export const CHIP_TEXT_SCHEMAS = {
  chip: chipTextSchema(CHIP_TEXT_LIMITS.chip),
  chipCompact: chipTextSchema(CHIP_TEXT_LIMITS.chipCompact),
} as const;

/**
 * A person's own chip text. The brand is applied only by the schemas above, so every `ChipText`
 * is cleaned and within its limit; it is drawn through `textContent` only.
 */
export type ChipText = v.InferOutput<(typeof CHIP_TEXT_SCHEMAS)["chip"]>;

/** The cleaned text for a field, or undefined when nothing is left of it. */
export function toChipText(field: ChipTextField, text: unknown): ChipText | undefined {
  const result = v.safeParse(CHIP_TEXT_SCHEMAS[field], text);
  return result.success ? result.output : undefined;
}
