import type { BareMessageKey } from "./i18n/t";

// Where a person can send a bug report or feedback. The settings footer links to these, and the
// README's Feedback section lists the same three (a test compares them). Each is a plain link
// the person opens in a tab; the extension never requests one, so no app ID goes anywhere
// (rule 1).

export const BUG_REPORT_URL =
  "https://github.com/jrv97/steam-ai-reporter/issues/new?template=bug_report.yml";
export const FEEDBACK_URL =
  "https://github.com/jrv97/steam-ai-reporter/issues/new?template=feature_request.yml";
export const ANONYMOUS_FEEDBACK_URL = "https://forms.gle/Fo652zzyFWUQn2qK9";

export interface FeedbackLink {
  readonly id: "bug" | "feedback" | "anonymous";
  readonly url: string;
  /** Decorative: the visible label names the link. */
  readonly emoji: string;
  readonly label: BareMessageKey;
}

/** In the order the footer shows them: the ladybug, the memo and the ghost. */
export const FEEDBACK_LINKS = [
  { id: "bug", url: BUG_REPORT_URL, emoji: "\u{1F41E}", label: "options_feedback_bug" },
  { id: "feedback", url: FEEDBACK_URL, emoji: "\u{1F4DD}", label: "options_feedback_leave" },
  {
    id: "anonymous",
    url: ANONYMOUS_FEEDBACK_URL,
    emoji: "\u{1F47B}",
    label: "options_feedback_anonymous",
  },
] as const satisfies readonly FeedbackLink[];
