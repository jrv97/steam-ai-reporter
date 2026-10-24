/**
 * Whitespace plus the invisible characters developers leave around their notes: zero-width space,
 * non-joiner and joiner, and word joiner (rq6, S2). `\s` already covers U+FEFF.
 */
const BLANK = /[\s\u200b-\u200d\u2060]/;

function isBlank(text: string, index: number): boolean {
  return BLANK.test(text.charAt(index));
}

/** Whether the text holds anything but blanks, so a developer's blank field says nothing. */
export function hasText(text: string): boolean {
  return trimNotes(text) !== "";
}

/**
 * Developer notes without leading or trailing blanks; inner text, line breaks included, stays
 * verbatim. An empty result means the developer disclosed nothing. Linear in the text length.
 */
export function trimNotes(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isBlank(text, start)) {
    start += 1;
  }
  while (end > start && isBlank(text, end - 1)) {
    end -= 1;
  }
  return text.slice(start, end);
}
