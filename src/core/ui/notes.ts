const WINDOWS_BREAK = /\r\n?/g;

/** The notes with Windows and old Mac line breaks turned into `\n` (rq6, S2). */
export function normalizeBreaks(notes: string): string {
  return notes.replace(WINDOWS_BREAK, "\n");
}
