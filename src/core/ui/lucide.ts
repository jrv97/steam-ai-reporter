// Path data copied from Lucide 1.70.0 (`icons/<name>.svg`), ISC licensed.
// THIRD_PARTY_NOTICES.md carries the notice. None of these derives from Feather.
// Stroke width, caps and joins come from `.tks-icon` in settings.css.
/** The page outline that `file-down` and `file-up` share. */
const FILE_OUTLINE = "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588"
  + "A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z";
/** The folded corner that `file-down` and `file-up` share. */
const FILE_FOLD = "M14 2v5a1 1 0 0 0 1 1h5";

export const LUCIDE_PATHS = {
  bug: [
    "M12 20v-9",
    "M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z",
    "M14.12 3.88 16 2",
    "M21 21a4 4 0 0 0-3.81-4",
    "M21 5a4 4 0 0 1-3.55 3.97",
    "M22 13h-4",
    "M3 21a4 4 0 0 1 3.81-4",
    "M3 5a4 4 0 0 0 3.55 3.97",
    "M6 13H2",
    "m8 2 1.88 1.88",
    "M9 7.13V6a3 3 0 1 1 6 0v1.13",
  ],
  lightbulb: [
    "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8"
    + "c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
    "M9 18h6",
    "M10 22h4",
  ],
  "message-square-heart": [
    "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202"
    + "A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
    "M7.5 9.5c0 .687.265 1.383.697 1.844l3.009 3.264a1.14 1.14 0 0 0 .407.314"
    + " 1 1 0 0 0 .783-.004 1.14 1.14 0 0 0 .398-.31l3.008-3.264"
    + "A2.77 2.77 0 0 0 16.5 9.5 2.5 2.5 0 0 0 12 8a2.5 2.5 0 0 0-4.5 1.5",
  ],
  "brush-cleaning": [
    "m16 22-1-4",
    "M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6"
    + "a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1",
    "M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z",
    "m8 22 1-4",
  ],
  "file-down": [
    FILE_OUTLINE,
    FILE_FOLD,
    "M12 18v-6",
    "m9 15 3 3 3-3",
  ],
  "file-up": [
    FILE_OUTLINE,
    FILE_FOLD,
    "M12 12v6",
    "m15 15-3-3-3 3",
  ],
  "list-x": [
    "M16 5H3",
    "M11 12H3",
    "M16 19H3",
    "m15.5 9.5 5 5",
    "m20.5 9.5-5 5",
  ],
  "refresh-cw": [
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5",
  ],
  "rotate-ccw": [
    "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
    "M3 3v5h5",
  ],
  "undo-2": [
    "M9 14 4 9l5-5",
    "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",
  ],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type LucideName = keyof typeof LUCIDE_PATHS;

/** Hidden from assistive technology and never a tab stop: the link's label names it. */
const SVG_ATTRIBUTES = 'class="tks-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';

/** The named icon's markup, for `parseIcon`. */
export function lucideMarkup(name: LucideName): string {
  const paths = LUCIDE_PATHS[name].map((d) => `<path d="${d}"/>`).join("");
  return `<svg ${SVG_ATTRIBUTES}>${paths}</svg>`;
}
