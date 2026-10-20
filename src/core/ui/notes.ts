/** How many characters of the developer's notes a badge tooltip quotes. */
export const TOOLTIP_NOTES_LENGTH = 200;

/** Typography, not copy: marks quoted notes that were cut. */
const ELLIPSIS = "...";

const WINDOWS_BREAK = /\r\n?/g;

/** The notes with Windows and old Mac line breaks turned into `\n` (rq6, S2). */
export function normalizeBreaks(notes: string): string {
  return notes.replace(WINDOWS_BREAK, "\n");
}

/**
 * The first `length` characters of the notes, counted in code points so an emoji is never cut in
 * half, followed by `...` when anything was left out.
 */
export function excerpt(notes: string, length = TOOLTIP_NOTES_LENGTH): string {
  const text = normalizeBreaks(notes);
  if (text.length <= length) {
    return text;
  }
  let end = 0;
  let count = 0;
  while (end < text.length && count < length) {
    const point = text.codePointAt(end) ?? 0;
    end += point > 0xffff ? 2 : 1;
    count += 1;
  }
  return end < text.length ? text.slice(0, end) + ELLIPSIS : text;
}
